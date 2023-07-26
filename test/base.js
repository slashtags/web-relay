const test = require('brittle')
const b4a = require('b4a')
const os = require('os')
const EventSource = require('eventsource')
/** @type {import('node-fetch')['default']} */
// @ts-ignore
const fetch = require('node-fetch')

const Relay = require('../index.js')
const Client = require('../lib/client.js')
const { HEADERS_NAMES, HEADERS } = require('../lib/shared.js')

test('method not allowed', async (t) => {
  const relay = new Relay(tmpdir())

  const client = new Client()

  const address = await relay.listen()

  const response = await fetch(address + '/' + client.id + '/foo', { method: 'POST' })

  t.is(response.status, 405)
  t.is(response.statusText, 'Method not allowed')

  relay.close()
})

test('basic - options', async (t) => {
  const relay = new Relay(tmpdir())
  const address = await relay.listen()

  const client = new Client()

  const response = await fetch(address + '/' + client.id + '/bar', {
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

  const userID = '8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo'

  const content = b4a.from(JSON.stringify({
    name: 'Alice'
  }))

  {
    const keyPair = Client.createKeyPair(b4a.alloc(32).fill(0))
    const client = new Client(keyPair)

    // PUT
    const response = await client.put(address, '/test.txt', content, { metadata: { timestamp: 1234567890 } })

    t.is(response.status, 200)
    t.is(response.statusText, 'OK')
  }

  {
    // GET
    const client = new Client()
    const response = await client.get(address, userID, '/test.txt')

    let recieved = Buffer.alloc(0)

    for await (const chunk of response) {
      recieved = Buffer.concat([recieved, chunk])
    }

    t.alike(recieved, content)
    t.ok(response.valid)
    t.is(response.metadata.timestamp, 1234567890)
    t.is(response.hash, '59b11ff3669fca113f32fe2d4715ccc7302a140dda0d2826d6b68a9c63495fbb')
  }

  relay.close()
})

test('get - 404', async (t) => {
  const relay = new Relay(tmpdir())

  const address = await relay.listen()

  const userID = '8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo'
  // GET
  const client = new Client()

  t.plan(2)

  try {
    await client.get(address, userID, '/test.txt')
  } catch (error) {
    t.is(error.message, '404')
    t.is(error.cause, 'File not found')
  }

  relay.close()
})

test('invalid userID', async (t) => {
  const relay = new Relay(tmpdir())

  const address = await relay.listen()

  const userID = 'foo'
  // GET
  const client = new Client()
  await client.put(address, '/test.txt', b4a.from('fff'))

  t.plan(4)

  try {
    await client.get(address, userID, '/test.txt')
  } catch (error) {
    t.is(error.message, '400')
    t.is(error.cause, 'Invalid userID')
  }

  const response = await fetch(
    address + '/foo/test.txt', {
      method: 'PUT',
      body: 'ffff'
    })

  t.is(response.status, 400)
  t.is(response.statusText, 'Invalid userID')

  relay.close()
})

test('missing headers', async (t) => {
  const relay = new Relay(tmpdir())

  const address = await relay.listen()

  const client = new Client()
  await client.put(address, '/test.txt', b4a.from('fff'))

  const response = await fetch(
    address + '/' + client.id, {
      method: 'PUT',
      body: 'ffff'
    })

  t.is(response.status, 400)
  t.is(response.statusText, `Missing or malformed header: '${HEADERS.CONTENT_HASH}'`)

  const response2 = await fetch(
    address + '/' + client.id, {
      method: 'PUT',
      body: 'ffff',
      headers: {
        'x-slashtags-web-relay-content-hash': 'f'.repeat(64)
      }
    })

  t.is(response2.status, 400)
  t.is(response2.statusText, `Missing or malformed header: '${HEADERS.SIGNATURE}'`)

  relay.close()
})

test.skip('put - invalid signature', async (t) => {
})

test.skip('put - hash mismatch', async (t) => {
})

test('subscribe', async (t) => {
  const relay = new Relay(tmpdir())
  const address = await relay.listen()

  const keyPair = Client.createKeyPair(b4a.alloc(32).fill(0))
  const client = new Client(keyPair)

  const url = address + '/subscribe/' + client.id + '/foo.txt'

  const eventsource = new EventSource(url)

  const te = t.test('eventsource')
  te.plan(1)

  eventsource.on('message', ({ data }) => {
    te.is(data, '/8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo/foo.txt put')
  })

  client.put(address, '/foo.txt', b4a.from('foo'))

  await te

  eventsource.close()
  relay.close()
})

function tmpdir () {
  return os.tmpdir() + Math.random().toString(16).slice(2)
}
