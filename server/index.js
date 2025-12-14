import express from 'express';
import { WebSocketServer } from 'ws';
import { GameServer } from './GameServer.js';

const PORT = process.env.PORT || 3000;
// Render uses port 10000, Cloud Run uses PORT env var
const app = express();

// CORS headers for Firebase Hosting
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Serve static files
app.use(express.static('client'));

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// WebSocket server with optimized low latency settings
const wss = new WebSocketServer({ 
  server,
  perMessageDeflate: false, // Disable compression for lower latency
  maxPayload: 100 * 1024, // 100KB max payload
  clientTracking: true, // Enable client tracking for better performance
  // TCP_NODELAY equivalent - send immediately without buffering
  noDelay: true
});

// Optimize server for low latency
server.keepAlive = true;
server.keepAliveInitialDelay = 0;
const gameServer = new GameServer(wss);

console.log(`Game server initialized`);

