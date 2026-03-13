import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { getDb, closeDb } from './db/connection.js';
import { setupWebSocket } from './ws/wsServer.js';
import { startHeartbeatChecker } from './services/sessionManager.js';
import authRoutes from './routes/auth.js';
import sessionRoutes from './routes/sessions.js';
import fileRoutes from './routes/files.js';
import logRoutes from './routes/logs.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/logs', logRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, data: { status: 'running' } });
});

// Serve static client build in production
const clientDist = resolve(__dirname, '../../client/dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/ws')) {
      res.sendFile(join(clientDist, 'index.html'));
    }
  });
}

// Error handler
app.use((err, req, res, next) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({
    ok: false,
    error: { code: 'INTERNAL', message: '서버 내부 오류가 발생했습니다' }
  });
});

// Initialize
const db = getDb();
console.log('[server] Database initialized');

const server = createServer(app);
setupWebSocket(server);
startHeartbeatChecker();

server.listen(PORT, () => {
  console.log(`[server] Claude Code Web server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[server] SIGTERM received, shutting down...');
  server.close(() => {
    closeDb();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[server] SIGINT received, shutting down...');
  server.close(() => {
    closeDb();
    process.exit(0);
  });
});
