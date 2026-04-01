# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Code Web is a full-stack web application that wraps the Claude Code CLI in a browser-based UI. It provides multi-session chat with persistent history, a Monaco-based code editor, SSH/SFTP remote workspace support, and real-time streaming via WebSocket.

## Repository Structure

This is an **npm workspaces monorepo** with two packages:

- `server/` — Node.js + Express backend (ES modules, `"type": "module"`)
- `client/` — React 19 + Vite frontend
- `data/` — Runtime data directory (SQLite DB, not in git)

## Commands

### Development

```bash
# Install all dependencies (run from root)
npm install

# Start server (port 3000, auto-reload)
cd server && npm run dev

# Start client dev server (port 5173, proxies to server)
cd client && npm run dev

# Initialize database manually (normally auto-creates on server start)
cd server && npm run db:init
```

### Production

```bash
cd client && npm run build    # Build client to client/dist/
cd server && npm run start    # Serves API + static client build
```

## Architecture

### Backend (server/)

- **Entry point**: `src/app.js` — Express server + WebSocket setup
- **Database**: SQLite3 (better-sqlite3, WAL mode). Schema in `src/db/schema.sql`, connection singleton in `src/db/connection.js` with auto-migration.
- **Auth**: JWT tokens (Bearer header or `?token=` query param). Middleware in `src/middleware/authenticate.js`.
- **API routes** (`src/routes/`): auth, sessions, files, sshProfiles, cliSessions, logs
- **Services** (`src/services/`):
  - `processManager.js` — Spawns Claude CLI via node-pty with `--output-format stream-json`. Handles local mode and SSH/SSHFS mode.
  - `sessionManager.js` — Session lifecycle, message storage, idle timeout.
  - `sshProfileManager.js` — SSH credential encryption (AES-256-GCM), SFTP browsing.
  - `cliSessionService.js` — Scans `~/.claude/projects/` for CLI sessions, supports adoption into web sessions.
- **WebSocket** (`src/ws/`):
  - `wsServer.js` — JWT auth on connection
  - `wsHandler.js` — Message handling, Claude CLI process streaming, reconnection recovery with messageId matching, heartbeat

### Frontend (client/)

- **Entry**: `src/main.jsx` → `src/App.jsx` (React Router with auth guards)
- **Layout**: `AppShell.jsx` — sidebar (sessions) + main content (chat/editor) + explorer panel (files)
- **State management**: Zustand stores in `src/stores/`:
  - `authStore` — JWT, user profile
  - `sessionStore` — Chat sessions and messages
  - `editorStore` — Monaco editor tabs, file content
  - `explorerStore` — File tree navigation
  - `themeStore` — 6 themes (dark, dimmed, light, solarized, nord, monokai)
  - `sshProfileStore`, `cliSessionStore`
- **Key hook**: `useWebSocket.js` — WebSocket connection with exponential backoff reconnection, messageId-based request-response matching, message queue buffering, response recovery on reconnect
- **API client**: `src/api/client.js` — Fetch wrapper with auto JWT attachment
- **Vite config**: Dev server on 5173, proxies `/api`, `/assets`, `/ws` to localhost:3000

### Data Flow (Chat)

1. Client sends `{ type: "message", content, messageId }` via WebSocket
2. Server stores message, spawns `claude -p {content} --output-format stream-json --resume {sessionId}`
3. Server streams `{ type: "assistant_chunk", content, messageId }` back
4. Client filters by messageId, accumulates streaming text
5. On process exit, server sends `assistant_end` with full response

### WebSocket Reconnection

- Exponential backoff (1s → 30s, max 20 attempts, 10% jitter)
- Server re-pipes buffered output if process still running on reconnect
- Unsent completed responses held for 60s for delivery on reconnect

## Environment Configuration

Copy `server/.env.example` to `server/.env`. Key variables:
- `JWT_SECRET` — Must change from default
- `WORKSPACE_ROOT` — Absolute path to user workspaces directory
- `DB_PATH` — SQLite database location (default: `../data/app.db`)
- `MAX_SESSIONS_PER_USER` — Concurrent session limit (default: 3)

## Key Patterns

- All server code uses ES module imports (`import`/`export`)
- Claude CLI is invoked with flags: `-p`, `--output-format stream-json`, `--verbose`, `--include-partial-messages`, `--dangerously-skip-permissions`, `--resume`
- SSH credentials are encrypted with AES-256-GCM before database storage
- Path traversal protection via `src/middleware/pathGuard.js` (rejects `../`, absolute paths, symlinks)
- No automated tests exist currently
