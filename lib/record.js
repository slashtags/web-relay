const b4a = require('b4a')
const sodium = require('sodium-universal')
const { createBLAKE3 } = require('hash-wasm')

const { Result } = require('./utils.js')

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

    //                     65            97       103
    // -------------------------------------------------------
    // |   1   |     64    |      32     |    6    |    N    |
    // <version><signature><content-hash><timestamp><metadata>
    const buf = new Uint8Array(103 + metadata.length)

    buf[0] = this._version
    buf.set(this._signature, 1)
    buf.set(this._hash, 65)
    this._encodeTimestamp(buf, 97)
    buf.set(metadata, 103)

    return buf
  }

  toBase64 () {
    if (this._string) return this._string
    return b4a.toString(this.encode(), 'base64')
  }

  _encodeSignable () {
    const metadata = this._encodeMetadata()

    // -----------------------------------
    // |     32     |     6    |    N    |
    // <content-hash><timestamp><metadata>
    const buf = new Uint8Array(38 + metadata.length)

    buf.set(this._hash, 0)
    this._encodeTimestamp(buf, 32)
    buf.set(metadata, 38)

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
   * @param {number} [offset=0]
   */
  _encodeTimestamp (buf, offset = 0) {
    let timestamp = this._timestamp

    for (let i = offset; i < (offset + 6); i++) {
      const byte = timestamp & 0xff
      buf[i] = byte
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

    const signature = buf.slice(1, 65)
    const hash = buf.slice(65, 97)
    const timestamp = Record._decodeTimestamp(buf, 97)
    const metadata = Record._decodeMetadata(buf.slice(103))

    return new Record({ timestamp, hash, signature, metadata })
  }

  /**
   * @param {string} string
   */
  static fromBase64 (string) {
    try {
      const buf = b4a.from(string, 'base64')
      return Result.ok(buf)
    } catch (error) {
      return Result.err(error)
    }
  }

  /**
   * @param {Uint8Array} buf
   * @param {number} [offset=0]
   */
  static _decodeTimestamp (buf, offset = 0) {
    let timestamp = 0
    for (let i = (offset + 5); i >= offset; i--) {
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

module.exports = Record

/**
* @typedef { string | number | boolean | null } JSONValue
* @typedef {{[key: string]: JSONValue | Array<JSONValue>}} JSONObject
* @typedef {{ publicKey: Uint8Array, secretKey: Uint8Array }} KeyPair
*/
