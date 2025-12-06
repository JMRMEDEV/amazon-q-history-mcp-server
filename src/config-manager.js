import { promises as fs } from 'fs';
import { join } from 'path';

export class ConfigManager {
  constructor() {
    this.config = null;
  }

  async loadConfig(projectDir) {
    const configPath = join(projectDir, '.amazon-q-history', 'config.json');
    
    try {
      const content = await fs.readFile(configPath, 'utf8');
      this.config = JSON.parse(content);
    } catch (e) {
      this.config = { storage_mode: 'server' };
    }
    
    return this.config;
  }

  isProjectMode() {
    return this.config?.storage_mode === 'project';
  }

  getStoragePath(projectDir, serverStorageDir) {
    if (this.isProjectMode()) {
      return join(projectDir, '.amazon-q-history', 'sessions');
    }
    return serverStorageDir;
  }

  getBackupPath(projectDir, serverBackupDir) {
    if (this.isProjectMode()) {
      return join(projectDir, '.amazon-q-history', 'backup');
    }
    return serverBackupDir;
  }

  canDelete() {
    return !this.isProjectMode();
  }
}
