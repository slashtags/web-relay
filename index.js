const http = require('http')
const os = require('os')
const fs = require('fs')
const path = require('path')
const { createBLAKE3 } = require('hash-wasm')
const z32 = require('z32')

const { HEADERS, HEADERS_NAMES, verify, decodeHeaders } = require('./lib/shared.js')

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

    const { metadata, signature, contentHash, hexContentHash, base64Metadata, base64Signature } = decodeHeaders(req.headers)

    if (!contentHash) {
      return badRequest(`Missing or malformed header: '${HEADERS.CONTENT_HASH}'`)
    } else if (!signature) {
      return badRequest(`Missing or malformed header: '${HEADERS.SIGNATURE}'`)
    }

    const valid = verify({ contentHash, metadata, signature, userID })

    if (!valid) {
      badRequest('Invalid signature')
    }

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
        // TODO: better error handling
        throw new Error('Hash mismatch')
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

      const metadataPath = path.join(self._recordsDir, req.url)

      const metadata = JSON.stringify({
        hexContentHash,
        base64Signature,
        base64Metadata
      })

      fs.writeFileSync(metadataPath, metadata)

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
    const record = readRecordIfExists(recordPath)

    if (!record) {
      res.writeHead(404, 'File not found')
      res.end()
      return
    }

    const {
      hexContentHash,
      base64Signature,
      base64Metadata
    } = JSON.parse(record)

    res.setHeader(HEADERS.CONTENT_HASH, hexContentHash)
    res.setHeader(HEADERS.SIGNATURE, base64Signature)
    res.setHeader(HEADERS.METADATA, base64Metadata)

    const contentPath = path.join(this._contentDir, hexContentHash)
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
       *
       * return {string | null}
       */
function readRecordIfExists (path) {
  try {
    return fs.readFileSync(path, { encoding: 'utf8' })
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

    const publicKey = z32.decode(userID)
    if (publicKey.length === 32) return true
  } catch { }

  return false
}

module.exports = Relay
