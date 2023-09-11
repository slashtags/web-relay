export = _fetch;
/**
 * @param {string} url
 * @param {object} [options]
 * @param {"GET" | "PUT"} [options.method]
 * @param {{[key:string]: string}} [options.headers]
 * @param {Uint8Array} [options.body]
 */
declare function _fetch(url: string, options?: {
    method?: "GET" | "PUT";
    headers?: {
        [key: string]: string;
    };
    body?: Uint8Array;
}): Promise<any>;
//# sourceMappingURL=fetch-react-native.d.ts.map