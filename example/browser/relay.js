const Relay = require('../../index.js')
const path = require('path')

const relay = new Relay(path.join(__dirname, './storage/'))

relay.listen(3000).then(() => {
  console.log('Web Relay listening on port ' + relay.port)
})
