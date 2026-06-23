export interface LogContext {
  userId?: string;
  masterFileId?: string;
  appointmentId?: string;
  ipAddress?: string;
  [key: string]: any;
}

export class Logger {
  private context: LogContext = {};

  constructor(context: LogContext = {}) {
    this.context = context;
  }

  private formatLog(level: string, message: string, data?: any) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      context: this.context,
      ...(data && { data }),
    });
  }

  info(message: string, data?: any) {
    console.log(this.formatLog('INFO', message, data));
  }

  error(message: string, error?: any) {
    console.error(this.formatLog('ERROR', message, error));
  }

  warn(message: string, data?: any) {
    console.warn(this.formatLog('WARN', message, data));
  }

  debug(message: string, data?: any) {
    if (process.env.NODE_ENV === 'development') {
      console.log(this.formatLog('DEBUG', message, data));
    }
  }
}

export function createLogger(context: LogContext = {}): Logger {
  return new Logger(context);
}
