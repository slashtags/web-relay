const test = require('brittle')
const b4a = require('b4a')
const os = require('os')

const Client = require('../lib/client.js')
const Relay = require('../index.js')

test.skip('relay: put - get', async (t) => {
  const relay = new Relay(tmpdir())
  const address = await relay.listen()

  const a = new Client({ storage: tmpdir(), relay: address })

  const value = b4a.from('bar')
  await a.put('foo', value)

  t.alike(await a.get('foo'), value)

  const url = await a.createURL('foo')

  const b = new Client({ storage: tmpdir(), relay: address })

  t.alike(await b.get(url), value)

  const updated = b4a.from('baz')
  await a.put('foo', updated)

  t.alike(await a.get(url), updated)

  // First read cached data, while reading from the relay in the background
  t.alike(await b.get(url), value)

  // Wait till the relay responds with updated data
  await new Promise(resolve => setTimeout(resolve, 100))

  t.alike(await b.get(url), updated)

  await new Promise(resolve => setTimeout(resolve, 1000))

  const pending = []

  for await (const [path] of a._store.iterator({ gt: 'pending-', lte: 'pending~' })) {
    pending.push(path)
  }

  t.is(pending.length, 0, 'clean all pending writes')

  // Stop retrying to send data to relay
  await a.close()

  relay.close()
})

test.skip('local (no relay connection): put - get', async (t) => {
  const keyPair = Client.createKeyPair(b4a.alloc(32).fill(0))
  const a = new Client({ storage: tmpdir(), keyPair })

  const value = b4a.from('bar')
  await a.put('foo', value)

  t.alike(await a.get('foo'), value)

  const updated = b4a.from('baz')
  await a.put('foo', updated)

  const url = await a.createURL('foo')

  t.alike(await a.get(url), updated, 'get local file by url')

  const pending = []

  for await (const [path] of a._store.iterator({ gt: 'pending-records', lte: 'pending-records~' })) {
    pending.push(path)
  }

  t.alike(pending, ['pending-records!/foo'], 'save pending writes')
})

test.skip('send pending to relay after initialization', async (t) => {
  const keyPair = Client.createKeyPair(b4a.alloc(32).fill(0))
  const storage = tmpdir()

  const a = new Client({ storage, keyPair })

  const value = b4a.from('bar')
  await a.put('foo', value)

  await a.close()

  const relay = new Relay(tmpdir())
  const address = await relay.listen()

  let url
  {
    // Reopened
    const a = new Client({ storage, keyPair, relay: address })
    url = await a.createURL('foo')

    // Wait for relay to receive the pending writes
    await new Promise(resolve => setTimeout(resolve, 10))
  }

  const b = new Client({ storage: tmpdir() })

  const fromRelay = await b.get(url)

  t.alike(fromRelay, value)

  relay.close()
})

function tmpdir() {
  return os.tmpdir() + Math.random().toString(16).slice(2)
}
