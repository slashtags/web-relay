const HEADERS = {
  CONTENT_TYPE: 'content-type',
  RECORD: 'x-slashtags-web-relay-record'
}

const HEADERS_NAMES = Object.values(HEADERS).join(', ')

module.exports = {
  HEADERS,
  HEADERS_NAMES
}
