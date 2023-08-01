/**
 * Create a keyPair from a provided or random seed
 *
 * @param {Uint8Array} [seed]
 */
export function createKeyPair(seed?: Uint8Array): {
    publicKey: any;
    secretKey: any;
};
export class Result {
    /**
     * @template T
     * @param {T} value
     * @returns {{value: T, error: null}}
     */
    static ok<T>(value: T): {
        value: T;
        error: null;
    };
    /**
     * @param {Error} error
     * @returns {{value: null, error:Error}}
     */
    static err(error: Error): {
        value: null;
        error: Error;
    };
    /**
     * @param {Error} error
     * @param {*} value
     */
    constructor(error: Error, value: any);
    value: any;
    error: Error;
}
//# sourceMappingURL=utils.d.ts.map