# Amazon Q History MCP Server - Refactor Plan

**Created:** 2025-12-05  
**Status:** Planning Phase

---

## Priority Legend

- 🔴 **HIGH** - Critical issues affecting reliability/security
- 🟡 **MEDIUM** - Important improvements for stability
- 🟢 **LOW** - Nice-to-have enhancements

---

## Issues & Solutions

### 1. Race Conditions in File Operations 🔴

**Issue:** `isUpdating` and `isLogging` flags cause intermittent failures. When `logPrompt` triggers `updateSuccessCriteria`, which calls `logAction`, the action gets silently dropped.

**Impact:** Unpredictable behavior - sometimes worklog works, sometimes session manager works, sometimes neither.

**Proposed Solutions:**

#### Option A: Async Queue (Recommended)
```javascript
class FileOperationQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }
  
  async enqueue(operation) {
    return new Promise((resolve, reject) => {
      this.queue.push({ operation, resolve, reject });
      this.process();
    });
  }
  
  async process() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    
    while (this.queue.length > 0) {
      const { operation, resolve, reject } = this.queue.shift();
      try {
        const result = await operation();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }
    
    this.processing = false;
  }
}
```

**Decision:** [x] Implemented - 2025-12-05

**Implementation Notes:**
- Used singleton queue pattern to avoid deadlocks
- Only top-level operations (`logPrompt`, `logAction`) are queued
- Nested operations run within parent queued operation
- Stress test created and passing (45 concurrent operations)
- **Status:** Tested in isolation, pending kiro-cli integration testing

---

### 2. Logging Within Script Directory 🟡

**Issue:** No debug logs for troubleshooting. All data goes to storage but no operational logs.

**Proposed Solutions:**

#### Option A: Per-project logs
```javascript
const projectLogDir = join(process.cwd(), '.amazon-q-history', 'logs');
// Structure: .amazon-q-history/logs/2025-12-05.log
```

#### Option B: Centralized with project reference
```javascript
const logFile = join(session.storage_path, 'debug.log');
// Each session has its own debug.log
```

#### Option C: Both (Recommended)
```javascript
// Project log for quick access
const projectLog = join(process.cwd(), '.amazon-q-history', 'session.log');
// Central log for debugging MCP server itself
const serverLog = join(__dirname, '../logs/server.log');
```

**Decision:** [ ] Pending

---

### 3. Memory Leaks in Auto-Tracking 🔴

**Issue:** 
- `debounceTimers` Map grows indefinitely with rapid file changes
- `activeOperations` Map never cleaned if `postToolUse` hook fails

**Proposed Solution:**

```javascript
class AmazonQHistoryServer {
  constructor() {
    this.debounceTimers = new Map();
    this.activeOperations = new Map();
    this.MAX_TIMERS = 1000;
    this.MAX_OPERATIONS = 100;
    this.OPERATION_TIMEOUT = 300000; // 5 minutes
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
    // Cleanup stale operations
    const now = Date.now();
    for (const [opId, op] of this.activeOperations) {
      if (now - new Date(op.start_time).getTime() > this.OPERATION_TIMEOUT) {
        this.activeOperations.delete(opId);
      }
    }
    
    // Enforce limit
    if (this.activeOperations.size >= this.MAX_OPERATIONS) {
      const oldestKey = this.activeOperations.keys().next().value;
      this.activeOperations.delete(oldestKey);
    }
    
    this.activeOperations.set(id, operation);
  }
}
```

**Decision:** [ ] Pending

---

### 4. Inefficient File Watching 🟡

**Issue:** Watches ALL files recursively, filters only after events fire. Performance issues in large projects.

**Proposed Solutions:**

