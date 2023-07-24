const test = require('brittle')
const b4a = require('b4a')
/** @type {import('node-fetch')['default']} */
// @ts-ignore
const fetch = require('node-fetch')

const Relay = require('../index.js')
const Client = require('../lib/client.js')

test('method not allowed', async (t) => {
  const relay = new Relay()

  await relay.listen()

  const address = 'http://localhost:' + relay.port
  const response = await fetch(address, { method: 'POST' })

  t.is(response.status, 405)
  t.is(response.statusText, 'Method not allowed')

  relay.close()
})

test('basic - put & get', async (t) => {
  const relay = new Relay()

  await relay.listen()

  const address = 'http://localhost:' + relay.port

  const userID = '8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo'

  const content = b4a.from(JSON.stringify({
    name: 'Alice'
  }))

  {
    const keyPair = Client.createKeyPair(b4a.alloc(32).fill(0))
    const client = new Client(keyPair)

    // PUT
    const response = await client.put(address, '/test.txt', content, { metadata: { timestamp: 1234567890 } })

    t.is(response.status, 201)
    t.is(response.statusText, 'File saved successfully')
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
  }

  relay.close()
})
