# Web Relay Desing

## Architecture

The web relay architecture is a local-first 
-server architecture, where the client is primarily reading and writing to local embedded databases. When possible the client should sync with its designated relay (hosting provider), either by sending or receiving [signed entries](#Signed-Entries).

## Transport

The web relay system uses HTTP exclusively to communicate between clients and relays, as a request/response with the only exception of the use of [Server-sent Events](Subscribtion). Clients do _not_ communicate with each other.

## API

### PUT 

#### Request
```
PUT /:userID/path/to/entry HTTP/2
x-slashtags-web-relay-record: <base64 encoded Signed Record>
content-type: application/octet-stream

<content>
```

On receiving a PUT request, the server should:
1. Decode the [Signed Record](#Signed-Record).
2. Check the timestamp, and compare it with the timestamp of the saved entry for that path, if it has any, if the incoming timestamp is _not_ the most recent, it should just return a `409 Conflict` response.
3. Concatenate the path from the request with the record from the step above to get an [Entry](#Entry).
4. Verify the [Signature](#Signature) over the [Entry](#Entry). The signer should be the public key decoded from the z32 encoded `:userID` part of the path in the request.
5. If the signature is valid, wait for the content streaming to finish to obtain the Sha256 [`Hash`](#Hash), and verify it is the same recieved in the [Signed Record](#Signed-Record).
6. If the hash is valid, the server should save the content and the [Signed-Record](#Signed-Record).

#### Response

On success server returns response code `200 OK` otherwise it returns `400 BadRequest`.

### GET

#### Request
```
GET /:userID/path/to/entry HTTP/2
```

#### Response

```
HTTP/2 200 OK
x-slashtags-web-relay-record: <base64 encoded Signed Record>
```

Or if the file is not found return `404 File not found`

### Subscribe

Read more about [Server-sent Events](https://html.spec.whatwg.org/#server-sent-events).

```
GET /subscribe/:userID/path/to/entry HTTP/2
```

Subscribe to updates to a given entry. The [EventSource](https://developer.mozilla.org/en-US/docs/Web/API/EventSource) will emit `data` event containing the [Signed Record](#Signed-Record) of the update.

## Signed Entry

A Signed Entry is a tuple of an [Entry](#Entry) and a signature over it.

## Entry

An entry is made of the concatenation of [full path](#Full-Path) and the signable part of a [Record](#Record) 


```
----------------------
| full path | record |
----------------------
```

### Full path 

A utf-8 encoded path of the entry consisting of `userID` (the public key of the author) and the relative path in the form `<userID>/path/to/entry`

### Record

```
-------------------------------
|             Record          | 
|------|-----------|----------|
|  32  |     6     |     M    | 
|------|-----------|----------|
| Hash | Timestamp | Metadata |
-------------------------------
```

#### `Hash` 
a 32 bytes of Sha256 hash of the content.
#### `Timestamp` 
a 6 bytes of unix timestamp in milliseconds.
#### `Metadata` 
an optional arbitrary length opaque array of usigned 8 bytes integers.

## Signed Record

A signed record is a concatenation of the ed25519 [Signature](#signature) over an [Entry](#Entry), and the [Record](#Record) part of an entry.

```
-------------------------------------------
| signature |            Record           | 
|-----------|-----------------------------|
|     64    |  32  |     6     |     M    | 
|-----------|------|-----------|----------|
| Signature | Hash | Timestamp | Metadata |
-------------------------------------------
```
