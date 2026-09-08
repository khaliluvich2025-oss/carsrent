import { hash, verify, type Algorithm } from "@node-rs/argon2";

/**
 * `Algorithm` is an ambient const enum, which `isolatedModules` (required by
 * Next) cannot inline — so it is imported as a type and its value written out.
 * Stated explicitly rather than relying on the library default, because this is
 * a security parameter that should not change silently under us.
 */
const ARGON2ID = 2 as Algorithm; // Algorithm.Argon2id

/**
 * Argon2id with the OWASP-recommended second-choice parameters
 * (19 MiB memory, 2 iterations, 1 degree of parallelism).
 *
 * Plaintext passwords are never stored or logged (spec §6).
 */
const OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

export function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext, OPTIONS);
}

export async function verifyPassword(
  passwordHash: string,
  plaintext: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, plaintext, OPTIONS);
  } catch {
    // A malformed or truncated hash must read as "wrong password", never as a crash.
    return false;
  }
}

/**
 * Minimum policy for Owner- and Employee-set passwords. Deliberately simple:
 * length carries the weight, and composition rules mostly produce worse
 * passwords. Called from every path that sets a password.
 */
export function validatePasswordStrength(plaintext: string): string | null {
  if (plaintext.length < 10) return "Password must be at least 10 characters.";
  if (plaintext.length > 200) return "Password must be at most 200 characters.";
  return null;
}
