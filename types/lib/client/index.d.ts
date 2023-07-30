export = Client;
declare class Client {
    /**
     * Validate a path to only contain valid characters.
     * @param {string} path
     */
    static validatePath(path: string): void;
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
     * Remove the file from pending database
     *
     * @param {string} path - path relative to the user's root
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
     *
     * @returns {Promise<Uint8Array | null>}
     */
    get(path: string): Promise<Uint8Array | null>;
    /**
     * @param {string} id
     * @param {string} path
     */
    _getStoredRecord(id: string, path: string): Promise<Record>;
    /**
     * Get data from the relay and save it to the local key-value store.
     *
     * @param {string} relay
     * @param {string} id - Author's ID
     * @param {string} path
     *
     * @returns {Promise<Uint8Array | null>}
     */
    _getFromRelay(relay: string, id: string, path: string): Promise<Uint8Array | null>;
    /**
     * Save data to the local key-value store.
     *
     * @param {string} id - remote user's id
     * @param {string} path - path relative to the user's root
     * @param {Uint8Array} content
     * @param {Record} record
     */
    _put(id: string, path: string, content: Uint8Array, record: Record): Promise<void>;
    /**
     * Start sending pending records to the relay.
     */
    _sendPending(): Promise<void>;
    /**
     * @param {string} path
     * @param {(value: Uint8Array | null) => any} onupdate
     */
    subscribe(path: string, onupdate: (value: Uint8Array | null) => any): void;
    /**
       * Return a url that can be shared by others to acess a file.
       *
       * @param {string} path
       *
       * @returns {Promise<string>}
       */
    createURL(path: string): Promise<string>;
    close(): Promise<void>;
}
declare namespace Client {
    export { KeyPair, JSONObject };
}
type JSONObject = import('../record.js').JSONObject;
import Record = require("../record.js");
type KeyPair = import('../record.js').KeyPair;
//# sourceMappingURL=index.d.ts.map