const b4a = require('b4a')
const sodium = require('sodium-universal')

/**
 * Create a keyPair from a provided or random seed
 *
 * @param {Uint8Array} [seed]
 */
function createKeyPair (seed) {
  const publicKey = b4a.allocUnsafe(sodium.crypto_sign_PUBLICKEYBYTES)
  const secretKey = b4a.allocUnsafe(sodium.crypto_sign_SECRETKEYBYTES)

  if (seed) sodium.crypto_sign_seed_keypair(publicKey, secretKey, seed)
  else sodium.crypto_sign_keypair(publicKey, secretKey)

  return {
    publicKey,
    secretKey
  }
}

class Result {
  /**
   * @param {Error} error
   * @param {*} value
   */
  constructor (error, value) {
    this.value = value
    this.error = error
  }

  /**
   * @template T
   * @param {T} value
   * @returns {{value: T, error: null}}
   */
  static ok (value) {
    // @ts-ignore
    return new Result(null, value)
  }

  /**
   * @param {Error} error
   * @returns {{value: null, error:Error}}
   */
  static err (error) {
    // @ts-ignore
    return new Result(error, null)
  }
}

module.exports = {
  createKeyPair,
  Result
}