#### Option A: Gitignore-style patterns (Recommended)
```javascript
import ignore from 'ignore';

class SmartFileWatcher {
  constructor() {
    this.ig = ignore();
    this.loadIgnorePatterns();
  }
  
  async loadIgnorePatterns() {
    // Load from .gitignore
    try {
      const gitignore = await fs.readFile('.gitignore', 'utf8');
      this.ig.add(gitignore);
    } catch (e) {}
    
    // Load from .qhistoryignore
    try {
      const qignore = await fs.readFile('.qhistoryignore', 'utf8');
      this.ig.add(qignore);
    } catch (e) {}
    
    // Add defaults
    this.ig.add([
      'node_modules/**',
      '.git/**',
      'storage/sessions/**',
      '**/*.log',
      '/tmp/**'
    ]);
  }
  
  shouldWatch(filename) {
    return !this.ig.ignores(filename);
  }
}
```

#### Option B: Watch specific directories only
```javascript
const watchDirs = ['src/', 'lib/', 'config/'];
for (const dir of watchDirs) {
  watch(join(baseDir, dir), { recursive: true }, handler);
}
```

#### Option C: Chokidar with debouncing
```javascript
import chokidar from 'chokidar';

const watcher = chokidar.watch('.', {
  ignored: /(^|[\/\\])\../, // ignore dotfiles
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 500,
    pollInterval: 100
  }
});
```

**Recommendation:** Option A + C combined

**Decision:** [ ] Pending

---

### 5. Circular Dependency Risk 🟡

**Issue:** 
```
SessionManager → WorklogTracker.logAction()
WorklogTracker → SessionManager.updateSuccessCriteria()
```

**Proposed Solution: Event-based architecture**

```javascript
// event-bus.js
import { EventEmitter } from 'events';

class SessionEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }
}

export const eventBus = new SessionEventBus();

// session-manager.js
import { eventBus } from './event-bus.js';

async logPrompt(prompt, extractedContext) {
  // ... save prompt
  eventBus.emit('prompt:logged', { prompt, extractedContext });
}

// worklog-tracker.js
import { eventBus } from './event-bus.js';

constructor() {
  eventBus.on('prompt:logged', this.handlePromptLogged.bind(this));
  eventBus.on('action:logged', this.handleActionLogged.bind(this));
}

async logAction(actionData) {
  // ... save action
  eventBus.emit('action:logged', actionData);
}
```

**Decision:** [ ] Pending

---

### 6. Hardcoded Paths (Non-portable) 🔴

**Issue:** `/tmp/amazon-q-history` doesn't work on Windows

**Proposed Solution:**

```javascript
import os from 'os';
import { join } from 'path';

constructor() {
  this.backupDir = join(os.tmpdir(), 'amazon-q-history');
  // Windows: C:\Users\username\AppData\Local\Temp\amazon-q-history
  // Linux: /tmp/amazon-q-history
  // macOS: /var/folders/.../amazon-q-history
}
```

**Decision:** [ ] Pending

---

### 7. No Session Cleanup 🟡

**Issue:** Sessions accumulate indefinitely. No mechanism to archive or delete old sessions.

**Proposed Solutions:**

#### Option A: Manual cleanup tool
```javascript
{
  name: 'cleanup_sessions',
  description: 'Archive or delete old sessions',
  inputSchema: {
    properties: {
      older_than_days: { type: 'number', default: 30 },
      action: { type: 'string', enum: ['archive', 'delete', 'list'] }
    }
  }
}
```

#### Option B: Size-based cleanup
```javascript
async checkStorageSize() {
  const stats = await this.getStorageStats();
  if (stats.totalSizeMB > 500) { // 500MB threshold
    return this.suggestCleanup(stats);
  }
}
```

#### Option C: Smart archival
```javascript
// Keep recent sessions, archive old ones to compressed format
async archiveOldSessions(daysOld = 30) {
  const sessions = await this.getSessionsOlderThan(daysOld);
  for (const session of sessions) {
    await this.compressSession(session); // tar.gz
    await this.moveToArchive(session);
  }
}
```

#### Option D: Lazy cleanup on startup
```javascript
async initializeSession(agentName) {
  // Check storage on each session start
  const stats = await this.getStorageStats();
  if (stats.sessionCount > 100 || stats.totalSizeMB > 1000) {
    console.warn('Storage cleanup recommended');
    // Optionally auto-archive sessions older than 90 days
  }
}
```

**Recommendation:** Combine B + C + D (monitor size, suggest cleanup, provide manual tool, auto-archive very old sessions)

