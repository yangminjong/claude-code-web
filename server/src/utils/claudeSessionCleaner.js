import { readFileSync, writeFileSync, readdirSync, unlinkSync, existsSync } from 'fs';
import { resolve } from 'path';

const HOME = process.env.HOME || '/home/' + (process.env.USER || 'root');
const CLAUDE_DIR = resolve(HOME, '.claude');
const PROJECTS_DIR = resolve(CLAUDE_DIR, 'projects');
const HISTORY_FILE = resolve(CLAUDE_DIR, 'history.jsonl');

/**
 * Delete a Claude CLI session completely:
 *  1. JSONL session file in ~/.claude/projects/
 *  2. Subagents directory
 *  3. Entries in ~/.claude/history.jsonl
 */
export function deleteClaudeCliSession(claudeSessionId) {
  // 1. Delete JSONL session files from all project directories
  try {
    const dirs = readdirSync(PROJECTS_DIR);
    for (const dir of dirs) {
      const jsonlPath = resolve(PROJECTS_DIR, dir, `${claudeSessionId}.jsonl`);
      try {
        unlinkSync(jsonlPath);
        console.log(`[claude-cleaner] Deleted: ${jsonlPath}`);
      } catch {}
      // Delete subagents directory contents
      try {
        const subDir = resolve(PROJECTS_DIR, dir, claudeSessionId, 'subagents');
        if (existsSync(subDir)) {
          const subFiles = readdirSync(subDir);
          for (const sf of subFiles) unlinkSync(resolve(subDir, sf));
        }
      } catch {}
    }
  } catch {}

  // 2. Remove entries from history.jsonl
  try {
    if (!existsSync(HISTORY_FILE)) return;
    const content = readFileSync(HISTORY_FILE, 'utf-8');
    const filtered = content
      .split('\n')
      .filter(line => {
        if (!line.trim()) return false;
        try {
          return JSON.parse(line).sessionId !== claudeSessionId;
        } catch {
          return true;
        }
      })
      .join('\n') + '\n';
    writeFileSync(HISTORY_FILE, filtered);
    console.log(`[claude-cleaner] Removed ${claudeSessionId} from history.jsonl`);
  } catch (err) {
    console.error('[claude-cleaner] Error:', err.message);
  }
}
