const b4a = require('b4a')
const SlashURL = require('@synonymdev/slashtags-url')
const EventSource = require('./eventsource.js')
const sodium = require('sodium-universal')
const { createHash } = require('crypto')
const fetch = require('./fetch.js')

const DEFAULT_STORAGE = require('./default-storage.js')
const { createKeyPair } = require('../utils.js')
const { HEADERS } = require('../constants.js')
const Record = require('../record.js')

const NAMESPACE = b4a.from('slashtags-web-relay')

const PREFIXES = {
  RECORDS: 'records!',
  BLOBS: 'blobs!',
  PENDING_RECORDS: 'pending-records!'
}

const BACKOFF_MAX = 32000 // .5 -> 1 -> 2 -> 4 -> 8 -> 16 -> 32 -> 32 -> 32 seconds -> ...

class Client {
  /**
   * @param {object} [opts]
   * @param {string} [opts.relay]
   * @param {KeyPair} [opts.keyPair]
   * @param {string} [opts.storage]
   * @param {Store} [opts.store]
   * @param {boolean} [opts._skipRecordVerification] - Set to true to skip expensive records verification and trust relays.
   * @param {boolean} [opts._skipCache] - Skip cache for remote get request and always await for the relay.
   */
  constructor (opts = {}) {
    const { relay, keyPair, storage } = opts

    this._skipCache = opts._skipCache

    this._keyPair = keyPair || createKeyPair()

    this._relay = relay && origin(relay)

    // Use a separate storage per user
    let _storage = storage || DEFAULT_STORAGE
    if (!_storage.endsWith('/')) _storage += '/'
    const userStorage = _storage + this.id

    this._store = opts.store || new Store(userStorage)

    /** @type {Map<string, ReturnType<setTimeout>>} */
    this._retryTimeouts = new Map()
    /** @type {Map<string, () => void>} */
    this._supscriptions = new Map()

    this._skipRecordVerification = opts._skipRecordVerification

    if (this._relay) {
      this._sentPending = this._sendPending()
    }
  }

  get key () {
    return this._keyPair.publicKey
  }

  get id () {
    return SlashURL.encode(this.key)
  }

  /**
   * Base URL of the client instance in the format `slash:<this.id>/?relay=<this._relay>`
   * @returns {string}
   */
  get url () {
    const query = `${this._relay ? 'relay=' + this._relay : ''}`
    return SlashURL.format(this.key, { query })
  }

  /**
   * @param {string} path
   * @param {Uint8Array} content
   * @param {object} [opts]
   * @param {boolean} [opts.encrypt]
   * @param {boolean} [opts.awaitRelaySync]
   *
   * @returns {Promise<void>}
   */
  async put (path, content, opts = {}) {
    const fullPath = this._fullPath(path)

    content = opts.encrypt ? await this._encrypt(path, content) : content

    const record = await Record.create(this._keyPair, fullPath, content, { metadata: { encrypted: opts.encrypt } })

    const syncPromise = new Promise(resolve => {
      this._trySendToRelay(fullPath, content, record, resolve)
    })

    await this._put(fullPath, content, record)

    if (opts.awaitRelaySync) await syncPromise
  }

  /**
   * @param {string} path
   * @param {object} [opts]
   * @param {boolean} [opts.awaitRelaySync]
   *
   * @returns {Promise<void>}
   */
  async del (path, opts = {}) {
    const fullPath = this._fullPath(path)

    const content = b4a.alloc(0)

    const record = await Record.create(this._keyPair, fullPath, content)

    const relaySynced = new Promise(resolve => {
      this._trySendToRelay(fullPath, content, record, resolve)
    })

    await this._put(fullPath, content, record)

    if (opts.awaitRelaySync) await relaySynced
  }

  /**
   * Get the content of an entry from the local cache immediatly if available,
   * otherwise wait for fetching from the remote relay.
   * To skip the local cache and wait for the remote relay response anyways use the `opts.skipCache` option.
   *
   * @param {string} path
   * @param {object} [opts]
   * @param {boolean} [opts.skipCache] - Skip the local cache and wait for the remote relay to respond with fresh data
   *
   * @returns {Promise<Uint8Array | null>}
   */
  async get (path, opts = {}) {
    const fullPath = this._fullPath(path)
    const parsed = this._parseURL(path)

    /** @type {Record} */
    const record = await this._getStoredRecord(fullPath)
    const fromRelay = this._getFromRelay(parsed.relay, fullPath, record, parsed.encryptionKey)

    if (!record || opts.skipCache || this._skipCache) return fromRelay

    return this._store.get(PREFIXES.BLOBS + b4a.toString(record.hash, 'hex'))
      .then(decryptIfNeccessary.bind(this))
      .catch((error) => {
        if (error.status === 404) return null
        throw error
      })

    /**
     * @param {Uint8Array} content
     */
    async function decryptIfNeccessary (content) {
      const isLocal = fullPath.split('/')[0] === this.id

      if (isLocal && record.metadata?.encrypted) {
        parsed.encryptionKey = await this._generateEncryptionKey(path)
      }

      return this._decrypt(content, parsed.encryptionKey)
    }
  }

