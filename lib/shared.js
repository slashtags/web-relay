const b4a = require('b4a')
const sodium = require('sodium-universal')
const SlashURL = require('@synonymdev/slashtags-url')
const z32 = require('z32')
const { createBLAKE3 } = require('hash-wasm')

class Record {
  /**
   * @param {object} params
   * @param {KeyPair} [params.keyPair]
   * @param {number} [params.timestamp]
   * @param {Uint8Array} [params.hash]
   * @param {Uint8Array} [params.signature]
   * @param {JSONObject} [params.metadata]
   */
  constructor (params) {
    this._keyPair = params.keyPair
    // Version 0 of the Record encoding.
    this._version = 0
    this._timestamp = params.timestamp
    this._hash = params.hash
    this._metadata = params.metadata
    this._signature = params.signature

    /** @type {Uint8Array} */
    this._encoded
    /** @type {string} */
    this._string
  }

  get timestamp () {
    return this._timestamp
  }

  get hash () {
    return this._hash
  }

  get metadata () {
    return this._metadata
  }

  get signature () {
    return this._signature
  }

  /**
   * @returns {Uint8Array}
   */
  sign () {
    if (!this._keyPair) throw new Error('Can not sign a record without a keyPair')
    if (this._signature) return this._signature

    this._signature = new Uint8Array(sodium.crypto_sign_BYTES)

    const signable = this._encodeSignable()
    sodium.crypto_sign_detached(this._signature, signable, this._keyPair.secretKey)

    return this._signature
  }

  /**
   * @returns {Uint8Array}
   */
  encode () {
    if (this._encoded) return this._encoded

    const metadata = this._encodeMetadata()

    //                    7             39         103
    // -------------------------------------------------------
    // |   1   |     6    |      32     |   64     |    N    |
    // <version><timestamp><content-hash><signature><metadata>
    /** @type {Uint8Array} */
    const buf = new Uint8Array(103 + metadata.length)

    buf[0] = this._version
    this._encodeTimestamp(buf)
    buf.set(this._hash, 7)
    buf.set(this._signature, 39)
    buf.set(metadata, 103)

    return buf
  }

  toHeader () {
    if (this._string) return this._string
    return b4a.toString(this.encode(), 'base64')
  }

  _encodeSignable () {
    const metadata = this._encodeMetadata()

    //                    7             39
    // -------------------------------------------
    // |   1   |     6    |      32     |   N    |
    // <version><timestamp><content-hash><metadata>
    /** @type {Uint8Array} */
    const buf = new Uint8Array(103 + metadata.length)

    buf[0] = this._version
    this._encodeTimestamp(buf)
    buf.set(this._hash, 7)
    buf.set(metadata, 39)

    return buf
  }

  /**
   * @returns {Uint8Array}
   */
  _encodeMetadata () {
    try {
      const string = JSON.stringify(this._metadata)
      return b4a.from(string)
    } catch (error) {
      return b4a.alloc(0)
    }
  }

  /**
   * Encode a milliseconds timestamp as a 6-byte Uint8Array.
   * @param {Uint8Array} buf
   */
  _encodeTimestamp (buf) {
    let timestamp = this._timestamp

    for (let index = 1; index < 7; index++) {
      const byte = timestamp & 0xff
      buf[index] = byte
      timestamp = (timestamp - byte) / 256
    }
  }

  /**
   * @param {Uint8Array} content
   * @param {ConstructorParameters<typeof Record>[0]} [params]
   */
  static async fromContent (content, params = {}) {
    const hasher = await createBLAKE3()
    const hash = hasher.update(content).digest('binary')

    const record = new Record({
      ...params,
      hash,
      timestamp: params.timestamp || Date.now()
    })
    record.sign()

    return record
  }

  /**
   * @param {Uint8Array} buf
   */
  static decode (buf) {
    const version = buf[0]
    if (version !== 0) throw new Error(`Unsupported version ${version}`)

    const timestamp = Record._decodeTimestamp(buf)
    const hash = buf.slice(7, 39)
    const signature = buf.slice(39, 103)
    const metadata = Record._decodeMetadata(buf.slice(103))

    return new Record({ timestamp, hash, signature, metadata })
  }

  /**
   * @param {string} string
   */
  static fromHeader (string) {
    const buf = b4a.from(string, 'base64')
    return Record.decode(buf)
  }

  /**
   * @param {Uint8Array} buf
   */
  static _decodeTimestamp (buf) {
    let timestamp = 0
    for (let i = 6; i >= 1; i--) {
      timestamp = (timestamp * 256) + buf[i]
    }
    return timestamp
  }

  /**
   * @param {Uint8Array} buf
   */
  static _decodeMetadata (buf) {
    try {
      const string = b4a.toString(buf)
      return JSON.parse(string)
    } catch {
      return null
    }
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

  static Record = Record

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
* @typedef {{ publicKey: Uint8Array, secretKey: Uint8Array }} KeyPair
*/
