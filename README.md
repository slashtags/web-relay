# Slashtags Web Relay

Slashtags Web Relay is a powerful abstraction library designed to simplify the management of data on Slashtags.

## 📦 Installation

To install the package, use the following npm command:

```bash
npm install @synonymdev/web-relay
```

## 🚀 Getting Started

### 1. Running the Relay

Copy and customize the configuration file.

```bash
cp config/config.example.json config/config.json
```

Run `npm start` or use [pm2](https://pm2.keymetrics.io/) `pm2 start ecosystem.config.json`

Setup proxy:

Web-relay uses [Server-sent Events](https://html.spec.whatwg.org/#server-sent-events) to subscribe for updates, which needs HTTP/2 to work best (especially in browsers).

If you are using Nginx, consider using the following configuration:

```
  location <path here> {
    proxy_pass <relay host:port here>;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    chunked_transfer_encoding off;
    proxy_buffering off;
    proxy_cache off;
  }
```
### 2. Interacting via the Client

```js
const { Client } = require("@synonymdev/web-relay/client");

const alice = new Client({ relay: "http://localhost:3000" });

(async () => {
  const url = await alice.createURL("/foo");
  console.log("Generated URL:", url);

  await alice.put("/foo", Buffer.from("bar"));
  const saved = await alice.get("/foo");
  console.log("Saved Data:", saved.toString());

  const bob = new Client();
  const resolved = await bob.get(url);
  console.log("Resolved Data:", resolved.toString());
})();
```

---

## 📚 API Documentation

### Table of Contents

- [Initialize a Client](#initialize-a-client)
- [Access the Client's URL](#access-the-clients-url)
- [Generate a Slashtags URL](#generate-a-slashtags-url)
- [Create or Update a File](#create-or-update-a-file)
- [Delete a File](#delete-a-file)
- [Retrieve Data](#retrieve-data)
- [Monitor Updates to a File](#monitor-updates-to-a-file)
- [Terminate Subscriptions and Close the Client](#terminate-subscriptions-and-close-the-client)

---

### Initialize a Client

```js
const client = new Client({
  keyPair: { secretKey: Uint8Array, publicKey: Uint8Array },
  relay: "http://your-relay-address.com",
  storage: "./path/to/storage",
});
```

### Access the Client's URL

```js
console.log(client.url); // Outputs: slash:<client.id>/[?relay=<relay address>]
```

### Generate a Slashtags URL

```js
const myURL = await client.createURL("/examplePath");
console.log(myURL); // Outputs: Generated Slashtags URL
```

### Create or Update a File

```js
const options = {
  encrypted: true,
  awaitRelaySync: true,
};
await client.put("/examplePath", Buffer.from("Hello World"), options);
```

### Delete a File

```js
const deleteOptions = {
  awaitRelaySync: true,
};
await client.del("/examplePath", deleteOptions);
```

### Retrieve Data

```js
const getOptions = {
  skipCache: false, // Set to `true` to Skip the local cache and wait for the remote relay to respond with fresh data.
};
const data = await client.get(myURL, getOptions);
console.log(data); // Outputs: Retrieved data
```

### Monitor Updates to a File

```js
const onupdate = (value) => {
  console.log("Updated Value:", value);
};
const unsubscribe = coreData.subscribe(myURL, onupdate);
// To stop monitoring:
// unsubscribe();
```

### Terminate Subscriptions and Close the Client

```js
await client.close();
```
