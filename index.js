const http = require('http')
const os = require('os')
const fs = require('fs')
const path = require('path')
const blake3 = require('blake3')

const { fromHeaders } = require('./lib/shared.js')

const DEFAULT_PORT = 3000
const DEFAULT_STORAGE_DIR = os.homedir() + '/.slashtags-web-relay'

const METADATA_DIR = 'metadata'
const CONTENT_DIR = 'content'

class Relay {
  /**
   * @param {string} [storage] - storage directory
   */
  constructor (storage) {
    this._server = http.createServer(this._handle.bind(this))

    this._listening = false

    this._storageDir = storage || DEFAULT_STORAGE_DIR
    this._metadataDir = path.join(this._storageDir, METADATA_DIR)
    this._contentDir = path.join(this._storageDir, CONTENT_DIR)

    // Create storage directory if it does not exist
    createDirectoryIfDoesNotExist(this._storageDir)
    createDirectoryIfDoesNotExist(this._metadataDir)
    createDirectoryIfDoesNotExist(this._contentDir)
  }

  [Symbol.for('nodejs.util.inspect.custom')] () {
    return this.constructor.name + ' ' + JSON.stringify({
      listening: this._listening,
      address: this._server.address()
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

    // Set CORS headers on all responses
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS')
    // TODO: Access-Control-Allow-Headers
    res.setHeader('Access-Control-Allow-Headers', '')

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

    // TODO: validate signature
    const { metadata, contentID } = fromHeaders(req.headers)

    const contentPath = path.join(this._contentDir, contentID)

    // Loading the entire file in memory is not safe
    const writeStream = fs.createWriteStream(contentPath)

    req.pipe(writeStream)

    await blake3.load()
    const hasher = blake3.createHash()

    req.on('data', (chunk) => {
      hasher.update(chunk)
    })

    writeStream.on('finish', () => {
      try {
        const hash = hasher.digest().toString('hex')

        if (hash !== contentID) {
          // TODO: better error handling
          throw new Error('Hash mismatch')
        }

        // Save metadata
        createDirectoryIfDoesNotExist(path.join(this._metadataDir, userID))

        const metadataPath = path.join(this._metadataDir, req.url)
        fs.writeFileSync(metadataPath, metadata)
      } catch (error) {
        // TODO: Handle hash mismatch error
      }

      res.writeHead(201, 'File saved successfully')
      res.end()
    })

    writeStream.on('error', _ => {
      res.writeHead(500, 'Failed to write file')
      res.end()
    })
  }

  /**
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   */
  _GET (req, res) {
    res.end()
  }
}

function createDirectoryIfDoesNotExist (path) {
  try {
    fs.mkdirSync(path)
  } catch { }
}

module.exports = Relay
