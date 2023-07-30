const test = require('brittle')
const b4a = require('b4a')

const Record = require('../lib/record.js')
const { createKeyPair } = require('../lib/utils.js')

const ZERO_SEED = b4a.alloc(32).fill(0)

test('Record - create', async (t) => {
  const content = b4a.from(JSON.stringify({
    name: 'Alice'
  }))

  const path = '/foo/bar'
  const keyPair = createKeyPair(ZERO_SEED)
  const record = await Record.create(keyPair, path, content, { timestamp: 1690441138549, metadata: { foo: 'bar' } })

  t.is(record.timestamp, 1690441138549)
  t.alike(record.metadata, { foo: 'bar' })
  t.is(b4a.toString(record.hash, 'hex'), '59b11ff3669fca113f32fe2d4715ccc7302a140dda0d2826d6b68a9c63495fbb')
  t.is(b4a.toString(record.signature, 'hex'), '7c358362e94fb2b46a8c0dcedb6b6c3704647267a0edc935a827bb345e216e572976f0cf7ef638538c0b3a06e7d4c53fdf460798b684b1c057679051d2c9cf0c')
  t.is(record.serialize('base64'), 'fDWDYulPsrRqjA3O22tsNwRkcmeg7ck1qCe7NF4hblcpdvDPfvY4U4wLOgbn1MU/30YHmLaEscBXZ5BR0snPDFmxH/Nmn8oRPzL+LUcVzMcwKhQN2g0oJta2ipxjSV+7dcEklokBeyJmb28iOiJiYXIifQ==')
})

test('Record - deserialize and verify', async (t) => {
  const publicKey = createKeyPair(ZERO_SEED).publicKey
  const path = '/foo/bar'
  const header = 'fDWDYulPsrRqjA3O22tsNwRkcmeg7ck1qCe7NF4hblcpdvDPfvY4U4wLOgbn1MU/30YHmLaEscBXZ5BR0snPDFmxH/Nmn8oRPzL+LUcVzMcwKhQN2g0oJta2ipxjSV+7dcEklokBeyJmb28iOiJiYXIifQ=='
  const result = Record.deserialize(header)

  t.ok(result.value)

  const record = result.value

  t.ok(record.verify(publicKey, path))
  t.is(record.timestamp, 1690441138549)
  t.alike(record.metadata, { foo: 'bar' })
  t.is(b4a.toString(record.hash, 'hex'), '59b11ff3669fca113f32fe2d4715ccc7302a140dda0d2826d6b68a9c63495fbb')
  t.is(b4a.toString(record.signature, 'hex'), '7c358362e94fb2b46a8c0dcedb6b6c3704647267a0edc935a827bb345e216e572976f0cf7ef638538c0b3a06e7d4c53fdf460798b684b1c057679051d2c9cf0c')
  t.is(record.serialize('base64'), 'fDWDYulPsrRqjA3O22tsNwRkcmeg7ck1qCe7NF4hblcpdvDPfvY4U4wLOgbn1MU/30YHmLaEscBXZ5BR0snPDFmxH/Nmn8oRPzL+LUcVzMcwKhQN2g0oJta2ipxjSV+7dcEklokBeyJmb28iOiJiYXIifQ==')
})

test('Record - invalid signature', async (t) => {
  const content = b4a.from(JSON.stringify({
    name: 'Alice'
  }))

  const path = '/foo/bar'
  const keyPair = createKeyPair(ZERO_SEED)
  const record = await Record.create(keyPair, path, content, { metadata: { foo: 'bar' } })
  const header = record.serialize('base64')

  t.ok(Record.deserialize(header).value.verify(keyPair.publicKey, path))
  t.absent(Record.deserialize(header).value.verify(keyPair.publicKey, '/foo/baz'))
})
