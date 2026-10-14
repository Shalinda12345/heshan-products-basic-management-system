// Password hashing with scrypt (Node's built-in crypto), stored as "scrypt$N$r$p$<salt>$<hash>" in base64url.
// Server-only: imported by route handlers, server actions and the migration script.
import { randomBytes, randomInt, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

const SCRYPT = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

export const MIN_PASSWORD_LENGTH = 8;

function deriveKey(password: string, salt: Buffer, options: ScryptOptions, keyLength = KEY_LENGTH): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        scrypt(password.normalize("NFKC"), salt, keyLength, { ...options, maxmem: 64 * 1024 * 1024 }, (error, key) =>
            error ? reject(error) : resolve(key)
        );
    });
}

export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const key = await deriveKey(password, salt, SCRYPT);
    return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
    const parts = stored?.split("$") ?? [];
    if (parts.length !== 6 || parts[0] !== "scrypt") {
        // Spend the same time as a real check, so a missing account can't be told apart by timing
        await deriveKey(password, randomBytes(SALT_BYTES), SCRYPT);
        return false;
    }
    const [, N, r, p, saltText, keyText] = parts;
    const expected = Buffer.from(keyText, "base64url");
    const actual = await deriveKey(password, Buffer.from(saltText, "base64url"), { N: Number(N), r: Number(r), p: Number(p) }, expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Why a new password is not acceptable, or null when it is
export function passwordProblem(password: string, username?: string): string | null {
    if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`;
    if (password.length > 200) return "Password is too long.";
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return "Password must contain both letters and numbers.";
    if (username && password.toLowerCase().includes(username.toLowerCase())) return "Password must not contain the username.";
    return null;
}

// A random password for new accounts and resets, without look-alike characters (0/O, 1/l/I)
export function generateTemporaryPassword(length = 12): string {
    const letters = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
    const digits = "23456789";
    const all = letters + digits;
    const chars = [letters[randomInt(letters.length)], digits[randomInt(digits.length)]];
    while (chars.length < length) chars.push(all[randomInt(all.length)]);
    // Shuffle so the guaranteed letter and digit aren't always first
    for (let i = chars.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join("");
}
