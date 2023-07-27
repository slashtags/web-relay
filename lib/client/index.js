const b4a = require('b4a')
const SlashURL = require('@synonymdev/slashtags-url')
const { Level } = require('level')
const EventSource = require('eventsource')

const DEFAULT_STORAGE = require('./default-storage.js')
const { createKeyPair, Signature, ContentHash } = require('../shared.js')

// TODO: Encrypt data
// TODO: Extract the following to Abstract-Adaptor

const PREFIXES = {
  RECORDS: 'records!',
  BLOBS: 'blobs!',
  PENDING_RECORDS: 'pending-records!'
}

// TODO: Implement an exponential backoff
const RETRY_INTERVAL = 10000 // 10 seconds

class WebRelayAdaptor {
  /**
   * @param {object} [opts]
   * @param {string} [opts.relay]
   * @param {KeyPair} [opts.keyPair]
   * @param {string} [opts.storage]
   */
  constructoropts = {}) {
    const { relay, keyPair, storage } = opts

    this._keyPair = keyPair || createKeyPair()

    this.key = this._keyPair.publicKey
    this.id = SlashURL.encode(this.key)

    this._relay = relay

    /** @type {import('level').Level<string, any>} */
    // @ts-ignore
    // Using single store instead of sub levels to enable batching
    this._store = new Level(storage || DEFAULT_STORAGE)

    /** @type {Map<string, ReturnType<setTimeout>>} */
    this._retryTimeouts = new Map()

    if (this._relay) this._sendPending()
  }

  /**
   * @param {string} path
   * @param {Uint8Array} content
   * @param {object} [opts]
   * @param {Metadata} [opts.metadata]
   *
   * @returns {Promise<void>}
   */
  async putpath, content, opts = {}) {
    const metadata = { ...opts.metadata, timestamp: Date.now() }

    const contentHash = await ContentHash.hash(content)
    const encodedMetadata = encodeMetadata(metadata)

    /** @type {Uint8Array} */
    const signature = Signature.sign({ contentHash, metadata: encodedMetadata, secretKey: this._keyPair.secretKey })

    this._trySendToRelay(path, content, contentHash, signature, metadata)

    return this._put(this.id, path, content, b4a.toString(contentHash, 'hex'), metadata, Signature.serialize(signature))
  }

  /**
   * Remove the file from pending database
   *
   * @param {string} path - path relative to the user's root
   * @param {number} timestamp - timestamp of the record that was successfully sent to the relay
   */
  async _removePendingpath, timestamp) {
    // Add the userID as the root of the path
    path = absolute(path)
    const key = PREFIXES.PENDING_RECORDS + path

    const saved = await this._store.get(key)

    if (!saved) return

    const metadata = JSON.parse(saved)
    // If the record was updated since, we don't delete the pending write.
    if (metadata.timestamp >= timestamp) return

    return this._store.del(key)
  }

  /**
   * Create a retry interval function
   *
   * @param {string} path
   * @param {Uint8Array} content
   * @param {Uint8Array} hash
   * @param {Uint8Array} signature
   * @param {Metadata} metadata
   */
  async _trySendToRelaypath, content, hash, signature, metadata) {
    if (!this._relay) return

    const url = origin(this._relay) + '/' + this.id + absolute(path)

    try {
      const response = fetch(url, {
        method: 'PUT',
        headers: {
          // Using hex because it is file path safe and easy to inspect by humans
          [HEADERS.CONTENT_HASH]: contentHash,
          [HEADERS.METADATA]: b4a.toString(encodedMetadata, 'base64'),
          [HEADERS.SIGNATURE]: b4a.toString(signature, 'base64'),
          [HEADERS.CONTENT_TYPE]: 'application/octet-stream'
        },
        body: content
      })
      // @ts-ignore
      if (response.ok) {
        // @ts-ignore
        this._removePending(path, metadata.timestamp)
      } else {
        throw new Error(response.statusText)
      }
    } catch (error) {
      // Clear existing timeout
      const existing = this._retryTimeouts.get(path)
      if (existing) clearTimeout(existing)

      this._retryTimeouts.set(
        path,
        setTimeout(
          () => this._trySendToRelay(path, content, hash, metadata),
          RETRY_INTERVAL
        )
      )
    }
  }

  /**
   * @param {string} path
   *
   * @returns {Promise<Uint8Array | null>}
   */
  async getpath) {
    let id = this._client.id
    let relay = this._relay

    if (path.startsWith('slash:')) {
      const parsed = SlashURL.parse(path)
      id = parsed.id
      path = parsed.path
      if (parsed.query.relay) relay = parsed.query.relay.toString()
    }

    let record
    try {
      const key = PREFIXES.RECORDS + id + absolute(path)
      record = await this._store.get(key, { valueEncoding: 'json' })
    } catch (error) {
      if (error.status === 404) return null
      throw error
    }

    const fromRelay = this._getFromRelay(relay, id, path, record)

    if (!record) return fromRelay

    return this._store.get(PREFIXES.BLOBS + record.hash, { valueEncoding: 'buffer' })
      .catch((error) => {
        if (error.status === 404) return null
        throw error
      })
  }

  /**
   * Get data from the relay and save it to the local key-value store.
   *
   * @param {string} relay
   * @param {string} id - Author's ID
   * @param {string} path
   *
   * @returns {Promise<Uint8Array | null>}
   */
  async _getFromRelayrelay, id, path) {
    if (!relay) return null

    /** @type {Awaited<ReturnType<import('@synonymdev/web-relay/types/lib/client.js')['get']>>} */
    let response
    try {
      response = await this._client.get(relay, id, path)
    } catch (error) {
      if (error.message === '404') return null
      throw error
    }

    /** @type {Uint8Array[]} */
    const chunks = []
    for await (const chunk of response) {
      chunks.push(chunk)
    }
    const content = b4a.concat(chunks)

    // Cache the result locally
    if (id !== this._client.id && content !== null) {
      this._put(id, path, content, response.hash, response.metadata)
    }

    return content
  }

  /**
   * Save data to the local key-value store.
   *
   * @param {string} id - remote user's id
   * @param {string} path - path relative to the user's root
   * @param {Uint8Array} content
   * @param {string} hash
   * @param {Metadata} metadata
   * @param {string} signature
   */
  async _put(id, path, content, hash, metadata, signature) {
    // Add the userID as the root of the path
    path = id + absolute(path)

    const batch = this._store.batch()

    if (path.startsWith(id)) {
      const key = PREFIXES.PENDING_RECORDS + path.slice(id.length)
      // save as a pending record to sync to the relay
      batch.put(key, { metadata, hash, signature }, { valueEncoding: 'json' })
    }

    // Write to the active records and blobs
    batch.put(PREFIXES.RECORDS + path, { metadata, hash }, { valueEncoding: 'json' })
    batch.put(PREFIXES.BLOBS + hash, content, { valueEncoding: 'buffer' })

    return batch.write()
  }

  /**
   * Start sending pending records to the relay.
   */
  async _sendPending) {
    for await (const [key, value] of this._store.iterator({ gt: 'pending-records', lte: 'pending-records~' })) {
      try {
        const path = key.slice(PREFIXES.PENDING_RECORDS.length)
        const { metadata, hash } = JSON.parse(value)

        const content = await this._store.get(PREFIXES.BLOBS + hash, { valueEncoding: 'buffer' })

        this._trySendToRelay(path, content, b4a.from(hash, 'hex'), metadata)
      } catch (error) {
        continue
      }
    }
  }

  /**
   * @param {string} path
   * @param {(value: Uint8Array | null) => any} onupdate
   */
  subscribepath) {
    return
    let id = this._client.id
    let relay = this._relay

    if (url.startsWith('slash:')) {
      url = '/subscribe/' + url.slice('slash:'.length)
      const parsed = SlashURL.parse(url)
      id = parsed.id
      path = parsed.path
      if (parsed.query.relay) relay = parsed.query.relay.toString()
    }

    const url = relay + '/subscribe/' + id + absolute(path)

    const eventsource = new EventSource(url)
    eventsource.on('message', ({ data }) => {
      // const { }

    })
  }

  /**
     * Return a url that can be shared by others to acess a file.
     *
     * @param {string} path
     *
     * @returns {Promise<string>}
     */
  async createURLpath) {
    WebRelayAdaptor.validatePath(path)

    const query = `${this._relay ? 'relay=' + this._relay : ''}`

    // Return a promise to be consistent with other adaptors that
    // may need to generate the url asynchronously, see SlashtagsCoreData.
    return SlashURL.format(this.key, { path: absolute(path), query })
  }

  close) {
    this._retryTimeouts.forEach(clearTimeout)
    return this._store.close()
  }

  /**
   * Validate a path to only contain valid characters.
   * @param {string} path
   */
  static validatePathpath) {
    if (!/^[^?#]+$/.test(path)) throw new AdaptorError(WebRelayAdaptor.ERROR_CODES.INVALID_PATH)
  }

  static ERROR_CODES = {
    INVALID_PATH: {
      message: 'INVALID_PATH',
      cause: 'Path must be a string and can only contain the following characters: 0-9a-zA-Z-._ /'
    }
  }
}

class AdaptorError extends Error {
  constructoropts) {
    super(opts.message, opts)
    this.name = 'SlashtagsProtocolAdaptorError'
    this.code = opts.code
  }
}

/**
 * @param {string} path
 */
function absolutepath) {
  if (!path.startsWith('/')) return '/' + path
  return path
}

/**
 * @param {string} url
 */
function originurl) {
  return url.split('#')[0] // without fragment
    .split('?')[0] //         without query
    .replace(/\/$/, '') //    without trailing slash
}

/**
 * Encode metadata as Uint8Array and base64 string
 *
 * @param {Metadata} metadata
 *
 * @returns {Uint8Array}
 */
function encodeMetadatametadata) {
  const stringfied = JSON.stringify(metadata || {})
  const encoded = b4a.from(stringfied)

  return encoded
}

module.exports = WebRelayAdaptor

/**
 * @typedef {import('@synonymdev/web-relay/types/lib/client').KeyPair} KeyPair
 * @typedef {import('@synonymdev/web-relay/types/lib/client').Metadata} Metadata
 */
