#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { SessionManager } from './src/session-manager.js';
import { ContextExtractor } from './src/context-extractor.js';
import { WorklogTracker } from './src/worklog-tracker.js';
import { watch } from 'fs';
import { promises as fs } from 'fs';

class AmazonQHistoryServer {
  constructor() {
    this.server = new Server(
      {
        name: 'amazon-q-history',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.sessionManager = new SessionManager();
    this.contextExtractor = new ContextExtractor();
    this.worklogTracker = new WorklogTracker();
    this.worklogTracker.setSessionManager(this.sessionManager);
    this.fileWatcher = null;
    this.autoTrackingEnabled = false;
    this.watchedFiles = new Set();
    this.activeOperations = new Map();
    this.debounceTimers = new Map();
    
    // Memory leak protection
    this.MAX_TIMERS = 1000;
    this.MAX_OPERATIONS = 100;
    this.OPERATION_TIMEOUT = 300000; // 5 minutes

    this.setupToolHandlers();
    
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'track_session',
          description: 'Initialize or resume session tracking for current directory',
          inputSchema: {
            type: 'object',
            properties: {
              agent_name: { type: 'string', description: 'Name of the Q agent being used' }
            }
          }
        },
        {
          name: 'log_prompt',
          description: 'Log user prompt and extract goals/requirements',
          inputSchema: {
            type: 'object',
            properties: {
              prompt: { type: 'string', description: 'User prompt to log' }
            },
            required: ['prompt']
          }
        },
        {
          name: 'log_action',
          description: 'Log Q agent action and progress',
          inputSchema: {
            type: 'object',
            properties: {
              action: { type: 'string', description: 'Description of action performed' },
              files_changed: { type: 'array', items: { type: 'string' }, description: 'List of files modified' },
              status: { type: 'string', enum: ['success', 'partial', 'failed'], description: 'Action status' }
            },
            required: ['action']
          }
        },
        {
          name: 'get_session_history',
          description: 'Retrieve session history and current context',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'check_progress',
          description: 'Check progress against success criteria',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'clear_session_history',
          description: 'Clear session history with confirmation',
          inputSchema: {
            type: 'object',
            properties: {
              confirm: { type: 'boolean', description: 'Confirmation to clear history' }
            },
            required: ['confirm']
          }
        },
        {
          name: 'restore_backup',
          description: 'Restore session data from /tmp backup',
          inputSchema: {
            type: 'object',
            properties: {
              session_id: { type: 'string', description: 'Session ID to restore (optional - will list available if not provided)' }
            }
          }
        },
        {
          name: 'auto_track_operations',
          description: 'Enable/disable automatic tracking of Q operations and file changes',
          inputSchema: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean', description: 'Enable or disable auto-tracking' },
              watch_directory: { type: 'string', description: 'Directory to monitor for changes (defaults to current)' }
            },
            required: ['enabled']
          }
        },
        {
          name: 'process_hook',
          description: 'Process Q CLI hook events (preToolUse, postToolUse, stop)',
          inputSchema: {
            type: 'object',
            properties: {
              hook_event_name: { type: 'string', enum: ['preToolUse', 'postToolUse', 'stop'], description: 'Hook event type' },
              cwd: { type: 'string', description: 'Current working directory' },
              tool_name: { type: 'string', description: 'Name of tool being used' },
              tool_input: { type: 'object', description: 'Tool input parameters' },
              tool_response: { type: 'object', description: 'Tool response (for postToolUse)' }
            },
            required: ['hook_event_name']
          }
        },
        {
          name: 'mark_criteria_complete',
          description: 'Manually mark success criteria as complete',
          inputSchema: {
            type: 'object',
            properties: {
              criteria_index: { type: 'number', description: 'Index of criteria to mark complete (0-based)' },
              completion_notes: { type: 'string', description: 'Notes about completion' }
            },
            required: ['criteria_index']
          }
        },
        {
          name: 'get_recent_context',
          description: 'Get recent prompts and actions for context (avoids overflow with large sessions)',
          inputSchema: {
            type: 'object',
            properties: {
              prompt_count: { type: 'number', description: 'Number of recent prompts to retrieve (default: 5)', default: 5 },
              action_count: { type: 'number', description: 'Number of recent actions to retrieve (default: 10)', default: 10 }
            }
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      try {
        switch (name) {
          case 'track_session':
            return await this.handleTrackSession(args);
          case 'log_prompt':
            return await this.handleLogPrompt(args);
          case 'log_action':
            return await this.handleLogAction(args);
          case 'get_session_history':
            return await this.handleGetHistory();
          case 'check_progress':
            return await this.handleCheckProgress();
          case 'clear_session_history':
            return await this.handleClearHistory(args);
          case 'restore_backup':
            return await this.handleRestoreBackup(args);
          case 'auto_track_operations':
            return await this.handleAutoTrackOperations(args);
          case 'process_hook':
            return await this.handleProcessHook(args);
          case 'mark_criteria_complete':
            return await this.handleMarkCriteriaComplete(args);
          case 'get_recent_context':
            return await this.handleGetRecentContext(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true
        };
      }
    });
  }

