const test = require('brittle')
const b4a = require('b4a')

const Entry = require('../lib/entry.js')
const { createKeyPair } = require('../lib/utils.js')

const ZERO_SEED = b4a.alloc(32).fill(0)

test('Entry - createSigned', async (t) => {
  const content = b4a.from(JSON.stringify({
    name: 'Alice'
  }))

  const path = '/foo/bar'
  const keyPair = createKeyPair(ZERO_SEED)
  const entry = await Entry.create(keyPair, path, content, { timestamp: 1690441138549, metadata: { foo: 'bar' } })

  t.is(entry.timestamp, 1690441138549)
  t.alike(entry.metadata, { foo: 'bar' })
  t.is(b4a.toString(entry.hash, 'hex'), '59b11ff3669fca113f32fe2d4715ccc7302a140dda0d2826d6b68a9c63495fbb')
  t.is(b4a.toString(entry.signature, 'hex'), '7c358362e94fb2b46a8c0dcedb6b6c3704647267a0edc935a827bb345e216e572976f0cf7ef638538c0b3a06e7d4c53fdf460798b684b1c057679051d2c9cf0c')
  t.is(entry.record('base64'), 'fDWDYulPsrRqjA3O22tsNwRkcmeg7ck1qCe7NF4hblcpdvDPfvY4U4wLOgbn1MU/30YHmLaEscBXZ5BR0snPDFmxH/Nmn8oRPzL+LUcVzMcwKhQN2g0oJta2ipxjSV+7dcEklokBeyJmb28iOiJiYXIifQ==')
})

test('Entry - deserialize', async (t) => {
  const publicKey = createKeyPair(ZERO_SEED).publicKey
  const path = '/foo/bar'
  const header = 'fDWDYulPsrRqjA3O22tsNwRkcmeg7ck1qCe7NF4hblcpdvDPfvY4U4wLOgbn1MU/30YHmLaEscBXZ5BR0snPDFmxH/Nmn8oRPzL+LUcVzMcwKhQN2g0oJta2ipxjSV+7dcEklokBeyJmb28iOiJiYXIifQ=='
  const result = Entry.deserialize(publicKey, path, header)

  t.ok(result.value)

  const entry = result.value

  t.is(entry.timestamp, 1690441138549)
  t.alike(entry.metadata, { foo: 'bar' })
  t.is(b4a.toString(entry.hash, 'hex'), '59b11ff3669fca113f32fe2d4715ccc7302a140dda0d2826d6b68a9c63495fbb')
  t.is(b4a.toString(entry.signature, 'hex'), '7c358362e94fb2b46a8c0dcedb6b6c3704647267a0edc935a827bb345e216e572976f0cf7ef638538c0b3a06e7d4c53fdf460798b684b1c057679051d2c9cf0c')
  t.is(entry.record('base64'), 'fDWDYulPsrRqjA3O22tsNwRkcmeg7ck1qCe7NF4hblcpdvDPfvY4U4wLOgbn1MU/30YHmLaEscBXZ5BR0snPDFmxH/Nmn8oRPzL+LUcVzMcwKhQN2g0oJta2ipxjSV+7dcEklokBeyJmb28iOiJiYXIifQ==')
})
