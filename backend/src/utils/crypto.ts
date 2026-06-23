import crypto from 'crypto';
import bcrypt from 'bcrypt';

export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateAccessCode(): string {
  return crypto.randomBytes(32).toString('hex').substring(0, 50);
}

export function hashAccessCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

export function generateMFASecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function generateDeviceFingerprint(
  userAgent: string,
  ipAddress: string
): string {
  const combined = `${userAgent}:${ipAddress}`;
  return crypto.createHash('sha256').update(combined).digest('hex');
}
