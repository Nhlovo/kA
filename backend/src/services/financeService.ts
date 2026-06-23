import { query, transaction } from '../config/database';
import { NotFoundError, ValidationError } from '../utils/errors';
import { v4 as uuidv4 } from 'uuid';

export class FinanceService {
  async recordExpense(
    data: {
      masterFileId: string;
      type: string; // 'deposit', 'assessment_fee', 'expert_fee', 'other'
      amount: number;
      description: string;
      paymentMethod: string;
      reference?: string;
    },
    recordedBy: string
  ) {
    // Verify master file exists
    const mfResult = await query(
      'SELECT id FROM master_files WHERE id = $1',
      [data.masterFileId]
    );

    if (mfResult.rows.length === 0) {
      throw new NotFoundError('Master File');
    }

    // Validate amount
    if (data.amount <= 0) {
      throw new ValidationError('Amount must be greater than zero');
    }

    const result = await query(
      `
      INSERT INTO financial_records
      (master_file_id, type, amount, description, payment_method, reference, recorded_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `,
      [
        data.masterFileId,
        data.type,
        data.amount,
        data.description,
        data.paymentMethod,
        data.reference || null,
        recordedBy,
      ]
    );

    return result.rows[0];
  }

  async getFinancialSummary(masterFileId: string) {
    const result = await query(
      `
      SELECT 
        SUM(CASE WHEN type IN ('deposit', 'payment_received') THEN amount ELSE 0 END) as total_received,
        SUM(CASE WHEN type IN ('assessment_fee', 'expert_fee', 'other') THEN amount ELSE 0 END) as total_expenses,
        COUNT(*) as transaction_count
      FROM financial_records
      WHERE master_file_id = $1
    `,
      [masterFileId]
    );

    const row = result.rows[0];
    return {
      totalReceived: parseFloat(row.total_received) || 0,
      totalExpenses: parseFloat(row.total_expenses) || 0,
      balance: (parseFloat(row.total_received) || 0) - (parseFloat(row.total_expenses) || 0),
      transactionCount: row.transaction_count,
    };
  }

  async getFinancialRecords(masterFileId: string) {
    const result = await query(
      `
      SELECT * FROM financial_records
      WHERE master_file_id = $1
      ORDER BY created_at DESC
    `,
      [masterFileId]
    );

    return result.rows;
  }

  async recordPaymentRelease(
    data: {
      masterFileId: string;
      amount: number;
      releaseDate: string;
      purpose: string;
      payeeName: string;
      bankDetails?: string;
    },
    approvedBy: string
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

      // Check financial status
      const financialResult = await client.query(
        `
        SELECT 
          SUM(CASE WHEN type IN ('deposit', 'payment_received') THEN amount ELSE 0 END) as total_received,
          SUM(CASE WHEN type IN ('assessment_fee', 'expert_fee', 'other') THEN amount ELSE 0 END) as total_expenses
        FROM financial_records
        WHERE master_file_id = $1
      `,
        [data.masterFileId]
      );

      const financial = financialResult.rows[0];
      const balance = (parseFloat(financial.total_received) || 0) - (parseFloat(financial.total_expenses) || 0);

      if (balance < data.amount) {
        throw new ValidationError('Insufficient funds for this release');
      }

      // Create payment release record
      const releaseResult = await client.query(
        `
        INSERT INTO payment_releases
        (master_file_id, amount, release_date, purpose, payee_name, bank_details, approved_by, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `,
        [
          data.masterFileId,
          data.amount,
          data.releaseDate,
          data.purpose,
          data.payeeName,
          data.bankDetails || null,
          approvedBy,
          'pending_approval',
        ]
      );

      return releaseResult.rows[0];
    });
  }

  async approvePaymentRelease(releaseId: string, approvedBy: string) {
    const result = await query(
      `
      UPDATE payment_releases
      SET status = 'approved', approval_date = NOW(), final_approved_by = $1
      WHERE id = $2
      RETURNING *
    `,
      [approvedBy, releaseId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Payment Release');
    }

    return result.rows[0];
  }

  async processPaymentRelease(releaseId: string, processedBy: string) {
    const result = await query(
      `
      UPDATE payment_releases
      SET status = 'processed', processing_date = NOW(), processed_by = $1
      WHERE id = $2
      RETURNING *
    `,
      [processedBy, releaseId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Payment Release');
    }

    return result.rows[0];
  }
}