  /**
   * @param {string} path
   * @param {(value: Uint8Array | null) => any} onupdate
   *
   * @returns {() => void}
   */
  subscribe (path, onupdate) {
    const fullPath = this._fullPath(path)
    const parsed = this._parseURL(path)

    const url = parsed.relay + '/subscribe/' + fullPath

    if (this._supscriptions.has(url)) {
      return this._supscriptions.get(url)
    }

    const eventsource = new EventSource(url)

    eventsource.onmessage = async () => {
      const saved = await this._getStoredRecord(fullPath)
      const value = await this._getFromRelay(parsed.relay, fullPath, saved, parsed.encryptionKey)
      onupdate(value)
    }

    const unsubscribe = () => eventsource.close()
    this._supscriptions.set(url, unsubscribe)

    return unsubscribe
  }

  /**
     * Return a url that can be shared by others to acess a file.
     *
     * @param {string} path
     *
     * @returns {Promise<string>}
     */
  async createURL (path) {
    const fullPath = this._fullPath(path)
    const record = await this._getStoredRecord(fullPath)

    const query = `${this._relay ? 'relay=' + this._relay : ''}`
    const fragment = {}

    if (record?.metadata?.encrypted) {
      const encryptionKey = await this._generateEncryptionKey(path)
      fragment.encryptionKey = SlashURL.encode(encryptionKey)
    }

    // Return a promise to be consistent with other adaptors that
    // may need to generate the url asynchronously, see SlashtagsCoreData.
    return SlashURL.format(this.key, {
      path: absolute(path),
      query,
      fragment
    })
  }

  close () {
    this._retryTimeouts.forEach(clearTimeout)
    this._supscriptions.forEach(unsubscribe => unsubscribe())
    return this._store.close()
  }

  /**
   * Takes either SlashURL `slash:<userID>/path/to/file` or `path/to/file` and retruns the full path as `<userID>/path/to/file`
   *
   * @param {string} path
   * @returns {string}
   */
  _fullPath (path) {
    let id = this.id

    if (path.startsWith('slash:')) {
      const parsed = this._parseURL(path)
      id = parsed.id
      path = parsed.path
    }

    Client.validatePath(path)

    return id + (path.startsWith('/') ? path : ('/' + path))
  }

  /**
   * Returns the relay from a url
   *
   * @param {string} url
   * @returns {Partial<ReturnType<import('@synonymdev/slashtags-url').parse> & {relay?:string, encryptionKey?: Uint8Array}>}
   */
  _parseURL (url) {
    if (!url.startsWith('slash:')) {
      // Not a remote url, use local relay
      return {
        relay: this._relay
      }
    }

    url = encodeURI(url)

    const parsed = SlashURL.parse(url)

    /** @type {Uint8Array} */
    let encryptionKey
    try {
      encryptionKey = SlashURL.decode(parsed.privateQuery.encryptionKey.toString())
    } catch { }

    return {
      ...parsed,
      path: decodeURIComponent(parsed.path),
      // Ask local relay anyways just in case.
      relay: parsed.query?.relay?.toString() || this._relay,
      encryptionKey
    }
  }

  /**
   * Remove the file from pending database
   *
   * @param {string} path - full path <userID>/path/to/file
   * @param {number} timestamp - timestamp of the record that was successfully sent to the relay
   */
  async _removePending (path, timestamp) {
    const saved = await this._getStoredRecord(path)

    // If the record was updated since, we don't delete the pending write.
    // because writes are denoted by the key, not a unique value, so we are
    // keeping a note that this file is still out of sync with the relay and
    // needs another PUT call to the relay.
    if (saved?.timestamp > timestamp) return

    const key = PREFIXES.PENDING_RECORDS + path
    return this._store.del(key)
  }

