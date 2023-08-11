const { Client } = require("@synonymdev/web-relay")
const b4a = require("b4a")
const path = require("path")

const client = new Client({
  keyPair: Client.createKeyPair(b4a.alloc(32).fill(0)),
  storage: path.join(__dirname, "storage", "feed"),
  relay: "http://localhost:3000"
});

const previous = [];

(async () => {
  console.log("Watch feed at", await client.createURL('price'))
})()

setInterval(() => {
  const price = Math.ceil(Math.random() * 1000000)
  if (previous.length > 7) {
    previous.shift()
  }
  previous.push(price)

  console.log('Price:', price)

  client.put("price", b4a.from(price.toString()))
  client.put("history", b4a.from(JSON.stringify(previous)))
}, 100)
