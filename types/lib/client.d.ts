export = WebRelayClient;
declare class WebRelayClient {
    /**
     * Create a keyPair from a provided or random seed
     *
     * @param {Uint8Array} [seed]
     */
    static createKeyPair(seed?: Uint8Array): {
        publicKey: any;
        secretKey: any;
    };
    /**
     * @param {KeyPair} [keyPair]
     */
    constructor(keyPair?: KeyPair);
    _keyPair: {
        publicKey: any;
        secretKey: any;
    };
    _id: any;
    /**
     * z-base32 encoding of the user publicKey
     */
    get id(): any;
    /**
     * Send a put request to the provided Relay
     *
     * @param {string} relayAddress - http address of the relay
     * @param {string} path - path of the file to put
     * @param {Uint8Array} content - content of the file
     * @param {object} [opts]
     * @param {Metadata} [opts.metadata]
     *
     * @returns {Promise<import('node-fetch').Response>}
     */
    put(relayAddress: string, path: string, content: Uint8Array, opts?: {
        metadata?: Metadata;
    }): Promise<import('node-fetch').Response>;
    /**
     * Send a get request to the provided Relay
     *
     * @param {string} relayAddress - http address of the relay
     * @param {string} userID - path of the file to put
     * @param {string} path - path of the file to put
     *
     * @returns {Promise<GetResponse>}
     */
    get(relayAddress: string, userID: string, path: string): Promise<GetResponse>;
}
declare namespace WebRelayClient {
    export { KeyPair, Metadata };
}
type Metadata = import('./shared.js').Metadata;
declare class GetResponse {
    /**
     * @param {import('node-fetch').Response} response
     * @param {Awaited<ReturnType<import('hash-wasm')['createBLAKE3']>>} hasher
     * @param {Metadata} metadata
     * @param {string} hexContentHash
     */
    constructor(response: import('node-fetch').Response, hasher: Awaited<ReturnType<typeof import("hash-wasm")['createBLAKE3']>>, metadata: Metadata, hexContentHash: string);
    _hasher: import("hash-wasm/dist/lib/WASMInterface.js").IHasher;
    _hexContentHash: string;
    metadata: import("./shared.js").Metadata;
    _isNodeFetch: boolean;
    _reader: any;
    valid: boolean;
    [Symbol.asyncIterator](): AsyncGenerator<Uint8Array, void, unknown>;
}
type KeyPair = {
    publicKey: Uint8Array;
    secretKey: Uint8Array;
};
//# sourceMappingURL=client.d.ts.map