  /**
   * @param {string} path
   * @param {Uint8Array} content
   * @param {Record} record
   * @param {Function} [onsuccess]
   */
  async _trySendToRelay (path, content, record, onsuccess, backoff = 500) {
    if (!this._relay) return

    const url = this._relay + '/' + path

    /** @type {import('node-fetch').Response | undefined } */
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        [HEADERS.RECORD]: record.serialize('base64'),
        [HEADERS.CONTENT_TYPE]: 'application/octet-stream'
      },
      body: content
    })
      .catch(noop)

    if (
      response?.status === 200 || // Success, remove from pending and don't retry.
      response?.status === 409 || // Conflict, the server has a newer version, don't retry.
      response?.status === 400 // Bad request, we did something worng, don't retry.
    ) {
      await this._removePending(path, record.timestamp)
      onsuccess?.()
      return
    }

    // Clear existing timeout
    const existing = this._retryTimeouts.get(path)
    if (existing) clearTimeout(existing)

    this._retryTimeouts.set(
      path,
      setTimeout(
        () => this._trySendToRelay(
          path,
          content,
          record,
          onsuccess,
          Math.min(backoff * 2, BACKOFF_MAX)
        ),
        backoff
      )
    )
  }

  /**
   * @param {string} path
   */
  async _getStoredRecord (path) {
    try {
      const saved = await this._store.get(PREFIXES.RECORDS + path)
      return Record.deserialize(saved).value
    } catch (error) {
      if (error.status === 404) return null
      throw error
    }
  }

  /**
   * Get data from the relay and save it to the local key-value store.
   *
   * @param {string} relay
   * @param {string} path
   * @param {Record | null} saved
   * @param {Uint8Array} [encryptionKey]
   *
   * @returns {Promise<Uint8Array | null>}
   */
  async _getFromRelay (relay, path, saved, encryptionKey) {
    if (!relay) return null

    const url = origin(relay) + '/' + path

    const hasher = createHash('sha256')

    /** @type {import('node-fetch').Response | undefined} */
    const response = await fetch(url)
      .catch(noop)

    if (!response?.ok) return null

    const chunks = []

    for await (const chunk of asyncIteratorFromResponse(response)) {
      hasher.update(chunk)
      chunks.push(chunk)
    }

    const content = b4a.concat(chunks)

    const header = response.headers.get(HEADERS.RECORD)?.toString()
    const deserialized = Record.deserialize(header)
    const record = deserialized.value
    if (!record) return null

    // Invalid signature
    if (!this._skipRecordVerification && !record.verify(path)) return null

    const hash = hasher.digest()
    // Invalid hash
    if (!b4a.equals(hash, record.hash)) return null

    // Save the new record if it's newer than the locally cached one
    if (record.timestamp > (saved?.timestamp || 0)) {
      this._put(path, content, record)
    }

    return this._decrypt(content, encryptionKey)
  }

  /**
   * Save data to the local key-value store.
   *
   * @param {string} path - <userID>/path/to/file
   * @param {Uint8Array} content
   * @param {Record} record
   */
  async _put (path, content, record) {
    const batch = this._store.batch()

    // If this is a local write not just caching a remote data
    if (path.startsWith(this.id)) {
      const key = PREFIXES.PENDING_RECORDS + path
      // save as a pending record to sync to the relay
      batch.put(key, record.serialize())
    }

    // Write to the active records and blobs
    batch.put(PREFIXES.RECORDS + path, record.serialize())
    batch.put(PREFIXES.BLOBS + b4a.toString(record.hash, 'hex'), content)

    return batch.write()
  }

  /**
   * Start sending pending records to the relay.
   */
  async _sendPending () {
    const promises = new Map()

    for await (const [key, value] of this._store.iterator({ gt: 'pending-records', lte: 'pending-records~' })) {
      const path = key.slice(PREFIXES.PENDING_RECORDS.length)
      const record = Record.deserialize(value).value

      if (!record) continue

      const content = await this._store.get(PREFIXES.BLOBS + b4a.toString(record.hash, 'hex'))
        .catch(noop)

      if (!content) continue

      promises.set(key, new Promise(resolve => {
        this._trySendToRelay(path, content, record, resolve)
      }))
    }

    await Promise.all(promises.values())
  }

  /**
   * Generates a unique encryptionKey per this user and a given path.
   *
   * @param {string} path
   */
  async _generateEncryptionKey (path) {
    return createHash('sha256')
      // encryptionKey = hash(<namespace><secretKey><path>)
      .update(b4a.concat([NAMESPACE, this._keyPair.secretKey, b4a.from(path)]))
      .digest()
      .subarray(0, sodium.crypto_secretbox_KEYBYTES)
  }

  /**
   * @param {string} path
   * @param {Uint8Array} content
   */
  async _encrypt (path, content) {
    if (content.length === 0) return content

    const encryptionKey = await this._generateEncryptionKey(path)

    // <nonce><authentication tag><encrypted content>
    const result = Buffer.alloc(sodium.crypto_secretbox_NONCEBYTES + sodium.crypto_secretbox_MACBYTES + content.length)

    const chipherText = result.subarray(sodium.crypto_secretbox_NONCEBYTES)

    const nonce = result.subarray(0, sodium.crypto_secretbox_NONCEBYTES)
    sodium.randombytes_buf(nonce)

    sodium.crypto_secretbox_easy(chipherText, content, nonce, encryptionKey)

    return result
  }

  /**
   * @param {Uint8Array} content
   * @param {Uint8Array} encryptionKey
   */
  async _decrypt (content, encryptionKey) {
    if (content.length === 0) return null
    if (!encryptionKey) return content

    const nonce = content.subarray(0, sodium.crypto_secretbox_NONCEBYTES)
    const chipherText = content.subarray(sodium.crypto_secretbox_NONCEBYTES)

    const decrypted = Buffer.alloc(chipherText.length - sodium.crypto_secretbox_MACBYTES)

    sodium.crypto_secretbox_open_easy(decrypted, chipherText, nonce, encryptionKey)

    return decrypted
  }

  /**
   * Validate a path to only contain valid characters.
   * @param {string} path
   */
  static validatePath (path) {
    if (!/^[^?#]+$/.test(path)) throw new AdaptorError(Client.ERROR_CODES.INVALID_PATH)
  }

  static createKeyPair = createKeyPair

  static ERROR_CODES = {
    INVALID_PATH: {
      message: 'INVALID_PATH',
      cause: 'Path must be a string and can only contain the following characters: 0-9a-zA-Z-._ /'
    }
  }
}

class AdaptorError extends Error {
  constructor (opts) {
    super(opts.message, opts)
    this.name = 'SlashtagsProtocolAdaptorError'
    this.code = opts.code
  }
}

// Abstract Store class makes it easier to override it in react-native
class Store {
  location = null

  /**
   * @param {string} location
   */
  constructor (location) {
    this.location = location
  }

  get _db () {
    if (this._level) return this._level
    const { Level } = require('level')
    /** @type {import('level').Level<string, any>} */
    // @ts-ignore
    // Using single store instead of sub levels to enable batching
    this._level = new Level(this.location, { valueEncoding: 'buffer' })
    return this._level
  }

  /**
   * @param {import('level').IteratorOptions<string, Uint8Array>} range
   */
  iterator (range) {
    return this._db.iterator(range)
  }

  /**
   * @param {string} key
   * @param {Uint8Array} value
   */
  put (key, value) {
    return this._db.put(key, value)
  }

  /**
   * @param {string} key
   *
   * @returns {Promise<void>}
   */
  del (key) {
    return this._db.del(key)
  }

  /**
   * @param {string} key
   *
   * @returns {Promise<Uint8Array>}
   */
  get (key) {
    return this._db.get(key)
  }

  batch () {
    return this._db.batch()
  }

  close () {
    return this._db.close()
  }
}

/**
 * Returns the absolute path of a file: `/path/to/file`
 *
 * @param {string} path
 */
function absolute (path) {
  if (!path?.startsWith('/')) return '/' + path
  return path
}

/**
 * Get the origin part of the url
 *
 * @param {string} url
 */
function origin (url) {
  return url.split('#')[0] // without fragment
    .split('?')[0] //         without query
    .replace(/\/$/, '') //    without trailing slash
}

function noop () { return undefined }

/**
 * @param {import('node-fetch').Response} response
 *
 * @returns {AsyncIterable<Uint8Array>}
 */
function asyncIteratorFromResponse (response) {
  if (!response.body) {
    // React Native does not support streams yet, so this is a fallback.
    // This might cause memory issues for large files though and react-native
    // fetch api compatible should be polyfilled.

    return (async function * () {
      try {
        const text = await response.text()
        yield b4a.from(text)
      } finally {
        yield new Uint8Array()
      }
    })()
  } else if (response.body.on) {
    // Node fetch response body is already an async iterable stream
    // @ts-ignore
    return response.body
  } else {
    // Browser fetch, better have getReader()
    return (async function * () {
      // @ts-ignore
      const reader = response.body.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) return
          yield value
        }
      } finally {
        reader.releaseLock()
      }
    })()
  }
}

module.exports = Client
module.exports.Client = Client
module.exports.Store = Store

/**
 * @typedef {import('../record.js').KeyPair} KeyPair
 * @typedef {import('../record.js').JSONObject} JSONObject
 */
