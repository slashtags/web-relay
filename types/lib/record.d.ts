export = Record;
declare class Record {
    /**
     * @param {KeyPair} keyPair
     * @param {string} path - full path of the file <userID>/path/to/file
     * @param {Uint8Array} content
     * @param {object} [opts]
     * @param {number} [opts.timestamp]
     * @param {JSONObject} [opts.metadata]
     */
    static create(keyPair: KeyPair, path: string, content: Uint8Array, opts?: {
        timestamp?: number;
        metadata?: JSONObject;
    }): Promise<import("./record.js")>;
    /**
     * Deserialize the saved record to a hash, timestamp and metadata
     *
     * @param {string | Uint8Array} record
     */
    static deserialize(record: string | Uint8Array): {
        value: null;
        error: Error;
    } | {
        value: import("./record.js");
        error: null;
    };
    /**
     * @param {object} params
     * @param {Uint8Array} params.record
     * @param {Uint8Array} params.signature
     * @param {Uint8Array} params.hash
     * @param {number} params.timestamp
     * @param {JSONObject} params.metadata
     */
    constructor(params: {
        record: Uint8Array;
        signature: Uint8Array;
        hash: Uint8Array;
        timestamp: number;
        metadata: JSONObject;
    });
    _record: Uint8Array;
    _hash: Uint8Array;
    _timestamp: number;
    _metadata: JSONObject;
    _signature: Uint8Array;
    _base64: any;
    get signature(): Uint8Array;
    get hash(): Uint8Array;
    get timestamp(): number;
    get metadata(): JSONObject;
    serialize(encoding?: 'binary'): Uint8Array;
    serialize(encoding: 'base64'): string;
    /**
     * Verify this record for the publicKey of an author, and the associated path
     *
     * @param {string} path - /:userID/path/to/file
     */
    verify(path: string): any;
}
declare namespace Record {
    export { JSONValue, JSONObject, KeyPair };
}
type JSONObject = {
    [key: string]: JSONValue | JSONValue[];
};
type KeyPair = {
    publicKey: Uint8Array;
    secretKey: Uint8Array;
};
type JSONValue = string | number | boolean | null;
//# sourceMappingURL=record.d.ts.map