import { GameWorld } from './GameWorld.js';

export class GameServer {
  constructor(wss) {
    this.wss = wss;
    this.world = new GameWorld();
    this.clients = new Map(); // clientId -> {ws, playerId, lastInput}
    
    this.setupWebSocket();
    this.startGameLoop();
  }

  setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      const clientId = `${Date.now()}-${Math.random()}`;
      const playerId = this.world.createPlayer();
      
      this.clients.set(clientId, {
        ws,
        playerId,
        lastInput: { dirX: 0, dirY: 0 },
        lastInputTime: Date.now()
      });

      console.log(`Client connected: ${clientId}, Player: ${playerId}`);

      // Optimize WebSocket for low latency
      if (ws._socket) {
        ws._socket.setNoDelay(true); // Disable Nagle's algorithm
        ws._socket.setKeepAlive(true, 0); // Keep connection alive
      }

      // Send initial state
      ws.send(JSON.stringify({
        type: 'init',
        playerId,
        config: this.world.config
      }));

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(clientId, message);
        } catch (e) {
          console.error('Error parsing message:', e);
        }
      });

      ws.on('close', () => {
        this.world.removePlayer(playerId);
        this.clients.delete(clientId);
        console.log(`Client disconnected: ${clientId}`);
      });

      ws.on('error', (error) => {
        console.error(`WebSocket error for ${clientId}:`, error);
      });
    });
  }

  handleMessage(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (message.type) {
      case 'input':
        client.lastInput = message.input;
        client.lastInputTime = Date.now();
        this.world.handleInput(client.playerId, message.input);
        break;
      case 'action':
        this.world.handleAction(client.playerId, message.action);
        break;
      case 'setName':
        if (typeof message.name === 'string') {
          const player = this.world.players.get(client.playerId);
          if (player) {
            player.setName(message.name);
          }
        }
        break;
      case 'ping':
        // Respond to ping immediately with the timestamp
        if (client.ws.readyState === 1) { // OPEN
          client.ws.send(JSON.stringify({
            type: 'pong',
            timestamp: message.timestamp
          }));
        }
        break;
      case 'keybindUpdate':
        // Store keybinds client-side only, server doesn't need them
        break;
      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  startGameLoop() {
    const TPS = 60; // Increased to 60 for smoother physics
    const tickInterval = 1000 / TPS;
    
    setInterval(() => {
      this.world.tick();
      this.broadcastState();
    }, tickInterval);
  }

  broadcastState() {
    const snapshot = this.world.getSnapshot();
    
    // Optimize snapshot size - only send essential data
    const optimizedSnapshot = {
      type: 'snapshot',
      timestamp: snapshot.timestamp,
      players: snapshot.players.map(p => ({
        id: p.id,
        name: p.name,
        score: p.score,
        color: p.color,
        isBot: p.isBot,
        cells: p.cells.map(c => ({
          id: c.id,
          x: Math.round(c.x * 10) / 10, // Round to 1 decimal
          y: Math.round(c.y * 10) / 10,
          mass: Math.round(c.mass),
          ownerId: c.ownerId
        }))
      })),
      pellets: snapshot.pellets.map(p => ({
        id: p.id,
        x: Math.round(p.x),
        y: Math.round(p.y),
        mass: p.mass,
        color: p.color
      })),
      viruses: snapshot.viruses.map(v => ({
        id: v.id,
        x: Math.round(v.x),
        y: Math.round(v.y),
        mass: v.mass,
        color: v.color
      })),
      feedPellets: snapshot.feedPellets.map(p => ({
        id: p.id,
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10,
        mass: Math.round(p.mass)
      })),
      virusProjectiles: snapshot.virusProjectiles.map(p => ({
        id: p.id,
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10,
        mass: Math.round(p.mass)
      }))
    };
    
    const message = JSON.stringify(optimizedSnapshot);

    // Batch send to all clients efficiently
    const messageBuffer = Buffer.from(message);
    this.clients.forEach((client) => {
      if (client.ws.readyState === 1) { // OPEN
        try {
          // Send without buffering for lowest latency
          client.ws.send(messageBuffer, { binary: false });
        } catch (e) {
          console.error('Error sending to client:', e);
        }
      }
    });
  }
}

