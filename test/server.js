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

  t.is(response.headers.get('access-control-allow-headers'), HEADERS_NAMES)
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
    const record = await Record.create(keyPair, '/test.txt', content, { timestamp: 10000000, metadata: { foo: 'bar' } })

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

    t.is(response.headers.get(HEADERS.RECORD), 'vG8/96qG66mjz7tGPwZhY5cbMs0m/7rKaM1Cieve7CFdpBYEB9EtQfJK85Y8MlbwbQEv0VOL1u9pK9CGre+5BlmxH/Nmn8oRPzL+LUcVzMcwKhQN2g0oJta2ipxjSV+7gJaYAAAAeyJmb28iOiJiYXIifQ==')

    let recieved = Buffer.alloc(0)

    for await (const chunk of response.body) {
      recieved = Buffer.concat([recieved, chunk])
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
    address + '/' + ZERO_ID + '/foo.txt', {
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

  const record = await Record.create(keyPair, '/test.txt', content, { timestamp: 10000000, metadata: { foo: 'bar' } })
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

  const record = await Record.create(keyPair, '/test.txt', content, { timestamp: 10000000, metadata: { foo: 'bar' } })
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

  const a = await Record.create(keyPair, '/test.txt', contentA, { timestamp: 10000000 })
  const b = await Record.create(keyPair, '/test.txt', contentB, { timestamp: 20000000 })

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
      recieved = Buffer.concat([recieved, chunk])
    }

    t.alike(recieved, b4a.from('newest'))
  }

  relay.close()
})

test.skip('subscribe', async (t) => {
  const relay = new Relay(tmpdir())
  const address = await relay.listen()

  const keyPair = Client.createKeyPair(b4a.alloc(32).fill(0))
  const client = new Client(keyPair)

  const url = address + '/subscribe/' + client.id + '/foo.txt'

  const eventsource = new EventSource(url)

  const te = t.test('eventsource')
  te.plan(1)

  eventsource.on('message', ({ data }) => {
    te.is(data, '/8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo/foo.txt put 04e0bb39f30b1a3feb89f536c93be15055482df748674b00d26e5a75777702e9')
  })

  client.put(address, '/foo.txt', b4a.from('foo'))

  await te

  eventsource.close()
  relay.close()
})

function tmpdir () {
  return os.tmpdir() + Math.random().toString(16).slice(2)
}
