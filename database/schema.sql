-- ========================================
-- KUTLWANO MEDICO-LEGAL CASE MANAGEMENT
-- DATABASE SCHEMA - PHASE 1
-- ========================================

-- ========================================
-- 1. CORE USERS & AUTH
-- ========================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    role VARCHAR(50) NOT NULL DEFAULT 'employee',
    user_type VARCHAR(50) NOT NULL DEFAULT 'internal', -- internal, attorney, expert
    is_active BOOLEAN DEFAULT true,
    mfa_enabled BOOLEAN DEFAULT false,
    mfa_secret VARCHAR(255),
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_fingerprint VARCHAR(255) NOT NULL,
    device_name VARCHAR(255),
    device_type VARCHAR(50), -- desktop, mobile, tablet
    browser VARCHAR(100),
    os VARCHAR(100),
    last_ip_address INET,
    last_accessed TIMESTAMP,
    is_trusted BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, device_fingerprint)
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID REFERENCES user_devices(id),
    token VARCHAR(500) NOT NULL UNIQUE,
    refresh_token VARCHAR(500),
    mfa_verified BOOLEAN DEFAULT false,
    ip_address INET,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_token ON user_sessions(token);
CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at);

-- ========================================
-- 2. EXTERNAL ORGANIZATIONS
-- ========================================

