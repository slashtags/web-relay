export = EventSource;
declare class EventSource {
    /**
     * @param {string} url
     */
    constructor(url: string);
    CONNECTING: number;
    OPEN: number;
    CLOSED: number;
    readyState: number;
    onerror: any;
    onmessage: any;
    onopen: any;
    interval: number;
    lastEventId: any;
    cache: string;
    URL: string;
    url: string;
    _pollTimer: NodeJS.Timeout;
    _xhr: any;
    _timeoutXhr: any;
    /**
     * @param {number} interval
     */
    pollAgain(interval: number): void;
    poll(): void;
    close(): void;
    /**
     * @param {string} type
     * @param {{type: string, data?: string}} event
     */
    dispatchEvent(type: string, event: {
        type: string;
        data?: string;
    }): void;
    /**
     * @param {string} type
     * @param {any} handler
     */
    addEventListener(type: string, handler: any): void;
    /**
     * @param {string} type
     * @param {any} handler
     */
    removeEventListener(type: string, handler: any): void;
}
//# sourceMappingURL=eventsource.d.ts.map