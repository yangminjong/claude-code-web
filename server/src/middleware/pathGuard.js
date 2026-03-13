import { resolve } from 'path';
import { validatePath, PathTraversalError } from '../utils/pathValidator.js';

const WORKSPACE_ROOT = () => resolve(process.env.WORKSPACE_ROOT || '../workspace');

export function pathGuard(req, res, next) {
  const requestedPath = req.query.path || req.body.path;
  if (!requestedPath) return next();

  try {
    const userRoot = resolve(WORKSPACE_ROOT(), req.user.email.split('@')[0]);
    req.resolvedPath = validatePath(userRoot, requestedPath);
    req.userRoot = userRoot;
    next();
  } catch (err) {
    if (err instanceof PathTraversalError) {
      return res.status(err.status).json({
        ok: false,
        error: { code: err.code, message: err.message }
      });
    }
    next(err);
  }
}
