export const config = {
  database: {
    url: process.env.DATABASE_URL || 'postgresql://localhost/kutlwano',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key-here',
    expiry: process.env.JWT_EXPIRY || '24h',
    refreshExpiry: process.env.REFRESH_TOKEN_EXPIRY || '7d',
  },
  mfa: {
    window: parseInt(process.env.MFA_WINDOW || '2'),
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY || '',
    fromEmail: process.env.RESEND_FROM_EMAIL || 'noreply@kutlwano.com',
  },
  server: {
    port: parseInt(process.env.PORT || '3001'),
    nodeEnv: process.env.NODE_ENV || 'development',
    backendUrl: process.env.BACKEND_URL || 'http://localhost:3001',
  },
  urls: {
    internalDashboard: process.env.INTERNAL_DASHBOARD_URL || 'http://localhost:3000',
    attorneyPortal: process.env.ATTORNEY_PORTAL_URL || 'http://localhost:3001',
    doctorPortal: process.env.DOCTOR_PORTAL_URL || 'http://localhost:3002',
  },
  session: {
    timeoutAdmin: parseInt(process.env.SESSION_TIMEOUT_ADMIN || '900000'),
    timeoutFinance: parseInt(process.env.SESSION_TIMEOUT_FINANCE || '1800000'),
    timeoutStaff: parseInt(process.env.SESSION_TIMEOUT_STAFF || '1800000'),
    timeoutExternal: parseInt(process.env.SESSION_TIMEOUT_EXTERNAL || '1800000'),
  },
  files: {
    uploadDir: process.env.FILE_UPLOAD_DIR || './uploads',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800'),
  },
  rateLimit: {
    window: parseInt(process.env.RATE_LIMIT_WINDOW || '15'),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  },
};
