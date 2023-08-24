const { Relay } = require('./index.js')
const path = require('path')
const fs = require('fs')

const config = getConfig()

const relay = new Relay(path.join(__dirname, config.storage))

relay.listen(3000).then(() => {
  console.log('Web Relay listening on port ' + relay.port)
})

/**
 * @returns {{storage: string}} 
 */
function getConfig() {
  const configPath = path.join(__dirname, 'config', 'config.json')
  let config;
  try {
    config = fs.readFileSync(configPath, 'utf8')
  } catch (error) {
    if (error.message.startsWith("ENOENT")) {
      throw new Error("Missing config file.")
    }
    throw error
  }

  try {
    return JSON.parse(config)
  } catch (error) {
    throw new Error("Invalid config file.")
  }
}
