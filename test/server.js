const test = require('brittle')
const b4a = require('b4a')
const os = require('os')
const path = require('path')
const EventSource = require('../lib/client/eventsource.js')
const SlashtagsURL = require('@synonymdev/slashtags-url')
/** @type {import('node-fetch')['default']} */
// @ts-ignore
const fetch = require('node-fetch')

const { Relay } = require('../index.js')
const Record = require('../lib/record.js')
const { createKeyPair } = require('../lib/utils.js')
const { HEADERS_NAMES, HEADERS } = require('../lib/constants.js')

const ZERO_SEED = b4a.alloc(32).fill(0)
const ZERO_ID = '8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo'

test('method not allowed', async (t) => {
  const relay = new Relay(tmpdir())

  const address = await relay.listen()
  const response = await fetch(address + '/' + ZERO_ID + '/foo', { method: 'POST' })

  t.is(response.status, 405)
  t.is(response.statusText, 'Method not allowed')

  relay.close()
})

test('basic - options', async (t) => {
  const relay = new Relay(tmpdir())
  const address = await relay.listen()

  const response = await fetch(address + '/' + ZERO_ID + '/bar', {
    method: 'OPTIONS'
  })

  t.is(response.headers.get('access-control-allow-headers'), '*')
  t.is(response.headers.get('access-control-allow-methods'), 'GET, PUT, OPTIONS')
  t.is(response.headers.get('access-control-allow-origin'), '*')
  t.is(response.headers.get('access-control-expose-headers'), HEADERS_NAMES)

  relay.close()
})

test('basic - put & get', async (t) => {
  const relay = new Relay(tmpdir())

  const address = await relay.listen()

  const keyPair = createKeyPair(ZERO_SEED)

  const content = b4a.from(JSON.stringify({
    name: 'Alice'
  }))

  {
    const record = await Record.create(keyPair, ZERO_ID + '/test.txt', content, { timestamp: 10000000, metadata: { foo: 'bar' } })

    const headers = {
      [HEADERS.RECORD]: record.serialize('base64'),
      [HEADERS.CONTENT_TYPE]: 'application/octet-stream'
    }

    // PUT
    const response = await fetch(address + '/' + ZERO_ID + '/test.txt', {
      method: 'PUT',
      headers,
      body: content
    })

    t.is(response.status, 200)
    t.is(response.statusText, 'OK')
  }

  {
    // GET
    const response = await fetch(address + '/' + ZERO_ID + '/test.txt')

    t.is(response.status, 200)
    t.is(response.statusText, 'OK')

    t.is(response.headers.get(HEADERS.RECORD), 'w4mR1i2Nxf1qiDff84J9F8Qpe/GPZ/vTJODoCTttcAS/UCTB3QO3hfNtWcFIIbd/hA4+B2VnhW5I9mkdEtewCjy6HjzyPIziS34IFx2CP72aSSmq/Z8nUW4waZ06QgJqgJaYAAAAeyJmb28iOiJiYXIifQ==')

    let recieved = Buffer.alloc(0)

    for await (const chunk of response.body) {
      recieved = Buffer.concat([recieved, b4a.from(chunk)])
    }

    t.alike(recieved, content)
  }

  relay.close()
})

test('get - 404', async (t) => {
  const relay = new Relay(tmpdir())

  const address = await relay.listen()

  const response = await fetch(address + '/' + ZERO_ID + '/test.txt')
  t.is(response.status, 404)
  t.is(response.statusText, 'File not found')

  relay.close()
})

test('invalid userID', async (t) => {
  const relay = new Relay(tmpdir())

  const address = await relay.listen()

  const userID = 'foo'
  const response = await fetch(address + '/' + userID + '/test.txt')
  t.is(response.status, 400)
  t.is(response.statusText, 'Invalid userID')

  relay.close()
})

test('missing header', async (t) => {
  const relay = new Relay(tmpdir())

  const address = await relay.listen()

  const response = await fetch(
    address + '/' + ZERO_ID + '/test.txt', {
      method: 'PUT',
      body: 'ffff'
    })

  t.is(response.status, 400)
  t.is(response.statusText, `Missing or malformed header: '${HEADERS.RECORD}'`)

  relay.close()
})

test('put - invalid signature', async (t) => {
  const relay = new Relay(tmpdir())

  const address = await relay.listen()

  const keyPair = createKeyPair(ZERO_SEED)

  const content = b4a.from(JSON.stringify({
    name: 'Alice'
  }))

  const record = await Record.create(keyPair, ZERO_ID + '/test.txt', content, { timestamp: 10000000, metadata: { foo: 'bar' } })
  const header = record.serialize('base64')

  const headers = {
    [HEADERS.RECORD]: header.slice(0, header.length - 5),
    [HEADERS.CONTENT_TYPE]: 'application/octet-stream'
  }

  // PUT
  const response = await fetch(address + '/' + ZERO_ID + '/test.txt', {
    method: 'PUT',
    headers,
    body: content
  })

  t.is(response.status, 400)
  t.is(response.statusText, 'Invalid signature')

  relay.close()
})

