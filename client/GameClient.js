// PIXI.js is loaded globally via script tag
const PIXI = window.PIXI;

export class GameClient {
  constructor(canvas, keybindManager) {
    this.canvas = canvas;
    this.keybindManager = keybindManager;
    this.ws = null;
    this.playerId = null;
    this.config = null;

    // Game state
    this.players = new Map();
    this.pellets = new Map();
    this.viruses = new Map();
    this.feedPellets = new Map();
    this.virusProjectiles = new Map();

    // Interpolation
    this.serverState = null;
    this.clientState = null;
    this.lastSnapshotTime = 0;
    this.interpolationDelay = 50; // 50ms delay for interpolation

    // Input
    this.mouseX = 0;
    this.mouseY = 0;
    this.inputDirX = 0;
    this.inputDirY = 0;
    this.lastInputTime = 0;
    this.inputRate = 1000 / 60; // 60Hz

    // Ping
    this.ping = 0;
    this.lastPingTime = 0;

    // Zoom
    this.zoom = 1.0;
    this.targetZoom = 1.0;
    this.minZoom = 0.5; // Can't zoom in too much
    this.maxZoom = 2.0; // Base max zoom (will be adjusted by cell size)

    // Theme
    this.isDarkMode = true;
    this.darkBgColor = 0x0d1117;
    this.lightBgColor = 0xf5f5f5;
    this.darkGridColor = 0x1a1f2e;
    this.lightGridColor = 0xe0e0e0;

    // Setup PIXI
    this.app = new PIXI.Application({
      view: canvas,
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: this.darkBgColor,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true
    });

    this.stage = this.app.stage;
    this.setupLayers();
    this.setupInput();
    this.setupResize();

    // Start render loop
    this.app.ticker.add(() => this.render());
  }

  setTheme(isDarkMode) {
    this.isDarkMode = isDarkMode;
    this.app.renderer.backgroundColor = isDarkMode ? this.darkBgColor : this.lightBgColor;
    this.drawBackground();
  }

  setupLayers() {
    // Background layer (grid/hex pattern)
    this.backgroundLayer = new PIXI.Container();
    this.stage.addChild(this.backgroundLayer);

    // Game objects layer
    this.gameLayer = new PIXI.Container();
    this.stage.addChild(this.gameLayer);

    // UI layer
    this.uiLayer = new PIXI.Container();
    this.stage.addChild(this.uiLayer);

    // Initialize background
    this.drawBackground();
  }

  drawBackground() {
    // Clear existing background
    this.backgroundLayer.removeChildren();

    if (!this.config) {
      // Draw default background until config is loaded
      this.drawGridPattern(5000, 5000);
      return;
    }

    const mapWidth = this.config.mapWidth || 5000;
    const mapHeight = this.config.mapHeight || 5000;

    // Draw grid pattern
    this.drawGridPattern(mapWidth, mapHeight);

    // Draw map borders
    this.drawMapBorders(mapWidth, mapHeight);
  }

  drawGridPattern(mapWidth, mapHeight) {
    const gridSize = 50;
    const gridColor = this.isDarkMode ? this.darkGridColor : this.lightGridColor;
    const gridAlpha = this.isDarkMode ? 0.3 : 0.5;

    const gridGraphics = new PIXI.Graphics();
    gridGraphics.lineStyle(1, gridColor, gridAlpha);

    // Vertical lines
    for (let x = 0; x <= mapWidth; x += gridSize) {
      gridGraphics.moveTo(x, 0);
      gridGraphics.lineTo(x, mapHeight);
    }

    // Horizontal lines
    for (let y = 0; y <= mapHeight; y += gridSize) {
      gridGraphics.moveTo(0, y);
      gridGraphics.lineTo(mapWidth, y);
    }

    this.backgroundLayer.addChild(gridGraphics);
  }

