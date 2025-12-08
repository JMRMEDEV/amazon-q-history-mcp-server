import { promises as fs } from 'fs';
import { join } from 'path';
import { logger } from './logger.js';
import { findWorkspaceFile, parseWorkspaceFile } from './utils.js';

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
    
    // Validate tool permissions
    if (this.config.tools) {
      const validModes = ['all', 'allow', 'deny'];
      if (!validModes.includes(this.config.tools.mode)) {
        logger.warn('Invalid tools.mode, defaulting to "all"', { mode: this.config.tools.mode });
        this.config.tools.mode = 'all';
      }
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

  async getAllowedPaths(projectDir) {
    const paths = [projectDir];
    
    // Add configured allowed_paths
    if (this.config?.allowed_paths && Array.isArray(this.config.allowed_paths)) {
      paths.push(...this.config.allowed_paths);
    }
    
    // Auto-detect workspace folders
    const workspaceFile = await findWorkspaceFile(projectDir);
    if (workspaceFile) {
      const workspacePaths = await parseWorkspaceFile(workspaceFile);
      paths.push(...workspacePaths);
    }
    
    return [...new Set(paths)]; // Remove duplicates
  }

  canDelete() {
    return !this.isProjectMode();
  }

  isToolAllowed(toolName) {
    if (!this.config?.tools) return true;
    
    const { mode, list = [] } = this.config.tools;
    
    if (mode === 'all') return true;
    if (mode === 'allow') return list.includes(toolName);
    if (mode === 'deny') return !list.includes(toolName);
    
    return true;
  }
}
