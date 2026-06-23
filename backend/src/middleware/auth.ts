import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { AuthenticationError } from '../utils/errors';
import { query } from '../config/database';

export interface AuthRequest extends Request {
  userId?: string;
  email?: string;
  role?: string;
  mfaVerified?: boolean;
  deviceId?: string;
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('No authorization token provided');
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);

    if (!payload) {
      throw new AuthenticationError('Invalid or expired token');
    }

    // Verify session is still active
    const sessionResult = await query(
      'SELECT * FROM user_sessions WHERE token = $1 AND expires_at > NOW()',
      [token]
    );

    if (sessionResult.rows.length === 0) {
      throw new AuthenticationError('Session expired or invalid');
    }

    const session = sessionResult.rows[0];

    req.userId = payload.userId;
    req.email = payload.email;
    req.role = payload.role;
    req.mfaVerified = payload.mfaVerified;
    req.deviceId = session.device_id;

    next();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      res.status(401).json({ error: error.message, code: error.code });
    } else {
      res.status(401).json({ error: 'Authentication failed' });
    }
  }
}

export async function mfaRequiredMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.mfaVerified) {
    return res.status(403).json({
      error: 'MFA verification required',
      code: 'MFA_REQUIRED',
    });
  }
  next();
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!roles.includes(req.role || '')) {
      return res.status(403).json({
        error: 'Access denied',
        code: 'INSUFFICIENT_PERMISSIONS',
      });
    }
    next();
  };
}
