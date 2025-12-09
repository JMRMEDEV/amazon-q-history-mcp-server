# Parallel Agent Isolation

## Summary

**Yes, you can run multiple kiro-cli agents in the same workspace simultaneously.** Each agent gets its own isolated session.

## How It Works

Sessions are isolated by **both** directory AND agent name:

```javascript
// Session matching logic
if (metadata.directory === cwd && metadata.agent_name === normalizedAgent)
```

### Example

```
/home/user/repos/project/
├── Agent A (kiro-cli with agent "senior-dev")
└── Agent B (kiro-cli with agent "code-reviewer")
```

**Result:**
- Agent A: `2025-12-09T06-47-48_senior-dev_abc123`
- Agent B: `2025-12-09T06-47-48_code-reviewer_def456`

Completely separate sessions, worklogs, and history.

## Testing

**File**: `test-parallel-agents.js`

All 5 tests passing:
1. ✅ Two agents in same directory get separate sessions
2. ✅ Agents maintain separate worklogs
3. ✅ Agent A cannot access Agent B session
4. ✅ Same agent name reuses session (sanity check)
5. ✅ List sessions shows both agents separately

## Use Cases

### 1. Multiple Developers
```bash
# Developer 1
kiro-cli chat --agent "dev-alice"

# Developer 2 (same project)
kiro-cli chat --agent "dev-bob"
```
Each gets their own session history.

### 2. Different Tasks
```bash
# Terminal 1: Feature development
kiro-cli chat --agent "feature-dev"

# Terminal 2: Bug fixing
kiro-cli chat --agent "bug-fixer"
```
Separate context for each task.

### 3. Review + Development
```bash
# Terminal 1: Writing code
kiro-cli chat --agent "developer"

# Terminal 2: Reviewing code
kiro-cli chat --agent "reviewer"
```
Independent sessions, no cross-contamination.

## Session Isolation Guarantees

✅ **Separate session IDs** - Each agent gets unique ID
✅ **Separate worklogs** - Actions don't mix
✅ **Separate history** - Prompts don't mix
✅ **Separate goals** - Requirements tracked independently
✅ **Separate progress** - Success criteria independent

## Viewing All Sessions

```bash
# List all sessions (shows all agents)
list_sessions

# Output:
# **Active Sessions:**
# - 2025-12-09T06-47-48_agent-a_562397c9
#   Agent: agent-a, Created: 2025-12-09
# - 2025-12-09T06-47-48_agent-b_da28b623
#   Agent: agent-b, Created: 2025-12-09
```

## File Structure

```
.amazon-q-history/
├── sessions/
│   ├── 2025-12-09T06-47-48_agent-a_562397c9/
│   │   ├── metadata.json
│   │   ├── history.json
│   │   ├── goals.json
│   │   ├── success-criteria.json
│   │   └── worklog.json
│   └── 2025-12-09T06-47-48_agent-b_da28b623/
│       ├── metadata.json
│       ├── history.json
│       ├── goals.json
│       ├── success-criteria.json
│       └── worklog.json
└── backup/
    ├── 2025-12-09T06-47-48_agent-a_562397c9/
    └── 2025-12-09T06-47-48_agent-b_da28b623/
```

## Important Notes

### Agent Name Normalization
Agent names are normalized to kebab-case:
- "Senior Full-Stack Developer" → `senior-full-stack-developer`
- "Code Reviewer" → `code-reviewer`
- "Agent A" → `agent-a`

### Session Reuse
Same agent name in same directory = reuses session:
```bash
# First invocation
kiro-cli chat --agent "my-agent"  # Creates session

# Second invocation (same agent, same dir)
kiro-cli chat --agent "my-agent"  # Reuses session
```

Different agent name = new session:
```bash
# Different agent
kiro-cli chat --agent "other-agent"  # Creates NEW session
```

## Race Conditions

**File operations are queued** - No race conditions:
- Uses `file-operation-queue.js`
- Sequential writes per session
- Safe for parallel agents

## Performance

- ✅ No performance impact
- ✅ Each agent operates independently
- ✅ No locking or blocking
- ✅ Scales to many agents

## Limitations

None! Run as many agents as you want in the same workspace.

## Best Practices

1. **Use descriptive agent names** - Makes sessions easy to identify
2. **Use `list_sessions`** - See all active agents
3. **Clean up old sessions** - Use TTL or manual cleanup
4. **Different tasks = different agents** - Better organization

## Example Workflow

```bash
# Terminal 1: Main development
cd /home/user/project
kiro-cli chat --agent "main-dev"

# Terminal 2: Testing
cd /home/user/project
kiro-cli chat --agent "tester"

# Terminal 3: Documentation
cd /home/user/project
kiro-cli chat --agent "docs-writer"

# All three work independently, no conflicts!
```

## Conclusion

**Parallel agents are fully supported and safe.** Each agent maintains complete isolation with its own session, history, and progress tracking.
