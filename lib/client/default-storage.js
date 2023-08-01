const os = require('node:os')

const DEFAULT_STORAGE = os.homedir() + '/.slashtags/key-value-store/'

module.exports = DEFAULT_STORAGE
