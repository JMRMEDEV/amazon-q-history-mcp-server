# Integration with Amazon Q CLI

## Setup

1. **Add to Q CLI Configuration**
   
   Add this server to your Q CLI MCP configuration:
   ```json
   {
     "mcpServers": {
       "amazon-q-history": {
         "command": "node",
         "args": ["server.js"],
         "cwd": "/home/jmrmedev/mcp-servers/amazon-q-history",
         "env": {}
       }
     }
   }
   ```

2. **Start Q CLI with MCP Support**
   ```bash
   q chat --mcp-config path/to/mcp-config.json
   ```

## Usage Workflow

### 1. Start a New Project Session
```
/track_session agent_name="amazon-q-developer"
```

### 2. Log Your Goals (Automatic)
When you describe your project goals to Q, use the logging tool:
```
/log_prompt prompt="I want to build a REST API with Node.js and Express. It should have user authentication, rate limiting, and must be secure with HTTPS."
```

### 3. Track Q's Progress (Manual/Automatic)
After Q performs actions, log them:
```
/log_action action="Created Express server structure" files_changed='["server.js", "package.json", "routes/auth.js"]' status="success"
```

### 4. Monitor Progress
```
/check_progress
/get_session_history
```

### 5. Recovery After Crash
If Q crashes or loses context:
```
/track_session  # Will resume existing session for current directory
/get_session_history  # Get full context to continue
```

## Automatic Integration Ideas

For future enhancement, consider:

1. **File System Monitoring**: Automatically detect file changes
2. **Q CLI Hooks**: Integrate directly with Q's command pipeline
3. **Context Injection**: Automatically provide session context to Q on startup
4. **Smart Resumption**: Detect incomplete sessions and offer to resume

## Session Recovery Example

```bash
# After Q crashes...
$ q chat
> /track_session
Session tracking initialized: 2024-10-13T13-01-17_amazon-q-developer_abc12345
Directory: /home/user/my-project
Agent: amazon-q-developer

> /get_session_history
Session: 2024-10-13T13-01-17_amazon-q-developer_abc12345
Prompts: 3
Actions: 7
Last activity: 2024-10-13T14:23:45.123Z

> /check_progress
Progress Check:
Completed: 2
Remaining: 4
Overall: 33%

# Now you can tell Q: "Based on the session history, I was working on..."
```

## File Locations

- **Primary Storage**: `./storage/sessions/`
- **Backup Storage**: `/tmp/amazon-q-history/`
- **Session Format**: `YYYY-MM-DDTHH-MM-SS_agent-name_hash`

## Benefits

- ✅ **Never lose progress** - All context preserved
- ✅ **Resume anywhere** - Session tied to directory
- ✅ **Track success** - Monitor goal completion
- ✅ **Learn patterns** - Analyze what works
- ✅ **Backup safety** - Automatic /tmp backup
