# Presession Mode

## Problem Solved

Previously, to browse existing sessions or get session details, the system would automatically create a new session. This was illogical - why create a session just to look at other sessions?

## Solution: Presession Mode

Presession mode allows browsing and managing sessions without creating one.

## Usage

### Manual Presession Mode
```javascript
// Enter presession mode
init_presession()

// Browse sessions without creating one
list_sessions()

// Restore a specific session
restore_latest()
// or
switch_session({ session_id: "SESSION_ID" })

// Create new session when ready
track_session({ agent_name: "my-agent" })
```

### Automatic Presession Mode
Set in `.amazon-q-history/config.json`:
```json
{
  "storage_mode": "project",
  "restore_latest": true
}
```

With `restore_latest: true`, the system automatically restores the most recent session on startup.

## Benefits

1. **No unnecessary sessions**: Browse without creating
2. **Logical workflow**: Look first, then decide
3. **Auto-restore option**: Seamless continuation of work
4. **Backward compatible**: Existing behavior unchanged

## Workflow Examples

### Browse Before Deciding
```javascript
// User: "Show me my recent sessions"
init_presession()
list_sessions()

// User: "Restore the one from yesterday"
switch_session({ session_id: "2025-12-09T10-30-45_project_abc123" })
```

### Auto-Restore Workflow
```json
// config.json
{ "restore_latest": true }
```
```javascript
// System automatically restores latest session
// No manual intervention needed
```

### Mixed Workflow
```javascript
// Browse first
init_presession()
list_sessions()

// Decide to start fresh instead
track_session({ agent_name: "new-project" })
```

## Configuration

### restore_latest Flag
- `true`: Automatically restore most recent session
- `false` (default): Manual session management

### Example Configs

**Auto-restore enabled:**
```json
{
  "storage_mode": "project",
  "restore_latest": true,
  "session_ttl_hours": 24
}
```

**Manual mode:**
```json
{
  "storage_mode": "project",
  "restore_latest": false
}
```

## Technical Details

### Presession State
- `sessionManager.presessionMode = true`
- No active session (`currentSession = null`)
- Can browse sessions and restore
- Cannot log prompts/actions until session active

### Auto-restore Logic
1. Check `config.restore_latest`
2. If `true`, call `autoRestoreLatest()`
3. If sessions exist, restore most recent
4. If no sessions, stay in presession mode

### Error Handling
- Tools requiring active session show clear error
- Suggests using `track_session` or `restore_latest`
- No automatic session creation in presession mode

## Integration

Works seamlessly with existing tools:
- `list_sessions` - Works in presession mode
- `restore_latest` - Works in presession mode  
- `switch_session` - Works in presession mode
- `track_session` - Exits presession mode
- Other tools - Require active session

## Migration

No migration needed:
- Existing behavior unchanged
- New functionality is opt-in
- Backward compatible