**Decision:** [ ] Pending

---

### 8. Weak Context Extraction 🟢

**Issue:** Simple keyword matching misses goals phrased differently.

**Proposed Solutions:**

#### Option A: Pattern-based extraction
```javascript
const patterns = [
  /I (?:want|need) to (.+?)(?:\.|$)/gi,
  /(?:create|build|implement|develop) (?:a |an )?(.+?)(?:\.|$)/gi,
  /The (?:goal|objective|aim) is to (.+?)(?:\.|$)/gi,
  /(?:must|should|need to) (.+?)(?:\.|$)/gi
];

extractGoals(text) {
  const goals = [];
  for (const pattern of patterns) {
    const matches = [...text.matchAll(pattern)];
    goals.push(...matches.map(m => m[1].trim()));
  }
  return goals;
}
```

#### Option B: Lightweight NLP (compromise.js)
```javascript
import nlp from 'compromise';

extractGoals(text) {
  const doc = nlp(text);
  
  // Find verbs with objects
  const actions = doc.match('#Verb #Noun+').out('array');
  
  // Find "want to" / "need to" phrases
  const intentions = doc.match('(want|need) to #Verb+').out('array');
  
  return [...actions, ...intentions];
}
```

#### Option C: Semantic similarity (Heavy - not recommended)
```javascript
import { pipeline } from '@xenova/transformers';

async extractGoals(text) {
  const classifier = await pipeline('zero-shot-classification');
  const sentences = this.splitIntoSentences(text);
  
  const results = await classifier(sentences, ['goal', 'requirement', 'constraint']);
  
  return sentences.filter((s, i) => 
    results[i].labels[0] === 'goal' && results[i].scores[0] > 0.7
  );
}
```

#### Option D: Hybrid approach
```javascript
extractGoalsAndRequirements(prompt) {
  // 1. Pattern matching (fast, reliable)
  const patternGoals = this.extractByPatterns(prompt);
  
  // 2. NLP parsing (more accurate)
  const nlpGoals = this.extractByNLP(prompt);
  
  // 3. Merge and deduplicate
  const allGoals = [...patternGoals, ...nlpGoals];
  return this.deduplicateSimilar(allGoals);
}

deduplicateSimilar(goals) {
  const unique = [];
  for (const goal of goals) {
    if (!unique.some(u => this.similarity(u, goal) > 0.8)) {
      unique.push(goal);
    }
  }
  return unique;
}
```

**Recommendation:** Start with Option A, optionally add Option B if needed

**Decision:** [ ] Pending

---

### 9. No Input Validation 🔴

**Issue:** Tool parameters not validated. Risk of path traversal, command injection, memory exhaustion.

**Examples of vulnerabilities:**

```javascript
// Path Traversal
{ "watch_directory": "../../etc/passwd" }
{ "files_changed": ["../../../home/user/.ssh/id_rsa"] }

// Memory exhaustion
{ "prompt": "Test\n\n\n" + "x".repeat(10000000) }
```

**Proposed Solution:**

```javascript
import { resolve, normalize } from 'path';

function validatePath(inputPath, baseDir) {
  const normalized = normalize(inputPath);
  const resolved = resolve(baseDir, normalized);
  
  // Ensure path is within baseDir
  if (!resolved.startsWith(baseDir)) {
    throw new Error('Path traversal detected');
  }
  
  return resolved;
}

function validateToolInput(name, args) {
  switch (name) {
    case 'auto_track_operations':
      if (args.watch_directory) {
        args.watch_directory = validatePath(args.watch_directory, process.cwd());
      }
      break;
    case 'log_action':
      if (args.action && args.action.length > 1000) {
        throw new Error('Action description too long');
      }
      if (args.files_changed) {
        args.files_changed = args.files_changed.map(f => 
          validatePath(f, process.cwd())
        );
      }
      break;
  }
  return args;
}
```

**Decision:** [ ] Pending

---

### 10. Unrestricted File Access 🔴

**Issue:** Auto-tracking can monitor any directory. No restrictions on what files can be tracked.

**Proposed Solutions:**

