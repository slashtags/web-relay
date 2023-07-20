const b4a = require('b4a')
const sodium = require('sodium-universal')

const HEADERS = {
  METADATA: 'x-slashtags-web-relay-metadata',
  CONTENT_HASH: 'x-slashtags-web-relay-content-hash',
  SIGNATURE: 'x-slashtags-web-relay-signature'
}

/**
 * Sign the contactination of contentHash and encoded metadata with the client's secretKey
 *
 * @param {Uint8Array} contentHash
 * @param {Uint8Array} metadata
 * @param {Uint8Array} secretKey
 */
function sign (contentHash, metadata, secretKey) {
  const signable = b4a.concat([contentHash, metadata])

  const signature = b4a.alloc(sodium.crypto_sign_BYTES)
  sodium.crypto_sign_detached(signature, signable, secretKey)

  return signature
}

/**
 * Create the http headers from the encoded signature, contentHash and metadata
 *
 * @param {{
 *  contentHash: Uint8Array,
 *  metadata: Uint8Array,
 *  signature: Uint8Array
 * }} input
 */
function toHeaders (input) {
  const { contentHash, metadata, signature } = input

  return {
    // Using hex because it is file path safe and easy to inspect by humans
    [HEADERS.CONTENT_HASH]: b4a.toString(contentHash, 'hex'),
    [HEADERS.METADATA]: b4a.toString(metadata, 'base64'),
    [HEADERS.SIGNATURE]: b4a.toString(signature, 'base64')
  }
}

/**
 * Decode the signature and metadata from http headers
 *
 * @param {object} headers
 *
 * @returns {{
 *  signature: Uint8Array,
 *  contentHash: Uint8Array,
 *  metadata: Uint8Array,
 *  contentID: string
 * }}
 */
function fromHeaders (headers) {
  const base64Metadata = headers[HEADERS.METADATA]

  const metadata = b4a.from(base64Metadata, 'base64url')
  const hexContentHash = headers[HEADERS.CONTENT_HASH]
  const base64Signature = headers[HEADERS.SIGNATURE]

  return {
    metadata,
    contentHash: b4a.from(hexContentHash, 'base64'),
    signature: b4a.from(base64Signature, 'base64'),
    // Hex encoded content hash, to be used as the file name
    contentID: hexContentHash
  }
}

module.exports = {
  HEADERS,
  sign,
  toHeaders,
  fromHeaders
}

/**
 * @typedef {{
 *    [key: string]: JSONValue | Array<JSONValue> | JSONObject
 * }} Metadata
 *
 * @typedef { string | number | boolean | null } JSONValue
 * @typedef {{[key: string]: JSONValue | Array<JSONValue>}} JSONObject
 */
