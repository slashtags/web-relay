const b4a = require('b4a')
const SlashURL = require('@synonymdev/slashtags-url')
const { Level } = require('level')
const EventSource = require('./eventsource.js')
const sodium = require('sodium-universal')
const { createHash } = require('crypto')
/** @type {import('node-fetch')['default']} */
// @ts-ignore
const fetch = require('node-fetch')

const DEFAULT_STORAGE = require('./default-storage.js')
const { createKeyPair } = require('../utils.js')
const { HEADERS } = require('../constants.js')
const Record = require('../record.js')

const NAMESPACE = b4a.from('slashtags-web-relay')

// TODO: Encrypt data
// TODO: Extract the following to Abstract-Adaptor

const PREFIXES = {
  RECORDS: 'records!',
  BLOBS: 'blobs!',
  PENDING_RECORDS: 'pending-records!'
}

// TODO: Implement an exponential backoff
const RETRY_INTERVAL = 10000 // 10 seconds

class Client {
  /**
   * @param {object} [opts]
   * @param {string} [opts.relay]
   * @param {KeyPair} [opts.keyPair]
   * @param {string} [opts.storage]
   */
  constructor (opts = {}) {
    const { relay, keyPair, storage } = opts

    this._keyPair = keyPair || createKeyPair()

    this._relay = relay && origin(relay)

    // Use a separate storage per user
    let _storage = storage || DEFAULT_STORAGE
    if (!_storage.endsWith('/')) _storage += '/'
    const userStorage = _storage + this.id

    /** @type {import('level').Level<string, any>} */
    // @ts-ignore
    // Using single store instead of sub levels to enable batching
    this._store = new Level(userStorage, { valueEncoding: 'buffer' })

    /** @type {Map<string, ReturnType<setTimeout>>} */
    this._retryTimeouts = new Map()
    /** @type {Map<string, () => void>} */
    this._supscriptions = new Map()

    if (this._relay) this._sendPending()
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
   *
   * @returns {Promise<void>}
   */
  async put (path, content, opts = {}) {
    const fullPath = this._fullPath(path)

    content = opts.encrypt ? await this._encrypt(path, content) : content

    const record = await Record.create(this._keyPair, fullPath, content, { metadata: { encrypted: opts.encrypt } })

    this._trySendToRelay(fullPath, content, record)

    return this._put(fullPath, content, record)
  }

  /**
   * @param {string} path
   *
   * @returns {Promise<void>}
   */
  async del (path, opts = {}) {
    const fullPath = this._fullPath(path)

    const content = b4a.alloc(0)

    const record = await Record.create(this._keyPair, fullPath, content, opts)

    this._trySendToRelay(fullPath, content, record)

    return this._put(fullPath, content, record)
  }

  /**
   * @param {string} path
   *
   * @returns {Promise<Uint8Array | null>}
   */
  async get (path) {
    const fullPath = this._fullPath(path)
    const parsed = this._parseURL(path)

    /** @type {Record} */
    const record = await this._getStoredRecord(fullPath)
    const fromRelay = this._getFromRelay(parsed.relay, fullPath, record, parsed.encryptionKey)

    if (!record) return fromRelay

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
    if (saved?.timestamp > timestamp) return

    const key = PREFIXES.PENDING_RECORDS + path
    return this._store.del(key)
  }

  /**
   * @param {string} path
   * @param {Uint8Array} content
   * @param {Record} record
   */
  async _trySendToRelay (path, content, record) {
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

    if (response?.status === 200 || response?.status === 409) {
      return this._removePending(path, record.timestamp)
    }

    // Clear existing timeout
    const existing = this._retryTimeouts.get(path)
    if (existing) clearTimeout(existing)

    this._retryTimeouts.set(
      path,
      setTimeout(
        () => this._trySendToRelay(path, content, record),
        RETRY_INTERVAL
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

    const isNodeFetch = !!response.body.on
    const reader = isNodeFetch
      ? response.body//             Node
      // @ts-ignore
      : response.body.getReader() // Browser

    const chunks = []

    while (true) {
      /** @type {Uint8Array} */
      // @ts-ignore
      let chunk
      let done = false

      if (isNodeFetch) {
        chunk = reader.read()
        done = !chunk
      } else {
        const result = await reader.read()
        chunk = result.value
        done = result.done
      }

      if (done) break

      hasher.update(chunk)
      chunks.push(chunk)
    }

    const content = b4a.concat(chunks)

    const header = response.headers.get(HEADERS.RECORD)?.toString()
    const deserialized = Record.deserialize(header)
    const record = deserialized.value
    if (!record) return null

    // Invalid signature
    if (!record.verify(path)) return null

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
    for await (const [key, value] of this._store.iterator({ gt: 'pending-records', lte: 'pending-records~' })) {
      const path = key.slice(PREFIXES.PENDING_RECORDS.length)
      const record = Record.deserialize(value).value

      if (!record) continue

      const content = await this._store.get(PREFIXES.BLOBS + b4a.toString(record.hash, 'hex'))
        .catch(noop)

      if (!content) continue

      this._trySendToRelay(path, content, record)
    }
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

module.exports = Client
module.exports.Client = Client

/**
 * @typedef {import('../record.js').KeyPair} KeyPair
 * @typedef {import('../record.js').JSONObject} JSONObject
 */
