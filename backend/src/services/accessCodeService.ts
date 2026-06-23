import { query } from '../config/database';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors';
import { generateAccessCode, hashAccessCode } from '../utils/crypto';
import { v4 as uuidv4 } from 'uuid';

export class AccessCodeService {
  async generateAttorneyAccessCode(
    masterFileId: string,
    attorneyId: string,
    createdBy: string
  ) {
    // Check if attorney already has code for this master file
    const existingResult = await query(
      `
      SELECT id FROM attorney_access_codes
      WHERE master_file_id = $1 AND attorney_id = $2 AND status = 'active'
    `,
      [masterFileId, attorneyId]
    );

    if (existingResult.rows.length > 0) {
      throw new ConflictError('Active access code already exists for this matter');
    }

    const code = generateAccessCode();
    const codeHash = hashAccessCode(code);
    const expiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year

    const result = await query(
      `
      INSERT INTO attorney_access_codes
      (master_file_id, attorney_id, code, code_hash, expiry_date, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, code, expiry_date, status
    `,
      [masterFileId, attorneyId, code, codeHash, expiryDate, createdBy]
    );

    return {
      id: result.rows[0].id,
      code: result.rows[0].code,
      expiryDate: result.rows[0].expiry_date,
      status: result.rows[0].status,
    };
  }

  async generateExpertAccessCode(
    appointmentId: string,
    expertId: string,
    masterFileId: string,
    createdBy: string
  ) {
    const code = generateAccessCode();
    const codeHash = hashAccessCode(code);
    const expiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year

    const result = await query(
      `
      INSERT INTO expert_access_codes
      (appointment_id, expert_id, master_file_id, code, code_hash, expiry_date, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, code, expiry_date, status
    `,
      [appointmentId, expertId, masterFileId, code, codeHash, expiryDate, createdBy]
    );

    return {
      id: result.rows[0].id,
      code: result.rows[0].code,
      expiryDate: result.rows[0].expiry_date,
      status: result.rows[0].status,
    };
  }

  async validateAttorneyAccessCode(
    code: string,
    ipAddress: string,
    deviceFingerprint: string
  ) {
    const codeHash = hashAccessCode(code);

    const result = await query(
      `
      SELECT aac.*, mf.*, a.id as attorney_id, a.first_name, a.last_name
      FROM attorney_access_codes aac
      JOIN master_files mf ON aac.master_file_id = mf.id
      JOIN attorneys a ON aac.attorney_id = a.id
      WHERE aac.code_hash = $1
    `,
      [codeHash]
    );

    if (result.rows.length === 0) {
      throw new ValidationError('Invalid access code');
    }

    const accessCode = result.rows[0];

    // Check if active
    if (accessCode.status !== 'active') {
      throw new ValidationError('Access code is no longer active');
    }

    // Check if expired
    if (new Date() > new Date(accessCode.expiry_date)) {
      await query(
        'UPDATE attorney_access_codes SET status = $1 WHERE id = $2',
        ['expired', accessCode.id]
      );
      throw new ValidationError('Access code has expired');
    }

    // Update access tracking
    await query(
      `
      UPDATE attorney_access_codes
      SET 
        last_accessed = NOW(),
        access_count = access_count + 1,
        last_ip_address = $1,
        device_fingerprint = $2
      WHERE id = $3
    `,
      [ipAddress, deviceFingerprint, accessCode.id]
    );

    return {
      masterFileId: accessCode.master_file_id,
      attorneyId: accessCode.attorney_id,
      attorneyName: `${accessCode.first_name} ${accessCode.last_name}`,
      masterFile: accessCode,
    };
  }

  async validateExpertAccessCode(
    code: string,
    ipAddress: string,
    deviceFingerprint: string
  ) {
    const codeHash = hashAccessCode(code);

    const result = await query(
      `
      SELECT eac.*, mf.*, app.*, me.id as expert_id, me.first_name, me.last_name
      FROM expert_access_codes eac
      JOIN master_files mf ON eac.master_file_id = mf.id
      JOIN appointments app ON eac.appointment_id = app.id
      JOIN medical_experts me ON eac.expert_id = me.id
      WHERE eac.code_hash = $1
    `,
      [codeHash]
    );

    if (result.rows.length === 0) {
      throw new ValidationError('Invalid access code');
    }

    const accessCode = result.rows[0];

    // Check if active
    if (accessCode.status !== 'active') {
      throw new ValidationError('Access code is no longer active');
    }

    // Check if expired
    if (new Date() > new Date(accessCode.expiry_date)) {
      await query(
        'UPDATE expert_access_codes SET status = $1 WHERE id = $2',
        ['expired', accessCode.id]
      );
      throw new ValidationError('Access code has expired');
    }

    // Update access tracking
    await query(
      `
      UPDATE expert_access_codes
      SET 
        last_accessed = NOW(),
        access_count = access_count + 1,
        last_ip_address = $1,
        device_fingerprint = $2
      WHERE id = $3
    `,
      [ipAddress, deviceFingerprint, accessCode.id]
    );

    return {
      masterFileId: accessCode.master_file_id,
      appointmentId: accessCode.appointment_id,
      expertId: accessCode.expert_id,
      expertName: `${accessCode.first_name} ${accessCode.last_name}`,
      appointment: accessCode,
    };
  }

  async revokeAttorneyAccessCode(
    codeId: string,
    reason: string,
    revokedBy: string
  ) {
    const result = await query(
      `
      UPDATE attorney_access_codes
      SET status = 'revoked', revoke_reason = $1
      WHERE id = $2
      RETURNING *
    `,
      [reason, codeId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Access code');
    }

    return result.rows[0];
  }

  async revokeExpertAccessCode(
    codeId: string,
    reason: string,
    revokedBy: string
  ) {
    const result = await query(
      `
      UPDATE expert_access_codes
      SET status = 'revoked', revoke_reason = $1
      WHERE id = $2
      RETURNING *
    `,
      [reason, codeId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Access code');
    }

    return result.rows[0];
  }
}
