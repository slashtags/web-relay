const test = require('brittle')
const b4a = require('b4a')
const os = require('os')

const Client = require('../lib/client/index.js')
const Relay = require('../index.js')
const { createKeyPair } = require('../lib/utils.js')

const ZERO_SEED = b4a.alloc(32).fill(0)

test('storage', async (t) => {
  const storage = tmpdir()
  const client = new Client({ storage })

  const store = client._store.location

  t.is(store, storage + '/' + client.id)
})

test('relay: put - get', async (t) => {
  const relay = new Relay(tmpdir())
  const address = await relay.listen()

  const a = new Client({ storage: tmpdir(), relay: address })

  const value = b4a.from('bar')
  await a.put('foo', value)

  t.alike(await a.get('foo'), value)

  const url = await a.createURL('foo')

  const b = new Client({ storage: tmpdir() })

  t.alike(await b.get(url), value)

  await new Promise(resolve => setTimeout(resolve, 100))

  const updated = b4a.from('baz')
  await a.put('foo', updated)

  t.alike(await a.get(url), updated)

  // Wwait for the server to get the new update
  await new Promise(resolve => setTimeout(resolve, 100))

  // First request will trigger this._getFromRelay, but immediatly return the cached value
  t.alike(await b.get(url), value)

  // Wait till the relay responds with updated data
  await new Promise(resolve => setTimeout(resolve, 100))

  t.alike(await b.get(url), updated)

  const pending = []

  for await (const [path] of a._store.iterator({ gt: 'pending-', lte: 'pending~' })) {
    pending.push(path)
  }

  t.is(pending.length, 0, 'clean all pending writes')

  // Stop retrying to send data to relay
  await a.close()

  relay.close()
})

test('local (no relay connection): put - get', async (t) => {
  const keyPair = createKeyPair(ZERO_SEED)
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

  t.alike(pending, ['pending-records!8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo/foo'], 'save pending writes')
})

test('send pending to relay after initialization', async (t) => {
  const keyPair = createKeyPair(ZERO_SEED)
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

test('subscribe', async (t) => {
  const relay = new Relay(tmpdir())
  const address = await relay.listen()

  const a = new Client({ storage: tmpdir(), relay: address })
  const b = new Client({ storage: tmpdir(), relay: address })

  const url = await a.createURL('/foo')

  const first = b4a.from('first')
  const second = b4a.from('second')

  const te = t.test('eventsource')
  te.plan(3)

  const unsbuscribe = a.subscribe('foo', (value) => {
    te.alike(value, first, 'subscribe local')
  })

  let count = 0
  b.subscribe(url, (value) => {
    if (count++ === 0) {
      te.alike(value, first)
    } else {
      te.alike(value, second)
    }
  })

  await a.put('foo', first)

  await new Promise(resolve => setTimeout(resolve, 100))

  // Subscribe closes eventsource
  unsbuscribe()

  await a.put('foo', second)

  await te

  // Closing the client closes all subscriptions
  await b.close()

  relay.close()
})

test('delete', async (t) => {
  const keyPair = createKeyPair(ZERO_SEED)
  const a = new Client({ storage: tmpdir(), keyPair })

  const value = b4a.from('bar')
  await a.put('foo', value)

  t.alike(await a.get('foo'), value)

  await a.del('foo')

  const url = await a.createURL('foo')

  t.absent(await a.get(url), 'get local file by url')
})

test('encrypt', async (t) => {
  const relay = new Relay(tmpdir())
  const address = await relay.listen()

  const keyPair = createKeyPair(ZERO_SEED)
  const a = new Client({ storage: tmpdir(), relay: address, keyPair })
  const b = new Client({ storage: tmpdir() })

  const encryptionKey = await a._generateEncryptionKey('/foo')

  t.is(b4a.toString(encryptionKey, 'hex'), '88aef2be59ab3fef27f064d5e78f1727cec521ec0d775db2e8586b51c86c0e1c')
  t.unlike(await a._generateEncryptionKey('/bar'), encryptionKey, 'unique encryption key for each path')
  t.unlike(await b._generateEncryptionKey('/foo'), encryptionKey, 'unique encryption key for each user')

  const value = b4a.from('bar')
  await a.put('foo', value, { encrypt: true })

  t.alike(await a.get('foo'), value, 'read locally encrypted file (at rest) without providing any key')

  const url = await a.createURL('foo')

  t.alike(await b.get(url), value, 'get remote encrypted file (e2e)')

  const fromSubscribe = await new Promise((resolve) => b.subscribe(url, resolve))
  t.alike(fromSubscribe, value)

  b.close()
  relay.close()
})

function tmpdir () {
  return os.tmpdir() + Math.random().toString(16).slice(2)
}
