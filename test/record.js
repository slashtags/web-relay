const test = require('brittle')
const b4a = require('b4a')

const Record = require('../lib/record.js')
const { createKeyPair } = require('../lib/utils.js')

const ZERO_SEED = b4a.alloc(32).fill(0)

test('Record - from content', async (t) => {
  const content = b4a.from(JSON.stringify({
    name: 'Alice'
  }))

  const keyPair = createKeyPair(ZERO_SEED)
  const record = await Record.fromContent(content, { keyPair, timestamp: 1690441138549, metadata: { foo: 'bar' } })

  t.is(record.timestamp, 1690441138549)
  t.alike(record.metadata, { foo: 'bar' })
  t.is(b4a.toString(record.hash, 'hex'), '59b11ff3669fca113f32fe2d4715ccc7302a140dda0d2826d6b68a9c63495fbb')
  t.is(b4a.toString(record.signature, 'hex'), 'a2fb27c29bfd090e8d22ae68c0aa1b457ecf83732dd725ad5ba2c00219586544bc64ed3a422e3357ada84ef5e4a36e11efed819aaacc5a1ff01cac226b165406')
  t.is(record.toBase64(), 'AKL7J8Kb/QkOjSKuaMCqG0V+z4NzLdclrVuiwAIZWGVEvGTtOkIuM1etqE715KNuEe/tgZqqzFof8BysImsWVAZZsR/zZp/KET8y/i1HFczHMCoUDdoNKCbWtoqcY0lfu3XBJJaJAXsiZm9vIjoiYmFyIn0=')
})

test('Record - fromBase64', async (t) => {
  const header = 'AKL7J8Kb/QkOjSKuaMCqG0V+z4NzLdclrVuiwAIZWGVEvGTtOkIuM1etqE715KNuEe/tgZqqzFof8BysImsWVAZZsR/zZp/KET8y/i1HFczHMCoUDdoNKCbWtoqcY0lfu3XBJJaJAXsiZm9vIjoiYmFyIn0='
  const result = Record.fromBase64(header)

  const record = result.value

  t.is(record.timestamp, 1690441138549)
  t.alike(record.metadata, { foo: 'bar' })
  t.is(b4a.toString(record.hash, 'hex'), '59b11ff3669fca113f32fe2d4715ccc7302a140dda0d2826d6b68a9c63495fbb')
  t.is(b4a.toString(record.signature, 'hex'), 'a2fb27c29bfd090e8d22ae68c0aa1b457ecf83732dd725ad5ba2c00219586544bc64ed3a422e3357ada84ef5e4a36e11efed819aaacc5a1ff01cac226b165406')
  t.is(record.toBase64(), 'AKL7J8Kb/QkOjSKuaMCqG0V+z4NzLdclrVuiwAIZWGVEvGTtOkIuM1etqE715KNuEe/tgZqqzFof8BysImsWVAZZsR/zZp/KET8y/i1HFczHMCoUDdoNKCbWtoqcY0lfu3XBJJaJAXsiZm9vIjoiYmFyIn0=')
})
