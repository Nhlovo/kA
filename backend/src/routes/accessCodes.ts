import { Router } from 'express';
import { AccessCodeService } from '../services/accessCodeService';
import { authMiddleware } from '../middleware/auth';
import { generateDeviceFingerprint } from '../utils/crypto';
import { createLogger } from '../utils/logger';

const router = Router();
const accessCodeService = new AccessCodeService();
const logger = createLogger();

// Generate attorney access code (internal only)
router.post('/attorney/generate', authMiddleware, async (req, res, next) => {
  try {
    const { masterFileId, attorneyId } = req.body;

    const accessCode = await accessCodeService.generateAttorneyAccessCode(
      masterFileId,
      attorneyId,
      (req as any).userId
    );

    logger.info('Attorney access code generated', {
      masterFileId,
      attorneyId,
    });

    res.status(201).json({
      success: true,
      accessCode,
    });
  } catch (error) {
    next(error);
  }
});

// Generate expert access code (internal only)
router.post('/expert/generate', authMiddleware, async (req, res, next) => {
  try {
    const { appointmentId, expertId, masterFileId } = req.body;

    const accessCode = await accessCodeService.generateExpertAccessCode(
      appointmentId,
      expertId,
      masterFileId,
      (req as any).userId
    );

    logger.info('Expert access code generated', {
      appointmentId,
      expertId,
    });

    res.status(201).json({
      success: true,
      accessCode,
    });
  } catch (error) {
    next(error);
  }
});

// Validate attorney access code (external)
router.post('/attorney/validate', async (req, res, next) => {
  try {
    const { code } = req.body;

    const ipAddress = req.ip || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';
    const deviceFingerprint = generateDeviceFingerprint(userAgent, ipAddress);

    const validation = await accessCodeService.validateAttorneyAccessCode(
      code,
      ipAddress,
      deviceFingerprint
    );

    logger.info('Attorney access code validated', {
      masterFileId: validation.masterFileId,
    });

    res.json({
      success: true,
      ...validation,
    });
  } catch (error) {
    next(error);
  }
});

// Validate expert access code (external)
router.post('/expert/validate', async (req, res, next) => {
  try {
    const { code } = req.body;

    const ipAddress = req.ip || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';
    const deviceFingerprint = generateDeviceFingerprint(userAgent, ipAddress);

    const validation = await accessCodeService.validateExpertAccessCode(
      code,
      ipAddress,
      deviceFingerprint
    );

    logger.info('Expert access code validated', {
      masterFileId: validation.masterFileId,
    });

    res.json({
      success: true,
      ...validation,
    });
  } catch (error) {
    next(error);
  }
});

// Revoke attorney access code (internal only)
router.post('/attorney/:id/revoke', authMiddleware, async (req, res, next) => {
  try {
    const { reason } = req.body;

    const accessCode = await accessCodeService.revokeAttorneyAccessCode(
      req.params.id,
      reason,
      (req as any).userId
    );

    logger.info('Attorney access code revoked', {
      codeId: req.params.id,
      reason,
    });

    res.json({
      success: true,
      accessCode,
    });
  } catch (error) {
    next(error);
  }
});

// Revoke expert access code (internal only)
router.post('/expert/:id/revoke', authMiddleware, async (req, res, next) => {
  try {
    const { reason } = req.body;

    const accessCode = await accessCodeService.revokeExpertAccessCode(
      req.params.id,
      reason,
      (req as any).userId
    );

    logger.info('Expert access code revoked', {
      codeId: req.params.id,
      reason,
    });

    res.json({
      success: true,
      accessCode,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
