# Slashtags Web Relay

Slashtags Core Data is abstraction library that encapsulates logic related to managing data on Slashtags.

## Install

```bash
npm install @synonymdev/web-relay
```

## Usage

### Relay

```js
const Relay = require('@synonymdev/web-relay')
const path = require('path')

const relay = new Relay(path.join(__dirname, './storage/'))

relay.listen(3000).then(() => {
  console.log('Web Relay listening on port ' + relay.port)
})
```

### client 

```
const Client = require('@synonymdev/web-relay/client')

const alice = new Client({relay: 'https://example.com'})

await alice.put('/foo', Buffer.from('bar'))

const saved = alice.get('/foo')
// Buffer.from('bar')

const url = await alice.createURL('/foo')

const bob = new Client()

const resolved = await bob.get(url)
// Buffer.from('bar')
```

## API

#### `const client = new Client(opts)`

Creates a new Client instance.

`opts` is an object that includes the following:

- `keyPair` An optional keyPair `{secretKey: Uint8Array, publicKey: Uint8Array}` to generate local drives. Keys have to be 32 bytes.
- `seeders` An optional relay address, if not specified, data will be stored locally.
- `storage` An optional storage path.

#### `await client.createURL(path)`

Create a Slashtags URL for the data stored at that path.

#### `await client.put(path, content, opts)`

Creates or updates a file. `key` should be a string, and `content` param should be a Uint8Array.

`opts` is an object that includes the following:

- `encrypted` An optional flag, if set to true the client will generate a unique encryptionKey for the file and encrypt the content with it.

#### `await client.del(path)`

Delete a file. `key` should be a string.

#### `await client.get(url)`

Reads the data from local cache if it exists, or wait for fetching the data from the relay specified in the url, or the instance's own relay.
Even if locally cached data exists, the client will reach out to the relay in the background to find new updates.

If the url contains an encryptionKey in the fragment (`#encryptionKey=<z-base32 encoded 32 bytes>`) it will be used to decrypt the content.

#### `const unsubscribe = coreData.subscribe(url, onupdate)`

Watch updates to a local or a remote file, and call the `onupdate(value)` function with the current value.

Call `unsubscribe()` to remove all related listeners and close resources created in `subscribe`.

#### `await client.close()`

Gracefully close subscriptions, and internal key value store.
