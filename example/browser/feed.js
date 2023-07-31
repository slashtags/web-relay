const Client = require("../../lib/client/index.js")
const { createKeyPair } = require("../../lib/utils.js")
const b4a = require("b4a")
const path = require("path")

const client = new Client({
  keyPair: createKeyPair(b4a.alloc(32).fill(0)),
  storage: path.join(__dirname, "storage", "feed"),
  relay: "http://localhost:3000"
});

(async () => {
  console.log("Watch feed at", await client.createURL('price'))
})()

setInterval(() => {
  const price = Math.ceil(Math.random() * 1000000)
  console.log('Price:', price)
  client.put("price", b4a.from(price.toString()))
}, 100)
