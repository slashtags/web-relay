export type Metadata = {
    [key: string]: JSONValue | JSONValue[] | JSONObject;
};
export type JSONValue = string | number | boolean | null;
export type JSONObject = {
    [key: string]: JSONValue | JSONValue[];
};
export namespace HEADERS {
    let METADATA: string;
    let CONTENT_HASH: string;
    let SIGNATURE: string;
}
/**
 * Sign the contactination of contentHash and encoded metadata with the client's secretKey
 *
 * @param {{
 *  contentHash: Uint8Array,
 *  metadata: Uint8Array,
 *  secretKey: Uint8Array,
 * }} input
 */
export function sign({ contentHash, metadata, secretKey }: {
    contentHash: Uint8Array;
    metadata: Uint8Array;
    secretKey: Uint8Array;
}): any;
/**
 * Verify the signature over the content hash and encoded metadata
 *
 * @param {{
 *  contentHash: Uint8Array,
 *  metadata: Uint8Array,
 *  signature: Uint8Array,
 *  userID: string,
 * }} input
 */
export function verify({ contentHash, metadata, signature, userID }: {
    contentHash: Uint8Array;
    metadata: Uint8Array;
    signature: Uint8Array;
    userID: string;
}): any;
//# sourceMappingURL=shared.d.ts.map