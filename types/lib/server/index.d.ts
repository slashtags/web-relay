/// <reference types="node" />
export = Relay;
declare class Relay {
    /**
     * @param {string} [storage] - storage directory
     */
    constructor(storage?: string);
    _server: http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>;
    _storageDir: string;
    _recordsDir: string;
    _contentDir: string;
    /** @type {import('lmdb').RootDatabase<Uint8Array>} */
    _recordsDB: import('lmdb').RootDatabase<Uint8Array>;
    /** @type {Map<string, Set<(record: Record) => void>>} */
    _subscriptions: Map<string, Set<(record: Record) => void>>;
    /**
     * The port the relay is listening on
     */
    get port(): any;
    /**
     * Start a web relay listening on the provided port or default port 3000
     *
     * @param {number} [port]
     */
    listen(port?: number): Promise<any>;
    /**
     * Close the web relay
     */
    close(): http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>;
    /**
     * @param {string} url - /:userID/path/to/record
     * @returns {Promise<Record | null>}
     */
    _readRecord(url: string): Promise<Record | null>;
    /**
     * @param {http.IncomingMessage} req
     * @param {http.ServerResponse} res
     */
    _handle(req: http.IncomingMessage, res: http.ServerResponse): void;
    /**
     * Respond to preflight requests
     *
     * @param {http.IncomingMessage} _req
     * @param {http.ServerResponse} res
     */
    _OPTIONS(_req: http.IncomingMessage, res: http.ServerResponse): void;
    /**
     * @param {http.IncomingMessage} req
     * @param {http.ServerResponse} res
     */
    _PUT(req: http.IncomingMessage, res: http.ServerResponse): Promise<void>;
    /**
     * @param {http.IncomingMessage} req
     * @param {http.ServerResponse} res
     */
    _GET(req: http.IncomingMessage, res: http.ServerResponse): Promise<void>;
    /**
     * @param {http.IncomingMessage} req
     * @param {http.ServerResponse} res
     */
    _SUBSCRIBE(req: http.IncomingMessage, res: http.ServerResponse): Promise<void>;
}
import http = require("http");
import Record = require("../record.js");
//# sourceMappingURL=index.d.ts.map