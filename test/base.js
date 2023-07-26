const test = require('brittle')
const b4a = require('b4a')
const os = require('os')
/** @type {import('node-fetch')['default']} */
// @ts-ignore
const fetch = require('node-fetch')

const Relay = require('../index.js')
const Client = require('../lib/client.js')
const { HEADERS_NAMES } = require('../lib/shared.js')

test('method not allowed', async (t) => {
  const relay = new Relay()

  const address = await relay.listen()

  const response = await fetch(address, { method: 'POST' })

  t.is(response.status, 405)
  t.is(response.statusText, 'Method not allowed')

  relay.close()
})

test('basic - options', async (t) => {
  const relay = new Relay(tmpdir())
  const address = await relay.listen()

  const response = await fetch(address + '/foo/bar', {
    method: 'OPTIONS'
  })

  t.is(response.headers.get('access-control-allow-headers'), HEADERS_NAMES)
  t.is(response.headers.get('access-control-allow-methods'), 'GET, PUT, OPTIONS')
  t.is(response.headers.get('access-control-allow-origin'), '*')
  t.is(response.headers.get('access-control-expose-headers'), HEADERS_NAMES)

  relay.close()
})

test('basic - put & get', async (t) => {
  const relay = new Relay()

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

function tmpdir () {
  return os.tmpdir() + Math.random().toString(16).slice(2)
}
