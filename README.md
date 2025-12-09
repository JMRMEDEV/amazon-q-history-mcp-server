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

## Configuration

### Storage Modes

Create `.amazon-q-history/config.json` in your project root to configure storage behavior.

#### Server Mode (Default)
```json
{
  "storage_mode": "server"
}
```
- History stored in MCP server directory
- Backup in `/tmp/amazon-q-history/`
- No delete protection

#### Project Mode
```json
{
  "storage_mode": "project",
  "session_ttl_hours": 24,
  "allowed_paths": [
    "/home/user/repos/project1",
    "/home/user/repos/project2"
  ]
}
```
- History stored in `.amazon-q-history/` directory
- Backup also in project directory
- Delete protection enabled
- History stays with project
- **session_ttl_hours**: Reuse sessions within this time (default: 24)
- **allowed_paths**: Additional paths for workspace/multi-project setups (auto-detects `.code-workspace` files)
  - Supports absolute paths: `/home/user/repos/project1`
  - Supports relative paths: `../`, `../sibling-project`, `../../parent`
  - Relative paths resolved from project directory

### Tool Permissions

Control which tools are available in your project.

#### Allow All (Default)
```json
{
  "tools": {
    "mode": "all"
  }
}
```
All tools available, no restrictions.

#### Whitelist Mode
```json
{
  "tools": {
    "mode": "allow",
    "list": [
      "track_session",
      "log_prompt",
      "log_action",
      "get_recent_context"
    ]
  }
}
```
Only listed tools are available. Most restrictive.

#### Blacklist Mode
```json
{
  "tools": {
    "mode": "deny",
    "list": [
      "clear_session_history",
      "restore_backup"
    ]
  }
}
```
All tools available EXCEPT those listed. Good for blocking dangerous operations.

### Preset Configurations

Copy preset configs to get started quickly:

```bash
# Read-only access (viewing only)
cp preset-configs/read-only.json .amazon-q-history/config.json

# Safe development (no destructive operations)
cp preset-configs/safe-dev.json .amazon-q-history/config.json

# Workspace/multi-project setup (supports relative paths)
cp preset-configs/workspace.json .amazon-q-history/config.json

# Git-focused workflow
cp preset-configs/git-workflow.json .amazon-q-history/config.json

# Team-safe (prevent accidental deletes)
cp preset-configs/team-safe.json .amazon-q-history/config.json

# Project storage (default permissions)
cp preset-configs/project-storage.json .amazon-q-history/config.json

# Server storage (default permissions)
cp preset-configs/server-storage.json .amazon-q-history/config.json
```

#### Available Presets

**read-only.json**
- Storage: Project mode
- Tools: Only viewing tools (get_session_history, get_recent_context, check_progress)
- Use case: Reviewing history without making changes

**safe-dev.json**
- Storage: Project mode
- Tools: All except clear_session_history and restore_backup
- Use case: Development with protection against accidental deletes

**workspace.json**
- Storage: Project mode
- Allowed paths: Supports relative paths (`.`, `../`, `../project`)
- Tools: Core tools + list_sessions
- Use case: Multi-project workspaces with sibling directories

**git-workflow.json**
- Storage: Project mode
- Tools: Session tracking, git integration, and viewing tools
- Use case: Git-focused development workflow

**team-safe.json**
- Storage: Project mode
- Tools: All except clear_session_history
- Use case: Team environments where history should be preserved

**project-storage.json**
- Storage: Project mode
- Tools: All available
- Use case: Full-featured project-based storage

**server-storage.json**
- Storage: Server mode
- Tools: All available
- Use case: Default centralized storage

### Setting Up config.json in Your Project

#### Step-by-Step Guide

**1. Create the configuration directory**
```bash
cd /path/to/your/project
mkdir -p .amazon-q-history
```

**2. Choose your configuration approach**

**Option A: Use a preset (recommended)**
```bash
# Copy a preset that matches your needs
cp /path/to/amazon-q-history/preset-configs/safe-dev.json .amazon-q-history/config.json
```

