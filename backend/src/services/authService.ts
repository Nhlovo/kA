import { query } from '../config/database';
import { hashPassword, comparePassword, hashAccessCode } from '../utils/crypto';
import { createToken, createRefreshToken } from '../utils/jwt';
import { AuthenticationError, ConflictError, NotFoundError } from '../utils/errors';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';

export class AuthService {
  async registerUser(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    role: string = 'employee'
  ) {
    // Check if user exists
    const existingUser = await query('SELECT id FROM users WHERE email = $1', [
      email,
    ]);

    if (existingUser.rows.length > 0) {
      throw new ConflictError('Email already registered');
    }

    const hashedPassword = await hashPassword(password);
    const userId = uuidv4();

    const result = await query(
      `
      INSERT INTO users 
      (id, email, password_hash, first_name, last_name, role, user_type)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, email, first_name, last_name, role
    `,
      [userId, email, hashedPassword, firstName, lastName, role, 'internal']
    );

    return result.rows[0];
  }

  async login(
    email: string,
    password: string,
    ipAddress: string,
    userAgent: string,
    deviceFingerprint: string
  ) {
    const userResult = await query('SELECT * FROM users WHERE email = $1', [
      email,
    ]);

    if (userResult.rows.length === 0) {
      // Log failed attempt
      await query(
        'INSERT INTO failed_login_attempts (email, ip_address, reason) VALUES ($1, $2, $3)',
        [email, ipAddress, 'User not found']
      );
      throw new AuthenticationError('Invalid credentials');
    }

    const user = userResult.rows[0];
    const passwordValid = await comparePassword(password, user.password_hash);

    if (!passwordValid) {
      await query(
        'INSERT INTO failed_login_attempts (email, ip_address, reason) VALUES ($1, $2, $3)',
        [email, ipAddress, 'Invalid password']
      );
      throw new AuthenticationError('Invalid credentials');
    }

    if (!user.is_active) {
      throw new AuthenticationError('Account is inactive');
    }

    // Check if MFA is required
    if (user.mfa_enabled && user.role !== 'read_only') {
      return {
        mfaRequired: true,
        userId: user.id,
        email: user.email,
        tempToken: createToken({
          userId: user.id,
          email: user.email,
          role: user.role,
          mfaVerified: false,
        }),
      };
    }

    // Create session
    return this.createSession(user, ipAddress, userAgent, deviceFingerprint);
  }

  async verifyMFA(
    userId: string,
    token: string,
    ipAddress: string,
    userAgent: string,
    deviceFingerprint: string
  ) {
    const userResult = await query('SELECT * FROM users WHERE id = $1', [
      userId,
    ]);

    if (userResult.rows.length === 0) {
      throw new NotFoundError('User');
    }

    const user = userResult.rows[0];

    if (!user.mfa_secret) {
      throw new AuthenticationError('MFA not configured');
    }

    const verified = speakeasy.totp.verify({
      secret: user.mfa_secret,
      encoding: 'base32',
      token: token,
      window: 2,
    });

    if (!verified) {
      throw new AuthenticationError('Invalid MFA token');
    }

    return this.createSession(user, ipAddress, userAgent, deviceFingerprint);
  }

  async setupMFA(userId: string) {
    const userResult = await query('SELECT email FROM users WHERE id = $1', [
      userId,
    ]);

    if (userResult.rows.length === 0) {
      throw new NotFoundError('User');
    }

    const user = userResult.rows[0];
    const secret = speakeasy.generateSecret({
      name: `Kutlwano (${user.email})`,
      issuer: 'Kutlwano',
      length: 32,
    });

    const qrCode = await QRCode.toDataURL(secret.otpauth_url!);

    return {
      secret: secret.base32,
      qrCode,
      backupCodes: this.generateBackupCodes(),
    };
  }

  async confirmMFA(userId: string, token: string, secret: string) {
    const verified = speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: token,
      window: 2,
    });

    if (!verified) {
      throw new AuthenticationError('Invalid MFA token');
    }

    await query(
      'UPDATE users SET mfa_enabled = true, mfa_secret = $1 WHERE id = $2',
      [secret, userId]
    );

    return { success: true };
  }

  private async createSession(
    user: any,
    ipAddress: string,
    userAgent: string,
    deviceFingerprint: string
  ) {
    // Get or create device
    let deviceResult = await query(
      'SELECT id FROM user_devices WHERE user_id = $1 AND device_fingerprint = $2',
      [user.id, deviceFingerprint]
    );

    let deviceId;
    if (deviceResult.rows.length === 0) {
      const newDeviceResult = await query(
        `
        INSERT INTO user_devices 
        (user_id, device_fingerprint, browser, last_ip_address)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `,
        [user.id, deviceFingerprint, userAgent, ipAddress]
      );
      deviceId = newDeviceResult.rows[0].id;
    } else {
      deviceId = deviceResult.rows[0].id;
      // Update last accessed
      await query(
        'UPDATE user_devices SET last_accessed = NOW(), last_ip_address = $1 WHERE id = $2',
        [ipAddress, deviceId]
      );
    }

    // Create tokens
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      mfaVerified: user.mfa_enabled,
    };

    const token = createToken(tokenPayload);
    const refreshToken = createRefreshToken(user.id);

    // Determine session timeout based on role
    const timeoutMap: { [key: string]: number } = {
      admin: 15 * 60 * 1000,
      finance: 30 * 60 * 1000,
      scheduler: 30 * 60 * 1000,
      case_manager: 30 * 60 * 1000,
    };
    const timeout = timeoutMap[user.role] || 30 * 60 * 1000;
    const expiresAt = new Date(Date.now() + timeout);

    // Create session
    await query(
      `
      INSERT INTO user_sessions 
      (user_id, device_id, token, refresh_token, mfa_verified, ip_address, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
      [user.id, deviceId, token, refreshToken, user.mfa_enabled, ipAddress, expiresAt]
    );

    // Update last login
    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    return {
      token,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
      },
    };
  }

  private generateBackupCodes(): string[] {
    const codes = [];
    for (let i = 0; i < 10; i++) {
      codes.push(Math.random().toString(36).substring(2, 10).toUpperCase());
    }
    return codes;
  }
}
