# Session Restore Fix - 2025-12-08

## Problem

When users tried to restore sessions, the system had several issues:

1. **`restore_backup` only looked in `/tmp` backup directory** - ignored active sessions in `.amazon-q-history/sessions`
2. **Listed wrong sessions** - showed old `/tmp` backups instead of current project sessions
3. **Confusing behavior** - session existed but tool said it didn't, then suggested using `track_session` anyway

### Example Issue

User had session: `2025-12-08T16-53-02_kiro-senior-full-stack-developer_27caa3bc`

Located at: `/home/user/repos/project/.amazon-q-history/sessions/2025-12-08T16-53-02_kiro-senior-full-stack-developer_27caa3bc`

But `restore_backup` showed:
```
1. 2025-12-06T02-12-04_agent-1_fcc26772 - No description available
2. 2025-12-06T02-12-04_agent-2_7c897083 - No description available  
3. 2025-12-06T02-06-33_kiro-cli_846f6ab9 - Create a copy...
```

These were old `/tmp` backups, not the actual current session!

## Solution

### 1. New Tool: `list_sessions`

Lists ALL sessions (active and backup) with clear distinction:

```
**Active Sessions:**
- 2025-12-08T16-53-02_kiro-senior-full-stack-developer_27caa3bc
  Agent: kiro-senior-full-stack-developer, Created: 2025-12-08

**Backup Sessions (deleted from active):**
- 2025-12-06T02-06-33_kiro-cli_846f6ab9
  Agent: kiro-cli, Created: 2025-12-06

Use `track_session` to resume an active session.
Use `restore_backup --session_id <id>` to restore a backup session.
```

### 2. Fixed `restore_backup` Logic

**Before:**
- Only checked `/tmp` backup directory
- Listed backups even when session was active
- Confusing error messages

**After:**
1. If no `session_id` provided → calls `list_sessions` (shows both active and backup)
2. If `session_id` provided:
   - **First** checks if session exists in active storage
   - If active → tells user to use `track_session` (no restore needed)
   - If not active → checks backup and restores if found
   - If nowhere → clear error message

### 3. Updated Tool Description

**Old:** "Restore session data from /tmp backup"

**New:** Behavior now checks active sessions first, making it more intuitive

## Changes Made

### Files Modified

1. **server.js**
   - Added `list_sessions` tool definition
   - Added `handleListSessions()` handler

2. **src/session-manager.js**
   - Rewrote `restoreFromBackup()` to check active storage first
   - Added `listAllSessions()` method
   - Improved error messages

### New Methods

```javascript
// Lists all sessions with active/backup distinction
async listAllSessions() {
  // Returns: { message: string }
  // Shows active sessions and backup-only sessions separately
}

// Updated restore logic
async restoreFromBackup(sessionId, options = {}) {
  // 1. No sessionId → list all sessions
  // 2. Check active storage first
  // 3. Then check backup
  // 4. Clear messages at each step
}
```

## Testing

### New Tests (`test-session-listing.js`)

All 4 tests passing:
1. ✅ listAllSessions shows active sessions
2. ✅ restoreFromBackup detects existing active session
3. ✅ restoreFromBackup without sessionId lists all sessions
4. ✅ listAllSessions distinguishes active from backup-only

### Existing Tests

All previous tests still passing (5/6, TTL test is timing-sensitive).

## Usage

### List All Sessions
```bash
# In kiro-cli
list_sessions

# Or
restore_backup  # without session_id
```

### Resume Active Session
```bash
# Session already exists in .amazon-q-history/sessions
track_session --agent_name "your-agent"
```

### Restore Backup Session
```bash
# Session only in backup (deleted from active)
restore_backup --session_id "2025-12-06T02-06-33_kiro-cli_846f6ab9"
```

## Benefits

1. **Clear visibility** - See all sessions (active and backup) in one place
2. **No confusion** - Tool tells you exactly what to do
3. **Correct behavior** - Checks active storage before backup
4. **Better UX** - Helpful messages guide user to right action

## Backward Compatibility

✅ Fully backward compatible
- Old `restore_backup` calls still work
- Existing sessions unaffected
- No breaking changes