#### Option A: Explicit allowlist
```javascript
{
  name: 'auto_track_operations',
  inputSchema: {
    properties: {
      allowed_patterns: {
        type: 'array',
        items: { type: 'string' },
        default: ['src/**', 'lib/**', '*.js', '*.json']
      },
      denied_patterns: {
        type: 'array',
        items: { type: 'string' },
        default: ['**/.env*', '**/secrets/**', '**/*.key']
      }
    }
  }
}
```

#### Option B: Wildcard with warning (Recommended)
```javascript
async handleAutoTrackOperations(args) {
  if (args.watch_directory === '*' || !args.allowed_patterns) {
    console.warn('⚠️  WARNING: Tracking all files. Sensitive data may be logged.');
    console.warn('⚠️  Consider using allowed_patterns to restrict tracking.');
    
    // Require explicit confirmation
    if (!args.confirm_unrestricted) {
      throw new Error('Use confirm_unrestricted: true to track all files');
    }
  }
  
  // Apply default restrictions even with wildcard
  const defaultDenied = ['**/.env*', '**/node_modules/**', '**/.git/**'];
  args.denied_patterns = [...(args.denied_patterns || []), ...defaultDenied];
}
```

#### Option C: Config file
```javascript
// .qhistory.config.json
{
  "tracking": {
    "allowed": ["src/**", "lib/**"],
    "denied": ["**/.env*", "**/secrets/**"],
    "warnOnSensitive": true
  }
}
```

**Recommendation:** Option B + C

**Decision:** [ ] Pending

---

### 11. Session Detection Logic (Multi-Agent) 🟡

**Issue:** Multiple agents in same directory share sessions. Only checks directory match, not agent name.

**Proposed Solutions:**

#### Option A: Agent name in session key (Recommended)
```javascript
async getCurrentSession(agentName) {
  const cwd = process.cwd();
  const sessions = await fs.readdir(this.storageDir);
  
  for (const sessionId of sessions) {
    const metadata = JSON.parse(
      await fs.readFile(join(this.storageDir, sessionId, 'metadata.json'), 'utf8')
    );
    
    // Match BOTH directory AND agent name
    if (metadata.directory === cwd && metadata.agent_name === agentName) {
      return metadata;
    }
  }
  
  return null;
}
```

#### Option B: Session registry
```javascript
// .amazon-q-history/registry.json in project root
{
  "sessions": {
    "agent-1": "2025-12-05T14-00-00_agent-1_abc123",
    "agent-2": "2025-12-05T14-05-00_agent-2_def456"
  }
}

async getSessionForAgent(agentName) {
  const registryPath = join(process.cwd(), '.amazon-q-history', 'registry.json');
  const registry = JSON.parse(await fs.readFile(registryPath, 'utf8'));
  return registry.sessions[agentName];
}
```

#### Option C: Environment variable
```javascript
const agentId = process.env.Q_AGENT_ID || args.agent_name || 'default';

async initializeSession(agentName) {
  const sessionKey = `${process.cwd()}:${agentName}`;
  // Use sessionKey for lookups
}
```

**Recommendation:** Option A + B (simplest + persistence)

**Decision:** [ ] Pending

---

### 12. Incomplete Hook Implementation 🟡

**Issue:** Hook matching is fragile. Only matches by tool name, not specific operation. Multiple concurrent operations of same tool will conflict.

**Proposed Solutions:**

#### Option A: Unique operation IDs (Recommended)
```javascript
async handleProcessHook(args) {
  const { hook_event_name, tool_name, tool_input, tool_response } = args;
  
  switch (hook_event_name) {
    case 'preToolUse':
      // Generate unique ID from tool + input hash
      const operationId = this.generateOperationId(tool_name, tool_input);
      
      this.activeOperations.set(operationId, {
        tool_name,
        tool_input,
        start_time: Date.now(),
        id: operationId
      });
      
      // Return ID to caller for matching
      return { 
        content: [{ 
          type: 'text', 
          text: JSON.stringify({ operation_id: operationId })
        }] 
      };
      
    case 'postToolUse':
      // Caller provides operation_id from preToolUse response
      const opId = args.operation_id;
      const operation = this.activeOperations.get(opId);
      
      if (operation) {
        await this.logCompletedOperation(operation, tool_response);
        this.activeOperations.delete(opId);
      }
      break;
  }
}

generateOperationId(tool_name, tool_input) {
  const hash = createHash('md5')
    .update(tool_name + JSON.stringify(tool_input) + Date.now())
    .digest('hex')
    .slice(0, 8);
  return `${tool_name}_${hash}`;
}
```

