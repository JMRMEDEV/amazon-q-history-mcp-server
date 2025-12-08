import { resolve, normalize } from 'path';
import { minimatch } from 'minimatch';

const SENSITIVE_PATTERNS = [
  '**/.env*',
  '**/*.key',
  '**/*.pem',
  '**/.ssh/**',
  '**/secrets/**',
  '**/.aws/**',
  '**/credentials',
  '**/.npmrc',
  '**/.pypirc'
];

const IGNORED_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/storage/sessions/**',
  '**/tmp/**',
  '**/*.log'
];

export function validatePath(inputPath, allowedPaths = [process.cwd()]) {
  const normalized = normalize(inputPath);
  const resolved = resolve(normalized);
  
  // Check if path is within any allowed path
  const isAllowed = allowedPaths.some(allowedPath => resolved.startsWith(allowedPath));
  if (!isAllowed) {
    throw new Error('Path not in allowed paths list');
  }
  
  // Check sensitive patterns
  for (const pattern of SENSITIVE_PATTERNS) {
    if (minimatch(resolved, pattern, { dot: true })) {
      throw new Error(`Access to sensitive path blocked: matches pattern ${pattern}`);
    }
  }
  
  return resolved;
}

export function validateToolInput(name, args, allowedPaths = [process.cwd()]) {
  switch (name) {
    case 'auto_track_operations':
      if (args.watch_directory) {
        args.watch_directory = validatePath(args.watch_directory, allowedPaths);
      }
      break;
      
    case 'log_action':
      if (args.action && args.action.length > 1000) {
        throw new Error('Action description too long (max 1000 characters)');
      }
      if (args.files_changed) {
        args.files_changed = args.files_changed.map(f => validatePath(f, allowedPaths));
      }
      break;
      
    case 'log_prompt':
      if (args.prompt && args.prompt.length > 10000) {
        throw new Error('Prompt too long (max 10000 characters)');
      }
      break;
      
    case 'track_session':
      if (args.agent_name && args.agent_name.length > 100) {
        throw new Error('Agent name too long (max 100 characters)');
      }
      break;
  }
  
  return args;
}

export function shouldIgnorePath(filePath) {
  for (const pattern of IGNORED_PATTERNS) {
    if (minimatch(filePath, pattern, { dot: true })) {
      return true;
    }
  }
  return false;
}

export { SENSITIVE_PATTERNS, IGNORED_PATTERNS };