**Option B: Create custom config**
```bash
# Create config.json manually
cat > .amazon-q-history/config.json << 'EOF'
{
  "storage_mode": "project",
  "tools": {
    "mode": "deny",
    "list": ["clear_session_history"]
  }
}
EOF
```

**3. Verify configuration**
```bash
# Check that config file exists
cat .amazon-q-history/config.json
```

**4. Start using Amazon Q History**
```bash
# Initialize session (will automatically load config)
q chat --agent your-agent

# Or use MCP tool directly
track_session --agent_name "my-agent"
```

#### Configuration Examples

**Example 1: Personal Project (Full Control)**
```json
{
  "storage_mode": "project"
}
```
- All tools available
- History stored in project
- Can commit to git if desired

**Example 2: Team Project (Safety First)**
```json
{
  "storage_mode": "project",
  "tools": {
    "mode": "deny",
    "list": ["clear_session_history"]
  }
}
```
- Prevents accidental history deletion
- All other tools available
- Safe for team collaboration

**Example 3: CI/CD Environment (Read-Only)**
```json
{
  "storage_mode": "server",
  "tools": {
    "mode": "allow",
    "list": [
      "get_session_history",
      "get_recent_context",
      "check_progress"
    ]
  }
}
```
- Only viewing tools
- No modifications allowed
- Good for automated checks

**Example 4: Git-Only Workflow**
```json
{
  "storage_mode": "project",
  "tools": {
    "mode": "allow",
    "list": [
      "track_session",
      "log_git_commits",
      "get_recent_context",
      "check_progress"
    ]
  }
}
```
- Focus on git integration
- No manual logging
- Streamlined workflow

#### Adding config.json to Git

**Option 1: Commit config (recommended for teams)**
```bash
# Add config to version control
git add .amazon-q-history/config.json
git commit -m "Add Amazon Q History config"

# Add sessions to .gitignore
echo ".amazon-q-history/sessions/" >> .gitignore
echo ".amazon-q-history/backup/" >> .gitignore
echo ".amazon-q-history/logs/" >> .gitignore
```

**Option 2: Keep config local**
```bash
# Ignore entire .amazon-q-history directory
echo ".amazon-q-history/" >> .gitignore
```

#### Troubleshooting

**Config not loading?**
- Ensure file is named exactly `config.json`
- Check file is in `.amazon-q-history/` directory at project root
- Verify JSON syntax is valid: `cat .amazon-q-history/config.json | jq`

**Tool blocked unexpectedly?**
- Check `tools.mode` setting
- Verify tool name is in correct list (allow vs deny)
- Review available tools in documentation

**Storage path issues?**
- Confirm `storage_mode` is either "server" or "project"
- Check directory permissions
- Verify `.amazon-q-history/` directory exists

#### Available Tools Reference

All tools that can be controlled via config:
- `track_session` - Initialize sessions
- `log_prompt` - Record prompts
- `log_action` - Manual logging
- `log_git_commits` - Git integration
- `get_session_history` - View history
- `get_recent_context` - Recent context
- `check_progress` - Progress monitoring
- `mark_criteria_complete` - Mark goals complete
- `clear_session_history` - Delete history
- `restore_backup` - Restore sessions
- `init_project_storage` - Initialize project mode
- `process_hook` - Hook processing

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

### Git Integration (Optional)
```bash
# Import recent git commits into worklog
log_git_commits --max_commits 5

# Import commits from last hour
log_git_commits --since "1 hour ago"

# Import from specific branch
log_git_commits --branch "feature/auth" --max_commits 10
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

# Get recent context without overwhelming Q (recommended for large sessions)
get_recent_context

# Get more context if needed (incremental approach)
get_recent_context --prompt_count 10 --action_count 20
```

