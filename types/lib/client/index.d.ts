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
     */
    constructor(opts?: {
        relay?: string;
        keyPair?: KeyPair;
        storage?: string;
    });
    _keyPair: {
        publicKey: any;
        secretKey: any;
    };
    _relay: string;
    /** @type {import('level').Level<string, any>} */
    _store: import('level').Level<string, any>;
    /** @type {Map<string, ReturnType<setTimeout>>} */
    _retryTimeouts: Map<string, ReturnType<typeof setTimeout>>;
    /** @type {Map<string, () => void>} */
    _supscriptions: Map<string, () => void>;
    get key(): any;
    get id(): string;
    /**
     * @param {string} path
     * @param {Uint8Array} content
     * @param {object} [opts]
     * @param {JSONObject} [opts.metadata]
     *
     * @returns {Promise<void>}
     */
    put(path: string, content: Uint8Array, opts?: {
        metadata?: JSONObject;
    }): Promise<void>;
    /**
     * @param {string} path
     *
     * @returns {Promise<void>}
     */
    del(path: string, opts?: {}): Promise<void>;
    /**
     * @param {string} path
     *
     * @returns {Promise<Uint8Array | null>}
     */
    get(path: string, opts: any): Promise<Uint8Array | null>;
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
     * @Returns {string | null}
     */
    _parseRelay(url: string): string;
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
     */
    _trySendToRelay(path: string, content: Uint8Array, record: Record): Promise<void>;
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
     *
     * @returns {Promise<Uint8Array | null>}
     */
    _getFromRelay(relay: string, path: string, saved: Record | null): Promise<Uint8Array | null>;
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
}
declare namespace Client {
    export { KeyPair, JSONObject };
}
type JSONObject = import('../record.js').JSONObject;
import Record = require("../record.js");
import { createKeyPair } from "../utils.js";
type KeyPair = import('../record.js').KeyPair;
//# sourceMappingURL=index.d.ts.map