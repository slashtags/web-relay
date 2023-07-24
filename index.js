const http = require('http')
const os = require('os')
const fs = require('fs')
const path = require('path')
const { createBLAKE3 } = require('hash-wasm')
const b4a = require('b4a')

const { HEADERS, verify } = require('./lib/shared.js')

const DEFAULT_PORT = 0
const DEFAULT_STORAGE_DIR = os.homedir() + '/.slashtags-web-relay'

const RECORDS_DIR = 'records'
const CONTENT_DIR = 'content'

const HEADERS_LIST = Object.values(HEADERS).join(', ')

class Relay {
  /**
   * @param {string} [storage] - storage directory
   */
  constructor (storage) {
    this._server = http.createServer(this._handle.bind(this))

    this._listening = false

    this._storageDir = storage || DEFAULT_STORAGE_DIR
    this._recordsDir = path.join(this._storageDir, RECORDS_DIR)
    this._contentDir = path.join(this._storageDir, CONTENT_DIR)

    // Create storage directory if it does not exist
    createDirectoryIfDoesNotExist(this._storageDir)
    createDirectoryIfDoesNotExist(this._recordsDir)
    createDirectoryIfDoesNotExist(this._contentDir)
  }

  [Symbol.for('nodejs.util.inspect.custom')] () {
    return this.constructor.name + ' ' + JSON.stringify({
      listening: this._listening,
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
        this._listening = true
        resolve()
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
    // TODO: validate request path
    // if (req.url === '/') {
    //   res.writeHead(200, 'Ok')
    //   res.end()
    //   return
    // }

    // Set CORS headers on all responses
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', HEADERS_LIST)
    res.setHeader('Access-Control-Expose-Headers', HEADERS_LIST)

    switch (req.method) {
      case 'OPTIONS':
        this._OPTIONS(req, res)
        break
      case 'GET':
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

    const hexContentHash = req.headers[HEADERS.CONTENT_HASH].toString()
    const base64Metadata = req.headers[HEADERS.METADATA]
    const base64Signature = req.headers[HEADERS.SIGNATURE]

    const metadata = b4a.from(base64Metadata, 'base64url')
    const contentHash = b4a.from(hexContentHash, 'hex')
    const signature = b4a.from(base64Signature, 'base64')

    const valid = verify({ contentHash, metadata, signature, userID })

    if (!valid) {
      // TODO: better error handling
      throw new Error('Invalid signature')
    }

    const contentPath = path.join(this._contentDir, hexContentHash)

    const exists = fs.existsSync(contentPath)
    if (exists) {
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

      res.writeHead(201, 'File saved successfully')
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

module.exports = Relay
