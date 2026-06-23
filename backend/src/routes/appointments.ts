import { Router } from 'express';
import { AppointmentService } from '../services/appointmentService';
import { authMiddleware } from '../middleware/auth';
import { createAppointmentSchema } from '../utils/validation';
import { createLogger } from '../utils/logger';

const router = Router();
const appointmentService = new AppointmentService();
const logger = createLogger();

router.use(authMiddleware);

// Create appointment
router.post('/', async (req, res, next) => {
  try {
    const data = createAppointmentSchema.parse(req.body);
    const appointment = await appointmentService.createAppointment(
      data,
      (req as any).userId
    );

    logger.info('Appointment created', {
      appointmentId: appointment.id,
      masterFileId: data.masterFileId,
    });

    res.status(201).json({
      success: true,
      appointment,
    });
  } catch (error) {
    next(error);
  }
});

// Get appointment
router.get('/:id', async (req, res, next) => {
  try {
    const appointment = await appointmentService.getAppointment(req.params.id);

    res.json({
      success: true,
      appointment,
    });
  } catch (error) {
    next(error);
  }
});

// Update appointment status
router.patch('/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    const appointment = await appointmentService.updateAppointmentStatus(
      req.params.id,
      status
    );

    logger.info('Appointment status updated', {
      appointmentId: req.params.id,
      status,
    });

    res.json({
      success: true,
      appointment,
    });
  } catch (error) {
    next(error);
  }
});

// Get appointment checklist
router.get('/:id/checklist', async (req, res, next) => {
  try {
    const checklist = await appointmentService.getAppointmentChecklist(
      req.params.id
    );

    res.json({
      success: true,
      checklist,
    });
  } catch (error) {
    next(error);
  }
});

// Complete checklist item
router.post('/:id/checklist/:itemId/complete', async (req, res, next) => {
  try {
    const item = await appointmentService.completeChecklistItem(
      req.params.itemId,
      (req as any).userId
    );

    logger.info('Checklist item completed', {
      appointmentId: req.params.id,
      itemId: req.params.itemId,
    });

    res.json({
      success: true,
      item,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