  async handleTrackSession(args) {
    const session = await this.sessionManager.initializeSession(args.agent_name);
    return {
      content: [{
        type: 'text',
        text: `Session tracking initialized: ${session.id}\nDirectory: ${session.directory}\nAgent: ${session.agent_name}`
      }]
    };
  }

  async handleLogPrompt(args) {
    const session = await this.sessionManager.getCurrentSession();
    if (!session) {
      throw new Error('No active session. Run track_session first.');
    }

    const extractedContext = this.contextExtractor.extractGoalsAndRequirements(args.prompt);
    await this.sessionManager.logPrompt(args.prompt, extractedContext);
    
    return {
      content: [{
        type: 'text',
        text: `Prompt logged. Extracted ${extractedContext.goals.length} goals and ${extractedContext.requirements.length} requirements.`
      }]
    };
  }

  async handleLogAction(args) {
    const session = await this.sessionManager.getCurrentSession();
    if (!session) {
      throw new Error('No active session. Run track_session first.');
    }

    await this.worklogTracker.logAction({
      action: args.action,
      files_changed: args.files_changed || [],
      status: args.status || 'success',
      timestamp: new Date().toISOString()
    });

    return {
      content: [{
        type: 'text',
        text: `Action logged: ${args.action} (${args.status || 'success'})`
      }]
    };
  }

  async handleGetHistory() {
    const session = await this.sessionManager.getCurrentSession();
    if (!session) {
      throw new Error('No active session found.');
    }

    const history = await this.sessionManager.getSessionHistory();
    const worklog = await this.worklogTracker.getWorklog();
    const summary = await this.sessionManager.getSessionSummary(session.storage_path);
    
    return {
      content: [{
        type: 'text',
        text: `Session: ${session.id}\nSummary: ${summary}\nPrompts: ${history.prompts.length}\nActions: ${worklog.actions.length}\nLast activity: ${worklog.last_updated || history.last_activity}`
      }]
    };
  }

  async handleCheckProgress() {
    const session = await this.sessionManager.getCurrentSession();
    if (!session) {
      throw new Error('No active session found.');
    }

    const progress = await this.sessionManager.checkProgress();
    return {
      content: [{
        type: 'text',
        text: `Progress Check:\nCompleted: ${progress.completed.length}\nRemaining: ${progress.remaining.length}\nOverall: ${progress.completion_percentage}%`
      }]
    };
  }

  async handleClearHistory(args) {
    if (!args.confirm) {
      return {
        content: [{
          type: 'text',
          text: 'Warning: This will clear all session history. Use confirm: true to proceed.'
        }]
      };
    }

    await this.sessionManager.clearHistory();
    return {
      content: [{
        type: 'text',
        text: 'Session history cleared successfully.'
      }]
    };
  }

  async handleRestoreBackup(args) {
    const result = await this.sessionManager.restoreFromBackup(args.session_id);
    return {
      content: [{
        type: 'text',
        text: result.message
      }]
    };
  }

