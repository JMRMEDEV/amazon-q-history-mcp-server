# Prefer Recent Session Feature

## Problem

With infinite TTL, multiple old sessions could exist for the same agent. The system would pick the first one found (often the oldest), not the most recent one.

**Example:**
```
Sessions for "kiro-cli":
- 2025-12-06 (3 days old) ← Picked this one
- 2025-12-09 (today)      ← Should pick this one
```

**Bad UX:** Like loading an old save game instead of your latest progress.

## Solution

New config option: `prefer_recent_session` (default: `true`)

When multiple sessions exist for the same agent + directory, automatically picks the most recent one.

## Configuration

```json
{
  "storage_mode": "project",
  "session_ttl_hours": 0,
  "prefer_recent_session": true
}
```

### Options

- **`true`** (default) - Always picks most recent session
- **`false`** - Picks first matching session (old behavior)

## How It Works

1. Finds all matching sessions (same directory + agent name)
2. Filters by TTL (if configured)
3. If multiple sessions remain:
   - **With `prefer_recent_session: true`**: Sorts by `created_at` descending, picks newest
   - **With `prefer_recent_session: false`**: Picks first found

## Example Scenarios

### Scenario 1: Multiple Old Sessions (Infinite TTL)

**Sessions:**
```
- 2025-12-06T04-45-23_kiro-cli_abc123 (3 days old)
- 2025-12-09T05-41-23_kiro-cli_def456 (today)
```

**Behavior:**
- `prefer_recent_session: true` → Uses 2025-12-09 session ✅
- `prefer_recent_session: false` → Uses 2025-12-06 session ❌

### Scenario 2: With TTL

**Config:**
```json
{
  "session_ttl_hours": 24,
  "prefer_recent_session": true
}
```

**Sessions:**
```
- 2025-12-06 (3 days old) → Expired, ignored
- 2025-12-09 (today)      → Within TTL, used ✅
```

Only one valid session, so `prefer_recent_session` doesn't matter.

### Scenario 3: Multiple Recent Sessions

**Sessions (all within TTL):**
```
- 2025-12-09T10-00-00_dev_abc (morning)
- 2025-12-09T14-00-00_dev_def (afternoon)
```

**Behavior:**
- `prefer_recent_session: true` → Uses afternoon session ✅
- `prefer_recent_session: false` → Uses morning session

## Use Cases

### 1. Long-Term Projects (Infinite TTL)

**Config:**
```json
{
  "session_ttl_hours": 0,
  "prefer_recent_session": true
}
```

**Benefit:** Always resumes from your latest work, even if you have old sessions lying around.

### 2. Multiple Work Sessions Per Day

**Config:**
```json
{
  "session_ttl_hours": 168,
  "prefer_recent_session": true
}
```

**Benefit:** If you work on the same project multiple times in a week, always picks the latest session.

### 3. Explicit Session Management

**Config:**
```json
{
  "session_ttl_hours": 24,
  "prefer_recent_session": false
}
```

**Benefit:** Predictable behavior - always uses the same session within 24 hours.

## Logging

When multiple sessions are found, the system logs:

```
INFO: Multiple sessions found, using most recent
  count: 2
  selected: 2025-12-09T05-41-23_kiro-cli_def456
```

Check `/path/to/project/.amazon-q-history/logs/session.log` to see which session was selected.

## Testing

**File:** `test-prefer-recent.js`

Test creates two sessions (old and new) and verifies the newest is picked.

✅ Test passing

## Backward Compatibility

- ✅ Default is `true` (better UX)
- ✅ Can set to `false` for old behavior
- ✅ Existing configs without this field default to `true`
- ✅ No breaking changes

## Comparison to Video Games

Like save game systems:

| Game Behavior | Q History Equivalent |
|--------------|---------------------|
| Multiple save slots | Multiple sessions per agent |
| "Load Latest Save" | `prefer_recent_session: true` |
| "Load Save #1" | `prefer_recent_session: false` |
| Auto-save | Automatic session tracking |
| Manual save | Manual session creation |

## Best Practices

### Recommended: Use with Infinite TTL

```json
{
  "session_ttl_hours": 0,
  "prefer_recent_session": true
}
```

**Why:** Keep all history forever, but always work with latest session.

### Alternative: Use with Reasonable TTL

```json
{
  "session_ttl_hours": 168,
  "prefer_recent_session": true
}
```

**Why:** Auto-cleanup old sessions, always use latest within TTL.

### Not Recommended: Disable with Infinite TTL

```json
{
  "session_ttl_hours": 0,
  "prefer_recent_session": false
}
```

**Why:** Will keep using old sessions, confusing UX.

## Implementation Details

**File:** `src/session-manager.js`

```javascript
async findReusableSession(cwd, normalizedAgent) {
  // ... find matching sessions ...
  
  const matchingSessions = [];
  // ... collect all matching sessions ...
  
  if (matchingSessions.length > 0) {
    if (preferRecent && matchingSessions.length > 1) {
      // Sort by created_at descending (newest first)
      matchingSessions.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }
    return matchingSessions[0]; // Return first (newest if sorted)
  }
}
```

## Summary

**Problem:** Old sessions picked instead of recent ones
**Solution:** `prefer_recent_session: true` (default)
**Benefit:** Better UX - always work with latest session
**Like:** Loading latest save game automatically
