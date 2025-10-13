import { promises as fs } from 'fs';
import { join } from 'path';

export class WorklogTracker {
  constructor() {
    this.sessionManager = null; // Will be injected
    this.isLogging = false; // Prevent recursive logging
  }

  setSessionManager(sessionManager) {
    this.sessionManager = sessionManager;
  }

  async logAction(actionData) {
    // Prevent recursive logging
    if (this.isLogging) return;
    this.isLogging = true;

    try {
      const session = await this.getSession();
      const worklogPath = join(session.storage_path, 'worklog.json');
      const backupWorklogPath = join(session.backup_path, 'worklog.json');
      
      let worklog = { actions: [], summary: {} };
      try {
        worklog = JSON.parse(await fs.readFile(worklogPath, 'utf8'));
      } catch (e) {
        // File doesn't exist yet
      }

      const actionEntry = {
        id: worklog.actions.length + 1,
        timestamp: actionData.timestamp,
        action: actionData.action,
        files_changed: actionData.files_changed || [],
        status: actionData.status || 'success',
        duration: null // Could be calculated if start/end times provided
      };

      worklog.actions.push(actionEntry);
      worklog.last_updated = actionData.timestamp;
      worklog.summary = this.generateSummary(worklog.actions);

      await fs.writeFile(worklogPath, JSON.stringify(worklog, null, 2));
      await fs.writeFile(backupWorklogPath, JSON.stringify(worklog, null, 2));

      // Update session history
      await this.updateSessionHistory(actionEntry);
    } finally {
      this.isLogging = false;
    }
  }

  async updateSessionHistory(actionEntry) {
    // Skip if already updating to prevent recursion
    if (this.sessionManager && this.sessionManager.isUpdating) return;

    const session = await this.getSession();
    const historyPath = join(session.storage_path, 'history.json');
    const backupHistoryPath = join(session.backup_path, 'history.json');
    
    let history = { prompts: [], actions: [] };
    try {
      history = JSON.parse(await fs.readFile(historyPath, 'utf8'));
    } catch (e) {
      // File doesn't exist yet
    }

    history.actions.push(actionEntry);
    history.last_activity = actionEntry.timestamp;

    await fs.writeFile(historyPath, JSON.stringify(history, null, 2));
    await fs.writeFile(backupHistoryPath, JSON.stringify(history, null, 2));
  }

  generateSummary(actions) {
    const total = actions.length;
    const successful = actions.filter(a => a.status === 'success').length;
    const failed = actions.filter(a => a.status === 'failed').length;
    const partial = actions.filter(a => a.status === 'partial').length;
    
    const filesModified = [...new Set(
      actions.flatMap(a => a.files_changed || [])
    )];

    return {
      total_actions: total,
      successful_actions: successful,
      failed_actions: failed,
      partial_actions: partial,
      success_rate: total > 0 ? Math.round((successful / total) * 100) : 0,
      unique_files_modified: filesModified.length,
      files_modified: filesModified
    };
  }

  async getWorklog() {
    const session = await this.getSession();
    const worklogPath = join(session.storage_path, 'worklog.json');
    
    try {
      return JSON.parse(await fs.readFile(worklogPath, 'utf8'));
    } catch (e) {
      return { actions: [], summary: {} };
    }
  }

  async getSession() {
    if (!this.sessionManager) {
      const { SessionManager } = await import('./session-manager.js');
      this.sessionManager = new SessionManager();
    }
    
    const session = await this.sessionManager.getCurrentSession();
    if (!session) {
      throw new Error('No active session found');
    }
    
    return session;
  }

  async generateProgressReport() {
    const worklog = await this.getWorklog();
    const session = await this.getSession();
    
    // Get recent actions (last 5)
    const recentActions = worklog.actions.slice(-5);
    
    return {
      session_id: session.id,
      current_status: this.determineCurrentStatus(worklog.actions),
      recent_actions: recentActions.map(a => ({
        action: a.action,
        status: a.status,
        files: a.files_changed?.length || 0
      })),
      summary: worklog.summary,
      last_activity: worklog.last_updated
    };
  }

  determineCurrentStatus(actions) {
    if (actions.length === 0) return 'idle';
    
    const lastAction = actions[actions.length - 1];
    const recentActions = actions.slice(-3);
    
    const recentFailures = recentActions.filter(a => a.status === 'failed').length;
    
    if (recentFailures >= 2) return 'struggling';
    if (lastAction.status === 'failed') return 'error';
    if (lastAction.status === 'partial') return 'in-progress';
    
    return 'active';
  }
}
