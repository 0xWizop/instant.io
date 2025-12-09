import express from 'express';
import { WebSocketServer } from 'ws';
import { GameServer } from './GameServer.js';

const PORT = process.env.PORT || 3000;
const app = express();

// Serve static files
app.use(express.static('client'));

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// WebSocket server
const wss = new WebSocketServer({ server });
const gameServer = new GameServer(wss);

console.log(`Game server initialized`);

