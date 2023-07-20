const sodium = require('sodium-universal')
const b4a = require('b4a')
const z32 = require('z32')
const blake3 = require('blake3')

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

    await blake3.load()
    const contentHash = blake3.hash(content)

    const encodedMetadata = encodeMetadata(opts.metadata || {})

    const signature = sign({ contentHash, metadata: encodedMetadata, secretKey: this._keyPair.secretKey })

    return fetch(url, {
      method: 'PUT',
      headers: {
        // Using hex because it is file path safe and easy to inspect by humans
        [HEADERS.CONTENT_HASH]: b4a.toString(contentHash, 'hex'),
        [HEADERS.METADATA]: b4a.toString(encodedMetadata, 'base64'),
        [HEADERS.SIGNATURE]: b4a.toString(signature, 'base64')
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
   * @returns {Promise<import('node-fetch').Response & {valid: Promise<boolean>}>}
   */
  async get (relayAddress, userID, path) {
    const url = origin(relayAddress) + '/' + userID + absolute(path)

    // Initialize the hasher before the stream starts
    await blake3.load()
    const hasher = blake3.createHash()

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

    response.body.on('data', chunk => {
      hasher.update(chunk)
    })

    // @ts-ignore
    response.valid = new Promise((resolve, reject) => {
      const validSignature = verify({
        contentHash: b4a.from(hexContentHash, 'hex'),
        metadata: b4a.from(base64Metadata, 'base64'),
        signature: b4a.from(base64Signature, 'base64'),
        userID
      })

      if (!validSignature) {
        // TODO: make a shared unique error type
        reject(new Error('Invalid signature'))
      }

      response.body.on('end', () => {
        const hash = hasher.digest().toString('hex')

        if (hash !== hexContentHash) {
          // TODO: make a shared unique error type
          reject(new Error('Content hash mismatch'))
        }
        resolve(hash === hexContentHash)
      })
    })

    // @ts-ignore
    return response
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
