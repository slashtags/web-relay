# Slashtags Web Relay

Slashtags Core Data is abstraction library that encapsulates logic related to managing data on Slashtags.

## Install

```bash
npm install @synonymdev/web-relay
```

## Usage

### Relay

```js
const { Relay } = require('@synonymdev/web-relay')
const path = require('path')

const relay = new Relay(path.join(__dirname, './storage/'))

relay.listen(3000).then(() => {
  console.log('Web Relay listening on port ' + relay.port)
})
```

### client 

```js
const { Client } = require('@synonymdev/web-relay/client')

const alice = new Client({relay: 'http://localhost:3000'})

;(async () => {
  const url = await alice.createURL('/foo')
  console.log('url', url)

  await alice.put('/foo', Buffer.from('bar'))
  const saved = await alice.get('/foo')
  console.log(saved.toString())

  const bob = new Client()
  const resolved = await bob.get(url)
  console.log(resolved.toString())
})()
```

## API

#### `const client = new Client(opts)`

Creates a new Client instance.

`opts` is an object that includes the following:

- `keyPair` An optional keyPair `{secretKey: Uint8Array, publicKey: Uint8Array}` to generate local drives. Keys have to be 32 bytes.
- `relay` An optional relay address, if not specified, data will be stored locally, until a relay is provided on following session, where unsynced records will be sent to the relay automatically.
- `storage` An optional storage path.


#### `client.url`

The base url of the client including the relay in the query params if it is specified. The url is in the following format: `slash:<client.id>/[?relay=<relay address>]`

#### `await client.createURL(path)`

Create a Slashtags URL for the data stored at that path.

#### `await client.put(path, content, [opts])`

Creates or updates a file. `key` should be a string, and `content` param should be a Uint8Array.

`opts` is an object that includes the following:

- `encrypted` An optional flag, if set to true the client will generate a unique encryptionKey for the file and encrypt the content with it.
- `awaitRelaySync` An optional flag, if set to true, the returned promise will only resolve after the relay responds with a success code to the PUT request.

#### `await client.del(path, [opts])`

Delete a file. `key` should be a string.

`opts` is an object that includes the following:

- `awaitRelaySync` An optional flag, if set to true, the returned promise will only resolve after the relay responds with a success code to the PUT request.

#### `await client.get(url, [opts])`

Reads the data from local cache if it exists, or wait for fetching the data from the relay specified in the url, or the instance's own relay.
Even if locally cached data exists, the client will reach out to the relay in the background to find new updates.

If the url contains an encryptionKey in the fragment (`#encryptionKey=<z-base32 encoded 32 bytes>`) it will be used to decrypt the content.

`opts` is an object that includes the following:

- `skipCache` An optional flag, if set to true, the returned promise will only resolve after it gets a response from the relay to the GET request, skipping any local cache.

#### `const unsubscribe = coreData.subscribe(url, onupdate)`

Watch updates to a local or a remote file, and call the `onupdate(value)` function with the current value.

Call `unsubscribe()` to remove all related listeners and close resources created in `subscribe`.

#### `await client.close()`

Gracefully close subscriptions, and internal key value store.
