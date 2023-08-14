const test = require('brittle')
const b4a = require('b4a')

const Record = require('../lib/record.js')
const { createKeyPair } = require('../lib/utils.js')

const ZERO_SEED = b4a.alloc(32).fill(0)
const ZERO_ID = '8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo'

test('Record - create', async (t) => {
  const content = b4a.from(JSON.stringify({
    name: 'Alice'
  }))

  const path = '/foo/bar'
  const keyPair = createKeyPair(ZERO_SEED)
  const record = await Record.create(keyPair, ZERO_ID + path, content, { timestamp: 1690441138549, metadata: { foo: 'bar' } })

  t.is(record.timestamp, 1690441138549)
  t.alike(record.metadata, { foo: 'bar' })
  t.is(b4a.toString(record.hash, 'hex'), '3cba1e3cf23c8ce24b7e08171d823fbd9a4929aafd9f27516e30699d3a42026a')
  t.is(b4a.toString(record.signature, 'hex'), '5804f1f283ab9c17dbbe29085921f845b7d9d8d1790bc1465a845452be4418c4255c0708bcd5de7c07713919b93008de578b47d6fdd31e01215476a1407eac0a')
  t.is(record.serialize('base64'), 'WATx8oOrnBfbvikIWSH4RbfZ2NF5C8FGWoRUUr5EGMQlXAcIvNXefAdxORm5MAjeV4tH1v3THgEhVHahQH6sCjy6HjzyPIziS34IFx2CP72aSSmq/Z8nUW4waZ06QgJqdcEklokBeyJmb28iOiJiYXIifQ==')
})

test('Record - deserialize and verify', async (t) => {
  const path = '/foo/bar'
  const header = 'WATx8oOrnBfbvikIWSH4RbfZ2NF5C8FGWoRUUr5EGMQlXAcIvNXefAdxORm5MAjeV4tH1v3THgEhVHahQH6sCjy6HjzyPIziS34IFx2CP72aSSmq/Z8nUW4waZ06QgJqdcEklokBeyJmb28iOiJiYXIifQ=='
  const result = Record.deserialize(header)

  t.ok(result.value)

  const record = result.value

  t.ok(record.verify(ZERO_ID + path))
  t.is(record.timestamp, 1690441138549)
  t.alike(record.metadata, { foo: 'bar' })
  t.is(b4a.toString(record.hash, 'hex'), '3cba1e3cf23c8ce24b7e08171d823fbd9a4929aafd9f27516e30699d3a42026a')
  t.is(b4a.toString(record.signature, 'hex'), '5804f1f283ab9c17dbbe29085921f845b7d9d8d1790bc1465a845452be4418c4255c0708bcd5de7c07713919b93008de578b47d6fdd31e01215476a1407eac0a')
  t.is(record.serialize('base64'), header)
})

test('Record - invalid signature', async (t) => {
  const content = b4a.from(JSON.stringify({
    name: 'Alice'
  }))

  const path = '/foo/bar'
  const keyPair = createKeyPair(ZERO_SEED)
  const record = await Record.create(keyPair, ZERO_ID + path, content, { metadata: { foo: 'bar' } })
  const header = record.serialize('base64')

  t.ok(Record.deserialize(header).value.verify(ZERO_ID + path))
  t.absent(Record.deserialize(header).value.verify(ZERO_ID + '/foo/baz'))
})
