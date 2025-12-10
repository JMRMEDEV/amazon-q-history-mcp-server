# Session Management

## Overview

The session management system supports graceful session exit, selective session switching, and automatic restoration of the most recent session for optimal user experience.

## Features

### 1. Restore Latest Session (`restore_latest`)

**NEW**: Automatically restores the most recent session with a single command.

**Usage:**
```javascript
await restore_latest()
```

**Behavior:**
- Finds the most recent session automatically
- Attempts to switch to it if in active storage
- Falls back to restoring from backup if needed
- Returns confirmation with session details

**Example Output:**
```
Restored latest session: 2025-12-09T15-30-45_kiro-cli_abc123
```

**Best for:** When user says "restore latest conversation" or similar requests.

### 2. Close Session (`close_session`)

Gracefully closes the current active session without deleting any data.

**Usage:**
```javascript
await close_session()
```

**Behavior:**
- Saves final session state
- Clears the current session from memory
- Session data remains in storage for future use
- Returns confirmation message with session ID

**Example Output:**
```
Session 2025-12-09T15-30-45_kiro-cli_abc123 closed gracefully.
Use list_sessions to view available sessions.
```

### 2. Switch Session (`switch_session`)

Switches from the current session to a different active session.

**Usage:**
```javascript
await switch_session({ session_id: "2025-12-09T15-30-45_kiro-cli_abc123" })
```

**Parameters:**
- `session_id` (required): The ID of the session to switch to

**Behavior:**
- Closes current session gracefully (if exists)
- Loads the target session from storage
- Restores session metadata and context
- Returns confirmation with session details

**Example Output:**
```
Switched to session 2025-12-09T15-30-45_kiro-cli_abc123
Agent: kiro-cli
Directory: /home/user/project
```

**Error Handling:**
- If session not found in active storage, suggests using `restore_backup`
- If metadata is corrupted, returns error message

### 3. List Sessions (`list_sessions`)

Lists all available sessions in both active storage and backup.

**Usage:**
```javascript
await list_sessions()
```

**Output:**
```
**Active Sessions:**
- 2025-12-09T15-30-45_kiro-cli_abc123
  Working on session management feature
- 2025-12-09T14-20-30_kiro-cli_def456
  Implementing backup system

Use `track_session` to resume an active session.
Use `restore_backup --session_id <id>` to restore a backup session.
```

## Workflow Examples

### Example 1: Working on Multiple Projects

```javascript
// Start working on project A
await track_session({ agent_name: "kiro-cli" })
await log_prompt({ prompt: "Implement feature X" })
// ... do work ...

// Need to switch to project B
await close_session()
await track_session({ agent_name: "kiro-cli" })
await log_prompt({ prompt: "Fix bug Y" })
// ... do work ...

// Return to project A
await list_sessions()  // Find the session ID
await switch_session({ session_id: "2025-12-09T15-30-45_kiro-cli_abc123" })
// Continue working on feature X
```

### Example 2: Reviewing Past Sessions

```javascript
// List all sessions
await list_sessions()

// Switch to a specific session to review
await switch_session({ session_id: "2025-12-08T10-15-20_kiro-cli_xyz789" })

// Check the history
await get_session_history()

// Close when done reviewing
await close_session()
```

### Example 3: Clean Session Management

```javascript
// Close current session before starting new work
await close_session()

// Start fresh session
await track_session({ agent_name: "kiro-cli" })
await log_prompt({ prompt: "New task" })
```

## Best Practices

1. **Always close sessions gracefully** before switching to avoid data loss
2. **Use descriptive prompts** when starting sessions to make them easier to identify in listings
3. **Regularly review sessions** using `list_sessions` to keep track of your work
4. **Close sessions** when taking breaks to free up memory
5. **Use switch_session** instead of creating new sessions when resuming work

## Technical Details

### Session State

When you close a session:
- All data is saved to storage
- Session metadata is updated
- Memory is cleared
- Session remains available for future use

When you switch sessions:
- Current session is closed gracefully
- Target session metadata is loaded
- Session context is restored
- All history and worklog data becomes available

### Storage Locations

- **Active sessions**: `storage/sessions/` or `.amazon-q-history/sessions/`
- **Backup sessions**: `/tmp/amazon-q-history/` (or configured backup location)
- **Session metadata**: `metadata.json` in each session directory

## Error Handling

### Session Not Found
```
Session non-existent-session not found. 
Use restore_backup to restore from backup first.
```
**Solution**: Check available sessions with `list_sessions` or restore from backup

### No Active Session
```
No active session to close
```
**Solution**: This is informational - no action needed

### Metadata Load Failure
```
Failed to load session metadata: [error details]
```
**Solution**: Session data may be corrupted - check storage directory or restore from backup

## Integration with Other Tools

The session management tools work seamlessly with:
- `track_session`: Creates or resumes sessions
- `restore_backup`: Restores sessions from backup
- `get_session_history`: Views session data
- `log_prompt` / `log_action`: Records session activity

## Migration Notes

This feature is backward compatible with existing sessions. All existing sessions can be:
- Listed with `list_sessions`
- Switched to with `switch_session`
- Closed with `close_session`

No migration or data conversion is required.
