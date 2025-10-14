import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class SessionManager {
  constructor() {
    this.storageDir = join(__dirname, '../storage/sessions');
    this.backupDir = '/tmp/amazon-q-history';
    this.currentSession = null;
    this.isUpdating = false; // Prevent recursive updates
  }

  async initializeSession(agentName = 'amazon-q') {
    const cwd = process.cwd();
    
    // Check for existing session in current directory first
    const existingSession = await this.getCurrentSession();
    if (existingSession && existingSession.agent_name === agentName) {
      this.currentSession = existingSession;
      return this.currentSession;
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const hash = createHash('md5').update(cwd + timestamp + agentName).digest('hex').slice(0, 8);
    const sessionId = `${timestamp}_${agentName}_${hash}`;
    
    const sessionDir = join(this.storageDir, sessionId);
    const backupSessionDir = join(this.backupDir, sessionId);
    
    await fs.mkdir(sessionDir, { recursive: true });
    await fs.mkdir(backupSessionDir, { recursive: true });

    this.currentSession = {
      id: sessionId,
      directory: cwd,
      agent_name: agentName,
      created_at: new Date().toISOString(),
      storage_path: sessionDir,
      backup_path: backupSessionDir,
      context_resets: 0 // Track context overflow resets
    };

    await this.saveSessionMetadata();
    await this.initializeSessionFiles();
    return this.currentSession;
  }

  async initializeSessionFiles() {
    const session = this.currentSession;
    
    // Initialize all required files with empty structures
    const files = {
      'history.json': { prompts: [], actions: [], last_activity: session.created_at },
      'goals.json': { goals: [], requirements: [], constraints: [] },
      'success-criteria.json': { criteria: [], requirements_met: [], generated_at: session.created_at },
      'worklog.json': { actions: [], summary: {}, last_updated: session.created_at }
    };

    for (const [filename, content] of Object.entries(files)) {
      const filePath = join(session.storage_path, filename);
      const backupPath = join(session.backup_path, filename);
      
      try {
        await fs.access(filePath);
      } catch (e) {
        // File doesn't exist, create it
        await fs.writeFile(filePath, JSON.stringify(content, null, 2));
        await fs.writeFile(backupPath, JSON.stringify(content, null, 2));
      }
    }
  }

  async getCurrentSession() {
    if (this.currentSession) return this.currentSession;
    
    // Try to find existing session for current directory and agent
    const cwd = process.cwd();
    try {
      const sessions = await fs.readdir(this.storageDir);
      
      // Sort sessions by creation time (newest first)
      const sessionData = [];
      for (const sessionId of sessions) {
        const metadataPath = join(this.storageDir, sessionId, 'metadata.json');
        try {
          const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
          if (metadata.directory === cwd) {
            sessionData.push({ id: sessionId, metadata });
          }
        } catch (e) {
          continue;
        }
      }
      
      if (sessionData.length > 0) {
        // Return the most recent session for this directory
        sessionData.sort((a, b) => new Date(b.metadata.created_at) - new Date(a.metadata.created_at));
        this.currentSession = sessionData[0].metadata;
        return this.currentSession;
      }
    } catch (e) {
      // Storage directory doesn't exist yet
    }
    
    return null;
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
    
    let history = { prompts: [], actions: [] };
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

    history.actions.push(resetEntry);
    history.last_activity = resetEntry.timestamp;

    await fs.writeFile(historyPath, JSON.stringify(history, null, 2));
    await fs.writeFile(backupHistoryPath, JSON.stringify(history, null, 2));
  }

  async saveSessionMetadata() {
    const metadataPath = join(this.currentSession.storage_path, 'metadata.json');
    const backupMetadataPath = join(this.currentSession.backup_path, 'metadata.json');
    
    await fs.writeFile(metadataPath, JSON.stringify(this.currentSession, null, 2));
    await fs.writeFile(backupMetadataPath, JSON.stringify(this.currentSession, null, 2));
  }

  async logPrompt(prompt, extractedContext) {
    if (this.isUpdating) return;
    this.isUpdating = true;

    try {
      const session = await this.getCurrentSession();
      const historyPath = join(session.storage_path, 'history.json');
      const backupHistoryPath = join(session.backup_path, 'history.json');
      
      let history = { prompts: [], actions: [] };
      try {
        history = JSON.parse(await fs.readFile(historyPath, 'utf8'));
      } catch (e) {
        // File doesn't exist yet
      }

      const promptEntry = {
        timestamp: new Date().toISOString(),
        prompt,
        extracted_context: extractedContext
      };

      history.prompts.push(promptEntry);
      history.last_activity = promptEntry.timestamp;

      await fs.writeFile(historyPath, JSON.stringify(history, null, 2));
      await fs.writeFile(backupHistoryPath, JSON.stringify(history, null, 2));

      // Update goals and success criteria
      await this.updateGoalsAndCriteria(extractedContext);
    } finally {
      this.isUpdating = false;
    }
  }

  async updateGoalsAndCriteria(extractedContext) {
    const session = await this.getCurrentSession();
    const goalsPath = join(session.storage_path, 'goals.json');
    const criteriaPath = join(session.storage_path, 'success-criteria.json');
    
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
    await fs.writeFile(goalsPath, JSON.stringify(goals, null, 2));
    await fs.writeFile(join(session.backup_path, 'goals.json'), JSON.stringify(goals, null, 2));

    // Generate success criteria (always create file)
    const criteria = this.generateSuccessCriteria(goals);
    await fs.writeFile(criteriaPath, JSON.stringify(criteria, null, 2));
    await fs.writeFile(join(session.backup_path, 'success-criteria.json'), JSON.stringify(criteria, null, 2));
  }

  generateSuccessCriteria(goals) {
    return {
      criteria: goals.goals.map(goal => ({
        description: goal,
        completed: false,
        completion_notes: null
      })),
      requirements_met: goals.requirements.map(req => ({
        requirement: req,
        satisfied: false,
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
      return { prompts: [], actions: [], last_activity: session.created_at };
    }
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

  async clearHistory() {
    const session = await this.getCurrentSession();
    if (!session) return;

    try {
      await fs.rm(session.storage_path, { recursive: true, force: true });
      await fs.rm(session.backup_path, { recursive: true, force: true });
    } catch (e) {
      // Ignore errors if directories don't exist
    }
    
    this.currentSession = null;
  }

  async restoreFromBackup(sessionId) {
    const backupDir = this.backupDir;
    
    try {
      // List available backups if no session ID provided
      if (!sessionId) {
        const backups = await fs.readdir(backupDir);
        if (backups.length === 0) {
          return { message: 'No backup sessions found in /tmp/amazon-q-history/' };
        }

        // Get summaries for each backup
        const summaries = [];
        for (const id of backups) {
          const summary = await this.getSessionSummary(join(backupDir, id));
          summaries.push(`- ${id}: ${summary}`);
        }
        
        return { 
          message: `Available backup sessions:\n${summaries.join('\n')}\n\nUse restore_backup with session_id parameter to restore.`
        };
      }

      const backupPath = join(backupDir, sessionId);
      const restorePath = join(this.storageDir, sessionId);

      // Check if backup exists
      try {
        await fs.access(backupPath);
      } catch (e) {
        return { message: `Backup session ${sessionId} not found in /tmp/amazon-q-history/` };
      }

      // Copy backup to main storage
      await fs.mkdir(restorePath, { recursive: true });
      const files = await fs.readdir(backupPath);
      
      for (const file of files) {
        const srcPath = join(backupPath, file);
        const destPath = join(restorePath, file);
        await fs.copyFile(srcPath, destPath);
      }

      const summary = await this.getSessionSummary(restorePath);
      return { 
        message: `Successfully restored session: ${summary}\nFiles restored: ${files.join(', ')}`
      };

    } catch (error) {
      return { message: `Error restoring backup: ${error.message}` };
    }
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