### Restore from Backup
```bash
# List all available sessions (active and backup)
list_sessions

# Or use restore_backup without parameters
restore_backup

# Example output:
# **Active Sessions:**
# - 2025-10-13T19-04-26_amazon-q-developer_384fc4e1
#   Agent: amazon-q-developer, Created: 2025-10-13
#
# **Backup Sessions (deleted from active):**
# - 2025-10-13T19-09-26_amazon-q-developer_fbd33373
#   Agent: amazon-q-developer, Created: 2025-10-13

# Resume an active session (no restore needed)
track_session --agent_name "amazon-q-developer"

# Restore a backup session (deleted from active)
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
- `get_recent_context` - Get recent prompts/actions (context-safe for large sessions)
- `check_progress` - Monitor goal completion
- `clear_session_history` - Clean up with confirmation
- `list_sessions` - List all sessions (active and backup)
- `restore_backup` - Recover from backup or resume active sessions

### Operation Tracking
- `log_action` - Manual operation logging (recommended)
- `log_git_commits` - Import git commit history (optional)
- `process_hook` - Q CLI hook event processing (advanced)

### Progress Management
- `mark_criteria_complete` - Manually mark success criteria as complete

### Recovery & Backup
- Automatic backup to `/tmp/amazon-q-history/`
- Session summaries for easy identification
- Complete crash recovery capabilities

## Context Management

### Avoiding Context Overflow
Large sessions with thousands of actions can overwhelm Q's context window. Use `get_recent_context` for safe context retrieval:

```bash
# Default: Last 5 prompts + 10 actions (recommended)
get_recent_context

# Need more context? Increase incrementally
get_recent_context --prompt_count 8 --action_count 15

# For detailed investigation (use carefully)
get_recent_context --prompt_count 15 --action_count 30
```

### Context Strategy
- **Start small**: Use default 5 prompts + 10 actions
- **Expand gradually**: Increase counts only if more context is needed
- **Bottom-to-top reading**: Always gets most recent entries first
- **Fixed size**: Never grows beyond specified limits

### When to Use Each Tool
- `get_recent_context` - **Recommended** for active work and large sessions
- `get_session_history` - Basic session stats and summaries only
- `check_progress` - Goal completion status

## File Structure

```
storage/sessions/2024-10-13T13-01-17_amazon-q-developer_abc12345/
├── metadata.json          # Session info and configuration
├── history.json           # User prompts and session events (context resets)
├── goals.json            # Extracted goals and requirements
├── success-criteria.json # Generated success criteria
└── worklog.json          # Detailed action tracking and file changes
```

## Backup Location

All files are automatically backed up to `/tmp/amazon-q-history/` for recovery.

## Session ID Format

`YYYY-MM-DDTHH-MM-SS_agent-name_hash`

Example: `2024-10-13T13-01-17_amazon-q-developer_abc12345`

## Preset Agent Configuration

Ready-to-use agent configuration with Amazon Q History integration and automatic session tracking.

### Available Preset

#### basic-dev-agent.json
- **Purpose**: General development work
- **Features**: Session tracking, automatic prompt logging
- **MCP Servers**: Amazon Q History only
- **Best for**: Simple development tasks, learning, experimentation

### Usage Instructions

#### 1. Copy Preset Configuration
```bash
# Copy preset to your Q CLI agents directory
cp /home/jmrmedev/mcp-servers/amazon-q-history/preset-agents/basic-dev-agent.json ~/.aws/amazonq/cli-agents/

# Or copy to project-specific location
cp /home/jmrmedev/mcp-servers/amazon-q-history/preset-agents/basic-dev-agent.json /path/to/project/.amazonq/cli-agents/
```

#### 2. Customize Configuration
Edit the copied file to adjust:
- **cwd**: Set to your project directory
- **Agent name**: Update to match your use case
- **MCP server paths**: Verify paths are correct for your system
- **Additional tools**: Add project-specific tools as needed

#### 3. Start Using
```bash
# Use the agent
q chat --agent your-agent-name

