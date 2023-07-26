const b4a = require('b4a')
const sodium = require('sodium-universal')
const SlashURL = require('@synonymdev/slashtags-url')

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
function sign({ contentHash, metadata, secretKey }) {
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
function verify({ contentHash, metadata, signature, userID }) {
  const publicKey = SlashURL.decode(userID)
  const signable = encodeSignable(contentHash, metadata)

  return sodium.crypto_sign_verify_detached(signature, signable, publicKey)
}

/**
 * @param {Uint8Array} contentHash
 * @param {Uint8Array} metadata
 */
function encodeSignable(contentHash, metadata) {
  return b4a.concat([contentHash, metadata])
}

/**
 * @param {string|string[]} hexContentHash
 */
function decodeContentHash(hexContentHash) {
  try {
    const hash = b4a.from(hexContentHash, 'hex')
    if (hash.length === 32) return hash
  } catch { }
  return null
}

/**
 * @param {string | string[]} base64Signature
 */
function decodeSignature(base64Signature) {
  try {
    const signature = b4a.from(base64Signature.toString(), 'base64')
    if (signature.length === 64) return signature
  } catch { }
  return null
}

/**
 * @param {string} base64Metadata
 */
function decodeMetadata(base64Metadata) {
  try {
    return b4a.from(base64Metadata, 'base64')
  } catch { }
  return b4a.alloc(0)
}

/**
 * @param {Map<string, string> | import('http').IncomingHttpHeaders} headers
 */
function decodeHeaders(headers) {
  if (!headers) headers = {}
  if (headers instanceof Map) headers = Object.fromEntries(headers.entries())

  const hexContentHash = headers[HEADERS.CONTENT_HASH]?.toString()
  const base64Metadata = headers[HEADERS.METADATA]?.toString()
  const base64Signature = headers[HEADERS.SIGNATURE]?.toString()

  const metadata = decodeMetadata(base64Metadata)
  const contentHash = decodeContentHash(hexContentHash)
  const signature = decodeSignature(base64Signature)

  return { metadata, contentHash, signature, hexContentHash, base64Signature, base64Metadata }
}

module.exports = {
  HEADERS,
  HEADERS_NAMES,
  sign,
  verify,
  decodeHeaders
}

/**
* @typedef {{
*    [key: string]: JSONValue | Array<JSONValue> | JSONObject
* }} Metadata
*
* @typedef { string | number | boolean | null } JSONValue
* @typedef {{[key: string]: JSONValue | Array<JSONValue>}} JSONObject
*/
