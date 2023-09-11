const XMLHttpRequest = require('./xmlhttprequest.js')
const b4a = require('b4a')

/**
 * @param {string} url
 * @param {object} [options]
 * @param {"GET" | "PUT"} [options.method]
 * @param {{[key:string]: string}} [options.headers]
 * @param {Uint8Array} [options.body]
 */
const _fetch = (url, options = {}) => {
  if (options.method === 'PUT') {
    return fetch(url, options)
  }

  // Custom get using XMLHttpRequest to support binary data in React Native response
  return new Promise((resolve, reject) => {
    try {
      options.method = options.method || 'GET'

      const { method, headers } = options

      const xhr = new XMLHttpRequest()

      Object.entries(headers || {}).forEach(([key, value]) => {
        xhr.setRequestHeader(key, value)
      })

      xhr.responseType = 'arraybuffer'

      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4 && xhr.status === 200) {
          resolve({
            ok: true,
            status: xhr.status,
            headers: {
              get (name) { return xhr.getResponseHeader(name) }
            },
            body: {
              getReader: () => ({
                releaseLock: () => { },
                read: async () => {
                  return { value: xhr.response && b4a.from(xhr.response), done: true }
                }
              })
            }
          })
        } else if (xhr.readyState === 4 && xhr.status !== 200) {
          resolve({
            ok: false,
            status: xhr.status,
            headers: {
              get (name) { return xhr.getResponseHeader(name) }
            },
            body: {
              getReader: () => ({
                releaseLock: () => { },
                read: async () => {
                  return { value: xhr.response && b4a.from(xhr.response), done: true }
                }
              })
            }
          })
        }
      }

      xhr.open(method, url, true)

      xhr.send()
    } catch (error) {
      reject(error)
    }
  })
}

module.exports = _fetch