#### Option B: Stack-based matching
```javascript
async handleProcessHook(args) {
  switch (args.hook_event_name) {
    case 'preToolUse':
      this.operationStack.push({
        tool_name: args.tool_name,
        tool_input: args.tool_input,
        start_time: Date.now()
      });
      break;
      
    case 'postToolUse':
      // Pop most recent matching operation
      const index = this.operationStack.findLastIndex(
        op => op.tool_name === args.tool_name
      );
      
      if (index !== -1) {
        const operation = this.operationStack.splice(index, 1)[0];
        await this.logCompletedOperation(operation, args.tool_response);
      }
      break;
  }
}
```

**Recommendation:** Option A

**Decision:** [ ] Pending

---

### 13. Context Overflow Detection Missing 🟢

**Issue:** `handleContextOverflow()` method exists but is never called. No actual detection mechanism.

**Purpose of method:** Handle when Q CLI's context window fills up and resets. Instead of creating new session, it increments a counter and logs the reset event.

**Proposed Solutions:**

#### Option A: Manual trigger tool
```javascript
{
  name: 'handle_context_overflow',
  description: 'Call when Q context resets to continue same session',
  inputSchema: { type: 'object', properties: {} }
}
```

#### Option B: Hook-based detection
```javascript
// Q CLI would need to emit event when context resets
eventBus.on('context:reset', async () => {
  await this.sessionManager.handleContextOverflow(agentName);
});
```

#### Option C: Token usage monitoring
```javascript
// Track approximate token usage
let estimatedTokens = 0;
const TOKEN_LIMIT = 100000;

if (estimatedTokens > TOKEN_LIMIT * 0.9) {
  console.warn('Context approaching limit');
}
```

**Recommendation:** Option A (simplest) until Q CLI provides detection

**Decision:** [ ] Pending

---

### 14. Backup Restoration Overwrites 🟡

**Issue:** No confirmation before overwriting existing sessions. Could lose current work.

**Proposed Solution:**

```javascript
async handleRestoreBackup(args) {
  const { session_id, mode = 'safe' } = args;
  
  if (!session_id) {
    return await this.listBackups();
  }
  
  const backupPath = join(this.backupDir, session_id);
  const restorePath = join(this.storageDir, session_id);
  
  // Check if session already exists
  const exists = await this.sessionExists(restorePath);
  
  if (exists && mode === 'safe') {
    // Compare backup vs current
    const diff = await this.compareSessionFiles(backupPath, restorePath);
    
    return {
      content: [{
        type: 'text',
        text: `Session ${session_id} already exists.\n\n` +
              `Differences found:\n${diff}\n\n` +
              `Options:\n` +
              `1. restore_backup --session_id "${session_id}" --mode "overwrite"\n` +
              `2. restore_backup --session_id "${session_id}" --mode "merge"\n` +
              `3. restore_backup --session_id "${session_id}" --mode "backup_current"`
      }]
    };
  }
  
  switch (mode) {
    case 'overwrite':
      await this.overwriteSession(backupPath, restorePath);
      break;
    case 'merge':
      await this.mergeSession(backupPath, restorePath);
      break;
    case 'backup_current':
      await this.backupCurrentSession(restorePath);
      await this.overwriteSession(backupPath, restorePath);
      break;
    default:
      await this.restoreSession(backupPath, restorePath);
  }
  
  return { content: [{ type: 'text', text: `Session restored: ${session_id}` }] };
}

async mergeSession(backupPath, currentPath) {
  // Merge history.json - combine prompts
  const backupHistory = JSON.parse(
    await fs.readFile(join(backupPath, 'history.json'), 'utf8')
  );
  const currentHistory = JSON.parse(
    await fs.readFile(join(currentPath, 'history.json'), 'utf8')
  );
  
  const merged = {
    prompts: [...backupHistory.prompts, ...currentHistory.prompts]
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)),
    last_activity: currentHistory.last_activity
  };
  
  await fs.writeFile(
    join(currentPath, 'history.json'),
    JSON.stringify(merged, null, 2)
  );
  
  // Similar for worklog, goals, etc.
}
```