test('put - Invalid hash', async (t) => {
  const relay = new Relay(tmpdir())

  const address = await relay.listen()

  const keyPair = createKeyPair(ZERO_SEED)

  const content = b4a.from(JSON.stringify({
    name: 'Alice'
  }))

  const record = await Record.create(keyPair, ZERO_ID + '/test.txt', content, { timestamp: 10000000, metadata: { foo: 'bar' } })
  const header = record.serialize('base64')

  const headers = {
    [HEADERS.RECORD]: header,
    [HEADERS.CONTENT_TYPE]: 'application/octet-stream'
  }

  // PUT
  const response = await fetch(address + '/' + ZERO_ID + '/test.txt', {
    method: 'PUT',
    headers,
    body: b4a.from('INVALID CONTENT')
  })

  t.is(response.status, 400)
  t.is(response.statusText, 'Invalid content hash')

  relay.close()
})

test('put - save most rercent timestamp', async (t) => {
  const relay = new Relay(tmpdir())

  const address = await relay.listen()

  const keyPair = createKeyPair(ZERO_SEED)

  const contentA = b4a.from('oldest')
  const contentB = b4a.from('newest')

  const a = await Record.create(keyPair, ZERO_ID + '/test.txt', contentA, { timestamp: 10000000 })
  const b = await Record.create(keyPair, ZERO_ID + '/test.txt', contentB, { timestamp: 20000000 })

  {
    const response = await fetch(address + '/' + ZERO_ID + '/test.txt', {
      method: 'PUT',
      headers: {
        [HEADERS.RECORD]: b.serialize('base64')
      },
      body: contentB
    })

    t.is(response.status, 200)
  }

  {
    const response = await fetch(address + '/' + ZERO_ID + '/test.txt', {
      method: 'PUT',
      headers: {
        [HEADERS.RECORD]: a.serialize('base64')
      },
      body: contentA
    })

    t.is(response.status, 409)
    t.is(response.statusText, 'Conflict')
    t.is(response.headers.get(HEADERS.RECORD), b.serialize('base64'))
  }

  {
    // GET
    const response = await fetch(address + '/' + ZERO_ID + '/test.txt')

    t.is(response.status, 200)
    t.is(response.statusText, 'OK')

    t.is(response.headers.get(HEADERS.RECORD), b.serialize('base64'))

    let recieved = Buffer.alloc(0)

    for await (const chunk of response.body) {
      recieved = Buffer.concat([recieved, b4a.from(chunk)])
    }

    t.alike(recieved, b4a.from('newest'))
  }

  relay.close()
})

test('put - url encoded path', async (t) => {
  const relay = new Relay(tmpdir())

  const address = await relay.listen()

  const keyPair = createKeyPair(ZERO_SEED)

  const content = b4a.from(JSON.stringify({
    name: 'Alice'
  }))

  const path = '/foo bar 🙏.txt'

  const record = await Record.create(keyPair, ZERO_ID + path, content, { timestamp: 10000000, metadata: { foo: 'bar' } })
  const header = record.serialize('base64')

  const headers = {
    [HEADERS.RECORD]: header,
    [HEADERS.CONTENT_TYPE]: 'application/octet-stream'
  }

  const url = encodeURI(address + '/' + ZERO_ID + path)

  // PUT
  const response = await fetch(url, {
    method: 'PUT',
    headers,
    body: content
  })

  t.is(response.status, 200)
  t.is(response.statusText, 'OK')

  relay.close()
})

test('subscribe', async (t) => {
  const relay = new Relay(tmpdir())
  const address = await relay.listen()

  const keyPair = createKeyPair(ZERO_SEED)

  const contentA = b4a.from('aaaaa')
  const a = await Record.create(keyPair, ZERO_ID + '/test.txt', contentA)

  {
    const response = await fetch(address + '/' + ZERO_ID + '/test.txt', {
      method: 'PUT',
      headers: {
        [HEADERS.RECORD]: a.serialize('base64')
      },
      body: contentA
    })

    t.is(response.status, 200)
    t.is(response.statusText, 'OK')
  }

  const contentB = b4a.from('bbbbb')
  const b = await Record.create(keyPair, ZERO_ID + '/test.txt', contentB)

  {
    const response = await fetch(address + '/' + ZERO_ID + '/test.txt', {
      method: 'PUT',
      headers: {
        [HEADERS.RECORD]: b.serialize('base64')
      },
      body: contentB
    })

    t.is(response.status, 200)
    t.is(response.statusText, 'OK')
  }

  const url = address + '/subscribe/' + ZERO_ID + '/test.txt'
  const eventsource = new EventSource(url)

  const contentC = b4a.from('ccccc')
  const c = await Record.create(keyPair, ZERO_ID + '/test.txt', contentC)

  const te = t.test('eventsource')
  te.plan(2)

  let count = 0

  eventsource.onmessage = ({ data }) => {
    if (count++ === 0) {
      te.is(data, b.serialize('base64'), 'immediatly sent more recent record')
    } else {
      te.is(data, c.serialize('base64'), 'sent live new record')
    }
  }

  {
    const response = await fetch(address + '/' + ZERO_ID + '/test.txt', {
      method: 'PUT',
      headers: {
        [HEADERS.RECORD]: c.serialize('base64')
      },
      body: contentC
    })

    t.is(response.status, 200)
    t.is(response.statusText, 'OK')
  }

  await te

  eventsource.close()
  relay.close()
})