  async handleAutoTrackOperations(args) {
    const session = await this.sessionManager.getCurrentSession();
    if (!session) {
      throw new Error('No active session. Run track_session first.');
    }

    if (args.enabled) {
      const watchDir = args.watch_directory || process.cwd();
      await this.startAutoTracking(watchDir);
      return {
        content: [{
          type: 'text',
          text: `Auto-tracking enabled for directory: ${watchDir}\nMonitoring file changes and Q operations...`
        }]
      };
    } else {
      await this.stopAutoTracking();
      return {
        content: [{
          type: 'text',
          text: 'Auto-tracking disabled.'
        }]
      };
    }
  }

  async startAutoTracking(directory) {
    if (this.fileWatcher) {
      this.fileWatcher.close();
    }

    this.autoTrackingEnabled = true;
    this.watchedFiles.clear();

    // Get initial file list
    try {
      const files = await fs.readdir(directory, { recursive: true });
      for (const file of files) {
        try {
          const stat = await fs.stat(`${directory}/${file}`);
          if (stat.isFile()) {
            this.watchedFiles.add(file);
          }
        } catch (e) {
          // Skip files we can't access
        }
      }
    } catch (e) {
      // Directory might not exist or be accessible
    }

    // Watch for changes
    this.fileWatcher = watch(directory, { recursive: true }, async (eventType, filename) => {
      if (!this.autoTrackingEnabled || !filename) return;

      // Skip session files to avoid recursive loops
      if (filename.includes('storage/sessions/') || 
          filename.includes('.git/') || 
          filename.includes('node_modules/') ||
          filename.includes('/tmp/amazon-q-history/') ||
          filename.endsWith('worklog.json') ||
          filename.endsWith('history.json') ||
          filename.endsWith('goals.json') ||
          filename.endsWith('success-criteria.json') ||
          filename.endsWith('metadata.json')) {
        return;
      }

      // Debounce file changes to prevent rapid-fire logging
      const debounceKey = filename;
      if (this.debounceTimers.has(debounceKey)) {
        clearTimeout(this.debounceTimers.get(debounceKey));
      }

      const debounceTimer = setTimeout(async () => {
        this.debounceTimers.delete(debounceKey);

        try {
          const isNewFile = !this.watchedFiles.has(filename);
          const filePath = `${directory}/${filename}`;
          
          // Check if file exists (might be deleted)
          let fileExists = false;
          try {
            await fs.access(filePath);
            fileExists = true;
            this.watchedFiles.add(filename);
          } catch (e) {
            this.watchedFiles.delete(filename);
          }

          // Log the operation
          let action = '';
          if (isNewFile && fileExists) {
            action = `Created file: ${filename}`;
          } else if (!fileExists) {
            action = `Deleted file: ${filename}`;
          } else {
            action = `Modified file: ${filename}`;
          }

          await this.worklogTracker.logAction({
            action,
            files_changed: [filename],
            status: 'success',
            timestamp: new Date().toISOString()
          });

        } catch (error) {
          // Silently handle errors to avoid disrupting Q operations
        }
      }, 500); // 500ms debounce

      this.addDebounceTimer(debounceKey, debounceTimer);
    });
  }

  async stopAutoTracking() {
    this.autoTrackingEnabled = false;
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }
    this.watchedFiles.clear();
    
    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  addDebounceTimer(key, timer) {
    // Cleanup old timers if limit reached
    if (this.debounceTimers.size >= this.MAX_TIMERS) {
      const oldestKey = this.debounceTimers.keys().next().value;
      clearTimeout(this.debounceTimers.get(oldestKey));
      this.debounceTimers.delete(oldestKey);
    }
    this.debounceTimers.set(key, timer);
  }

  addActiveOperation(id, operation) {
    // Cleanup stale operations (older than timeout)
    const now = Date.now();
    for (const [opId, op] of this.activeOperations) {
      const opTime = new Date(op.start_time).getTime();
      if (now - opTime > this.OPERATION_TIMEOUT) {
        this.activeOperations.delete(opId);
      }
    }
    
    // Enforce size limit
    if (this.activeOperations.size >= this.MAX_OPERATIONS) {
      const oldestKey = this.activeOperations.keys().next().value;
      this.activeOperations.delete(oldestKey);
    }
    
    this.activeOperations.set(id, operation);
  }

