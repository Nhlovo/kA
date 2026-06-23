import { Router } from 'express';
import { MasterFileService } from '../services/masterFileService';
import { authMiddleware, mfaRequiredMiddleware } from '../middleware/auth';
import { createMasterFileSchema } from '../utils/validation';
import { createLogger } from '../utils/logger';

const router = Router();
const masterFileService = new MasterFileService();
const logger = createLogger();

router.use(authMiddleware);

// Create master file
router.post('/', async (req, res, next) => {
  try {
    const data = createMasterFileSchema.parse(req.body);
    const masterFile = await masterFileService.createMasterFile(
      data,
      (req as any).userId
    );

    logger.info('Master file created', {
      masterFileId: masterFile.id,
      mfNumber: masterFile.mf_number,
    });

    res.status(201).json({
      success: true,
      masterFile,
    });
  } catch (error) {
    next(error);
  }
});

// Get master file
router.get('/:id', async (req, res, next) => {
  try {
    const masterFileData = await masterFileService.getMasterFileWithRelations(
      req.params.id
    );

    res.json({
      success: true,
      data: masterFileData,
    });
  } catch (error) {
    next(error);
  }
});

// List master files
router.get('/', async (req, res, next) => {
  try {
    const filters = {
      status: req.query.status as string | undefined,
      attorneyId: req.query.attorneyId as string | undefined,
      lawFirmId: req.query.lawFirmId as string | undefined,
      skip: req.query.skip ? parseInt(req.query.skip as string) : 0,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
    };

    const masterFiles = await masterFileService.listMasterFiles(filters);

    res.json({
      success: true,
      data: masterFiles,
      count: masterFiles.length,
    });
  } catch (error) {
    next(error);
  }
});

// Update master file status
router.patch('/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    const masterFile = await masterFileService.updateMasterFileStatus(
      req.params.id,
      status,
      (req as any).userId
    );

    logger.info('Master file status updated', {
      masterFileId: req.params.id,
      status,
    });

    res.json({
      success: true,
      masterFile,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