CREATE TABLE IF NOT EXISTS law_firms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    registration_number VARCHAR(100),
    address TEXT,
    city VARCHAR(100),
    province VARCHAR(100),
    postal_code VARCHAR(20),
    phone VARCHAR(20),
    email VARCHAR(255),
    contact_person VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attorneys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    law_firm_id UUID NOT NULL REFERENCES law_firms(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(20),
    fax VARCHAR(20),
    bar_number VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    user_id UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_attorneys_law_firm ON attorneys(law_firm_id);
CREATE INDEX idx_attorneys_email ON attorneys(email);

CREATE TABLE IF NOT EXISTS medical_experts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(20),
    speciality VARCHAR(100),
    qualifications TEXT,
    registration_number VARCHAR(100),
    province VARCHAR(100),
    availability_notes TEXT,
    is_active BOOLEAN DEFAULT true,
    user_id UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_medical_experts_email ON medical_experts(email);
CREATE INDEX idx_medical_experts_speciality ON medical_experts(speciality);

-- ========================================
-- 3. MASTER FILES & CLAIMANTS
-- ========================================

CREATE TABLE IF NOT EXISTS master_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mf_number VARCHAR(50) NOT NULL UNIQUE, -- MF-2026-000124
    claimant_id UUID,
    referring_attorney_id UUID NOT NULL REFERENCES attorneys(id),
    law_firm_id UUID NOT NULL REFERENCES law_firms(id),
    matter_type VARCHAR(100), -- RAF Assessment, Personal Injury, etc.
    status VARCHAR(50) DEFAULT 'intake', -- intake, scheduled, awaiting_assessment, awaiting_report, awaiting_payment, ready_for_release, closed, archived
    risk_level VARCHAR(50) DEFAULT 'low', -- low, medium, high, critical
    payment_risk VARCHAR(50) DEFAULT 'none', -- none, low, medium, high
    report_risk VARCHAR(50) DEFAULT 'none', -- none, low, medium, high
    created_by UUID REFERENCES users(id),
    assigned_to UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_master_files_mf_number ON master_files(mf_number);
CREATE INDEX idx_master_files_status ON master_files(status);
CREATE INDEX idx_master_files_attorney ON master_files(referring_attorney_id);
CREATE INDEX idx_master_files_law_firm ON master_files(law_firm_id);

CREATE TABLE IF NOT EXISTS claimants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    id_number VARCHAR(50),
    passport_number VARCHAR(50),
    date_of_birth DATE,
    gender VARCHAR(20),
    email VARCHAR(255),
    phone VARCHAR(20),
    address TEXT,
    city VARCHAR(100),
    province VARCHAR(100),
    postal_code VARCHAR(20),
    is_minor BOOLEAN DEFAULT false,
    guardian_name VARCHAR(255),
    guardian_contact VARCHAR(100),
    injury_description TEXT,
    incident_date DATE,
    incident_location VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_claimants_email ON claimants(email);
CREATE INDEX idx_claimants_id_number ON claimants(id_number);

ALTER TABLE master_files ADD CONSTRAINT fk_master_files_claimant 
FOREIGN KEY (claimant_id) REFERENCES claimants(id) ON DELETE SET NULL;

-- ========================================
-- 4. APPOINTMENTS & ASSESSMENTS
-- ========================================

CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_file_id UUID NOT NULL REFERENCES master_files(id) ON DELETE CASCADE,
    expert_id UUID NOT NULL REFERENCES medical_experts(id),
    assessment_type VARCHAR(100), -- Orthopaedic, Neurosurgeon, OT, etc.
    appointment_date TIMESTAMP NOT NULL,
    location VARCHAR(255),
    status VARCHAR(50) DEFAULT 'draft', -- draft, scheduled, confirmation_sent, confirmed, rescheduled, cancelled, no_show, completed
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_appointments_master_file ON appointments(master_file_id);
CREATE INDEX idx_appointments_expert ON appointments(expert_id);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_appointments_date ON appointments(appointment_date);

CREATE TABLE IF NOT EXISTS assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'awaiting_assessment', -- awaiting_assessment, assessed, incomplete, follow_up_required
    assessment_date TIMESTAMP,
    attended BOOLEAN,
    assessment_notes TEXT,
    findings TEXT,
    completed_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_assessments_appointment ON assessments(appointment_id);
CREATE INDEX idx_assessments_status ON assessments(status);

-- ========================================
-- 5. REPORTS
-- ========================================

CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_file_id UUID NOT NULL REFERENCES master_files(id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES appointments(id),
    expert_id UUID NOT NULL REFERENCES medical_experts(id),
    report_type VARCHAR(100), -- Assessment Report, Addendum, etc.
    status VARCHAR(50) DEFAULT 'not_started', -- not_started, requested, in_progress, received, proofreading, ready_for_release, released, delayed
    due_date DATE,
    received_date TIMESTAMP,
    file_path VARCHAR(500),
    file_size BIGINT,
    release_date TIMESTAMP,
    is_released BOOLEAN DEFAULT false,
    release_notes TEXT,
    proofreading_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_reports_master_file ON reports(master_file_id);
CREATE INDEX idx_reports_expert ON reports(expert_id);
CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_reports_due_date ON reports(due_date);

-- ========================================
-- 6. DOCUMENTS & FILES
-- ========================================

CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_file_id UUID NOT NULL REFERENCES master_files(id) ON DELETE CASCADE,
    document_type VARCHAR(100), -- ID Copy, Medical Records, RAF, AOD, Invoice, etc.
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT,
    mime_type VARCHAR(100),
    uploaded_by UUID REFERENCES users(id),
    is_sensitive BOOLEAN DEFAULT false,
    visibility VARCHAR(50) DEFAULT 'internal', -- internal, attorney, expert, shared
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_documents_master_file ON documents(master_file_id);
CREATE INDEX idx_documents_type ON documents(document_type);
CREATE INDEX idx_documents_sensitivity ON documents(is_sensitive);

-- ========================================
-- 7. FINANCE & PAYMENTS
-- ========================================

CREATE TABLE IF NOT EXISTS financial_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_file_id UUID NOT NULL REFERENCES master_files(id) ON DELETE CASCADE,
    assessment_fee DECIMAL(10, 2),
    deposit_amount DECIMAL(10, 2),
    deposit_date DATE,
    balance DECIMAL(10, 2),
    payment_status VARCHAR(50) DEFAULT 'unpaid', -- unpaid, deposit_paid, partially_paid, fully_paid, overdue, written_off
    payment_date DATE,
    payment_method VARCHAR(50),
    payment_reference VARCHAR(100),
    aod_active BOOLEAN DEFAULT false,
    aod_amount DECIMAL(10, 2),
    aod_due_date DATE,
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_financial_records_master_file ON financial_records(master_file_id);
CREATE INDEX idx_financial_records_payment_status ON financial_records(payment_status);

CREATE TABLE IF NOT EXISTS payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    financial_record_id UUID NOT NULL REFERENCES financial_records(id) ON DELETE CASCADE,
    transaction_type VARCHAR(50), -- deposit, payment, adjustment, write_off
    amount DECIMAL(10, 2),
    transaction_date DATE,
    reference VARCHAR(100),
    description TEXT,
    recorded_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payment_transactions_financial_record ON payment_transactions(financial_record_id);
CREATE INDEX idx_payment_transactions_date ON payment_transactions(transaction_date);

-- ========================================
-- 8. EXTERNAL ACCESS CODES
-- ========================================

CREATE TABLE IF NOT EXISTS attorney_access_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_file_id UUID NOT NULL REFERENCES master_files(id) ON DELETE CASCADE,
    attorney_id UUID NOT NULL REFERENCES attorneys(id),
    code VARCHAR(50) NOT NULL UNIQUE,
    code_hash VARCHAR(255),
    status VARCHAR(50) DEFAULT 'active', -- active, expired, revoked, inactive
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expiry_date TIMESTAMP,
    first_accessed TIMESTAMP,
    last_accessed TIMESTAMP,
    access_count INT DEFAULT 0,
    last_ip_address INET,
    device_fingerprint VARCHAR(255),
    browser_info VARCHAR(255),
    revoke_reason VARCHAR(255),
    created_by UUID REFERENCES users(id),
    UNIQUE(master_file_id, attorney_id)
);

CREATE INDEX idx_attorney_access_codes_code ON attorney_access_codes(code);
CREATE INDEX idx_attorney_access_codes_status ON attorney_access_codes(status);
CREATE INDEX idx_attorney_access_codes_attorney ON attorney_access_codes(attorney_id);
CREATE INDEX idx_attorney_access_codes_master_file ON attorney_access_codes(master_file_id);

CREATE TABLE IF NOT EXISTS expert_access_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    expert_id UUID NOT NULL REFERENCES medical_experts(id),
    master_file_id UUID NOT NULL REFERENCES master_files(id),
    code VARCHAR(50) NOT NULL UNIQUE,
    code_hash VARCHAR(255),
    status VARCHAR(50) DEFAULT 'active', -- active, expired, revoked, inactive
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expiry_date TIMESTAMP,
    first_accessed TIMESTAMP,
    last_accessed TIMESTAMP,
    access_count INT DEFAULT 0,
    last_ip_address INET,
    device_fingerprint VARCHAR(255),
    browser_info VARCHAR(255),
    revoke_reason VARCHAR(255),
    created_by UUID REFERENCES users(id),
    UNIQUE(appointment_id, expert_id)
);

