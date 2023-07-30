const b4a = require('b4a')
const sodium = require('sodium-universal')
const { createBLAKE3 } = require('hash-wasm')

const { Result } = require('./utils.js')

class Entry {
  /**
   * @param {object} params
   */
  constructor (params) {
    this._path = params.path
    this._record = params.record
    this._hash = params.hash
    this._timestamp = params.timestamp
    this._metadata = params.metadata
    this._signature = params.signature
  }

  get path () {
    return this._path
  }

  get hash () {
    return this._hash
  }

  get timestamp () {
    return this._timestamp
  }

  get metadata () {
    return this._metadata
  }

  get signature () {
    return this._signature
  }

  /**
   * Serialized signed record to be saved or sent to the web relay
   *
   * @overload
   * @param {'binary'} [encoding]
   * @returns {Uint8Array}
   * @overload
   * @param {'base64'} encoding
   * @returns {string}
   */
  record (encoding = 'binary') {
    return encoding === 'binary' ? this._record : b4a.toString(this._record, encoding)
  }

  /**
   * @param {KeyPair} keyPair
   * @param {string} path
   * @param {Uint8Array} content
   * @param {object} [opts]
   * @param {number} [opts.timestamp]
   * @param {JSONObject} [opts.metadata]
   */
  static async create (keyPair, path, content, opts = {}) {
    const timestamp = opts.timestamp || Date.now()
    const hasher = await createBLAKE3()
    const hash = hasher.update(content).digest('binary')

    const serializedMetadata = serializeMetadata(opts.metadata)

    // |    64     |  32  |     6     |     M    |
    // |-----------|------|-----------|----------|
    // | signature | hash | timestamp | metadata |
    const record = new Uint8Array(64 + 32 + 6 + serializedMetadata.length)

    record.set(hash, 64)
    serializeTimestamp(timestamp, record, 96)
    record.set(serializedMetadata, 102)

    const signature = record.subarray(0, 64)

    // |  P   |  32  |     6     |     M    |
    // |------|------|-----------|----------|
    // | path | hash | timestamp | metadata |
    const signable = b4a.concat([b4a.from(path), record.subarray(64)])

    sodium.crypto_sign_detached(signature, signable, keyPair.secretKey)

    return new Entry({
      publicKey: keyPair.publicKey,
      path,
      hash,
      timestamp,
      signature,
      record,
      metadata: opts.metadata
    })
  }

  /**
   * @param {Uint8Array} publicKey
   * @param {string} path
   * @param {string} record
   */
  static deserialize (publicKey, path, record) {
    try {
      const buf = b4a.from(record, 'base64')

      const signature = buf.subarray(0, 64)
      const hash = buf.subarray(64, 96)
      const timestamp = deserializeTimestamp(buf, 96)
      const metadata = deserializeMetadata(buf.subarray(102))

      if (!verify(publicKey, path, buf)) {
        throw new Error('invalid signature')
      }

      const entry = new Entry({
        publicKey,
        path,
        hash,
        timestamp,
        signature,
        record: buf,
        metadata
      })

      return Result.ok(entry)
    } catch (error) {
      return Result.err(error)
    }
  }
}

/**
 * @param {Uint8Array} buf
 * @param {number} [offset=0]
 */
function deserializeTimestamp (buf, offset = 0) {
  let timestamp = 0
  for (let i = (offset + 5); i >= offset; i--) {
    timestamp = (timestamp * 256) + buf[i]
  }
  return timestamp
}

/**
 * @param {Uint8Array} buf
 */
function deserializeMetadata (buf) {
  try {
    const string = b4a.toString(buf)
    return JSON.parse(string)
  } catch {
    return null
  }
}

/**
 * serialize a milliseconds timestamp as a 6-byte Uint8Array.
 * @param {number} timestamp
 * @param {Uint8Array} buf
 * @param {number} [offset=0]
 */
function serializeTimestamp (timestamp, buf, offset = 0) {
  for (let i = offset; i < (offset + 6); i++) {
    const byte = timestamp & 0xff
    buf[i] = byte
    timestamp = (timestamp - byte) / 256
  }
}

/**
 * @param {JSONObject} metadata
 * @returns {Uint8Array}
 */
function serializeMetadata (metadata) {
  try {
    const string = JSON.stringify(metadata)
    return b4a.from(string)
  } catch (error) {
    return b4a.alloc(0)
  }
}

/**
 * Verify the signature over the content hash and serialized metadata
 *
 * @param {Uint8Array} publicKey
 * @param {string} path
 * @param {Uint8Array} record
 */
function verify (publicKey, path, record) {
  const signature = record.subarray(0, 64)
  const signable = b4a.concat([b4a.from(path), record.subarray(64)])

  return sodium.crypto_sign_verify_detached(signature, signable, publicKey)
}

module.exports = Entry

/**
* @typedef { string | number | boolean | null } JSONValue
* @typedef {{[key: string]: JSONValue | Array<JSONValue>}} JSONObject
* @typedef {{ publicKey: Uint8Array, secretKey: Uint8Array }} KeyPair
*/
