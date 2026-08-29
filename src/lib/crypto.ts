const MAX_PBKDF2_ITERATIONS = 100_000;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);

  for (let index = 0; index < hex.length; index += 2) {
    bytes[index / 2] = Number.parseInt(hex.slice(index, index + 2), 16);
  }

  return bytes;
}

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

function ensureSupportedPbkdf2Iterations(iterations: number): number {
  if (iterations > MAX_PBKDF2_ITERATIONS) {
    throw new Error(
      `PBKDF2 iteration count ${iterations} exceeds the Cloudflare Workers limit of ${MAX_PBKDF2_ITERATIONS}.`,
    );
  }

  return iterations;
}

export async function hashPassword(
  password: string,
  pepper = "",
  iterations = MAX_PBKDF2_ITERATIONS,
): Promise<string> {
  const supportedIterations = ensureSupportedPbkdf2Iterations(iterations);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`${password}${pepper}`),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      hash: "SHA-256",
      iterations: supportedIterations,
      name: "PBKDF2",
      salt,
    },
    keyMaterial,
    256,
  );

  return `pbkdf2_sha256$${supportedIterations}$${bytesToHex(salt)}$${bytesToHex(
    new Uint8Array(derivedBits),
  )}`;
}

export async function hashToken(token: string): Promise<string> {
  return sha256(token);
}

export function randomToken(byteLength = 32): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export function randomNumericCode(length = 6): string {
  const digits = new Uint8Array(length);
  crypto.getRandomValues(digits);

  return Array.from(digits, (digit) => String(digit % 10)).join("");
}

export async function verifyPassword(
  password: string,
  serializedHash: string,
  pepper = "",
): Promise<boolean> {
  const [algorithm, iterations, saltHex, digestHex] = serializedHash.split("$");

  if (algorithm !== "pbkdf2_sha256" || !iterations || !saltHex || !digestHex) {
    return false;
  }

  const supportedIterations = ensureSupportedPbkdf2Iterations(
    Number(iterations),
  );

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`${password}${pepper}`),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      hash: "SHA-256",
      iterations: supportedIterations,
      name: "PBKDF2",
      salt: hexToBytes(saltHex),
    },
    keyMaterial,
    256,
  );

  return bytesToHex(new Uint8Array(derivedBits)) === digestHex;
}
