/// <reference types="node" />
export = Relay;
declare class Relay {
    /**
     * @param {string} [storage] - storage directory
     */
    constructor(storage?: string);
    _server: http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>;
    _listening: boolean;
    _storageDir: string;
    _recordsDir: string;
    _contentDir: string;
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
    _GET(req: http.IncomingMessage, res: http.ServerResponse): void;
}
import http = require("http");
//# sourceMappingURL=index.d.ts.map