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
  t.is(b4a.toString(record.hash, 'hex'), '59b11ff3669fca113f32fe2d4715ccc7302a140dda0d2826d6b68a9c63495fbb')
  t.is(b4a.toString(record.signature, 'hex'), '2435938f9b68554526b7ad5edb3d6ecb120053f5752b53992b1be2a8e48f37c56be551b66b36a6172719706753bcaa90f6452eb91b8bff758ff503781eec1b01')
  t.is(record.serialize('base64'), 'JDWTj5toVUUmt61e2z1uyxIAU/V1K1OZKxviqOSPN8Vr5VG2azamFycZcGdTvKqQ9kUuuRuL/3WP9QN4HuwbAVmxH/Nmn8oRPzL+LUcVzMcwKhQN2g0oJta2ipxjSV+7dcEklokBeyJmb28iOiJiYXIifQ==')
})

test('Record - deserialize and verify', async (t) => {
  const path = '/foo/bar'
  const header = 'JDWTj5toVUUmt61e2z1uyxIAU/V1K1OZKxviqOSPN8Vr5VG2azamFycZcGdTvKqQ9kUuuRuL/3WP9QN4HuwbAVmxH/Nmn8oRPzL+LUcVzMcwKhQN2g0oJta2ipxjSV+7dcEklokBeyJmb28iOiJiYXIifQ=='
  const result = Record.deserialize(header)

  t.ok(result.value)

  const record = result.value

  t.ok(record.verify(ZERO_ID + path))
  t.is(record.timestamp, 1690441138549)
  t.alike(record.metadata, { foo: 'bar' })
  t.is(b4a.toString(record.hash, 'hex'), '59b11ff3669fca113f32fe2d4715ccc7302a140dda0d2826d6b68a9c63495fbb')
  t.is(b4a.toString(record.signature, 'hex'), '2435938f9b68554526b7ad5edb3d6ecb120053f5752b53992b1be2a8e48f37c56be551b66b36a6172719706753bcaa90f6452eb91b8bff758ff503781eec1b01')
  t.is(record.serialize('base64'), 'JDWTj5toVUUmt61e2z1uyxIAU/V1K1OZKxviqOSPN8Vr5VG2azamFycZcGdTvKqQ9kUuuRuL/3WP9QN4HuwbAVmxH/Nmn8oRPzL+LUcVzMcwKhQN2g0oJta2ipxjSV+7dcEklokBeyJmb28iOiJiYXIifQ==')
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
