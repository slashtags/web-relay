const http = require('http')
const os = require('os')
const fs = require('fs')
const path = require('path')
const { createHash } = require('crypto')
const SlashURL = require('@synonymdev/slashtags-url')
const b4a = require('b4a')
const lmdb = require('lmdb')
const { URL } = require('url')
const gitinfo = require('git-repo-info')()
const LCL = require("last-commit-log");

const Record = require('../record.js')
const { HEADERS, HEADERS_NAMES } = require('../constants.js')

const DEFAULT_PORT = 0
const DEFAULT_STORAGE_DIR = os.homedir() + '/.slashtags-web-relay'

const RECORDS_DIR = 'records'
const CONTENT_DIR = 'content'

// '0' is lexicographically bigger than '/'
// so it will be after all users records as they start with `/`
const SERVER_SIDE_RECORDS_METADATA = '0!ssrmeta!'

const version = require(process.cwd() + '/package.json').version

const DEFAULT_MAX_CONTENT_SIZE = 200 * 1024 // 200 KiB
const WRITE_QUEUE_INTERVAL = 1000 * 60 * 10 // 10 minutes

class Relay {
  static SERVER_SIDE_RECORDS_METADATA = SERVER_SIDE_RECORDS_METADATA

  /**
   * @param {string} [storage] - storage directory
   * @param {object} [options]
   * @param {number} [options.maxContentSize]
   *
   * @param {number} [options._writeInterval] - for testing only
   */
  constructor (storage, options = {}) {
    this._server = http.createServer(this._handle.bind(this))

    this._maxContentSize = options.maxContentSize || DEFAULT_MAX_CONTENT_SIZE

    this._storageDir = storage || DEFAULT_STORAGE_DIR
    this._recordsDir = path.join(this._storageDir, RECORDS_DIR)
    this._contentDir = path.join(this._storageDir, CONTENT_DIR)

    // Create storage directory if it does not exist
    createDirectoryIfDoesNotExist(this._storageDir)
    createDirectoryIfDoesNotExist(this._contentDir)

    /** @type {import('lmdb').RootDatabase<Uint8Array>} */
    this._recordsDB = lmdb.open({
      path: this._recordsDir,
      compression: true,
      encoding: 'binary'
    })

    /** @type {Map<string, Set<(record: Record) => void>>} */
    this._subscriptions = new Map()

    /**
     * A queue of writes to be processed every WRITE_QUEUE_INTERVAL
     * currently only used for updating records' lastQueried time
     * @type {Array<() => void>}
     */
    this._writeQueue = []
    this._writeQueueInterval = setInterval(this._processWriteQueue.bind(this), options._writeInterval || WRITE_QUEUE_INTERVAL)
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

  _processWriteQueue () {
    const queue = this._writeQueue
    this._writeQueue = []
    if (queue.length === 0) return

    this._recordsDB.transaction(() => {
      for (const operation of queue) {
        operation()
      }
    })
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

        this._startTime = Date.now()
      })
    })
  }

  /**
   * Close the web relay
   */
  close () {
    clearInterval(this._writeQueueInterval)
    return this._server.close()
  }

  /**
   * @param {string} url - /:userID/path/to/record
   * @returns {Promise<Record | null>}
   */
  async _readRecord (url) {
    const saved = this._recordsDB.get(url)
    return Record.deserialize(saved).value || null
  }

  /**
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   */
  _handle (req, res) {
    // Check for the health check endpoint
    if (req.url.startsWith('/health-check') && req.method === 'GET') {
      return this._HEALTH_CHECK(req, res)
    }

    // Check for the version endpoint
    if (req.url === '/version' && req.method === 'GET') {
      return this._VERSION(req, res);
    }

    // Validate userID
    if (!validateUserID(req.url)) {
      res.writeHead(400, 'Invalid userID')
      res.end()
      return
    }

    // Sanitize the URL
    req.url = decodeURIComponent(req.url)

    // Set CORS headers on all responses
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', '*')
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
   * Respond to version requests
   *
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   */
  _VERSION(req, res) {
    const lcl = new LCL();
    const commit = lcl.getLastCommitSync();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(commit));
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
    const self = this

    // === Verify the record ===

    const header = req.headers[HEADERS.RECORD]?.toString()
    if (!header) {
      return badRequest(`Missing or malformed header: '${HEADERS.RECORD}'`)
    }

    const result = Record.deserialize(header)
    if (result.error) {
      return badRequest(result.error.message)
    }

    const record = result.value
    if (!record.verify(req.url)) {
      return badRequest('Invalid signature')
    }

    const saved = await this._readRecord(req.url)
    if (saved) {
      if (saved.timestamp > record.timestamp) {
        // The logic here is that the server successfully processed the request
        // but the client is out of date, so we return the latest record in the response headers
        res.setHeader(HEADERS.RECORD, saved.serialize('base64'))
        res.writeHead(409, 'Conflict')
        res.end()
        return
      }
    }

    // === Download the content ===

    const hexContentHash = b4a.toString(record.hash, 'hex')
    const contentPath = path.join(this._contentDir, hexContentHash)

    const contentExists = fs.existsSync(contentPath)
    if (contentExists) {
      return success()
    }

    // Initialize the hasher before the stream starts
    const hasher = createHash('sha256')

    // Loading the entire file in memory is not safe
    const writeStream = fs.createWriteStream(contentPath)

    let contentSize = 0

    req.pipe(writeStream)

    req.on('data', (chunk) => {
      hasher.update(chunk)
      contentSize += chunk.length

      if (contentSize > this._maxContentSize) {
        res.writeHead(413, 'Content too large')
        res.end()

        req.destroy()
        writeStream.destroy()

        // TODO: remove this step after adding garbage collection
        fs.unlinkSync(contentPath)
      }
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

    // === Save Record after content is downloaded and verified ===

    async function success () {
      // Save record
      await self._recordsDB.put(req.url, record.serialize())

      if (self._subscriptions.has(req.url)) {
        for (const notify of self._subscriptions.get(req.url)) {
          notify(record)
        }
      }

      self._updateLastQueried(req.url)

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
   * Update the date of the last time a record was queried, either by a GET, PUT or SUBSCRIBE request.
   *
   * Queues writes to the database on intervals, otherwise every read would involve a write as well,
   * which is expensive from LMDB.
   *
   * @param {string} recordPath
   */
  _updateLastQueried (recordPath) {
    const time = Date.now()

    // For now we are just saving this metadata, but not reading it anywhere, until we need it.
    const content = Buffer.from(JSON.stringify({ time }))

    this._writeQueue.push(() => {
      this._recordsDB.put(SERVER_SIDE_RECORDS_METADATA + recordPath, content)
    })
  }

  /**
   * @param {string} recordPath
   */
  _serverSideRecordMetadata (recordPath) {
    const content = this._recordsDB.get(SERVER_SIDE_RECORDS_METADATA + recordPath)

    if (!content) return

    let json
    try {
      json = JSON.parse(Buffer.from(content).toString())
    } catch (error) {
      return
    }

    return json
  }

  /**
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   */
  async _GET (req, res) {
    const saved = await this._readRecord(req.url)

    if (!saved) {
      res.writeHead(404, 'File not found')
      res.end()
      return
    }

    this._updateLastQueried(req.url)

    res.setHeader(HEADERS.RECORD, saved.serialize('base64'))

    const contentPath = path.join(this._contentDir, b4a.toString(saved.hash, 'hex'))
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
  async _SUBSCRIBE (req, res) {
    const target = req.url.replace('/subscribe', '')

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    })

    this._updateLastQueried(req.url)

    /**
   * @param {Record} record
   */
    const notify = (record) => {
      const data = `data: ${record.serialize('base64')}\n\n`
      res.write(data)
    }

    let subscriptions = this._subscriptions.get(target)
    if (!subscriptions) {
      subscriptions = new Set()
      this._subscriptions.set(target, subscriptions)
    }
    subscriptions.add(notify)

    const lastSeen = Record.deserialize(req.headers[HEADERS.RECORD]?.toString())
    const lastSeenTimestamp = lastSeen.value?.timestamp || 0
    const saved = await this._readRecord(target)

    if (saved?.timestamp > lastSeenTimestamp) {
      notify(saved)
    }

    // Close the connection and remove subscription when the client disconnects
    req.on('close', () => {
      const subscriptions = this._subscriptions.get(target)
      if (!subscriptions) return

      subscriptions.delete(notify)

      if (subscriptions.size === 0) {
        this._subscriptions.delete(target)
      }

      res.end()
    })
  }

  /**
   * Health check endpoint to provide server metrics.
   *
   * @param {http.IncomingMessage} req
   * @param {http.ServerResponse} res
   */
  _HEALTH_CHECK (req, res) {
    const uptime = process.uptime()

    const memoryUsage = process.memoryUsage()

    if (new URL(req.url, `http://${req.headers.host}`).searchParams.get('format') === 'json') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        status: 'operational',
        uptime,
        serverTime: Date.now(),
        memoryUsage,
        version,
        git: {
          commit: gitinfo.sha,
          branch: gitinfo.branch
        }
      }))
      return
    }

    const uptimeFormatted = `${Math.floor(uptime / 3600)} hours ${Math.floor((uptime % 3600) / 60)} minutes ${Math.floor(uptime)} seconds`
    const formatMemoryUsage = (/** @type {number} */data) => `${(Math.round(data / 1024 / 1024 * 100) / 100).toString().padEnd(5, ' ')} MB`

    const text = `# Health check
  - Uptime      : ${uptimeFormatted}
  - Up since    : ${new Date(this._startTime).toISOString()}
  - Server time : ${new Date().toISOString()}

  - Version
    - Package     : ${version}
    - GIT
      - Branch    : ${gitinfo.branch}
      - Commit    : ${gitinfo.sha}

  - Memory usage:
    - rss       : ${formatMemoryUsage(memoryUsage.rss)} -> Resident Set Size - total memory allocated for the process execution
    - heapTotal : ${formatMemoryUsage(memoryUsage.heapTotal)} -> total size of the allocated heap
    - heapUsed  : ${formatMemoryUsage(memoryUsage.heapUsed)} -> actual memory used during the execution
    - external  : ${formatMemoryUsage(memoryUsage.external)} -> V8 external memory


To get the health check in JSON format go to "/health-check?format=json".
      `
    res.writeHead(200)
    res.end(text)
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
