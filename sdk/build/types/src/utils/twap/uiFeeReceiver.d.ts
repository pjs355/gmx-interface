/**
 * Ui fee receiver structure:
 * 0-3 (4) bytes (0-7 chars) - PREFIX
 * 4-15 (12) bytes (8-32 chars) - 12 bytes buffer
 * 16 (1) byte (33-34 chars) - isExpress flag
 * 17 (1) byte (35-36 chars) - numberOfParts (hex encoded)
 * 18-19 (2) bytes (37-40 chars) - twapId
 * 20 (1) byte (41-42 chars) - VERSION
 *
 * Total: 0x + 20 bytes (41 hex characters)
 */
export declare function generateTwapId(): string;
export declare function createTwapUiFeeReceiver({ numberOfParts }: {
    numberOfParts: number;
}): string;
export declare function decodeTwapUiFeeReceiver(address: string): {
    twapId: string;
    numberOfParts: number;
    isExpress: boolean;
} | void;
export declare function isValidTwapUiFeeReceiver(address: string): boolean;
export declare function setUiFeeReceiverIsExpress(uiFeeReceiver: string, isExpress: boolean): string;