  drawMapBorders(mapWidth, mapHeight) {
    const borderGraphics = new PIXI.Graphics();
    const borderColor = this.isDarkMode ? 0x4a5568 : 0x999999;
    const borderWidth = 4;

    borderGraphics.lineStyle(borderWidth, borderColor, 1);

    // Draw border rectangle
    borderGraphics.drawRect(0, 0, mapWidth, mapHeight);

    // Add corner markers
    const cornerSize = 30;
    const cornerColor = this.isDarkMode ? 0x6b7280 : 0x777777;
    borderGraphics.lineStyle(3, cornerColor, 1);

    // Top-left corner
    borderGraphics.moveTo(0, cornerSize);
    borderGraphics.lineTo(0, 0);
    borderGraphics.lineTo(cornerSize, 0);

    // Top-right corner
    borderGraphics.moveTo(mapWidth - cornerSize, 0);
    borderGraphics.lineTo(mapWidth, 0);
    borderGraphics.lineTo(mapWidth, cornerSize);

    // Bottom-left corner
    borderGraphics.moveTo(0, mapHeight - cornerSize);
    borderGraphics.lineTo(0, mapHeight);
    borderGraphics.lineTo(cornerSize, mapHeight);

    // Bottom-right corner
    borderGraphics.moveTo(mapWidth - cornerSize, mapHeight);
    borderGraphics.lineTo(mapWidth, mapHeight);
    borderGraphics.lineTo(mapWidth, mapHeight - cornerSize);

    this.backgroundLayer.addChild(borderGraphics);
  }