test('save deep path (path/to/file)', async (t) => {
  const relay = new Relay(tmpdir())
  const address = await relay.listen()

  const keyPair = createKeyPair(ZERO_SEED)
  const content = b4a.from(JSON.stringify({
    name: 'Alice'
  }))

  const record = await Record.create(keyPair, ZERO_ID + '/path/to/file', content)

  const headers = {
    [HEADERS.RECORD]: record.serialize('base64'),
    [HEADERS.CONTENT_TYPE]: 'application/octet-stream'
  }

  // PUT
  const response = await fetch(address + '/' + ZERO_ID + '/path/to/file', {
    method: 'PUT',
    headers,
    body: content
  })

  t.is(response.status, 200)
  t.is(response.statusText, 'OK')

  relay.close()
})

test('health check endpoint', async (t) => {
  const relay = new Relay(tmpdir())
  const address = await relay.listen()

  // Make a GET request to the health check endpoint
  const response = await fetch(address + '/health-check?format=json')

  // Check the response status
  t.is(response.status, 200, 'Should return 200 OK status')

  // Parse the response body
  const responseBody = await response.json()

  // Check the structure of the returned JSON
  t.ok(responseBody.status, 'Should have a status field')
  t.ok(responseBody.uptime, 'Should have an uptime field')
  t.ok(responseBody.serverTime, 'Should have a serverTime field')
  t.ok(responseBody.memoryUsage, 'Should have a memoryUsage field')

  relay.close()
})

test('content too large', async (t) => {
  const relay = new Relay(tmpdir(), { maxContentSize: 10 })

  const address = await relay.listen()

  const keyPair = createKeyPair(ZERO_SEED)

  const content = b4a.from(JSON.stringify({
    name: 'Alice Bob Carl'
  }))

  const record = await Record.create(keyPair, ZERO_ID + '/test.txt', content, { timestamp: 10000000, metadata: { foo: 'bar' } })

  const headers = {
    [HEADERS.RECORD]: record.serialize('base64'),
    [HEADERS.CONTENT_TYPE]: 'application/octet-stream'
  }

  // PUT
  const response = await fetch(address + '/' + ZERO_ID + '/test.txt', {
    method: 'PUT',
    headers,
    body: content
  })

  t.is(response.status, 413)
  t.is(await response.text(), 'Content too large')

  relay.close()
})

test('save query dates to help prunning abandoned records later', async (t) => {
  const relay = new Relay(tmpdir(), { _writeInterval: 1 })

  const address = await relay.listen()

  const keyPair = createKeyPair(ZERO_SEED)

  const content = b4a.from(JSON.stringify({
    name: 'Alice'
  }))

  const record = await Record.create(keyPair, ZERO_ID + '/test.txt', content, { timestamp: 10000000, metadata: { foo: 'bar' } })

  const headers = {
    [HEADERS.RECORD]: record.serialize('base64'),
    [HEADERS.CONTENT_TYPE]: 'application/octet-stream'
  }

  // PUT
  await fetch(address + '/' + ZERO_ID + '/test.txt', {
    method: 'PUT',
    headers,
    body: content
  })

  await sleep(10)

  const afterPut = relay._serverSideRecordMetadata('/' + ZERO_ID + '/test.txt')

  // GET
  await fetch(address + '/' + ZERO_ID + '/test.txt')

  await sleep(10)

  const afterGet = relay._serverSideRecordMetadata('/' + ZERO_ID + '/test.txt')

  t.ok(afterPut)
  t.ok(afterPut)
  t.ok(afterGet.time > afterPut.time)

  relay.close()
})

test('save query dates to help prunning abandoned records later', async (t) => {
  const relay = new Relay(tmpdir())

  const address = await relay.listen()

  for (let i = 0; i < 3; i++) {
    const keyPair = createKeyPair()
    const content = b4a.from('foo')

    const id = SlashtagsURL.encode(keyPair.publicKey)

    for (let j = 0; j < i + 1; j++) {
      const path = `${id}/test${j}.txt`

      const record = await Record.create(keyPair, path, content, { timestamp: 10000000, metadata: { foo: 'bar' } })

      const headers = {
        [HEADERS.RECORD]: record.serialize('base64'),
        [HEADERS.CONTENT_TYPE]: 'application/octet-stream'
      }

      // PUT
      await fetch(address + '/' + path, {
        method: 'PUT',
        headers,
        body: content
      })
    }
  }

  await sleep(10)

  t.alike(relay.stats(), { totalRecordsCount: 6 })

  relay.close()
})

function tmpdir () {
  return path.join(os.tmpdir(), Math.random().toString(16).slice(2))
}

/** @param {number} ms */
function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
