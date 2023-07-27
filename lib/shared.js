const b4a = require('b4a')
const sodium = require('sodium-universal')
const SlashURL = require('@synonymdev/slashtags-url')
const { createBLAKE3 } = require('hash-wasm')

class ContentHash {
  /**
   * @param {Uint8Array} content
   */
  static async hash (content) {
    const hasher = await createBLAKE3()
    return hasher.update(content).digest('binary')
  }

  /**
   * @param {Uint8Array} hash
   * @returns {string}
   */
  static serialize (hash) {
    return b4a.toString(hash, 'hex')
  }

  /**
   * @param {string | Uint8Array} hash
   * @returns {Uint8Array | null}
   */
  static deserialize (hash) {
    return trycatch(() => {
      const buf = b4a.from(hash, 'hex')
      return buf.length === 32 ? buf : null
    }) || null
  }
}

class Metadata {
  /**
   * @param {JSONObject} metadata
   * @returns {Uint8Array}
   */
  static encode (metadata) {
    return trycatch(() => b4a.from(JSON.stringify(metadata)))
  }

  /**
   * @param {Uint8Array | JSONObject} metadata
   * @returns {string}
   */
  static serialize (metadata) {
    const buf = metadata instanceof Uint8Array ? metadata : Metadata.encode(metadata)
    // @ts-ignore
    return b4a.toString(buf, 'base64')
  }

  /**
   * @param {string} metadata
   * @returns {JSONObject | null}
   */
  static deserialize (metadata) {
    try {
      /** @type {Uint8Array} */
      const buf = b4a.from(metadata, 'base64')
      return JSON.parse(b4a.toString(buf))
    } catch {
      return null
    }
  }
}

class Signature {
  /**
   * @param {Uint8Array} signature
   * @returns {string}
   */
  static serialize (signature) {
    return b4a.toString(signature, 'base64')
  }

  /**
   * @param {string} string
   * @returns {Uint8Array | null}
   */
  static deserialize (string) {
    const buf = b4a.from(string, 'base64')
    return buf.length === sodium.crypto_sign_BYTES ? buf : null
  }

  /**
   * Verify the signature over the content hash and encoded metadata
   *
   * @param {{
   *  contentHash: Uint8Array,
   *  metadata: Uint8Array,
   *  signature: Uint8Array,
   *  userID: string,
   * }} input
   */
  static verify ({ contentHash, metadata, signature, userID }) {
    const publicKey = SlashURL.decode(userID)
    const signable = Signature.signable(contentHash, metadata)

    return sodium.crypto_sign_verify_detached(signature, signable, publicKey)
  }

  /**
   * Sign the contactination of contentHash and encoded metadata with the client's secretKey
   *
   * @param {{
   *  contentHash: Uint8Array,
   *  metadata: Uint8Array,
   *  secretKey: Uint8Array,
   * }} input
   *
   * @returns {Uint8Array}
   */
  static sign ({ contentHash, metadata, secretKey }) {
    const signable = Signature.signable(contentHash, metadata)

    const signature = b4a.alloc(sodium.crypto_sign_BYTES)
    sodium.crypto_sign_detached(signature, signable, secretKey)

    return signature
  }

  /**
   * @param {Uint8Array} contentHash
   * @param {Uint8Array} metadata
   */
  static signable (contentHash, metadata) {
    return b4a.concat([contentHash, metadata])
  }
}

class Shared {
  static HEADERS = {
    CONTENT_TYPE: 'content-type',
    METADATA: 'x-slashtags-web-relay-metadata',
    CONTENT_HASH: 'x-slashtags-web-relay-content-hash',
    SIGNATURE: 'x-slashtags-web-relay-signature'
  }

  static HEADERS_NAMES = Object.values(Shared.HEADERS).join(', ')

  static Metadata = Metadata
  static ContentHash = ContentHash
  static Signature = Signature

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

  /**
   * @param {string | string[]} base64Signature
   */
  static decodeSignature (base64Signature) {
    try {
      const signature = b4a.from(base64Signature.toString(), 'base64')
      if (signature.length === 64) return signature
    } catch { }
    return null
  }

  /**
   * @param {string} metadata
   * @returns {Uint8Array | null}
   */
  static decodeMetadata (metadata) {
    return trycatch(() => b4a.from(metadata, 'base64')) || null
  }

  /**
   * @param {Map<string, string> | import('http').IncomingHttpHeaders} headers
   */
  static decodeHeaders (headers) {
    if (!headers) headers = {}
    if (headers instanceof Map) headers = Object.fromEntries(headers.entries())

    const hexContentHash = headers[Shared.HEADERS.CONTENT_HASH]?.toString()
    const base64Metadata = headers[Shared.HEADERS.METADATA]?.toString()
    const base64Signature = headers[Shared.HEADERS.SIGNATURE]?.toString()

    const metadata = Metadata.encode(Metadata.deserialize(base64Metadata))
    const contentHash = ContentHash.deserialize(hexContentHash)
    const signature = Signature.deserialize(base64Signature)

    return { metadata, contentHash, signature, hexContentHash, base64Signature, base64Metadata }
  }
}

module.exports = Shared

function trycatch (cb) {
  try {
    return cb()
  } catch { }
}

/**
* @typedef { string | number | boolean | null } JSONValue
* @typedef {{[key: string]: JSONValue | Array<JSONValue>}} JSONObject
*/
