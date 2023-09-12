export = Client;
declare class Client {
    /**
     * Validate a path to only contain valid characters.
     * @param {string} path
     */
    static validatePath(path: string): void;
    static createKeyPair: typeof createKeyPair;
    static ERROR_CODES: {
        INVALID_PATH: {
            message: string;
            cause: string;
        };
    };
    /**
     * @param {object} [opts]
     * @param {string} [opts.relay]
     * @param {KeyPair} [opts.keyPair]
     * @param {string} [opts.storage]
     * @param {Store} [opts.store]
     * @param {Store} [opts._skipRecordVerification] - Set to true to skip expensive records verification and trust relays.
     */
    constructor(opts?: {
        relay?: string;
        keyPair?: KeyPair;
        storage?: string;
        store?: Store;
        _skipRecordVerification?: Store;
    });
    _keyPair: {
        publicKey: any;
        secretKey: any;
    };
    _relay: string;
    _store: Store;
    /** @type {Map<string, ReturnType<setTimeout>>} */
    _retryTimeouts: Map<string, ReturnType<typeof setTimeout>>;
    /** @type {Map<string, () => void>} */
    _supscriptions: Map<string, () => void>;
    _skipRecordVerification: Store;
    _sentPending: Promise<void>;
    get key(): any;
    get id(): string;
    /**
     * Base URL of the client instance in the format `slash:<this.id>/?relay=<this._relay>`
     * @returns {string}
     */
    get url(): string;
    /**
     * @param {string} path
     * @param {Uint8Array} content
     * @param {object} [opts]
     * @param {boolean} [opts.encrypt]
     * @param {boolean} [opts.awaitRelaySync]
     *
     * @returns {Promise<void>}
     */
    put(path: string, content: Uint8Array, opts?: {
        encrypt?: boolean;
        awaitRelaySync?: boolean;
    }): Promise<void>;
    /**
     * @param {string} path
     * @param {object} [opts]
     * @param {boolean} [opts.awaitRelaySync]
     *
     * @returns {Promise<void>}
     */
    del(path: string, opts?: {
        awaitRelaySync?: boolean;
    }): Promise<void>;
    /**
     * Get the content of an entry from the local cache immediatly if available,
     * otherwise wait for fetching from the remote relay.
     * To skip the local cache and wait for the remote relay response anyways use the `opts.skipCache` option.
     *
     * @param {string} path
     * @param {object} [opts]
     * @param {boolean} [opts.skipCache] - Skip the local cache and wait for the remote relay to respond with fresh data
     *
     * @returns {Promise<Uint8Array | null>}
     */
    get(path: string, opts?: {
        skipCache?: boolean;
    }): Promise<Uint8Array | null>;
    /**
     * @param {string} path
     * @param {(value: Uint8Array | null) => any} onupdate
     *
     * @returns {() => void}
     */
    subscribe(path: string, onupdate: (value: Uint8Array | null) => any): () => void;
    /**
       * Return a url that can be shared by others to acess a file.
       *
       * @param {string} path
       *
       * @returns {Promise<string>}
       */
    createURL(path: string): Promise<string>;
    close(): Promise<void>;
    /**
     * Takes either SlashURL `slash:<userID>/path/to/file` or `path/to/file` and retruns the full path as `<userID>/path/to/file`
     *
     * @param {string} path
     * @returns {string}
     */
    _fullPath(path: string): string;
    /**
     * Returns the relay from a url
     *
     * @param {string} url
     * @returns {Partial<ReturnType<import('@synonymdev/slashtags-url').parse> & {relay?:string, encryptionKey?: Uint8Array}>}
     */
    _parseURL(url: string): Partial<{
        protocol: string;
        key: Uint8Array;
        id: string;
        path: string;
        query: {
            [k: string]: string | boolean;
        };
        fragment: string;
        privateQuery: {
            [k: string]: string | boolean;
        };
    } & {
        relay?: string;
        encryptionKey?: Uint8Array;
    }>;
    /**
     * Remove the file from pending database
     *
     * @param {string} path - full path <userID>/path/to/file
     * @param {number} timestamp - timestamp of the record that was successfully sent to the relay
     */
    _removePending(path: string, timestamp: number): Promise<void>;
    /**
     * @param {string} path
     * @param {Uint8Array} content
     * @param {Record} record
     * @param {Function} [onsuccess]
     */
    _trySendToRelay(path: string, content: Uint8Array, record: Record, onsuccess?: Function, backoff?: number): Promise<void>;
    /**
     * @param {string} path
     */
    _getStoredRecord(path: string): Promise<Record>;
    /**
     * Get data from the relay and save it to the local key-value store.
     *
     * @param {string} relay
     * @param {string} path
     * @param {Record | null} saved
     * @param {Uint8Array} [encryptionKey]
     *
     * @returns {Promise<Uint8Array | null>}
     */
    _getFromRelay(relay: string, path: string, saved: Record | null, encryptionKey?: Uint8Array): Promise<Uint8Array | null>;
    /**
     * Save data to the local key-value store.
     *
     * @param {string} path - <userID>/path/to/file
     * @param {Uint8Array} content
     * @param {Record} record
     */
    _put(path: string, content: Uint8Array, record: Record): Promise<void>;
    /**
     * Start sending pending records to the relay.
     */
    _sendPending(): Promise<void>;
    /**
     * Generates a unique encryptionKey per this user and a given path.
     *
     * @param {string} path
     */
    _generateEncryptionKey(path: string): Promise<Buffer>;
    /**
     * @param {string} path
     * @param {Uint8Array} content
     */
    _encrypt(path: string, content: Uint8Array): Promise<Uint8Array | Buffer>;
    /**
     * @param {Uint8Array} content
     * @param {Uint8Array} encryptionKey
     */
    _decrypt(content: Uint8Array, encryptionKey: Uint8Array): Promise<Uint8Array | Buffer>;
}
declare namespace Client {
    export { Client, Store, KeyPair, JSONObject };
}
declare class Store {
    /**
     * @param {string} location
     */
    constructor(location: string);
    location: any;
    get _db(): import("level").Level<string, any>;
    /** @type {import('level').Level<string, any>} */
    _level: import('level').Level<string, any>;
    /**
     * @param {import('level').IteratorOptions<string, Uint8Array>} range
     */
    iterator(range: import('level').IteratorOptions<string, Uint8Array>): import("level").Iterator<import("level").Level<string, any>, string, Uint8Array>;
    /**
     * @param {string} key
     * @param {Uint8Array} value
     */
    put(key: string, value: Uint8Array): Promise<void>;
    /**
     * @param {string} key
     *
     * @returns {Promise<void>}
     */
    del(key: string): Promise<void>;
    /**
     * @param {string} key
     *
     * @returns {Promise<Uint8Array>}
     */
    get(key: string): Promise<Uint8Array>;
    batch(): import("level").ChainedBatch<import("level").Level<string, any>, string, any>;
    close(): Promise<void>;
}
import SlashURL = require("@synonymdev/slashtags-url");
import Record = require("../record.js");
import { createKeyPair } from "../utils.js";
type KeyPair = import('../record.js').KeyPair;
type JSONObject = import('../record.js').JSONObject;
//# sourceMappingURL=index.d.ts.map