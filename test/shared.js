const test = require('brittle')
const b4a = require('b4a')

const { Record, createKeyPair } = require('../lib/shared.js')

const ZERO_SEED = b4a.alloc(32).fill(0)
const ZERO_ID = '8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo'

test('Record - from content', async (t) => {
  const content = b4a.from(JSON.stringify({
    name: 'Alice'
  }))

  const keyPair = createKeyPair(ZERO_SEED)
  const record = await Record.fromContent(content, { keyPair, timestamp: 1690441138549, metadata: { foo: 'bar' } })

  t.is(record.timestamp, 1690441138549)
  t.alike(record.metadata, { foo: 'bar' })
  t.is(b4a.toString(record.hash, 'hex'), '59b11ff3669fca113f32fe2d4715ccc7302a140dda0d2826d6b68a9c63495fbb')
  t.is(b4a.toString(record.signature, 'hex'), 'bce99609431673977da45ae24bc08c4270bf38025866ef798c2c2329c24d4867d32f2a9033f05e0bda9d9926ea7c62e80ee0d5ba55fd7f1762f169fc4bfb6f09')
  t.is(record.toHeader(), 'AHXBJJaJAVmxH/Nmn8oRPzL+LUcVzMcwKhQN2g0oJta2ipxjSV+7vOmWCUMWc5d9pFriS8CMQnC/OAJYZu95jCwjKcJNSGfTLyqQM/BeC9qdmSbqfGLoDuDVulX9fxdi8Wn8S/tvCXsiZm9vIjoiYmFyIn0=')
})

test.solo('Record - fromHeader', async (t) => {
  const header = 'AHXBJJaJAVmxH/Nmn8oRPzL+LUcVzMcwKhQN2g0oJta2ipxjSV+7vOmWCUMWc5d9pFriS8CMQnC/OAJYZu95jCwjKcJNSGfTLyqQM/BeC9qdmSbqfGLoDuDVulX9fxdi8Wn8S/tvCXsiZm9vIjoiYmFyIn0='
  const record = Record.fromHeader(header)

  t.is(record.timestamp, 1690441138549)
  t.alike(record.metadata, { foo: 'bar' })
  t.is(b4a.toString(record.hash, 'hex'), '59b11ff3669fca113f32fe2d4715ccc7302a140dda0d2826d6b68a9c63495fbb')
  t.is(b4a.toString(record.signature, 'hex'), 'bce99609431673977da45ae24bc08c4270bf38025866ef798c2c2329c24d4867d32f2a9033f05e0bda9d9926ea7c62e80ee0d5ba55fd7f1762f169fc4bfb6f09')
})
