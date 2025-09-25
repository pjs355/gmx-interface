export type L2Headers = {
  LVLUP_ADDRESS: string;
  LVLUP_API_KEY: string;
  LVLUP_PASSPHRASE: string;
  LVLUP_TIMESTAMP: string;
  LVLUP_SIGNATURE: string;
};

export type L2Params = {
  method: string;
  path: string; // e.g. "/api/auth/me"
  body?: unknown;
};

export type L2Secrets = {
  key: string;
  secret: string; // raw secret string for HMAC
  passphrase: string;
  address: string;
};

export async function signL2(req: L2Params, auth: L2Secrets): Promise<L2Headers> {
  const encoder = new TextEncoder();
  const timestamp = Date.now().toString();
  // Payload MUST be method + "\n" + path + "\n" + timestamp
  const upperMethod = req.method.toUpperCase();
  const data = `${upperMethod}\n${req.path}\n${timestamp}`;
  const key = await crypto.subtle.importKey(
    "raw",
    // Secret is treated as UTF-8 string (do not hex-decode)
    encoder.encode(auth.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const signature = bufferToHex(sigBuffer);
  return {
    LVLUP_ADDRESS: auth.address,
    LVLUP_API_KEY: auth.key,
    LVLUP_PASSPHRASE: auth.passphrase,
    LVLUP_TIMESTAMP: timestamp,
    LVLUP_SIGNATURE: signature,
  };
}

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const hex: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const v = bytes[i].toString(16).padStart(2, "0");
    hex.push(v);
  }
  return hex.join("");
}
