/**
 * Normalize agent name for use in session IDs
 * Converts to lowercase kebab-case
 */
export function normalizeAgentName(name) {
  if (!name) return 'amazon-q';
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Parse workspace file and extract folder paths
 */
export async function parseWorkspaceFile(workspacePath) {
  const { promises: fs } = await import('fs');
  const { dirname, resolve } = await import('path');
  
  try {
    const content = await fs.readFile(workspacePath, 'utf8');
    const workspace = JSON.parse(content);
    const workspaceDir = dirname(workspacePath);
    
    if (!workspace.folders || !Array.isArray(workspace.folders)) {
      return [];
    }
    
    return workspace.folders
      .map(f => resolve(workspaceDir, f.path))
      .filter(Boolean);
  } catch (e) {
    return [];
  }
}

/**
 * Find workspace file in directory or parents
 */
export async function findWorkspaceFile(startDir) {
  const { promises: fs } = await import('fs');
  const { join, dirname } = await import('path');
  
  let dir = startDir;
  const root = dirname(dir);
  
  while (dir !== root) {
    try {
      const files = await fs.readdir(dir);
      const workspaceFile = files.find(f => f.endsWith('.code-workspace'));
      if (workspaceFile) {
        return join(dir, workspaceFile);
      }
    } catch (e) {
      // Continue searching
    }
    dir = dirname(dir);
  }
  
  return null;
}
