const sodium = require('sodium-universal')
const b4a = require('b4a')
const z32 = require('z32')
const { createBLAKE3 } = require('hash-wasm')

/** @type {import('node-fetch')['default']} */
// @ts-ignore
const fetch = require('node-fetch')

const { HEADERS, sign, verify } = require('./shared.js')

class WebRelayClient {
  /**
   * @param {KeyPair} [keyPair]
   */
  constructor (keyPair) {
    this._keyPair = keyPair || WebRelayClient.createKeyPair()

    this._id = z32.encode(this._keyPair.publicKey)
  }

  /**
   * z-base32 encoding of the user publicKey
   */
  get id () {
    return this._id
  }

  /**
   * Send a put request to the provided Relay
   *
   * @param {string} relayAddress - http address of the relay
   * @param {string} path - path of the file to put
   * @param {Uint8Array} content - content of the file
   * @param {object} [opts]
   * @param {Metadata} [opts.metadata]
   *
   * @returns {Promise<import('node-fetch').Response>}
   */
  async put (relayAddress, path, content, opts = {}) {
    const url = origin(relayAddress) + '/' + this._id + absolute(path)

    const hasher = await createBLAKE3()
    const contentHash = hasher.update(content).digest('binary')

    const encodedMetadata = encodeMetadata(opts.metadata || {})

    const signature = sign({ contentHash, metadata: encodedMetadata, secretKey: this._keyPair.secretKey })

    return fetch(url, {
      method: 'PUT',
      headers: {
        // Using hex because it is file path safe and easy to inspect by humans
        [HEADERS.CONTENT_HASH]: b4a.toString(contentHash, 'hex'),
        [HEADERS.METADATA]: b4a.toString(encodedMetadata, 'base64'),
        [HEADERS.SIGNATURE]: b4a.toString(signature, 'base64'),
        [HEADERS.CONTENT_TYPE]: 'application/octet-stream'
      },
      body: content
    })
  }

  /**
   * Send a get request to the provided Relay
   *
   * @param {string} relayAddress - http address of the relay
   * @param {string} userID - path of the file to put
   * @param {string} path - path of the file to put
   *
   * @returns {Promise<GetResponse>}
   */
  async get (relayAddress, userID, path) {
    const url = origin(relayAddress) + '/' + userID + absolute(path)

    // Initialize the hasher before the stream starts
    const hasher = await createBLAKE3()

    const response = await fetch(url, {
      method: 'GET'
      // TODO: add etag support
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`)
    }

    const hexContentHash = response.headers.get(HEADERS.CONTENT_HASH)
    const base64Metadata = response.headers.get(HEADERS.METADATA)
    const base64Signature = response.headers.get(HEADERS.SIGNATURE)

    const encodedMetadata = b4a.from(base64Metadata, 'base64')

    const validSignature = verify({
      contentHash: b4a.from(hexContentHash, 'hex'),
      metadata: encodedMetadata,
      signature: b4a.from(base64Signature, 'base64'),
      userID
    })

    if (!validSignature) {
      // TODO: make a shared unique error type
      throw new Error('Invalid signature')
    }

    /** @type {Metadata} */
    let metadata
    try {
      metadata = JSON.parse(b4a.toString(encodedMetadata))
    } catch { }

    return new GetResponse(response, hasher, metadata, hexContentHash)
  }

  /**
   * Create a keyPair from a provided or random seed
   *
   * @param {Uint8Array} [seed]
   */
  static createKeyPair (seed) {
    const publicKey = b4a.allocUnsafe(sodium.crypto_sign_PUBLICKEYBYTES)
    const secretKey = b4a.allocUnsafe(sodium.crypto_sign_SECRETKEYBYTES)

    if (seed) sodium.crypto_sign_seed_keypair(publicKey, secretKey, seed)
    else sodium.crypto_sign_keypair(publicKey, secretKey)

    return {
      publicKey,
      secretKey
    }
  }
}

class GetResponse {
  /**
   * @param {import('node-fetch').Response} response
   * @param {Awaited<ReturnType<import('hash-wasm')['createBLAKE3']>>} hasher
   * @param {Metadata} metadata
   * @param {string} hexContentHash
   */
  constructor (response, hasher, metadata, hexContentHash) {
    this._hasher = hasher
    this._hexContentHash = hexContentHash

    this.metadata = metadata

    this._isNodeFetch = !!response.body.on

    this._reader = this._isNodeFetch
      ? response.body//             Node
      // @ts-ignore
      : response.body.getReader() // Browser
  }

  async * [Symbol.asyncIterator] () {
    let done = false

    while (true) {
      /** @type {Uint8Array} */
      // @ts-ignore
      let chunk

      if (this._isNodeFetch) {
        chunk = this._reader.read()
        done = !chunk
      } else {
        const result = await this._reader.read()
        chunk = result.value
        done = result.done
      }

      if (done) break

      this._hasher.update(chunk)
      yield chunk
    }

    const hash = this._hasher.digest('hex')
    this.valid = hash === this._hexContentHash
    this.hash = hash
  }
}

/**
     * Encode metadata as Uint8Array and base64 string
     *
     * @param {Metadata} metadata
     *
     * @returns {Uint8Array}
     */
function encodeMetadata (metadata) {
  const stringfied = JSON.stringify(metadata || {})
  const encoded = b4a.from(stringfied)

  return encoded
}

/**
 * @param {string} url
 */
function origin (url) {
  return url.split('#')[0] // without fragment
    .split('?')[0] //         without query
    .replace(/\/$/, '') //    without trailing slash
}

/**
 * @param {string} path
 */
function absolute (path) {
  if (!path.startsWith('/')) return '/' + path
  return path
}

module.exports = WebRelayClient

/**
 * @typedef {{
 *  publicKey: Uint8Array,
 *  secretKey: Uint8Array
 * }} KeyPair
 *
 * @typedef {import('./shared.js').Metadata} Metadata
 */
