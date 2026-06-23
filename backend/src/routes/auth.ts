import { Router } from 'express';
import { AuthService } from '../services/authService';
import { authMiddleware, mfaRequiredMiddleware } from '../middleware/auth';
import { loginSchema, mfaSchema } from '../utils/validation';
import { generateDeviceFingerprint } from '../utils/crypto';
import { createLogger } from '../utils/logger';

const router = Router();
const authService = new AuthService();
const logger = createLogger();

router.post('/register', async (req, res, next) => {
  try {
    const { email, password, firstName, lastName, role } = req.body;

    const user = await authService.registerUser(
      email,
      password,
      firstName,
      lastName,
      role
    );

    logger.info('User registered', { email });

    res.status(201).json({
      success: true,
      user,
      message: 'Registration successful. Please configure MFA.',
    });
  } catch (error) {
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const ipAddress = req.ip || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';
    const deviceFingerprint = generateDeviceFingerprint(userAgent, ipAddress);

    const result = await authService.login(
      email,
      password,
      ipAddress,
      userAgent,
      deviceFingerprint
    );

    logger.info('User login attempt', { email, mfaRequired: result.mfaRequired });

    if (result.mfaRequired) {
      return res.json({
        success: true,
        mfaRequired: true,
        tempToken: result.tempToken,
        userId: result.userId,
      });
    }

    res.json({
      success: true,
      token: result.token,
      refreshToken: result.refreshToken,
      user: result.user,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/mfa/verify', async (req, res, next) => {
  try {
    const { userId, token } = mfaSchema.parse({
      ...req.body,
      token: req.body.token,
    });

    const ipAddress = req.ip || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';
    const deviceFingerprint = generateDeviceFingerprint(userAgent, ipAddress);

    const result = await authService.verifyMFA(
      req.body.userId,
      token,
      ipAddress,
      userAgent,
      deviceFingerprint
    );

    logger.info('MFA verified', { userId: req.body.userId });

    res.json({
      success: true,
      token: result.token,
      refreshToken: result.refreshToken,
      user: result.user,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/mfa/setup', authMiddleware, async (req, res, next) => {
  try {
    const result = await authService.setupMFA((req as any).userId);

    res.json({
      success: true,
      secret: result.secret,
      qrCode: result.qrCode,
      backupCodes: result.backupCodes,
      message: 'Scan the QR code with your authenticator app',
    });
  } catch (error) {
    next(error);
  }
});

router.post('/mfa/confirm', authMiddleware, async (req, res, next) => {
  try {
    const { token, secret } = req.body;

    await authService.confirmMFA((req as any).userId, token, secret);

    logger.info('MFA enabled', { userId: (req as any).userId });

    res.json({
      success: true,
      message: 'MFA successfully configured',
    });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', authMiddleware, async (req, res, next) => {
  try {
    const token = req.headers.authorization?.substring(7);
    if (token) {
      // Invalidate session - in production, add to token blacklist
      logger.info('User logged out', { userId: (req as any).userId });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