  async handleProcessHook(args) {
    const session = await this.sessionManager.getCurrentSession();
    if (!session) {
      // Silently ignore hooks if no session is active
      return { content: [{ type: 'text', text: 'Hook processed (no active session)' }] };
    }

    const { hook_event_name, tool_name, tool_input, tool_response, cwd } = args;
    const timestamp = new Date().toISOString();

    try {
      switch (hook_event_name) {
        case 'preToolUse':
          // Track operation start
          const operationId = `${tool_name}_${timestamp}`;
          this.addActiveOperation(operationId, {
            tool_name,
            tool_input,
            start_time: timestamp,
            cwd
          });
          break;

        case 'postToolUse':
          // Find matching preToolUse and log completed operation
          const matchingOp = Array.from(this.activeOperations.entries())
            .find(([id, op]) => op.tool_name === tool_name);
          
          if (matchingOp) {
            const [opId, operation] = matchingOp;
            this.activeOperations.delete(opId);

            // Extract files from tool input/response
            const files = this.extractFilesFromTool(tool_name, tool_input, tool_response);
            const success = tool_response?.success !== false;

            await this.worklogTracker.logAction({
              action: `Used ${tool_name}: ${this.summarizeToolAction(tool_name, tool_input)}`,
              files_changed: files,
              status: success ? 'success' : 'failed',
              timestamp
            });
          }
          break;

        case 'stop':
          // Log any incomplete operations
          for (const [opId, operation] of this.activeOperations) {
            await this.worklogTracker.logAction({
              action: `Incomplete ${operation.tool_name} operation`,
              files_changed: [],
              status: 'partial',
              timestamp
            });
          }
          this.activeOperations.clear();
          break;
      }

      return { content: [{ type: 'text', text: `Hook ${hook_event_name} processed` }] };
    } catch (error) {
      return { content: [{ type: 'text', text: `Hook processing error: ${error.message}` }] };
    }
  }

  async handleGetRecentContext(args) {
    const session = await this.sessionManager.getCurrentSession();
    if (!session) {
      throw new Error('No active session found.');
    }

    const context = await this.sessionManager.getRecentContext(
      args.prompt_count || 5,
      args.action_count || 10
    );
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(context, null, 2)
      }]
    };
  }

  async handleMarkCriteriaComplete(args) {
    const session = await this.sessionManager.getCurrentSession();
    if (!session) {
      throw new Error('No active session found.');
    }

    const result = await this.sessionManager.markCriteriaComplete(args.criteria_index, args.completion_notes);
    return {
      content: [{
        type: 'text',
        text: result
      }]
    };
  }

  extractFilesFromTool(tool_name, tool_input, tool_response) {
    const files = [];
    
    // Extract files based on tool type
    if (tool_name === 'fs_write' && tool_input?.path) {
      files.push(tool_input.path);
    } else if (tool_name === 'fs_read' && tool_input?.operations) {
      for (const op of tool_input.operations) {
        if (op.path) files.push(op.path);
      }
    } else if (tool_name === 'execute_bash' && tool_response?.success) {
      // Could parse bash output for file operations, but keep simple for now
    }
    
    return files;
  }

  summarizeToolAction(tool_name, tool_input) {
    switch (tool_name) {
      case 'fs_write':
        return `${tool_input?.command || 'write'} ${tool_input?.path || 'file'}`;
      case 'fs_read':
        return `read ${tool_input?.operations?.length || 1} file(s)`;
      case 'execute_bash':
        return `${tool_input?.command?.substring(0, 50) || 'bash command'}...`;
      default:
        return `${tool_name} operation`;
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Amazon Q History MCP Server running on stdio');
  }
}

export { AmazonQHistoryServer };

const server = new AmazonQHistoryServer();
server.run().catch(console.error);