  setupInput() {
    // Mouse movement
    this.app.view.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
    });

    // Mouse wheel for zoom
    this.app.view.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
      this.targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.targetZoom + zoomDelta));
    });

    // Keyboard input
    document.addEventListener('keydown', (e) => {
      this.handleKeyPress(e, true);
    });

    document.addEventListener('keyup', (e) => {
      this.handleKeyPress(e, false);
    });

    // Prevent context menu
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  handleKeyPress(event, isDown) {
    if (!isDown) return;

    const keybinds = this.keybindManager;

    if (keybinds.isPressed('split', event)) {
      this.sendAction('split');
    } else if (keybinds.isPressed('doubleSplit', event)) {
      this.sendAction('doubleSplit');
    } else if (keybinds.isPressed('tripleSplit', event)) {
      this.sendAction('tripleSplit');
    } else if (keybinds.isPressed('split16', event)) {
      this.sendAction('split16');
    } else if (keybinds.isPressed('split32', event)) {
      this.sendAction('split32');
    } else if (keybinds.isPressed('feed', event)) {
      this.sendAction('feed');
    } else if (keybinds.isPressed('macroFeed', event)) {
      this.sendAction('macroFeed');
    } else if (keybinds.isPressed('stop', event)) {
      this.sendAction('stop');
    } else if (keybinds.isPressed('respawn', event)) {
      this.sendAction('respawn');
    }
  }

  setupResize() {
    window.addEventListener('resize', () => {
      this.app.renderer.resize(window.innerWidth, window.innerHeight);
      // Redraw background if config is loaded
      if (this.config) {
        this.drawBackground();
      }
    });
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('Connected to server');
      this.startInputLoop();
      this.startPingLoop();
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (e) {
        console.error('Error parsing message:', e);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = () => {
      console.log('Disconnected from server');
      setTimeout(() => this.connect(), 3000);
    };
  }

  handleMessage(message) {
    switch (message.type) {
      case 'init':
        this.playerId = message.playerId;
        this.config = message.config;
        this.drawBackground(); // Redraw background with correct map size
        break;
      case 'snapshot':
        this.handleSnapshot(message);
        break;
    }
  }

  handleSnapshot(snapshot) {
    this.serverState = snapshot;
    this.lastSnapshotTime = Date.now();

    // Update ping
    if (this.lastPingTime > 0) {
      this.ping = Date.now() - this.lastPingTime;
      document.getElementById('pingValue').textContent = this.ping;
    }

    // Update game entities
    this.updateEntities(snapshot);
  }

  updateEntities(snapshot) {
    // Remove disconnected players first
    const existingPlayerIds = new Set(snapshot.players.map(p => p.id));
    this.players.forEach((player, id) => {
      if (!existingPlayerIds.has(id)) {
        this.removePlayerEntity(id);
      }
    });

    // Update players
    snapshot.players.forEach((playerData) => {
      if (!this.players.has(playerData.id)) {
        this.createPlayerEntity(playerData);
      }
      this.updatePlayerEntity(playerData);
    });

    // Update pellets
    snapshot.pellets.forEach((pelletData) => {
      if (!this.pellets.has(pelletData.id)) {
        this.createPelletEntity(pelletData);
      }
      this.updatePelletEntity(pelletData);
    });

    // Update viruses
    snapshot.viruses.forEach((virusData) => {
      if (!this.viruses.has(virusData.id)) {
        this.createVirusEntity(virusData);
      }
      this.updateVirusEntity(virusData);
    });

    // Update feed pellets
    snapshot.feedPellets?.forEach((pelletData) => {
      if (!this.feedPellets.has(pelletData.id)) {
        this.createFeedPelletEntity(pelletData);
      }
      this.updateFeedPelletEntity(pelletData);
    });

    // Update virus projectiles
    snapshot.virusProjectiles?.forEach((projectileData) => {
      if (!this.virusProjectiles.has(projectileData.id)) {
        this.createVirusProjectileEntity(projectileData);
      }
      this.updateVirusProjectileEntity(projectileData);
    });

    // Remove old entities
    this.cleanupEntities(snapshot);
  }

  createPlayerEntity(playerData) {
    const container = new PIXI.Container();
    const isLocal = playerData.id === this.playerId;
    playerData.cells.forEach((cellData) => {
      const cell = this.createCellGraphics(cellData, isLocal, playerData.name);
      container.addChild(cell);
    });
    this.gameLayer.addChild(container);
    this.players.set(playerData.id, { data: playerData, container });
  }

  updatePlayerEntity(playerData) {
    const player = this.players.get(playerData.id);
    if (!player) return;

    player.data = playerData;

    // Update cells
    const existingCells = player.container.children;
    const isLocal = playerData.id === this.playerId;
    playerData.cells.forEach((cellData, index) => {
      let cellGraphics;
      if (index < existingCells.length) {
        cellGraphics = existingCells[index];
      } else {
        cellGraphics = this.createCellGraphics(cellData, isLocal, playerData.name);
        player.container.addChild(cellGraphics);
      }
      this.updateCellGraphics(cellGraphics, cellData, isLocal, playerData.name);
    });

    // Remove extra cells
    while (player.container.children.length > playerData.cells.length) {
      player.container.removeChildAt(player.container.children.length - 1);
    }

    // Update stats for local player
    if (playerData.id === this.playerId) {
      const totalMass = playerData.cells.reduce((sum, cell) => sum + cell.mass, 0);
      document.getElementById('mass').textContent = Math.floor(totalMass);
      document.getElementById('cells').textContent = playerData.cells.length;
      document.getElementById('score').textContent = playerData.score || 0;
    }
  }

  createCellGraphics(cellData, isLocal, playerName) {
    const radius = this.massToRadius(cellData.mass);
    const graphics = new PIXI.Graphics();
    graphics.cellData = cellData;
    graphics.isLocal = isLocal;
    graphics.playerName = playerName;
    
    this.drawCell(graphics, cellData, radius, isLocal, playerName);
    return graphics;
  }

  updateCellGraphics(graphics, cellData, isLocal, playerName) {
    graphics.cellData = cellData;
    graphics.playerName = playerName;
    const radius = this.massToRadius(cellData.mass);
    graphics.clear();
    this.drawCell(graphics, cellData, radius, isLocal, playerName);
  }

  drawCell(graphics, cellData, radius, isLocal, playerName) {
    const isBot = playerName && playerName.startsWith('Bot');
    
    let color, borderColor;
    if (isLocal) {
      color = 0x00ff00; // Green for local player
      borderColor = 0x00ffff; // Cyan border
    } else if (isBot) {
      color = 0xffaa00; // Orange for bots
      borderColor = 0xff6600; // Darker orange border
    } else {
      color = 0xff6b6b; // Red for other players
      borderColor = 0xff0000; // Dark red border
    }

    graphics.beginFill(color);
    graphics.lineStyle(2, borderColor);
    graphics.drawCircle(0, 0, radius);
    graphics.endFill();
  }

  createPelletEntity(pelletData) {
    const radius = this.massToRadius(pelletData.mass);
    const graphics = new PIXI.Graphics();
    graphics.pelletData = pelletData;
    
    const color = this.hexToNumber(pelletData.color || '#ffffff');
    graphics.beginFill(color);
    graphics.drawCircle(0, 0, radius);
    graphics.endFill();

    this.gameLayer.addChild(graphics);
    this.pellets.set(pelletData.id, graphics);
  }

  updatePelletEntity(pelletData) {
    const graphics = this.pellets.get(pelletData.id);
    if (!graphics) return;

    graphics.pelletData = pelletData;
    const radius = this.massToRadius(pelletData.mass);
    graphics.clear();
    
    const color = this.hexToNumber(pelletData.color || '#ffffff');
    graphics.beginFill(color);
    graphics.drawCircle(0, 0, radius);
    graphics.endFill();
  }

  createVirusEntity(virusData) {
    const radius = this.massToRadius(virusData.mass);
    const graphics = new PIXI.Graphics();
    graphics.virusData = virusData;
    
    graphics.beginFill(0x00ff00);
    graphics.lineStyle(3, 0x00aa00);
    graphics.drawCircle(0, 0, radius);
    graphics.endFill();

    this.gameLayer.addChild(graphics);
    this.viruses.set(virusData.id, graphics);
  }

  updateVirusEntity(virusData) {
    const graphics = this.viruses.get(virusData.id);
    if (!graphics) return;

    graphics.virusData = virusData;
    const radius = this.massToRadius(virusData.mass);
    graphics.clear();
    
    graphics.beginFill(0x00ff00);
    graphics.lineStyle(3, 0x00aa00);
    graphics.drawCircle(0, 0, radius);
    graphics.endFill();
  }

  createFeedPelletEntity(pelletData) {
    const radius = this.massToRadius(pelletData.mass);
    const graphics = new PIXI.Graphics();
    graphics.pelletData = pelletData;
    
    graphics.beginFill(0xffff00);
    graphics.drawCircle(0, 0, radius);
    graphics.endFill();

    this.gameLayer.addChild(graphics);
    this.feedPellets.set(pelletData.id, graphics);
  }

  updateFeedPelletEntity(pelletData) {
    const graphics = this.feedPellets.get(pelletData.id);
    if (!graphics) return;

    graphics.pelletData = pelletData;
    const radius = this.massToRadius(pelletData.mass);
    graphics.clear();
    
    graphics.beginFill(0xffff00);
    graphics.drawCircle(0, 0, radius);
    graphics.endFill();
  }

  createVirusProjectileEntity(projectileData) {
    const radius = this.massToRadius(projectileData.mass);
    const graphics = new PIXI.Graphics();
    graphics.projectileData = projectileData;
    
    graphics.beginFill(0xff00ff);
    graphics.lineStyle(2, 0xff0088);
    graphics.drawCircle(0, 0, radius);
    graphics.endFill();

    this.gameLayer.addChild(graphics);
    this.virusProjectiles.set(projectileData.id, graphics);
  }

  updateVirusProjectileEntity(projectileData) {
    const graphics = this.virusProjectiles.get(projectileData.id);
    if (!graphics) return;

    graphics.projectileData = projectileData;
    const radius = this.massToRadius(projectileData.mass);
    graphics.clear();
    
    graphics.beginFill(0xff00ff);
    graphics.lineStyle(2, 0xff0088);
    graphics.drawCircle(0, 0, radius);
    graphics.endFill();
  }

  removePlayerEntity(playerId) {
    const player = this.players.get(playerId);
    if (player) {
      this.gameLayer.removeChild(player.container);
      this.players.delete(playerId);
    }
  }

  cleanupEntities(snapshot) {
    // Remove pellets not in snapshot
    const pelletIds = new Set(snapshot.pellets.map(p => p.id));
    this.pellets.forEach((graphics, id) => {
      if (!pelletIds.has(id)) {
        this.gameLayer.removeChild(graphics);
        this.pellets.delete(id);
      }
    });

    // Remove viruses not in snapshot
    const virusIds = new Set(snapshot.viruses.map(v => v.id));
    this.viruses.forEach((graphics, id) => {
      if (!virusIds.has(id)) {
        this.gameLayer.removeChild(graphics);
        this.viruses.delete(id);
      }
    });

    // Remove feed pellets not in snapshot
    const feedPelletIds = new Set((snapshot.feedPellets || []).map(p => p.id));
    this.feedPellets.forEach((graphics, id) => {
      if (!feedPelletIds.has(id)) {
        this.gameLayer.removeChild(graphics);
        this.feedPellets.delete(id);
      }
    });

    // Remove virus projectiles not in snapshot
    const projectileIds = new Set((snapshot.virusProjectiles || []).map(p => p.id));
    this.virusProjectiles.forEach((graphics, id) => {
      if (!projectileIds.has(id)) {
        this.gameLayer.removeChild(graphics);
        this.virusProjectiles.delete(id);
      }
    });
  }

  massToRadius(mass) {
    return Math.sqrt(mass / Math.PI) * 2;
  }

  hexToNumber(hex) {
    if (!hex) return 0xffffff;
    // Handle HSL colors
    if (hex.startsWith('hsl')) {
      const match = hex.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
      if (match) {
        const h = parseInt(match[1]) / 360;
        const s = parseInt(match[2]) / 100;
        const l = parseInt(match[3]) / 100;
        return this.hslToHex(h, s, l);
      }
    }
    // Handle hex colors
    return parseInt(hex.replace('#', ''), 16);
  }

  hslToHex(h, s, l) {
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return ((Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255));
  }

  startInputLoop() {
    setInterval(() => {
      this.sendInput();
    }, this.inputRate);
  }

  sendInput() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (!this.playerId) return;

    // Calculate direction to mouse
    const localPlayer = this.players.get(this.playerId);
    if (!localPlayer || localPlayer.data.cells.length === 0) {
      this.inputDirX = 0;
      this.inputDirY = 0;
    } else {
      // Get player center
      const centerX = localPlayer.data.cells.reduce((sum, cell) => sum + cell.x, 0) / localPlayer.data.cells.length;
      const centerY = localPlayer.data.cells.reduce((sum, cell) => sum + cell.y, 0) / localPlayer.data.cells.length;
      
      // Convert screen coordinates to world coordinates (accounting for zoom)
      const worldMouseX = (this.mouseX - this.app.screen.width / 2) / this.zoom + centerX;
      const worldMouseY = (this.mouseY - this.app.screen.height / 2) / this.zoom + centerY;
      
      const dx = worldMouseX - centerX;
      const dy = worldMouseY - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      this.inputDirX = dist > 0 ? dx / dist : 0;
      this.inputDirY = dist > 0 ? dy / dist : 0;
    }

    // Convert screen mouse to world coordinates for cursor (accounting for zoom)
    let worldCursorX = 0;
    let worldCursorY = 0;
    const localPlayerForCursor = this.players.get(this.playerId);
    if (localPlayerForCursor && localPlayerForCursor.data.cells.length > 0) {
      const centerX = localPlayerForCursor.data.cells.reduce((sum, cell) => sum + cell.x, 0) / localPlayerForCursor.data.cells.length;
      const centerY = localPlayerForCursor.data.cells.reduce((sum, cell) => sum + cell.y, 0) / localPlayerForCursor.data.cells.length;
      worldCursorX = (this.mouseX - this.app.screen.width / 2) / this.zoom + centerX;
      worldCursorY = (this.mouseY - this.app.screen.height / 2) / this.zoom + centerY;

      this.ws.send(JSON.stringify({
        type: 'input',
        input: {
          dirX: this.inputDirX,
          dirY: this.inputDirY,
          cursorX: worldCursorX,
          cursorY: worldCursorY
        }
      }));
  }

  sendAction(actionType) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (!this.playerId) return;

    this.ws.send(JSON.stringify({
      type: 'action',
      action: {
        type: actionType
      }
    }));
  }

  startPingLoop() {
    setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.lastPingTime = Date.now();
      }
    }, 1000);
  }

  render() {
    if (!this.serverState) return;

    // Calculate camera position (follow local player)
    const localPlayer = this.players.get(this.playerId);
    if (localPlayer && localPlayer.data.cells.length > 0) {
      const centerX = localPlayer.data.cells.reduce((sum, cell) => sum + cell.x, 0) / localPlayer.data.cells.length;
      const centerY = localPlayer.data.cells.reduce((sum, cell) => sum + cell.y, 0) / localPlayer.data.cells.length;

      // Calculate zoom based on largest cell size
      const largestCell = localPlayer.data.cells.reduce((largest, cell) => 
        cell.mass > largest.mass ? cell : largest, localPlayer.data.cells[0]);
      const cellRadius = Math.sqrt(largestCell.mass / Math.PI) * 2;
      
      // Dynamic max zoom: larger cells can zoom out more, but with caps
      // Base viewport is ~800px, so we want to see at least 2x the cell radius
      const baseViewport = Math.min(this.app.screen.width, this.app.screen.height);
      const minVisibleRadius = baseViewport / 4; // Want to see at least 4x cell radius
      const maxZoomBySize = Math.min(3.0, Math.max(1.0, minVisibleRadius / cellRadius));
      this.maxZoom = Math.min(2.5, maxZoomBySize); // Cap at 2.5x to prevent seeing too much

      // Smooth zoom interpolation
      const zoomSpeed = 0.1;
      this.zoom += (this.targetZoom - this.zoom) * zoomSpeed;

      // Apply camera offset with zoom
      const offsetX = (this.app.screen.width / 2) / this.zoom - centerX;
      const offsetY = (this.app.screen.height / 2) / this.zoom - centerY;
      
      // Apply zoom and position to layers
      this.backgroundLayer.scale.set(this.zoom);
      this.backgroundLayer.x = offsetX * this.zoom;
      this.backgroundLayer.y = offsetY * this.zoom;
      
      this.gameLayer.scale.set(this.zoom);
      this.gameLayer.x = offsetX * this.zoom;
      this.gameLayer.y = offsetY * this.zoom;
    }

    // Render all entities
    this.renderPlayers();
    this.renderPellets();
    this.renderViruses();
    this.renderFeedPellets();
    this.renderVirusProjectiles();

    // Update leaderboard
    this.updateLeaderboard();
  }

  renderPlayers() {
    this.players.forEach((player, playerId) => {
      const isLocal = playerId === this.playerId;
      player.data.cells.forEach((cellData, index) => {
        const cellGraphics = player.container.children[index];
        if (cellGraphics) {
          // Improved interpolation for smoother, more fluid movement
          // Use higher interpolation for remote players, lower for local (client prediction)
          const alpha = isLocal ? 0.25 : 0.12; // Smoother interpolation
          const targetX = cellData.x;
          const targetY = cellData.y;
          
          // Smooth position interpolation
          cellGraphics.x += (targetX - cellGraphics.x) * alpha;
          cellGraphics.y += (targetY - cellGraphics.y) * alpha;
        }
      });
    });
  }

  renderPellets() {
    this.pellets.forEach((graphics, id) => {
      if (graphics.pelletData) {
        // Smooth interpolation for pellets
        const alpha = 0.25;
        graphics.x += (graphics.pelletData.x - graphics.x) * alpha;
        graphics.y += (graphics.pelletData.y - graphics.y) * alpha;
      }
    });
  }

  renderViruses() {
    this.viruses.forEach((graphics, id) => {
      if (graphics.virusData) {
        // Smooth interpolation for viruses
        const alpha = 0.25;
        graphics.x += (graphics.virusData.x - graphics.x) * alpha;
        graphics.y += (graphics.virusData.y - graphics.y) * alpha;
      }
    });
  }

  renderFeedPellets() {
    this.feedPellets.forEach((graphics, id) => {
      if (graphics.pelletData) {
        graphics.x = graphics.pelletData.x;
        graphics.y = graphics.pelletData.y;
      }
    });
  }

  renderVirusProjectiles() {
    this.virusProjectiles.forEach((graphics, id) => {
      if (graphics.projectileData) {
        graphics.x = graphics.projectileData.x;
        graphics.y = graphics.projectileData.y;
      }
    });
  }

  updateLeaderboard() {
    const players = Array.from(this.players.values())
      .map(p => ({ name: p.data.name, score: p.data.score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    const list = document.getElementById('leaderboardList');
    list.innerHTML = '';

    players.forEach((player) => {
      const li = document.createElement('li');
      li.textContent = `${player.name}: ${player.score}`;
      list.appendChild(li);
    });
  }
}