# The agent will automatically:
# - Initialize session tracking
# - Enable auto-tracking of operations
# - Log all prompts and tool usage
# - Maintain context across Q restarts
```

### Automatic Features

The preset agent includes:

#### Session Management
- **Auto-initialization**: Session tracking starts automatically
- **Context preservation**: Goals and progress maintained across conversations
- **Crash recovery**: Sessions backed up to `/tmp/amazon-q-history/`

#### Hook Integration
- **userPromptSubmit**: Logs every user prompt with context extraction
- **Agent instructions**: Uses echo commands to instruct agent behavior
- **Session cleanup**: Handles session management through agent instructions

#### Progress Tracking
- **Goal extraction**: Automatically identifies goals from user prompts
- **Success criteria**: Generates measurable completion criteria
- **Progress monitoring**: Tracks actions and completion status

### Customization Tips

#### Adding More MCP Servers
```json
"mcpServers": {
    "your-server": {
        "type": "stdio",
        "command": "node",
        "args": ["/path/to/your/server.js"],
        "timeout": 120000,
        "disabled": false
    }
}
```

#### Adding Custom Hook Instructions
```json
"hooks": {
    "userPromptSubmit": [
        {
            "command": "echo 'Custom instruction for agent behavior'"
        }
    ],
    "agentSpawn": [
        {
            "command": "echo 'IMPORTANT: Use track_session at session start. Optionally use log_git_commits to import commit history.'"
        }
    ]
}
```

#### Tool Restrictions
```json
"toolsSettings": {
    "fs_write": {
        "allowedPaths": ["./**/*.js", "./**/*.json"],
        "deniedPaths": ["./**/.env*"]
    }
}
```

### Troubleshooting

#### Hook Errors
If you see "command not found" errors:
- Ensure Amazon Q History MCP server is running
- Check that `cwd` is set correctly in the agent configuration
- Verify MCP server paths are accessible
- Remember: hooks use shell commands, not MCP tools directly

#### Missing Session Files
The updated server ensures all files (goals.json, history.json, etc.) are created consistently. If files are missing:
- Restart the agent to trigger file initialization
- Check `/tmp/amazon-q-history/` for backup copies
- Use `restore_backup` tool to recover sessions

#### Context Overflow
When Q's context resets mid-conversation:
- The same session continues (no new session created)
- Context reset is logged in session history
- All previous goals and progress are preserved

## Git Integration

The `log_git_commits` tool allows you to import git commit history into your session worklog. This is an optional feature that works alongside manual `log_action` logging.

### Usage

```bash
# Import last 5 commits
log_git_commits --max_commits 5

# Import commits from last hour
log_git_commits --since "1 hour ago"

# Import commits from last day
log_git_commits --since "24 hours ago" --max_commits 20

# Import from specific branch
log_git_commits --branch "feature/auth" --max_commits 10
```

### What Gets Imported

Each commit is logged as an action with:
- **Action**: "Git commit: {commit message}"
- **Files changed**: List of files modified in the commit
- **Timestamp**: Commit date/time
- **Metadata**: 
  - `git_hash`: Commit SHA
  - `author`: Commit author
  - `source`: "git"

### Example Worklog Entry

```json
{
  "action": "Git commit: Add user authentication",
  "files_changed": ["src/auth.js", "src/middleware/auth.js"],
  "status": "success",
  "timestamp": "2025-12-05T19:30:00Z",
  "metadata": {
    "git_hash": "a3f2b1c",
    "author": "John Doe",
    "source": "git"
  }
}
```

### Requirements

- Git must be installed
- Must be run in a git repository
- Commits must exist in the specified range

### When to Use

- **Session start**: Import recent commits to provide context
- **After major work**: Import commits from your work session
- **Progress review**: See what was actually committed vs. planned
- **Team collaboration**: Import commits from other team members

## Future Improvements

### Phase 2: Context Management
- **Context Overflow Detection**: Monitor token usage and warn before limits
- **Smart Summarization**: Automatically compress old context while preserving key information
- **Token Counting**: Estimate context size and optimize for model limits

### Phase 3: Advanced Features
- **Q CLI Integration**: Direct hooks into Q's command pipeline for seamless tracking
- **Context Injection**: Automatically provide session context to Q on startup
- **Smart Resumption**: Detect incomplete sessions and offer to resume
- **Pattern Analysis**: Learn from successful sessions to improve recommendations
- **Session Analytics**: Track success rates, common failure patterns, and productivity metrics
- **Multi-Agent Support**: Handle multiple Q agents running simultaneously
- **Session Merging**: Combine related sessions across different directories
- **Export/Import**: Share session data between team members or environments
