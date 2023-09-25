/// <reference types="node" />
export = Relay;
declare class Relay {
    static SERVER_SIDE_RECORDS_METADATA: string;
    /**
     * @param {string} [storage] - storage directory
     * @param {object} [options]
     * @param {number} [options.maxContentSize]
     *
     * @param {number} [options._writeInterval] - for testing only
     */
    constructor(storage?: string, options?: {
        maxContentSize?: number;
        _writeInterval?: number;
    });
    _server: http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>;
    _maxContentSize: number;
    _storageDir: string;
    _recordsDir: string;
    _contentDir: string;
    /** @type {import('lmdb').RootDatabase<Uint8Array>} */
    _recordsDB: import('lmdb').RootDatabase<Uint8Array>;
    /** @type {Map<string, Set<(record: Record) => void>>} */
    _subscriptions: Map<string, Set<(record: Record) => void>>;
    /**
     * A queue of writes to be processed every WRITE_QUEUE_INTERVAL
     * currently only used for updating records' lastQueried time
     * @type {Array<() => void>}
     */
    _writeQueue: (() => void)[];
    _writeQueueInterval: NodeJS.Timer;
    _processWriteQueue(): void;
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
    _startTime: number;
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
     * Update the date of the last time a record was queried, either by a GET, PUT or SUBSCRIBE request.
     *
     * Queues writes to the database on intervals, otherwise every read would involve a write as well,
     * which is expensive from LMDB.
     *
     * @param {string} recordPath
     */
    _updateLastQueried(recordPath: string): void;
    /**
     * @param {string} recordPath
     */
    _serverSideRecordMetadata(recordPath: string): any;
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
    /**
     * Health check endpoint to provide server metrics.
     *
     * @param {http.IncomingMessage} req
     * @param {http.ServerResponse} res
     */
    _HEALTH_CHECK(req: http.IncomingMessage, res: http.ServerResponse): void;
}
import http = require("http");
import Record = require("../record.js");
//# sourceMappingURL=index.d.ts.map