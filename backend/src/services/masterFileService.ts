import { query, transaction } from '../config/database';
import { NotFoundError, ValidationError } from '../utils/errors';
import { v4 as uuidv4 } from 'uuid';

export class MasterFileService {
  async generateMFNumber(): Promise<string> {
    const result = await query(
      `SELECT COUNT(*) as count FROM master_files WHERE created_at > NOW() - INTERVAL '1 year'`
    );
    const count = parseInt(result.rows[0].count) + 1;
    const year = new Date().getFullYear();
    return `MF-${year}-${String(count).padStart(6, '0')}`;
  }

  async createMasterFile(
    data: {
      referringAttorneyId: string;
      matterType: string;
      claimantId?: string;
      firstName?: string;
      lastName?: string;
      idNumber?: string;
      dateOfBirth?: string;
      email?: string;
      phone?: string;
    },
    createdBy: string
  ) {
    return transaction(async (client) => {
      // Create or get claimant
      let claimantId = data.claimantId;

      if (!claimantId && data.firstName && data.lastName) {
        const claimantResult = await client.query(
          `
          INSERT INTO claimants 
          (first_name, last_name, id_number, date_of_birth, email, phone)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id
        `,
          [
            data.firstName,
            data.lastName,
            data.idNumber || null,
            data.dateOfBirth || null,
            data.email || null,
            data.phone || null,
          ]
        );
        claimantId = claimantResult.rows[0].id;
      }

      // Get attorney's law firm
      const attorneyResult = await client.query(
        'SELECT law_firm_id FROM attorneys WHERE id = $1',
        [data.referringAttorneyId]
      );

      if (attorneyResult.rows.length === 0) {
        throw new NotFoundError('Attorney');
      }

      const lawFirmId = attorneyResult.rows[0].law_firm_id;

      // Generate MF number
      const mfNumber = await this.generateMFNumber();

      // Create master file
      const masterFileResult = await client.query(
        `
        INSERT INTO master_files 
        (mf_number, claimant_id, referring_attorney_id, law_firm_id, matter_type, created_by, assigned_to)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `,
        [
          mfNumber,
          claimantId || null,
          data.referringAttorneyId,
          lawFirmId,
          data.matterType,
          createdBy,
          createdBy,
        ]
      );

      return masterFileResult.rows[0];
    });
  }

  async getMasterFile(id: string) {
    const result = await query(
      `
      SELECT 
        mf.*,
        c.first_name as claimant_first_name,
        c.last_name as claimant_last_name,
        c.id_number as claimant_id_number,
        c.email as claimant_email,
        c.phone as claimant_phone,
        a.first_name as attorney_first_name,
        a.last_name as attorney_last_name,
        a.email as attorney_email,
        lf.name as law_firm_name
      FROM master_files mf
      LEFT JOIN claimants c ON mf.claimant_id = c.id
      LEFT JOIN attorneys a ON mf.referring_attorney_id = a.id
      LEFT JOIN law_firms lf ON mf.law_firm_id = lf.id
      WHERE mf.id = $1
    `,
      [id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Master File');
    }

    return result.rows[0];
  }

  async listMasterFiles(
    filters: {
      status?: string;
      attorneyId?: string;
      lawFirmId?: string;
      skip?: number;
      limit?: number;
    } = {}
  ) {
    let query_text = `
      SELECT 
        mf.*,
        c.first_name as claimant_first_name,
        c.last_name as claimant_last_name,
        a.first_name as attorney_first_name,
        a.last_name as attorney_last_name,
        lf.name as law_firm_name
      FROM master_files mf
      LEFT JOIN claimants c ON mf.claimant_id = c.id
      LEFT JOIN attorneys a ON mf.referring_attorney_id = a.id
      LEFT JOIN law_firms lf ON mf.law_firm_id = lf.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters.status) {
      query_text += ` AND mf.status = $${params.length + 1}`;
      params.push(filters.status);
    }

    if (filters.attorneyId) {
      query_text += ` AND mf.referring_attorney_id = $${params.length + 1}`;
      params.push(filters.attorneyId);
    }

    if (filters.lawFirmId) {
      query_text += ` AND mf.law_firm_id = $${params.length + 1}`;
      params.push(filters.lawFirmId);
    }

    query_text += ` ORDER BY mf.created_at DESC`;

    const skip = filters.skip || 0;
    const limit = filters.limit || 50;

    query_text += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, skip);

    const result = await query(query_text, params);
    return result.rows;
  }

  async updateMasterFileStatus(
    id: string,
    status: string,
    updatedBy: string
  ) {
    const validStatuses = [
      'intake',
      'scheduled',
      'awaiting_assessment',
      'awaiting_report',
      'awaiting_payment',
      'ready_for_release',
      'closed',
      'archived',
    ];

    if (!validStatuses.includes(status)) {
      throw new ValidationError('Invalid status');
    }

    const result = await query(
      `
      UPDATE master_files
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `,
      [status, id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Master File');
    }

    return result.rows[0];
  }

  async getMasterFileWithRelations(id: string) {
    const masterFile = await this.getMasterFile(id);

    // Get appointments
    const appointmentsResult = await query(
      `
      SELECT a.*, me.first_name as expert_first_name, me.last_name as expert_last_name,
             me.speciality
      FROM appointments a
      LEFT JOIN medical_experts me ON a.expert_id = me.id
      WHERE a.master_file_id = $1
      ORDER BY a.appointment_date
    `,
      [id]
    );

    // Get reports
    const reportsResult = await query(
      `
      SELECT r.*, me.first_name as expert_first_name, me.last_name as expert_last_name
      FROM reports r
      LEFT JOIN medical_experts me ON r.expert_id = me.id
      WHERE r.master_file_id = $1
      ORDER BY r.created_at DESC
    `,
      [id]
    );

    // Get financial records
    const financialResult = await query(
      'SELECT * FROM financial_records WHERE master_file_id = $1',
      [id]
    );

    // Get documents
    const documentsResult = await query(
      'SELECT * FROM documents WHERE master_file_id = $1 ORDER BY created_at DESC',
      [id]
    );

    // Get communications
    const communicationsResult = await query(
      'SELECT * FROM communications WHERE master_file_id = $1 ORDER BY created_at DESC',
      [id]
    );

    return {
      masterFile,
      appointments: appointmentsResult.rows,
      reports: reportsResult.rows,
      financial: financialResult.rows[0] || null,
      documents: documentsResult.rows,
      communications: communicationsResult.rows,
    };
  }
}