CREATE INDEX idx_expert_access_codes_code ON expert_access_codes(code);
CREATE INDEX idx_expert_access_codes_status ON expert_access_codes(status);
CREATE INDEX idx_expert_access_codes_expert ON expert_access_codes(expert_id);
CREATE INDEX idx_expert_access_codes_master_file ON expert_access_codes(master_file_id);

-- ========================================
-- 9. AUDIT TRAIL & LOGGING
-- ========================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    event_type VARCHAR(100), -- login, logout, create, update, delete, download, release, etc.
    action VARCHAR(255),
    record_type VARCHAR(100), -- master_file, appointment, report, etc.
    record_id UUID,
    master_file_id UUID REFERENCES master_files(id),
    old_value TEXT,
    new_value TEXT,
    ip_address INET,
    device_id UUID,
    browser_info VARCHAR(255),
    risk_level VARCHAR(50) DEFAULT 'low', -- low, medium, high, critical
    success BOOLEAN DEFAULT true,
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_master_file ON audit_logs(master_file_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_risk_level ON audit_logs(risk_level);

CREATE TABLE IF NOT EXISTS failed_login_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255),
    ip_address INET,
    attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reason VARCHAR(255)
);

CREATE INDEX idx_failed_login_attempts_email ON failed_login_attempts(email);
CREATE INDEX idx_failed_login_attempts_ip ON failed_login_attempts(ip_address);
CREATE INDEX idx_failed_login_attempts_timestamp ON failed_login_attempts(attempted_at);

-- ========================================
-- 10. COMMUNICATIONS
-- ========================================

CREATE TABLE IF NOT EXISTS communications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    master_file_id UUID NOT NULL REFERENCES master_files(id) ON DELETE CASCADE,
    communication_type VARCHAR(50), -- email, sms, whatsapp, internal_note
    subject VARCHAR(255),
    message TEXT,
    sender_id UUID REFERENCES users(id),
    sender_type VARCHAR(50), -- internal, attorney, expert
    recipient_email VARCHAR(255),
    recipient_type VARCHAR(50), -- internal, attorney, expert
    status VARCHAR(50) DEFAULT 'sent', -- draft, sent, delivered, failed, read
    sent_at TIMESTAMP,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_communications_master_file ON communications(master_file_id);
CREATE INDEX idx_communications_status ON communications(status);

-- ========================================
-- 11. CHECKLISTS
-- ========================================

CREATE TABLE IF NOT EXISTS appointment_checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    item VARCHAR(255) NOT NULL,
    is_completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMP,
    completed_by UUID REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_checklists_appointment ON appointment_checklists(appointment_id);

-- ========================================
-- 12. ROLE-BASED PERMISSIONS
-- ========================================

CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    resource VARCHAR(100), -- master_files, appointments, reports, finance, etc.
    action VARCHAR(50), -- read, create, update, delete, release, approve
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(role_id, resource, action)
);

-- ========================================
-- INITIAL SEED DATA
-- ========================================

INSERT INTO roles (name, description) VALUES
('admin', 'System administrator with full access'),
('employee', 'Staff member with operational access'),
('scheduler', 'Handles appointments and scheduling'),
('case_manager', 'Manages master files and workflow'),
('report_team', 'Handles report tracking and release'),
('finance', 'Handles payments and AOD'),
('sales_consultant', 'Manages attorney relationships'),
('read_only', 'View-only access')
ON CONFLICT DO NOTHING;

INSERT INTO permissions (role_id, resource, action)
SELECT r.id, res, act FROM 
roles r,
(VALUES 
  ('master_files', 'read'),
  ('master_files', 'create'),
  ('master_files', 'update'),
  ('appointments', 'read'),
  ('appointments', 'create'),
  ('appointments', 'update'),
  ('reports', 'read'),
  ('reports', 'create'),
  ('documents', 'read'),
  ('documents', 'upload'),
  ('finance', 'read'),
  ('finance', 'update'),
  ('audit', 'read')
) AS t(res, act)
WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;
