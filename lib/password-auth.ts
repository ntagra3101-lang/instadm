/**
 * Single-owner username/password login (added by insta-autodm).
 *
 * - LOGIN_USERNAME: the username to type on the login page.
 * - LOGIN_PASSWORD_HASH: the starting password, as a hash from hashPassword().
 *   After a "forgot password" reset, the new hash lives in User.passwordHash
 *   and takes over.
 * - The owner account is the first address in ALLOWED_EMAILS. Reset links are
 *   only ever emailed there.
 */
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import Redis from "ioredis";

const KEYLEN = 64;
const N = 16384;
const R = 8;
const P = 1;

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key)
    )
  );
}

/** Format: scrypt:N:r:p:saltB64url:hashB64url (no "$", so it is safe in .env files). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt);
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join(":");
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  if (Number(n) !== N || Number(r) !== R || Number(p) !== P) return false;
  const expected = Buffer.from(hashB64, "base64url");
  if (expected.length !== KEYLEN) return false;
  const key = await scryptAsync(password, Buffer.from(saltB64, "base64url"));
  return timingSafeEqual(key, expected);
}

export function getOwnerEmail(): string | null {
  const first = (process.env.ALLOWED_EMAILS ?? "").split(",")[0]?.trim().toLowerCase();
  return first || null;
}

export function getLoginUsername(): string | null {
  return process.env.LOGIN_USERNAME?.trim().toLowerCase() || null;
}

export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 2)}••••@${domain}`;
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const RESET_IDENTIFIER_PREFIX = "password-reset:";
export const RESET_TTL_MS = 30 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 8;

// ---- brute-force guard (Redis). Fails open if Redis is down so the owner is never locked out by an outage.
let redis: Redis | null = null;
function getRedis(): Redis | null {
  if (!process.env.REDIS_URL) return null;
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false });
    redis.on("error", () => undefined);
  }
  return redis;
}

/** Returns false when this key has used up its attempts in the window. */
export async function takeAttempt(key: string, max: number, windowSeconds: number): Promise<boolean> {
  const client = getRedis();
  if (!client) return true;
  try {
    const name = `insta-dm:attempts:${key}`;
    const count = await client.incr(name);
    if (count === 1) await client.expire(name, windowSeconds);
    return count <= max;
  } catch {
    return true;
  }
}

export async function clearAttempts(key: string): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.del(`insta-dm:attempts:${key}`);
  } catch {
    // ignore
  }
}

export function clientIp(headers: Headers | undefined): string {
  return headers?.get("x-forwarded-for")?.split(",")[0]?.trim() || headers?.get("x-real-ip") || "unknown";
}
