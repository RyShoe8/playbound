import { createHash } from "node:crypto";

const DIGEST_SIZE = 32;
const ITERATIONS = 1337;

/** Fixed salt base from 0 A.D. JSInterface_Lobby.cpp EncryptPassword */
const SALT_BASE = Buffer.from([
  244, 243, 249, 244, 32, 33, 34, 35, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 32, 33, 244, 224,
  127, 129, 130, 140, 153, 133, 123, 234, 123,
]);

/**
 * 0 A.D.'s non-standard HMAC-SHA256: pad length is digest size (32), not
 * SHA-256 block size (64). Must match source/third_party/encryption/pkcs5_pbkdf2.cpp.
 * @param {Buffer} text
 * @param {Buffer} key
 * @returns {Buffer}
 */
function hmacSha256OddPad(text, key) {
  let k = key;
  if (k.length > DIGEST_SIZE) {
    k = createHash("sha256").update(k).digest();
  }

  const kPad = Buffer.alloc(DIGEST_SIZE, 0);
  k.copy(kPad, 0, 0, Math.min(k.length, DIGEST_SIZE));

  const ipad = Buffer.alloc(DIGEST_SIZE);
  const opad = Buffer.alloc(DIGEST_SIZE);
  for (let i = 0; i < DIGEST_SIZE; i++) {
    ipad[i] = kPad[i] ^ 0x36;
    opad[i] = kPad[i] ^ 0x5c;
  }

  const inner = createHash("sha256").update(ipad).update(text).digest();
  return createHash("sha256").update(opad).update(inner).digest();
}

/**
 * Custom PBKDF2 matching 0 A.D. (single 32-byte block).
 * @param {Buffer} password
 * @param {Buffer} salt
 * @param {number} rounds
 * @returns {Buffer}
 */
function pbkdf2ZeroAd(password, salt, rounds) {
  if (rounds < 1 || password.length === 0 || salt.length === 0) {
    throw new Error("invalid pbkdf2 inputs");
  }

  let saltLen = salt.length;
  if (saltLen > DIGEST_SIZE) saltLen = DIGEST_SIZE;

  const asalt = Buffer.alloc(DIGEST_SIZE + 4, 0);
  salt.copy(asalt, 0, 0, saltLen);

  const count = 1;
  asalt[saltLen + 0] = (count >> 24) & 0xff;
  asalt[saltLen + 1] = (count >> 16) & 0xff;
  asalt[saltLen + 2] = (count >> 8) & 0xff;
  asalt[saltLen + 3] = count & 0xff;

  let d1 = hmacSha256OddPad(asalt.subarray(0, saltLen + 4), password);
  const obuf = Buffer.from(d1);

  for (let i = 1; i < rounds; i++) {
    d1 = hmacSha256OddPad(d1, password);
    for (let j = 0; j < DIGEST_SIZE; j++) {
      obuf[j] ^= d1[j];
    }
  }

  return obuf;
}

/**
 * Official client EncryptPassword — SASL password is this uppercase hex, not the typed password.
 * @param {string} password plain lobby password
 * @param {string} username localpart (no @domain)
 * @returns {string} 64-char uppercase hex
 */
export function encryptZeroAdPassword(password, username) {
  const userBuf = Buffer.from(String(username), "utf8");
  const passBuf = Buffer.from(String(password), "utf8");
  const salt = createHash("sha256").update(SALT_BASE).update(userBuf).digest();
  const derived = pbkdf2ZeroAd(passBuf, salt, ITERATIONS);
  return derived.toString("hex").toUpperCase();
}

/** Already-hashed lobby.password from user.cfg */
const HEX64 = /^[0-9A-Fa-f]{64}$/;

/**
 * @param {string} password plain or 64-hex
 * @param {string} username
 * @returns {string} XMPP SASL password
 */
export function resolveZeroAdSaslPassword(password, username) {
  const raw = String(password);
  if (HEX64.test(raw)) return raw.toUpperCase();
  return encryptZeroAdPassword(raw, username);
}
