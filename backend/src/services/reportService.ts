import { query } from '../config/database';
import { NotFoundError, ValidationError } from '../utils/errors';
import { v4 as uuidv4 } from 'uuid';

export class ReportService {
  async createReportRequest(
    data: {
      masterFileId: string;
      appointmentId: string;
      expertId: string;
      reportType: string; // 'medico-legal', 'medical_opinion', 'assessment'
      dueDate: string;
      instructions?: string;
    },
    createdBy: string
  ) {
    // Verify master file
    const mfResult = await query(
      'SELECT id FROM master_files WHERE id = $1',
      [data.masterFileId]
    );

    if (mfResult.rows.length === 0) {
      throw new NotFoundError('Master File');
    }

    // Verify appointment
    const appointmentResult = await query(
      'SELECT id FROM appointments WHERE id = $1',
      [data.appointmentId]
    );

    if (appointmentResult.rows.length === 0) {
      throw new NotFoundError('Appointment');
    }

    // Verify expert
    const expertResult = await query(
      'SELECT id FROM medical_experts WHERE id = $1',
      [data.expertId]
    );

    if (expertResult.rows.length === 0) {
      throw new NotFoundError('Medical Expert');
    }

    const reportNumber = `RPT-${Date.now()}`;

    const result = await query(
      `
      INSERT INTO reports
      (master_file_id, appointment_id, expert_id, report_number, report_type, due_date, instructions, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `,
      [
        data.masterFileId,
        data.appointmentId,
        data.expertId,
        reportNumber,
        data.reportType,
        data.dueDate,
        data.instructions || null,
        createdBy,
      ]
    );

    return result.rows[0];
  }

  async getReport(id: string) {
    const result = await query(
      `
      SELECT r.*, me.first_name as expert_first_name, me.last_name as expert_last_name,
             me.email as expert_email, me.speciality
      FROM reports r
      LEFT JOIN medical_experts me ON r.expert_id = me.id
      WHERE r.id = $1
    `,
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Report');
    }

    return result.rows[0];
  }

  async updateReportStatus(reportId: string, status: string) {
    const validStatuses = [
      'draft',
      'pending_submission',
      'submitted',
      'pending_review',
      'approved',
      'rejected',
      'archived',
    ];

    if (!validStatuses.includes(status)) {
      throw new ValidationError('Invalid status');
    }

    const result = await query(
      `
      UPDATE reports
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `,
      [status, reportId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Report');
    }

    return result.rows[0];
  }

  async submitReport(reportId: string, fileUrl: string, submittedBy: string) {
    const result = await query(
      `
      UPDATE reports
      SET 
        status = 'submitted',
        file_url = $1,
        submission_date = NOW(),
        submitted_by = $2,
        updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `,
      [fileUrl, submittedBy, reportId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Report');
    }

    return result.rows[0];
  }

  async approveReport(reportId: string, comments: string, approvedBy: string) {
    const result = await query(
      `
      UPDATE reports
      SET 
        status = 'approved',
        approval_comments = $1,
        approval_date = NOW(),
        approved_by = $2,
        updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `,
      [comments, approvedBy, reportId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Report');
    }

    return result.rows[0];
  }

  async rejectReport(
    reportId: string,
    rejectionReason: string,
    rejectedBy: string
  ) {
    const result = await query(
      `
      UPDATE reports
      SET 
        status = 'rejected',
        rejection_reason = $1,
        rejection_date = NOW(),
        rejected_by = $2,
        updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `,
      [rejectionReason, rejectedBy, reportId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Report');
    }

    return result.rows[0];
  }

  async getReportsForMasterFile(masterFileId: string) {
    const result = await query(
      `
      SELECT r.*, me.first_name as expert_first_name, me.last_name as expert_last_name
      FROM reports r
      LEFT JOIN medical_experts me ON r.expert_id = me.id
      WHERE r.master_file_id = $1
      ORDER BY r.created_at DESC
    `,
      [masterFileId]
    );

    return result.rows;
  }
}