**Decision:** [ ] Pending

---

## Additional Issues

### 15. Incomplete Error Handling 🟡

**Issue:** Many try-catch blocks silently swallow errors. No logging for debugging.

**Proposed Solution:**
- Add proper error logging
- Return user-facing error messages
- Create error log file

**Decision:** [ ] Pending

---

### 16. No Pagination 🟢

**Issue:** `getSessionHistory()` loads entire history into memory. Could cause issues with long-running sessions.

**Proposed Solution:**
- Implement pagination
- Add streaming for large files
- Use `get_recent_context` as default

**Decision:** [ ] Pending

---

### 17. Redundant File Reads 🟢

**Issue:** Many methods read the same files multiple times. No caching mechanism.

**Proposed Solution:**
- Implement file caching with TTL
- Invalidate cache on writes
- Use in-memory cache for session metadata

**Decision:** [ ] Pending

---

### 18. Inconsistent Timestamp Formats 🟢

**Issue:** Uses ISO strings everywhere but no timezone handling.

**Proposed Solution:**
- Standardize on UTC
- Document timezone handling
- Add timezone conversion utilities

**Decision:** [ ] Pending

---

### 19. No Version Migration 🟢

**Issue:** If file format changes, old sessions will break.

**Proposed Solution:**
- Add version field to all JSON files
- Implement migration logic
- Provide migration tool

**Decision:** [ ] Pending

---

### 20. Misleading Documentation 🟢

**Issue:** 
- Claims "automatic tracking" but it's experimental
- Hook integration described as "advanced" but incomplete
- Preset agent uses `echo` commands which don't execute MCP tools

**Proposed Solution:**
- Update README to reflect actual capabilities
- Clarify hook limitations
- Add troubleshooting section

**Decision:** [ ] Pending

---

## Implementation Phases

### Phase 1: Critical Fixes
- [ ] Issue #1: Race conditions (async queue)
- [ ] Issue #3: Memory leaks
- [ ] Issue #6: Portable paths
- [ ] Issue #9: Input validation
- [ ] Issue #10: File access control

### Phase 2: Stability Improvements
- [ ] Issue #2: Logging system
- [ ] Issue #4: File watching improvements
- [ ] Issue #5: Circular dependency fix
- [ ] Issue #11: Multi-agent session handling
- [ ] Issue #15: Error handling

### Phase 3: Feature Enhancements
- [ ] Issue #7: Session cleanup
- [ ] Issue #12: Hook implementation
- [ ] Issue #14: Backup restoration
- [ ] Issue #8: Context extraction

### Phase 4: Polish
- [ ] Issue #13: Context overflow detection
- [ ] Issue #16: Pagination
- [ ] Issue #17: Caching
- [ ] Issue #18: Timestamp handling
- [ ] Issue #19: Version migration
- [ ] Issue #20: Documentation updates

---

## Notes

- Each issue should be addressed in a separate branch
- Add tests for each fix
- Update documentation as changes are made
- Track progress in `progress.md`

---

## Development Workflow

For each issue implementation:

1. **Design** - Review proposed solutions and select approach
2. **Implement** - Write minimal code to solve the problem
3. **Test** - Create stress tests that simulate real-world scenarios
4. **Verify** - Ensure tests pass before moving forward
5. **Document** - Update progress.md with findings and solutions
6. **Integration Test** - Test with kiro-cli MCP server (when applicable)
7. **Mark Complete** - Update refactor.md decision status

### Testing Requirements

- All critical fixes must have stress tests
- Tests should simulate concurrent operations and edge cases
- Tests must pass before considering issue resolved
- Real-world kiro-cli testing required for final validation
