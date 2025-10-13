# Amazon Q History MCP Server

Track Amazon Q sessions, maintain context across crashes, and monitor progress toward goals.

## Features

- **Session Tracking**: Unique session IDs with agent name and timestamp
- **Context Preservation**: Extract and store goals, requirements, and constraints
- **Progress Monitoring**: Track actions and success criteria
- **Crash Recovery**: Backup to `/tmp` with restoration capabilities
- **Worklog Management**: Chronological action tracking with status
- **Backup Restoration**: Restore deleted sessions from `/tmp` backup
- **Hook Integration**: Support for Q CLI hook events for automatic operation tracking

## Installation

```bash
cd /home/jmrmedev/mcp-servers/amazon-q-history
npm install
```

## Usage

### Initialize Session
```bash
# Start tracking for current directory
track_session --agent_name "amazon-q-developer"
```

### Log User Prompts
```bash
# Log prompt and extract goals/requirements
log_prompt --prompt "I want to create a React app with authentication. It should use JWT tokens and have a login page."
```

### Manual Operation Logging
```bash
# Log Q actions manually (recommended for precise control)
log_action --action "Created React app structure" --files_changed "['src/App.js', 'package.json']" --status "success"
```

### Automatic Operation Tracking
```bash
# Enable file system monitoring (experimental)
auto_track_operations --enabled true

# Disable auto-tracking
auto_track_operations --enabled false
```

### Hook-Based Operation Tracking
```bash
# Process Q CLI hook events for precise operation tracking (advanced)
process_hook --hook_event_name "preToolUse" --tool_name "fs_read" --tool_input {...}
process_hook --hook_event_name "postToolUse" --tool_name "fs_read" --tool_input {...} --tool_response {...}
process_hook --hook_event_name "stop"
```

### Check Progress
```bash
# See current progress and session data
check_progress
get_session_history
```

### Restore from Backup
```bash
# List available backups with summaries
restore_backup

# Example output:
# - 2025-10-13T19-04-26_amazon-q-developer_384fc4e1: I want to create a React app with authentication...
# - 2025-10-13T19-09-26_amazon-q-developer_fbd33373: Build a Node.js REST API with JWT tokens...

# Restore specific session
restore_backup --session_id "2025-10-13T19-04-26_amazon-q-developer_384fc4e1"
```

### Clear History
```bash
# Clear session history with confirmation
clear_session_history --confirm true
```

## Complete Tool Set

### Core Session Management
- `track_session` - Initialize/resume sessions
- `log_prompt` - Record prompts with context extraction  
- `get_session_history` - Retrieve session data with summaries
- `check_progress` - Monitor goal completion
- `clear_session_history` - Clean up with confirmation
- `restore_backup` - Recover from `/tmp` backup

### Operation Tracking
- `log_action` - Manual operation logging (recommended)
- `auto_track_operations` - File system monitoring (experimental)
- `process_hook` - Q CLI hook event processing (advanced)

### Recovery & Backup
- Automatic backup to `/tmp/amazon-q-history/`
- Session summaries for easy identification
- Complete crash recovery capabilities

## File Structure

```
storage/sessions/2024-10-13T13-01-17_amazon-q-developer_abc12345/
├── metadata.json          # Session info
├── history.json           # Prompts and actions log
├── goals.json            # Extracted goals and requirements
├── success-criteria.json # Generated success criteria
└── worklog.json          # Detailed action tracking
```

## Backup Location

All files are automatically backed up to `/tmp/amazon-q-history/` for recovery.

## Session ID Format

`YYYY-MM-DDTHH-MM-SS_agent-name_hash`

Example: `2024-10-13T13-01-17_amazon-q-developer_abc12345`

## Future Improvements

### Phase 2: Context Management
- **Context Overflow Detection**: Monitor token usage and warn before limits
- **Smart Summarization**: Automatically compress old context while preserving key information
- **Token Counting**: Estimate context size and optimize for model limits

### Phase 3: Advanced Features
- **File System Monitoring**: Automatically detect file changes without manual logging
- **Q CLI Integration**: Direct hooks into Q's command pipeline for seamless tracking
- **Context Injection**: Automatically provide session context to Q on startup
- **Smart Resumption**: Detect incomplete sessions and offer to resume
- **Pattern Analysis**: Learn from successful sessions to improve recommendations
- **Session Analytics**: Track success rates, common failure patterns, and productivity metrics
- **Multi-Agent Support**: Handle multiple Q agents running simultaneously
- **Session Merging**: Combine related sessions across different directories
- **Export/Import**: Share session data between team members or environments
