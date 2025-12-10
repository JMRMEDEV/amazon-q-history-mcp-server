import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import os from 'os';
import { fileQueue } from './file-operation-queue.js';
import { logger } from './logger.js';
import { eventBus } from './event-bus.js';
import { ConfigManager } from './config-manager.js';
import { normalizeAgentName } from './utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class SessionManager {
  constructor() {
    this.defaultStorageDir = join(__dirname, '../storage/sessions');
    this.defaultBackupDir = join(os.tmpdir(), 'amazon-q-history');
    this.storageDir = this.defaultStorageDir;
    this.backupDir = this.defaultBackupDir;
    this.currentSession = null;
    this.configManager = new ConfigManager();
    this.presessionMode = false;
  }

  async initializePresession() {
    const cwd = process.cwd();
    await this.configManager.loadConfig(cwd);
    this.storageDir = this.configManager.getStoragePath(cwd, this.defaultStorageDir);
    this.backupDir = this.configManager.getBackupPath(cwd, this.defaultBackupDir);
    this.presessionMode = true;
    
    // Check if auto-restore is enabled
    if (this.configManager.config.restore_latest) {
      const result = await this.autoRestoreLatest();
      if (result.message.includes('Restored latest session')) {
        this.presessionMode = false; // Exit presession mode since we have active session
        return { message: `Auto-restored: ${result.message}. Session is now active - no need to call track_session.` };
      }
      return result;
    }
    
    return { message: 'Presession mode active. Use list_sessions, restore_latest, or track_session.' };
  }

  async initializeSession(agentName = 'amazon-q') {
    const cwd = process.cwd();
    const normalizedAgent = normalizeAgentName(agentName);
    
    // Load config and set storage paths
    await this.configManager.loadConfig(cwd);
    this.storageDir = this.configManager.getStoragePath(cwd, this.defaultStorageDir);
    this.backupDir = this.configManager.getBackupPath(cwd, this.defaultBackupDir);
    
    logger.info('Initializing session', { agent_name: agentName, cwd });
    logger.info('Storage initialized', { 
      mode: this.configManager.config.storage_mode,
      storage: this.storageDir
    });
    
    // Check for existing session (reuse within TTL)
    const existingSession = await this.findReusableSession(cwd, normalizedAgent);
    if (existingSession) {
      this.currentSession = existingSession;
      logger.info('Found existing session', { agent: normalizedAgent });
      return this.currentSession;
    }
    
    // Create new session
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const hash = createHash('md5').update(cwd + timestamp + normalizedAgent).digest('hex').slice(0, 8);
    const sessionId = `${timestamp}_${normalizedAgent}_${hash}`;
    
    const sessionDir = join(this.storageDir, sessionId);
    const backupSessionDir = join(this.backupDir, sessionId);
    
    await fs.mkdir(sessionDir, { recursive: true });
    await fs.mkdir(backupSessionDir, { recursive: true });

    this.currentSession = {
      id: sessionId,
      directory: cwd,
      agent_name: normalizedAgent,
      agent_display_name: agentName,
      created_at: new Date().toISOString(),
      storage_path: sessionDir,
      backup_path: backupSessionDir,
      context_resets: 0
    };

    await this.saveSessionMetadata();
    await this.initializeSessionFiles();
    logger.info('Session initialized', {});
    return this.currentSession;
  }

  async ensureBackupDir() {
    await fs.mkdir(this.currentSession.backup_path, { recursive: true });
  }

  async ensureStorageDir() {
    await fs.mkdir(this.currentSession.storage_path, { recursive: true });
  }

  async initializeSessionFiles() {
    const session = this.currentSession;
    await this.ensureStorageDir();
    await this.ensureBackupDir();
    
    // Initialize all required files with empty structures
    const files = {
      'history.json': { prompts: [], last_activity: session.created_at },
      'goals.json': { goals: [], requirements: [], constraints: [] },
      'success-criteria.json': { requirements_met: [], generated_at: session.created_at },
      'worklog.json': { actions: [], summary: {}, last_updated: session.created_at }
    };

    for (const [filename, content] of Object.entries(files)) {
      const filePath = join(session.storage_path, filename);
      const backupPath = join(session.backup_path, filename);
      const contentStr = JSON.stringify(content, null, 2);
      
      try {
        await fs.access(filePath);
      } catch (e) {
        // File doesn't exist, create it
        await fs.writeFile(filePath, contentStr);
        await fs.writeFile(backupPath, contentStr);
      }
    }
  }

  async findReusableSession(cwd, normalizedAgent) {
    try {
      const sessions = await fs.readdir(this.storageDir);
      const ttlHours = this.configManager.config.session_ttl_hours;
      const preferRecent = this.configManager.config.prefer_recent_session !== false; // Default true
      const now = Date.now();
      
      const matchingSessions = [];
      
      for (const sessionId of sessions) {
        const metadataPath = join(this.storageDir, sessionId, 'metadata.json');
        try {
          const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
          
          // Match directory and normalized agent name
          if (metadata.directory === cwd && metadata.agent_name === normalizedAgent) {
            // If TTL is null/undefined/0, no expiration (infinite TTL)
            if (!ttlHours) {
              matchingSessions.push(metadata);
              continue;
            }
            
            // Check TTL
            const createdAt = new Date(metadata.created_at).getTime();
            const ageHours = (now - createdAt) / (1000 * 60 * 60);
            
            if (ageHours < ttlHours) {
              matchingSessions.push(metadata);
            }
          }
        } catch (e) {
          continue;
        }
      }
      
      // If multiple sessions found, pick most recent
      if (matchingSessions.length > 0) {
        if (preferRecent && matchingSessions.length > 1) {
          matchingSessions.sort((a, b) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
          logger.info('Multiple sessions found, using most recent', { 
            count: matchingSessions.length,
            selected: matchingSessions[0].id 
          });
        }
        return matchingSessions[0];
      }
    } catch (e) {
      // Storage directory doesn't exist
    }
    
    return null;
  }

  async getCurrentSession(agentName = null) {
    if (this.currentSession) return this.currentSession;
    
    // In presession mode, don't auto-create sessions
    if (this.presessionMode) {
      throw new Error('No active session. Use track_session to create one or restore_latest to restore.');
    }
    
    // Auto-create session if not in presession mode
    const cwd = process.cwd();
    const normalizedAgent = agentName ? normalizeAgentName(agentName) : null;
    
    return await this.findReusableSession(cwd, normalizedAgent);
  }

  async handleContextOverflow(agentName) {
    // When Q context overflows and resets, continue with same session but increment reset counter
    const session = await this.getCurrentSession();
    if (session) {
      session.context_resets = (session.context_resets || 0) + 1;
      session.last_context_reset = new Date().toISOString();
      
      // Log the context reset event
      await this.logContextReset();
      await this.saveSessionMetadata();
      
      return session;
    }
    
    // If no session exists, create new one
    return await this.initializeSession(agentName);
  }

  async logContextReset() {
    const session = this.currentSession;
    const historyPath = join(session.storage_path, 'history.json');
    const backupHistoryPath = join(session.backup_path, 'history.json');
    
    await this.ensureBackupDir();
    
    let history = { prompts: [] };
    try {
      history = JSON.parse(await fs.readFile(historyPath, 'utf8'));
    } catch (e) {
      // File doesn't exist yet
    }

    const resetEntry = {
      timestamp: new Date().toISOString(),
      event: 'context_overflow_reset',
      reset_count: session.context_resets,
      note: 'Q CLI context was reset due to overflow, continuing same session'
    };

    history.prompts.push(resetEntry);
    history.last_activity = resetEntry.timestamp;

    const historyContent = JSON.stringify(history, null, 2);
    await fs.writeFile(historyPath, historyContent);
    await fs.writeFile(backupHistoryPath, historyContent);
  }

  async saveSessionMetadata() {
    const metadataPath = join(this.currentSession.storage_path, 'metadata.json');
    const backupMetadataPath = join(this.currentSession.backup_path, 'metadata.json');
    
    await this.ensureStorageDir();
    const metadataContent = JSON.stringify(this.currentSession, null, 2);
    await fs.writeFile(metadataPath, metadataContent);
    await this.ensureBackupDir();
    await fs.writeFile(backupMetadataPath, metadataContent);
  }

  async logPrompt(prompt, extractedContext) {
    return fileQueue.enqueue(async () => {
      logger.debug('Logging prompt', { prompt_length: prompt.length });
      const session = await this.getCurrentSession();
      const historyPath = join(session.storage_path, 'history.json');
      const backupHistoryPath = join(session.backup_path, 'history.json');
      
      await this.ensureStorageDir();
      await this.ensureBackupDir();
      
      let history = { prompts: [] };
      try {
        history = JSON.parse(await fs.readFile(historyPath, 'utf8'));
      } catch (e) {
        logger.debug('History file not found, creating new', { path: historyPath });
      }

      const promptEntry = {
        timestamp: new Date().toISOString(),
        prompt,
        extracted_context: extractedContext
      };

      history.prompts.push(promptEntry);
      history.last_activity = promptEntry.timestamp;

      const historyContent = JSON.stringify(history, null, 2);
      await fs.writeFile(historyPath, historyContent);
      await fs.writeFile(backupHistoryPath, historyContent);

      // Update goals and success criteria
      await this.updateGoalsAndCriteria(extractedContext);
      
      // Emit event for other components
      eventBus.emit('prompt:logged', { prompt, extractedContext });
    });
  }

  async updateGoalsAndCriteria(extractedContext) {
    const session = await this.getCurrentSession();
    const goalsPath = join(session.storage_path, 'goals.json');
    const criteriaPath = join(session.storage_path, 'success-criteria.json');
    
    await this.ensureStorageDir();
    await this.ensureBackupDir();
    
    let goals = { goals: [], requirements: [], constraints: [] };
    try {
      goals = JSON.parse(await fs.readFile(goalsPath, 'utf8'));
    } catch (e) {
      // File doesn't exist yet, use empty structure
    }

    // Only add new context if it contains meaningful data
    if (extractedContext.goals.length > 0 || extractedContext.requirements.length > 0 || extractedContext.constraints.length > 0) {
      // Merge new context
      goals.goals.push(...extractedContext.goals);
      goals.requirements.push(...extractedContext.requirements);
      goals.constraints.push(...extractedContext.constraints);

      // Remove duplicates
      goals.goals = [...new Set(goals.goals)];
      goals.requirements = [...new Set(goals.requirements)];
      goals.constraints = [...new Set(goals.constraints)];
    }

    // Always write files, even if empty
    const goalsContent = JSON.stringify(goals, null, 2);
    await fs.writeFile(goalsPath, goalsContent);
    await fs.writeFile(join(session.backup_path, 'goals.json'), goalsContent);

    // Generate success criteria (always create file)
    const criteria = this.generateSuccessCriteria(goals);
    const criteriaContent = JSON.stringify(criteria, null, 2);
    await fs.writeFile(criteriaPath, criteriaContent);
    await fs.writeFile(join(session.backup_path, 'success-criteria.json'), criteriaContent);
  }

  generateSuccessCriteria(goals) {
    return {
      requirements_met: [...goals.goals, ...goals.requirements].map(item => ({
        requirement: item,
        satisfied: false,
        satisfied_at: null,
        validation_notes: null
      })),
      generated_at: new Date().toISOString()
    };
  }

  async getSessionHistory() {
    const session = await this.getCurrentSession();
    const historyPath = join(session.storage_path, 'history.json');
    
    try {
      return JSON.parse(await fs.readFile(historyPath, 'utf8'));
    } catch (e) {
      return { prompts: [], last_activity: session.created_at };
    }
  }

  async updateSuccessCriteria() {
    const session = await this.getCurrentSession();
    const criteriaPath = join(session.storage_path, 'success-criteria.json');
    const worklogPath = join(session.storage_path, 'worklog.json');
    
    await this.ensureBackupDir();
    
    try {
      const criteria = JSON.parse(await fs.readFile(criteriaPath, 'utf8'));
      const worklog = JSON.parse(await fs.readFile(worklogPath, 'utf8'));
      
      let updated = false;
      
      // Update requirements_met only
      for (const requirement of criteria.requirements_met || []) {
        if (!requirement.satisfied) {
          const isSatisfied = this.checkRequirementSatisfaction(requirement.requirement, worklog.actions);
          if (isSatisfied) {
            requirement.satisfied = true;
            requirement.satisfied_at = new Date().toISOString();
            requirement.validation_notes = `Auto-satisfied based on worklog analysis`;
            updated = true;
          }
        }
      }
      
      if (updated) {
        const criteriaContent = JSON.stringify(criteria, null, 2);
        await fs.writeFile(criteriaPath, criteriaContent);
        await fs.writeFile(join(session.backup_path, 'success-criteria.json'), criteriaContent);
      }
      
    } catch (e) {
      // Silently handle errors
    }
  }

  checkCriterionCompletion(description, actions) {
    const desc = description.toLowerCase();
    
    // Check for file/directory operations mentioned in the criterion
    const fileMatches = desc.match(/\/[\w\-\/\.]+/g) || [];
    for (const filePath of fileMatches) {
      const hasFileAction = actions.some(action => 
        action.files_changed?.some(file => file.includes(filePath.replace(/^\//, ''))) ||
        action.action.toLowerCase().includes(filePath)
      );
      if (hasFileAction) return true;
    }
    
    // Check for action keywords
    const actionKeywords = ['create', 'move', 'modify', 'delete', 'update', 'implement', 'add'];
    for (const keyword of actionKeywords) {
      if (desc.includes(keyword)) {
        const hasMatchingAction = actions.some(action => 
          action.action.toLowerCase().includes(keyword) && action.status === 'success'
        );
        if (hasMatchingAction) return true;
      }
    }
    
    return false;
  }

  checkRequirementSatisfaction(requirement, actions) {
    const req = requirement.toLowerCase();
    
    // Simple keyword matching for requirements
    const keywords = req.split(' ').filter(word => word.length > 3);
    const matchingActions = actions.filter(action => 
      keywords.some(keyword => action.action.toLowerCase().includes(keyword)) &&
      action.status === 'success'
    );
    
    return matchingActions.length >= 1; // Single matching action is sufficient
  }

  async checkProgress() {
    const session = await this.getCurrentSession();
    const criteriaPath = join(session.storage_path, 'success-criteria.json');
    
    try {
      const criteria = JSON.parse(await fs.readFile(criteriaPath, 'utf8'));
      const completed = criteria.criteria.filter(c => c.completed);
      const remaining = criteria.criteria.filter(c => !c.completed);
      
      return {
        completed: completed.map(c => c.description),
        remaining: remaining.map(c => c.description),
        completion_percentage: Math.round((completed.length / criteria.criteria.length) * 100) || 0
      };
    } catch (e) {
      return { completed: [], remaining: [], completion_percentage: 0 };
    }
  }

  async getRecentContext(promptCount = 5, actionCount = 10) {
    const session = await this.getCurrentSession();
    const historyPath = join(session.storage_path, 'history.json');
    const worklogPath = join(session.storage_path, 'worklog.json');
    
    let recentPrompts = [];
    let recentActions = [];
    let contextSummary = 'No recent activity';
    
    try {
      // Get recent prompts (bottom-to-top)
      const history = JSON.parse(await fs.readFile(historyPath, 'utf8'));
      if (history.prompts && history.prompts.length > 0) {
        recentPrompts = history.prompts.slice(-promptCount).reverse();
        contextSummary = recentPrompts[0]?.prompt?.substring(0, 100) + '...' || contextSummary;
      }
    } catch (e) {
      // File doesn't exist or is empty
    }
    
    try {
      // Get recent actions (bottom-to-top)
      const worklog = JSON.parse(await fs.readFile(worklogPath, 'utf8'));
      if (worklog.actions && worklog.actions.length > 0) {
        recentActions = worklog.actions.slice(-actionCount).reverse();
      }
    } catch (e) {
      // File doesn't exist or is empty
    }
    
    return {
      session_id: session.id,
      recent_prompts: recentPrompts.map(p => ({
        timestamp: p.timestamp,
        prompt: p.prompt,
        goals_extracted: p.extracted_context?.goals?.length || 0
      })),
      recent_actions: recentActions.map(a => ({
        timestamp: a.timestamp,
        action: a.action,
        files_changed: a.files_changed || [],
        status: a.status
      })),
      context_summary: contextSummary,
      total_prompts: recentPrompts.length,
      total_actions: recentActions.length,
      last_activity: recentActions[0]?.timestamp || recentPrompts[0]?.timestamp || session.created_at
    };
  }

  async markCriteriaComplete(criteriaIndex, notes) {
    const session = await this.getCurrentSession();
    const criteriaPath = join(session.storage_path, 'success-criteria.json');
    
    await this.ensureBackupDir();
    
    try {
      const criteria = JSON.parse(await fs.readFile(criteriaPath, 'utf8'));
      
      if (criteriaIndex < 0 || criteriaIndex >= criteria.criteria.length) {
        return `Invalid criteria index. Available indices: 0-${criteria.criteria.length - 1}`;
      }
      
      criteria.criteria[criteriaIndex].completed = true;
      criteria.criteria[criteriaIndex].completion_notes = notes || 'Manually marked complete';
      
      const criteriaContent = JSON.stringify(criteria, null, 2);
      await fs.writeFile(criteriaPath, criteriaContent);
      await fs.writeFile(join(session.backup_path, 'success-criteria.json'), criteriaContent);
      
      return `Marked criteria ${criteriaIndex} as complete: "${criteria.criteria[criteriaIndex].description}"`;
    } catch (e) {
      return `Error updating criteria: ${e.message}`;
    }
  }

  async clearHistory() {
    if (!this.configManager.canDelete()) {
      logger.warn('Delete blocked in project mode');
      throw new Error('Cannot delete history in project storage mode');
    }
    
    const session = await this.getCurrentSession();
    if (!session) return;

    try {
      await fs.rm(session.storage_path, { recursive: true, force: true });
      await fs.rm(session.backup_path, { recursive: true, force: true });
      logger.info('History cleared', { session_id: session.id });
    } catch (e) {
      logger.warn('Error clearing history', { error: e.message });
    }
    
    this.currentSession = null;
  }

  async closeSession() {
    if (!this.currentSession) {
      return { message: 'No active session to close' };
    }
    
    const sessionId = this.currentSession.id;
    logger.info('Closing session', { session_id: sessionId });
    
    // Save final state
    await this.saveSessionMetadata();
    
    // Clear current session
    this.currentSession = null;
    
    return { 
      message: `Session ${sessionId} closed gracefully.\nUse list_sessions to view available sessions.`
    };
  }

  async switchSession(sessionId) {
    // Close current session if exists
    if (this.currentSession) {
      await this.closeSession();
    }
    
    // Load the target session
    const storagePath = join(this.storageDir, sessionId);
    try {
      await fs.access(storagePath);
    } catch (e) {
      return { message: `Session ${sessionId} not found. Use restore_backup to restore from backup first.` };
    }
    
    // Load session metadata
    const metadataPath = join(storagePath, 'metadata.json');
    try {
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
      
      this.currentSession = {
        ...metadata,
        storage_path: storagePath,
        backup_path: join(this.backupDir, sessionId)
      };
      
      logger.info('Switched to session', { session_id: sessionId });
      return { 
        message: `Switched to session ${sessionId}\nAgent: ${metadata.agent_display_name}\nDirectory: ${metadata.directory}`
      };
    } catch (e) {
      return { message: `Failed to load session metadata: ${e.message}` };
    }
  }

  async autoRestoreLatest() {
    const cwd = process.cwd();
    await this.configManager.loadConfig(cwd);
    this.storageDir = this.configManager.getStoragePath(cwd, this.defaultStorageDir);
    this.backupDir = this.configManager.getBackupPath(cwd, this.defaultBackupDir);
    
    // Find most recent session
    const sessions = await this.listAllSessions();
    const sessionLines = sessions.message.split('\n').filter(line => line.startsWith('- '));
    
    if (sessionLines.length === 0) {
      return { message: 'No sessions found. Use track_session to create a new one.' };
    }
    
    // Extract first session ID (most recent)
    const firstSession = sessionLines[0];
    const sessionId = firstSession.split(' ')[1];
    
    // Try to switch to it
    const result = await this.switchSession(sessionId);
    if (result.message.includes('not found')) {
      // Try restore from backup
      const restoreResult = await this.restoreFromBackup(sessionId);
      if (restoreResult.message.includes('Successfully restored')) {
        return await this.switchSession(sessionId);
      }
      return restoreResult;
    }
    
    return { message: `Restored latest session: ${sessionId}` };
  }

  async restoreFromBackup(sessionId, options = {}) {
    try {
      // List available sessions if no session ID provided
      if (!sessionId) {
        return await this.listAllSessions();
      }

      // First check if session already exists in storage (no restore needed)
      const storagePath = join(this.storageDir, sessionId);
      try {
        await fs.access(storagePath);
        return { 
          message: `Session ${sessionId} already exists in active storage.\n\n` +
                   `Use track_session to resume this session, no restore needed.`
        };
      } catch (e) {
        // Session not in storage, proceed with restore from backup
      }

      const backupPath = join(this.backupDir, sessionId);

      // Check if backup exists
      try {
        await fs.access(backupPath);
      } catch (e) {
        logger.error('Session not found', { session_id: sessionId });
        return { message: `Session ${sessionId} not found in backup or active storage.` };
      }

      // Copy backup to main storage
      await fs.mkdir(storagePath, { recursive: true });
      const files = await fs.readdir(backupPath);
      
      for (const file of files) {
        const srcPath = join(backupPath, file);
        const destPath = join(storagePath, file);
        await fs.copyFile(srcPath, destPath);
      }

      logger.info('Session restored', { session_id: sessionId, files: files.length });
      const summary = await this.getSessionSummary(storagePath);
      return { 
        message: `Successfully restored session: ${summary}\nFiles restored: ${files.join(', ')}`
      };

    } catch (error) {
      logger.error('Restore failed', { session_id: sessionId, error: error.message });
      return { message: `Error restoring backup: ${error.message}` };
    }
  }

  async listAllSessions() {
    // Always load config and set storage paths for current directory
    const cwd = process.cwd();
    await this.configManager.loadConfig(cwd);
    const storageDir = this.configManager.getStoragePath(cwd, this.defaultStorageDir);
    const backupDir = this.configManager.getBackupPath(cwd, this.defaultBackupDir);
    
    const sessions = { active: [], backup: [] };
    
    // List active sessions
    try {
      const activeSessions = await fs.readdir(storageDir);
      for (const id of activeSessions) {
        const sessionPath = join(storageDir, id);
        const summary = await this.getSessionSummary(sessionPath);
        sessions.active.push({ id, summary, path: sessionPath });
      }
    } catch (e) {
      // No active sessions
    }
    
    // List backup sessions (only those not in active)
    try {
      const backupSessions = await fs.readdir(backupDir);
      for (const id of backupSessions) {
        if (!sessions.active.find(s => s.id === id)) {
          const backupPath = join(backupDir, id);
          const summary = await this.getSessionSummary(backupPath);
          sessions.backup.push({ id, summary, path: backupPath });
        }
      }
    } catch (e) {
      // No backup sessions
    }
    
    let message = '';
    
    if (sessions.active.length > 0) {
      message += '**Active Sessions:**\n';
      for (const s of sessions.active) {
        message += `- ${s.id}\n  ${s.summary}\n`;
      }
      message += '\n';
    }
    
    if (sessions.backup.length > 0) {
      message += '**Backup Sessions (deleted from active):**\n';
      for (const s of sessions.backup) {
        message += `- ${s.id}\n  ${s.summary}\n`;
      }
      message += '\n';
    }
    
    if (sessions.active.length === 0 && sessions.backup.length === 0) {
      message = 'No sessions found.';
    } else {
      message += '\nUse `track_session` to resume an active session.\n';
      message += 'Use `restore_backup --session_id <id>` to restore a backup session.';
    }
    
    return { message };
  }

  async getSessionSummary(sessionPath) {
    try {
      const historyPath = join(sessionPath, 'history.json');
      const goalsPath = join(sessionPath, 'goals.json');
      
      let summary = 'No description available';
      
      // Try to get first prompt as summary
      try {
        const history = JSON.parse(await fs.readFile(historyPath, 'utf8'));
        if (history.prompts && history.prompts.length > 0) {
          const firstPrompt = history.prompts[0].prompt;
          summary = firstPrompt.length > 80 ? firstPrompt.substring(0, 77) + '...' : firstPrompt;
        }
      } catch (e) {
        // Try goals as fallback
        try {
          const goals = JSON.parse(await fs.readFile(goalsPath, 'utf8'));
          if (goals.goals && goals.goals.length > 0) {
            summary = goals.goals[0].length > 80 ? goals.goals[0].substring(0, 77) + '...' : goals.goals[0];
          }
        } catch (e2) {
          // Keep default summary
        }
      }
      
      return summary;
    } catch (error) {
      return 'Session summary unavailable';
    }
  }
}
