import { query, transaction } from '../config/database';
import { NotFoundError, ValidationError } from '../utils/errors';
import { generateAccessCode, hashAccessCode } from '../utils/crypto';
import { v4 as uuidv4 } from 'uuid';

export class AppointmentService {
  async createAppointment(
    data: {
      masterFileId: string;
      expertId: string;
      assessmentType: string;
      appointmentDate: string;
      location: string;
    },
    createdBy: string
  ) {
    return transaction(async (client) => {
      // Verify master file exists
      const mfResult = await client.query(
        'SELECT id FROM master_files WHERE id = $1',
        [data.masterFileId]
      );

      if (mfResult.rows.length === 0) {
        throw new NotFoundError('Master File');
      }

      // Verify expert exists
      const expertResult = await client.query(
        'SELECT id FROM medical_experts WHERE id = $1',
        [data.expertId]
      );

      if (expertResult.rows.length === 0) {
        throw new NotFoundError('Medical Expert');
      }

      // Create appointment
      const appointmentResult = await client.query(
        `
        INSERT INTO appointments
        (master_file_id, expert_id, assessment_type, appointment_date, location, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `,
        [
          data.masterFileId,
          data.expertId,
          data.assessmentType,
          data.appointmentDate,
          data.location,
          createdBy,
        ]
      );

      const appointment = appointmentResult.rows[0];

      // Create appointment checklist
      const checklistItems = [
        'Claimant details complete',
        'Expert selected',
        'Fee captured',
        'Deposit captured',
        'Required documents uploaded',
        'Appointment confirmed',
        'Doctor notified',
        'AOD checked',
        'Report due date set',
      ];

      for (const item of checklistItems) {
        await client.query(
          `
          INSERT INTO appointment_checklists
          (appointment_id, item)
          VALUES ($1, $2)
        `,
          [appointment.id, item]
        );
      }

      return appointment;
    });
  }

  async getAppointment(id: string) {
    const result = await query(
      `
      SELECT a.*, me.first_name as expert_first_name, me.last_name as expert_last_name,
             me.email as expert_email, me.speciality
      FROM appointments a
      LEFT JOIN medical_experts me ON a.expert_id = me.id
      WHERE a.id = $1
    `,
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Appointment');
    }

    return result.rows[0];
  }

  async updateAppointmentStatus(
    id: string,
    status: string
  ) {
    const validStatuses = [
      'draft',
      'scheduled',
      'confirmation_sent',
      'confirmed',
      'rescheduled',
      'cancelled',
      'no_show',
      'completed',
    ];

    if (!validStatuses.includes(status)) {
      throw new ValidationError('Invalid status');
    }

    const result = await query(
      `
      UPDATE appointments
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `,
      [status, id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Appointment');
    }

    return result.rows[0];
  }

  async getAppointmentChecklist(appointmentId: string) {
    const result = await query(
      `
      SELECT * FROM appointment_checklists
      WHERE appointment_id = $1
      ORDER BY created_at
    `,
      [appointmentId]
    );

    return result.rows;
  }

  async completeChecklistItem(
    checklistId: string,
    completedBy: string
  ) {
    const result = await query(
      `
      UPDATE appointment_checklists
      SET is_completed = true, completed_at = NOW(), completed_by = $1
      WHERE id = $2
      RETURNING *
    `,
      [completedBy, checklistId]
    );

    return result.rows[0];
  }
}
