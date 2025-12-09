# Workspace Preset Configuration

## Overview

New preset configuration for multi-project workspaces with support for relative paths like `../`.

## Features

### 1. Relative Path Support

The `allowed_paths` config now supports:
- **Absolute paths**: `/home/user/repos/project1`
- **Relative paths**: `../`, `../sibling-project`, `../../parent`
- **Current directory**: `.`

All relative paths are resolved from the project directory where `.amazon-q-history/config.json` is located.

### 2. Workspace Preset

**File**: `preset-configs/workspace.json`

```json
{
  "storage_mode": "project",
  "session_ttl_hours": 24,
  "allowed_paths": [
    ".",
    "../",
    "../project1",
    "../project2"
  ],
  "tools": {
    "mode": "allow",
    "list": [
      "track_session",
      "log_prompt",
      "log_action",
      "log_git_commits",
      "get_recent_context",
      "get_session_history",
      "check_progress",
      "list_sessions"
    ]
  }
}
```

## Use Cases

### Multi-Project Workspace

```
workspace/
├── project1/
│   └── .amazon-q-history/
│       └── config.json  <- workspace.json preset
├── project2/
└── project3/
```

With `workspace.json` in `project1`, you can log actions for files in `project2` and `project3`:

```javascript
// From project1, can log files in project2
log_action({
  action: "Updated API endpoint",
  files_changed: ["../project2/src/api.js"]
})
```

### Monorepo Structure

```
monorepo/
├── packages/
│   ├── frontend/
│   │   └── .amazon-q-history/
│   │       └── config.json
│   ├── backend/
│   └── shared/
└── tools/
```

Config in `packages/frontend`:
```json
{
  "allowed_paths": [
    ".",
    "../backend",
    "../shared",
    "../../tools"
  ]
}
```

### Parent Directory Access

```
repos/
├── main-project/
│   └── .amazon-q-history/
│       └── config.json
├── utils/
└── docs/
```

Config in `main-project`:
```json
{
  "allowed_paths": [
    ".",
    "../",
    "../utils",
    "../docs"
  ]
}
```

## Implementation

### Changes Made

**File**: `src/config-manager.js`

```javascript
async getAllowedPaths(projectDir) {
  const paths = [projectDir];
  
  // Resolve relative paths from project directory
  if (this.config?.allowed_paths && Array.isArray(this.config.allowed_paths)) {
    const resolvedPaths = this.config.allowed_paths.map(p => resolve(projectDir, p));
    paths.push(...resolvedPaths);
  }
  
  // Auto-detect workspace folders
  const workspaceFile = await findWorkspaceFile(projectDir);
  if (workspaceFile) {
    const workspacePaths = await parseWorkspaceFile(workspaceFile);
    paths.push(...workspacePaths);
  }
  
  return [...new Set(paths)]; // Remove duplicates
}
```

### Testing

**File**: `test-relative-paths.js`

All 5 tests passing:
1. ✅ Current directory (.) included
2. ✅ Parent directory (..) resolved
3. ✅ Sibling directory (../sibling) resolved
4. ✅ Grandparent directory (../../) resolved
5. ✅ No duplicate paths

## Installation

```bash
# Copy workspace preset to your project
cp preset-configs/workspace.json /path/to/project/.amazon-q-history/config.json

# Edit to add your specific paths
nano /path/to/project/.amazon-q-history/config.json
```

## Example Configurations

### VS Code Workspace

If you have a `.code-workspace` file, paths are auto-detected. But you can also manually specify:

```json
{
  "storage_mode": "project",
  "allowed_paths": [
    ".",
    "../raven-master",
    "../raven-master/projects/heili-project",
    "../raven-master/projects/loki-project",
    "../raven-master/projects/hugin-project"
  ]
}
```

### Sibling Projects

```json
{
  "storage_mode": "project",
  "allowed_paths": [
    ".",
    "../project-a",
    "../project-b",
    "../shared-lib"
  ]
}
```

### Parent and Children

```json
{
  "storage_mode": "project",
  "allowed_paths": [
    ".",
    "../",
    "./subproject1",
    "./subproject2"
  ]
}
```

## Security Notes

- Paths are validated against the allowed list
- Sensitive patterns (`.env`, `.ssh`, etc.) are still blocked
- Path traversal attacks prevented by validation
- Relative paths resolved before validation

## Benefits

1. **Flexible workspace support** - Work across multiple related projects
2. **Simple configuration** - Use relative paths instead of absolute
3. **Portable configs** - Works on different machines/users
4. **Auto-detection** - Workspace files still auto-detected
5. **Secure** - Path validation still enforced

## Backward Compatibility

✅ Fully backward compatible
- Existing absolute paths still work
- Configs without `allowed_paths` work as before
- No breaking changes
