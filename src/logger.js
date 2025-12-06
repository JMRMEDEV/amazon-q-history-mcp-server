import { writeFile, appendFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

class Logger {
  constructor() {
    this.projectLogPath = null;
    this.serverLogPath = join(__dirname, '../logs/server.log');
  }

  async init(projectDir) {
    const logDir = join(projectDir, '.amazon-q-history', 'logs');
    await mkdir(logDir, { recursive: true });
    this.projectLogPath = join(logDir, 'session.log');
    
    const serverLogDir = join(__dirname, '../logs');
    await mkdir(serverLogDir, { recursive: true });
  }

  format(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level}: ${message}${metaStr}\n`;
  }

  async log(level, message, meta = {}) {
    const line = this.format(level, message, meta);
    
    try {
      if (this.projectLogPath) {
        await appendFile(this.projectLogPath, line);
      }
      await appendFile(this.serverLogPath, line);
    } catch (err) {
      console.error('Logger failed:', err.message);
    }
  }

  debug(message, meta) { return this.log('DEBUG', message, meta); }
  info(message, meta) { return this.log('INFO', message, meta); }
  warn(message, meta) { return this.log('WARN', message, meta); }
  error(message, meta) { return this.log('ERROR', message, meta); }
}

export const logger = new Logger();
