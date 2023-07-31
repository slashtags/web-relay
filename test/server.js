const test = require('brittle')
const b4a = require('b4a')
const os = require('os')
const EventSource = require('eventsource')
/** @type {import('node-fetch')['default']} */
// @ts-ignore
const fetch = require('node-fetch')

const Relay = require('../index.js')
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

    t.is(response.headers.get(HEADERS.RECORD), 'Xi6Eq9v+kx7gCrJ3le+4ijpaMrGWY4vcPIKF8bCToFhAprFD4RypefA16v5Q+1jUxbGzFkUcvLPOnHgFTQP/CVmxH/Nmn8oRPzL+LUcVzMcwKhQN2g0oJta2ipxjSV+7gJaYAAAAeyJmb28iOiJiYXIifQ==')

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
  const eventsource = new EventSource(url, {
    headers: {
      // Inform the relay about the last record we have
      // [HEADERS.RECORD]: a.serialize('base64')
    }
  })

  const contentC = b4a.from('ccccc')
  const c = await Record.create(keyPair, ZERO_ID + '/test.txt', contentC)

  const te = t.test('eventsource')
  te.plan(2)

  let count = 0

  eventsource.on('message', ({ data }) => {
    if (count++ === 0) {
      te.is(data, b.serialize('base64'), 'immediatly sent more recent record')
    } else {
      te.is(data, c.serialize('base64'), 'sent live new record')
    }
  })

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

function tmpdir () {
  return os.tmpdir() + Math.random().toString(16).slice(2)
}
