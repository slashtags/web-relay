const b4a = require('b4a')
const sodium = require('sodium-universal')
const z32 = require('z32')

const HEADERS = {
  CONTENT_TYPE: 'content-type',
  METADATA: 'x-slashtags-web-relay-metadata',
  CONTENT_HASH: 'x-slashtags-web-relay-content-hash',
  SIGNATURE: 'x-slashtags-web-relay-signature'
}

const HEADERS_NAMES = Object.values(HEADERS).join(', ')

/**
 * Sign the contactination of contentHash and encoded metadata with the client's secretKey
 *
 * @param {{
 *  contentHash: Uint8Array,
 *  metadata: Uint8Array,
 *  secretKey: Uint8Array,
 * }} input
 */
function sign ({ contentHash, metadata, secretKey }) {
  const signable = encodeSignable(contentHash, metadata)

  const signature = b4a.alloc(sodium.crypto_sign_BYTES)
  sodium.crypto_sign_detached(signature, signable, secretKey)

  return signature
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
function verify ({ contentHash, metadata, signature, userID }) {
  const publicKey = z32.decode(userID)
  const signable = encodeSignable(contentHash, metadata)

  return sodium.crypto_sign_verify_detached(signature, signable, publicKey)
}

/**
 * @param {Uint8Array} contentHash
 * @param {Uint8Array} metadata
 */
function encodeSignable (contentHash, metadata) {
  return b4a.concat([contentHash, metadata])
}

module.exports = {
  HEADERS,
  HEADERS_NAMES,
  sign,
  verify
}

/**
 * @typedef {{
 *    [key: string]: JSONValue | Array<JSONValue> | JSONObject
 * }} Metadata
 *
 * @typedef { string | number | boolean | null } JSONValue
 * @typedef {{[key: string]: JSONValue | Array<JSONValue>}} JSONObject
 */
