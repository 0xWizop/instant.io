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
      case 'keybindUpdate':
        // Store keybinds client-side only, server doesn't need them
        break;
      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  startGameLoop() {
    const TPS = 60;
    const tickInterval = 1000 / TPS;
    
    setInterval(() => {
      this.world.tick();
      this.broadcastState();
    }, tickInterval);
  }

  broadcastState() {
    const snapshot = this.world.getSnapshot();
    const message = JSON.stringify({
      type: 'snapshot',
      ...snapshot
    });

    this.clients.forEach((client) => {
      if (client.ws.readyState === 1) { // OPEN
        try {
          client.ws.send(message);
        } catch (e) {
          console.error('Error sending to client:', e);
        }
      }
    });
  }
}

