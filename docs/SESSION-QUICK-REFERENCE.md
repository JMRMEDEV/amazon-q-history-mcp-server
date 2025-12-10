# Session Management Quick Reference

## Commands

### Close Current Session
```javascript
close_session()
```
Saves and closes the current session. Session remains available for future use.

### List All Sessions
```javascript
list_sessions()
```
Shows all active and backup sessions with descriptions.

### Switch to Session
```javascript
switch_session({ session_id: "SESSION_ID" })
```
Closes current session and switches to the specified session.

### Create/Resume Session
```javascript
track_session({ agent_name: "AGENT_NAME" })
```
Creates new session or resumes existing one within TTL.

### Restore from Backup
```javascript
restore_backup({ session_id: "SESSION_ID" })
```
Restores a session from backup storage.

## Common Workflows

### Switch Projects
```javascript
// Close current work
close_session()

// Start new project
track_session({ agent_name: "project-name" })
```

### Resume Previous Work
```javascript
// Find session
list_sessions()

// Switch to it
switch_session({ session_id: "2025-12-09T15-30-45_kiro-cli_abc123" })
```

### End of Day
```javascript
// Save and close
close_session()
```

### Start of Day
```javascript
// List yesterday's sessions
list_sessions()

// Resume where you left off
switch_session({ session_id: "YESTERDAY_SESSION_ID" })
```

## Tips

- **Always close** before switching to ensure data is saved
- **Use descriptive agent names** to identify sessions easily
- **List sessions regularly** to keep track of your work
- **Session IDs** are in format: `YYYY-MM-DDTHH-MM-SS_agent-name_hash`

## Error Messages

| Message | Meaning | Solution |
|---------|---------|----------|
| "No active session to close" | No session is currently active | Normal - no action needed |
| "Session not found" | Session ID doesn't exist in storage | Check ID with `list_sessions` or use `restore_backup` |
| "Failed to load session metadata" | Session data is corrupted | Restore from backup |

## Integration

Works with all other tools:
- `log_prompt` - Records prompts in current session
- `log_action` - Records actions in current session
- `get_session_history` - Views current session history
- `check_progress` - Checks current session progress
