const http = require('http')
const os = require('os')
const fs = require('fs')
const path = require('path')
const { createBLAKE3 } = require('hash-wasm')
const SlashURL = require('@synonymdev/slashtags-url')
const b4a = require('b4a')

const Record = require('../record.js')
const { HEADERS, HEADERS_NAMES } = require('../constants.js')

const DEFAULT_PORT = 0
const DEFAULT_STORAGE_DIR = os.homedir() + '/.slashtags-web-relay'

const RECORDS_DIR = 'records'
const CONTENT_DIR = 'content'

class Relay {
  /**
   * @param {string} [storage] - storage directory
   */
  constructor (storage) {
    this._server = http.createServer(this._handle.bind(this))

    this._storageDir = storage || DEFAULT_STORAGE_DIR
    this._recordsDir = path.join(this._storageDir, RECORDS_DIR)
    this._contentDir = path.join(this._storageDir, CONTENT_DIR)

    // Create storage directory if it does not exist
    createDirectoryIfDoesNotExist(this._storageDir)
    createDirectoryIfDoesNotExist(this._recordsDir)
    createDirectoryIfDoesNotExist(this._contentDir)

    /** @type {Map<string, Set<(operation: 'put' | 'del', hash?: string) => void>>} */
    this._subscriptions = new Map()
  }

  [Symbol.for('nodejs.util.inspect.custom')] () {
    return this.constructor.name + ' ' + JSON.stringify({
      listening: this._server.listening,
      address: this._server.address(),
      storageDir: this._storageDir,
      recordsDir: this._recordsDir,
      contentDir: this._contentDir
    }, null, 4)
  }

  /**
   * The port the relay is listening on
   */
  get port () {
    // @ts-ignore
    return this._server.address()?.port
  }

  /**
   * Start a web relay listening on the provided port or default port 3000
   *
   * @param {number} [port]
   */
  listen (port) {
    return new Promise(resolve => {
      this._server.listen(port || DEFAULT_PORT, () => {
        resolve('http://localhost:' + this.port)
      })
    })
  }

  /**
   * Close the web relay
   */
  close () {
    return this._server.close()
  }

  /**
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   */
  _handle (req, res) {
    // Validate userID
    if (!validateUserID(req.url)) {
      res.writeHead(400, 'Invalid userID')
      res.end()
      return
    }

    // Set CORS headers on all responses
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', HEADERS_NAMES)
    res.setHeader('Access-Control-Expose-Headers', HEADERS_NAMES)

    switch (req.method) {
      case 'OPTIONS':
        this._OPTIONS(req, res)
        break
      case 'GET':
        if (req.url.startsWith('/subscribe/')) {
          this._SUBSCRIBE(req, res)
          return
        }
        this._GET(req, res)
        break
      case 'PUT':
        this._PUT(req, res)
        break
      default:
        res.writeHead(405, 'Method not allowed')
        res.end()
    }
  }

  /**
 * Respond to preflight requests
 *
 * @param {http.IncomingMessage} _req
 * @param {http.ServerResponse} res
 */
  _OPTIONS (_req, res) {
    res.writeHead(204)
    res.end()
  }

