# Q History MCP Server - Fix Plan

## Issues & Solutions

### Issue 1: Session Restoration Fails
**Problem**: Sessions don't restore properly, claims they don't exist, then finds backups but can't log.
**Solution**: 
- Normalize agent names to kebab-case
- Fix session matching logic (directory + normalized agent)
- Improve session reuse detection

### Issue 2: Success Criteria Never Complete
**Problem**: `criteria[].completed` stays false, but `requirements_met[].satisfied` updates correctly.
**Solution**:
- Remove duplicate `criteria` array
- Use only `requirements_met` for tracking
- Improve completion detection (1 action sufficient)

### Issue 3: Agent Names with Spaces
**Problem**: Session IDs contain spaces, unpredictable format.
**Solution**:
- Sanitize agent names in session IDs
- Keep display name in metadata
- Format: `YYYY-MM-DDTHH-MM-SS_normalized-agent_hash`

### Issue 4: Path Validation Too Restrictive
**Problem**: Can't log files outside cwd, breaks workspace usage.
**Solution**:
- Add `allowed_paths` to config.json
- Auto-detect workspace files
- Validate against allowed paths list

### Issue 5: Always Creates New Sessions
**Problem**: Creates new session every time instead of reusing.
**Solution**:
- Fix session matching (directory + agent)
- Add session TTL (24h default)
- Reuse recent sessions automatically

## Implementation Phases

### Phase 1: Critical Fixes (Session & Paths)
**Files**: session-manager.js, input-validator.js, config-manager.js

1. **Normalize Agent Names**
   - Add `normalizeAgentName()` utility
   - Update session ID generation
   - Store both normalized and display names

2. **Workspace Path Support**
   - Add `allowed_paths` to config schema
   - Add workspace file detection
   - Update `validatePath()` to check allowed paths

3. **Fix Session Reuse**
   - Update `getCurrentSession()` matching logic
   - Add session TTL check
   - Prevent duplicate session creation

4. **Tests**
   - test-session-normalization.js
   - test-workspace-paths.js
   - test-session-reuse.js

### Phase 2: Success Criteria Fix
**Files**: session-manager.js, worklog-tracker.js

1. **Simplify Success Tracking**
   - Remove `criteria` array from schema
   - Keep only `requirements_met`
   - Update all references

2. **Improve Detection**
   - Single action = satisfied (not 2+)
   - Better keyword matching
   - Add completion timestamps

3. **Tests**
   - test-success-criteria.js

### Phase 3: Session Management
**Files**: server.js, session-manager.js

1. **Session TTL**
   - Add `session_ttl_hours` to config
   - Check age on session load
   - Auto-expire old sessions

2. **Session Commands**
   - list_sessions tool
   - switch_session tool
   - cleanup_sessions tool

3. **Tests**
   - test-session-ttl.js
   - test-session-commands.js

## Test Strategy

Each test spawns real kiro-cli instance with timeout:
- Setup: Create test workspace/config
- Execute: Run kiro-cli commands
- Verify: Check session files
- Cleanup: Remove test data

## Config Schema Updates

```json
{
  "storage_mode": "project",
  "session_ttl_hours": 24,
  "allowed_paths": [
    "/home/user/repos/project1",
    "/home/user/repos/project2"
  ],
  "tools": {
    "mode": "allow",
    "list": ["track_session", "log_prompt", "log_action"]
  }
}
```

## Success Criteria Schema Update

```json
{
  "requirements_met": [
    {
      "requirement": "string",
      "satisfied": true,
      "satisfied_at": "2025-12-08T00:00:00Z",
      "validation_notes": "string"
    }
  ],
  "generated_at": "2025-12-08T00:00:00Z"
}
```

## Implementation Order

1. Phase 1.1: Agent name normalization
2. Phase 1.2: Workspace paths
3. Phase 1.3: Session reuse
4. Phase 1.4: Integration tests
5. Phase 2.1: Success criteria simplification
6. Phase 2.2: Tests
7. Phase 3.1: Session TTL
8. Phase 3.2: Session commands
9. Phase 3.3: Tests

## Rollout

- Backward compatible: old sessions still readable
- Migration: auto-convert on first load
- Documentation: update README with new features
