const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export interface SessionJwtPayload {
  email: string;
  exp: number;
  iat: number;
  sub: string;
}

function base64UrlEncode(input: string | Uint8Array): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64UrlDecode(input: string): Uint8Array {
  const padded = input
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(input.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function hmacSha256(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data),
  );

  return base64UrlEncode(new Uint8Array(signature));
}

export async function signSessionJwt(input: {
  email: string;
  secret: string;
  subject: string;
  ttlSeconds?: number;
}): Promise<string> {
  const header = {
    alg: "HS256",
    typ: "JWT",
  };
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: SessionJwtPayload = {
    email: input.email,
    exp: issuedAt + (input.ttlSeconds ?? SESSION_TTL_SECONDS),
    iat: issuedAt,
    sub: input.subject,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmacSha256(
    input.secret,
    `${encodedHeader}.${encodedPayload}`,
  );

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export async function verifySessionJwt(input: {
  secret: string;
  token: string;
}): Promise<SessionJwtPayload | null> {
  const segments = input.token.split(".");

  if (segments.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, providedSignature] = segments;
  const expectedSignature = await hmacSha256(
    input.secret,
    `${encodedHeader}.${encodedPayload}`,
  );

  if (providedSignature !== expectedSignature) {
    return null;
  }

  const payload = JSON.parse(
    new TextDecoder().decode(base64UrlDecode(encodedPayload)),
  ) as SessionJwtPayload;

  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}

export { SESSION_TTL_SECONDS };
