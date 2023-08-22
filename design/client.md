# Web relay client

This document explores how to bulid a local-first client for the web-relay, the server isn't aware of the details discussed here, as long as it receives valid requests.

## components

Internally the client is made of an embedded database (in this repo it is LevelDB) and an HTTP client.

## Operations

### Put

On putting an entry, the client does the following

1. Writes the content to a sub path using the prefix `blobs!` for example`blobs!<z-base32 publicKey of the clietn>/path/to/entry`.
2. Generates the [signed record](./relay.md#Signed-Record), and save it to the prefix `records!` for example `records!<z-base32 publicKey of the clietn>/path/to/entry`.
3. Saves the same record from step 2, to a pending records prefix `pending-records!`
4. Tries to send the record to the relay, if it failed because the relay is unavailable, it should retry on an interval, otherwise on success it should delete the `pending-records!` from the local embedded database.

On loading a client for the first time, it should check all `pending-records!` prefixed items, and try to send them to the relay.

### Del

Deleting an entry is simply creating a newer entry with an empty content. 

### Get

Whenever the user is querying a specific entry, the client would return the local value from `records!` prefix, while concurrently making a request to the relay where that entry is assumed to exist.

If there are no locally saved entry for that path, the client waits for the relay to respond or timeout, otherwise, it responds immediatly.

Once the relay responds with a signed record in the header, it should be validated in the same way the server validates records on [PUT](./relay.md#PUT) requests, including ignoring records with timestamps that are not more recent than what the client already saw and cached for that path.

If the content length is 0, the client returns `null`.

### Subscribe

The client uses [EventSource](https://html.spec.whatwg.org/#server-sent-events) instance to listen for any updates on a given entry, and once it gets a notification it sends a GET request to the server, and updates its local records accordingly, then calls the `onupdate` callback function with the new value received from the relay.