  /**
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   */
  async _PUT (req, res) {
    const userID = req.url.split('/')[1]
    const self = this

    const header = req.headers[HEADERS.RECORD]?.toString()

    if (!header) {
      return badRequest(`Missing or malformed header: '${HEADERS.RECORD}'`)
    }

    const result = Record.deserialize(header)

    if (result.error) {
      return badRequest(result.error.message)
    }

    const record = result.value

    const publicKey = SlashURL.decode(userID)
    const _path = req.url.replace('/' + userID, '')
    if (!record.verify(publicKey, _path)) {
      return badRequest('Invalid signature')
    }

    const recordPath = path.join(this._recordsDir, req.url)
    const saved = readRecordIfExists(recordPath)
    if (saved) {
      const result = Record.deserialize(saved)
      const savedRecord = result.value
      if (savedRecord?.timestamp > record.timestamp) {
        // The logic here is that the server successfully processed the request
        // but the client is out of date, so we return the latest record in the response headers
        res.setHeader(HEADERS.RECORD, savedRecord.serialize('base64'))
        res.writeHead(409, 'Conflict')
        res.end()
        return
      }
    }

    const hexContentHash = b4a.toString(record.hash, 'hex')

    const contentPath = path.join(this._contentDir, hexContentHash)

    const contentExists = fs.existsSync(contentPath)
    if (contentExists) {
      return success()
    }

    // Initialize the hasher before the stream starts
    const hasher = await createBLAKE3()

    // Loading the entire file in memory is not safe
    const writeStream = fs.createWriteStream(contentPath)

    req.pipe(writeStream)

    req.on('data', (chunk) => {
      hasher.update(chunk)
    })

    writeStream.on('finish', () => {
      const hash = hasher.digest('hex')

      if (hash !== hexContentHash) {
        // Remove that invalid file. Since we would have responded with success if it existed before,
        // we can be sure that we are not deleting a file created by another request.
        // alternatively, we could skip this step, and do ocasional garbage collection
        // by deleting files that are not refrenced by any valid record.
        fs.unlinkSync(contentPath)

        return badRequest('Invalid content hash')
      }

      success()
    })

    writeStream.on('error', _ => {
      res.writeHead(500, 'Failed to write file')
      res.end()
    })

    function success () {
      // Save metadata
      createDirectoryIfDoesNotExist(path.join(self._recordsDir, userID))

      const recordPath = path.join(self._recordsDir, req.url)

      fs.writeFileSync(recordPath, record.serialize())

      if (self._subscriptions.has(req.url)) {
        for (const notify of self._subscriptions.get(req.url)) {
          notify('put', hexContentHash)
        }
      }

      res.writeHead(200, 'OK')
      res.end()
    }

    /**
   * @param {string} message
   */
    function badRequest (message) {
      res.writeHead(400, message)
      res.end()
    }
  }

  /**
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   */
  _GET (req, res) {
    const recordPath = path.join(this._recordsDir, req.url)
    const saved = readRecordIfExists(recordPath)

    if (!saved) {
      res.writeHead(404, 'File not found')
      res.end()
      return
    }

    const result = Record.deserialize(saved)
    const record = result.value

    res.setHeader(HEADERS.RECORD, record.serialize('base64'))

    const contentPath = path.join(this._contentDir, b4a.toString(record.hash, 'hex'))
    const stream = fs.createReadStream(contentPath)

    stream.on('data', (chunk) => {
      res.write(chunk)
    })

    stream.on('end', () => {
      res.end()
    })

    stream.on('error', () => {
      res.writeHead(500, 'Failed to read file')
      res.end()
    })
  }

  /**
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   */
  _SUBSCRIBE (req, res) {
    const target = req.url.replace('/subscribe', '')

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    })

    const notify = (operation = 'put', hash = '') => {
      const data = `data: ${target} ${operation} ${hash}\n\n`
      res.write(data)
    }

    let subscriptions = this._subscriptions.get(target)
    if (!subscriptions) {
      subscriptions = new Set([notify])
      this._subscriptions.set(target, subscriptions)
    }

    // Close the connection and remove subscription when the client disconnects
    req.on('close', () => {
      const subscriptions = this._subscriptions.get(target)
      subscriptions.delete(notify)

      if (subscriptions.size === 0) {
        this._subscriptions.delete(target)
      }

      res.end()
    })
  }
}

/**
 * @param {string} path
 * @returns {Uint8Array | null}
 */
function readRecordIfExists (path) {
  try {
    return fs.readFileSync(path)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    return null
  }
}

/**
 * @param {string} path
 */
function createDirectoryIfDoesNotExist (path) {
  try {
    fs.mkdirSync(path)
  } catch { }
}

/**
 * @param {string} url
 */
function validateUserID (url) {
  try {
    const parts = url.split('/')
    const userID = url.startsWith('/subscribe/') ? parts[2] : parts[1]

    const publicKey = SlashURL.decode(userID)
    if (publicKey.length === 32) return true
  } catch { }

  return false
}

module.exports = Relay
