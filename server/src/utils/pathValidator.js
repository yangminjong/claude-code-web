import { resolve } from 'path';
import { lstatSync } from 'fs';

export class PathTraversalError extends Error {
  constructor(message = '경로 접근이 거부되었습니다') {
    super(message);
    this.code = 'PATH_TRAVERSAL_DENIED';
    this.status = 403;
  }
}

export function validatePath(userRoot, requestedPath) {
  // Block absolute paths
  if (requestedPath.startsWith('/')) {
    throw new PathTraversalError('절대경로 접근이 차단되었습니다');
  }

  const resolved = resolve(userRoot, requestedPath);

  // Ensure resolved path is within userRoot
  if (!resolved.startsWith(resolve(userRoot))) {
    throw new PathTraversalError('경로 이탈이 감지되었습니다');
  }

  // Check for symlinks
  try {
    const stat = lstatSync(resolved);
    if (stat.isSymbolicLink()) {
      throw new PathTraversalError('심볼릭 링크 접근이 차단되었습니다');
    }
  } catch (err) {
    if (err instanceof PathTraversalError) throw err;
    // File doesn't exist yet — that's ok for uploads
  }

  return resolved;
}
