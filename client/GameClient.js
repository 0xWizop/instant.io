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
    this.feedParticles = []; // Visual particles for feeding

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
    this.inputRate = 1000 / 60; // 60Hz to match server TPS

    // Ping
    this.ping = 0;
    this.lastPingTime = 0;

    // Zoom
    this.zoom = 1.0;
    this.targetZoom = 1.0;
    this.minZoom = 0.5; // Can't zoom in too much
    this.maxZoom = 2.0; // Base max zoom (will be adjusted by cell size)
    this.manualZoom = false; // Track if user manually zoomed

    // Session
    this.isPlaying = false;
    this.playerName = null;

    // Minimap
    this.minimapCanvas = document.getElementById('minimap');
    this.minimapCtx = this.minimapCanvas ? this.minimapCanvas.getContext('2d') : null;
    this.resizeMinimap();

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

    // Start render loop with smooth delta time
    this.lastFrameTime = performance.now();
    this.app.ticker.add((delta) => this.render(delta));
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
      this.manualZoom = true; // User is manually zooming
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
      this.resizeMinimap();
    });
  }

  resizeMinimap() {
    if (!this.minimapCanvas) return;
    const size = Math.min(200, Math.min(window.innerWidth, window.innerHeight) * 0.25);
    this.minimapCanvas.width = size;
    this.minimapCanvas.height = size;
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('Connected to server');
      this.startInputLoop();
      this.startPingLoop();
      if (this.playerName) {
        this.sendName(this.playerName);
      }
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
        if (this.playerName) {
          this.sendName(this.playerName);
        }
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

  setPlayerName(name) {
    if (!name) return;
    this.playerName = name;
    this.sendName(name);
  }

  setPlaying(isPlaying) {
    this.isPlaying = isPlaying;
  }

  sendName(name) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      type: 'setName',
      name
    }));
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
      const cell = this.createCellGraphics(cellData, isLocal, playerData.name, playerData.color);
      container.addChild(cell);
    });
    this.gameLayer.addChild(container);
    this.players.set(playerData.id, { data: playerData, container });
  }

  updatePlayerEntity(playerData) {
    const player = this.players.get(playerData.id);
    if (!player) return;

    const previousCellCount = player.data.cells ? player.data.cells.length : 0;
    player.data = playerData;

    // Update cells with smooth transitions
    const existingCells = player.container.children;
    const isLocal = playerData.id === this.playerId;
    playerData.cells.forEach((cellData, index) => {
      let cellGraphics;
      const isNewCell = index >= existingCells.length;
      if (isNewCell) {
        // New cell created (split) - animate in with smooth scale
        cellGraphics = this.createCellGraphics(cellData, isLocal, playerData.name, playerData.color);
        // Set initial position immediately to prevent interpolation from wrong position
        cellGraphics.x = cellData.x;
        cellGraphics.y = cellData.y;
        cellGraphics.scale.set(0); // Start at 0 scale for animation
        cellGraphics.animationTime = 0; // Animation timer
        cellGraphics.alpha = 1.0; // Start fully visible
        player.container.addChild(cellGraphics);
      } else {
        cellGraphics = existingCells[index];
        // Ensure smooth transitions for existing cells
        if (cellGraphics.animationTime === undefined) {
          cellGraphics.animationTime = undefined; // Not animating
        }
      }
      this.updateCellGraphics(cellGraphics, cellData, isLocal, playerData.name, playerData.color);
    });

    // Remove extra cells immediately (merge happens instantly, no fade needed)
    // The smooth interpolation will handle the visual transition
    while (player.container.children.length > playerData.cells.length) {
      player.container.removeChildAt(player.container.children.length - 1);
    }

    // Update stats for local player
    if (playerData.id === this.playerId) {
      document.getElementById('cells').textContent = playerData.cells.length;
      document.getElementById('score').textContent = playerData.score || 0;
    }
  }

  createCellGraphics(cellData, isLocal, playerName, playerColor) {
    const radius = this.massToRadius(cellData.mass);
    const container = new PIXI.Container();
    
    // Ensure container is fully opaque
    container.alpha = 1.0;
    
    // Create graphics for the cell circle
    const graphics = new PIXI.Graphics();
    graphics.cellData = cellData;
    graphics.isLocal = isLocal;
    graphics.playerName = playerName;
    graphics.alpha = 1.0; // Ensure graphics are fully opaque
    
    container.addChild(graphics);
    
    // Create text for player name (crisp rendering, properly centered)
    // Scale text size with cell radius - more aggressive scaling for larger cells
    const nameFontSize = Math.max(12, Math.min(radius * 0.5, 40)); // Scale more aggressively, max 40px
    const nameText = new PIXI.Text(playerName || 'Player', {
      fontFamily: 'Arial',
      fontSize: nameFontSize,
      fill: 0xffffff,
      align: 'center',
      stroke: 0x000000,
      strokeThickness: Math.max(2, Math.min(4, radius * 0.05)), // Scale stroke with size
      fontWeight: 'bold',
      resolution: window.devicePixelRatio || 1, // High DPI support
      roundPixels: true // Prevent blurry text
    });
    nameText.anchor.set(0.5, 0.5); // Center anchor
    nameText.x = 0;
    nameText.y = Math.round(-radius * 0.12); // Position name slightly above center with better spacing
    container.nameText = nameText;
    container.addChild(nameText);
    
    // Create text for cell mass (below name, crisp rendering, properly centered)
    // Scale text size with cell radius - more aggressive scaling for larger cells
    const massFontSize = Math.max(10, Math.min(radius * 0.4, 32)); // Scale more aggressively, max 32px
    const massText = new PIXI.Text(Math.floor(cellData.mass).toString(), {
      fontFamily: 'Arial',
      fontSize: massFontSize,
      fill: 0xffffff,
      align: 'center',
      stroke: 0x000000,
      strokeThickness: Math.max(1.5, Math.min(3, radius * 0.04)), // Scale stroke with size
      fontWeight: 'normal',
      resolution: window.devicePixelRatio || 1, // High DPI support
      roundPixels: true // Prevent blurry text
    });
    massText.anchor.set(0.5, 0.5); // Center anchor
    massText.x = 0;
    massText.y = Math.round(radius * 0.12); // Position mass below name with proper spacing
    container.massText = massText;
    container.addChild(massText);
    
    this.drawCell(graphics, cellData, radius, isLocal, playerName, playerColor);
    return container;
  }

  updateCellGraphics(container, cellData, isLocal, playerName, playerColor) {
    const graphics = container.children[0]; // Graphics is first child
    const nameText = container.nameText;
    const massText = container.massText;
    
    graphics.cellData = cellData;
    graphics.playerName = playerName;
    const radius = this.massToRadius(cellData.mass);
    
    // Store target scale for animation (only for split animation, not size changes)
    if (container.targetScale === undefined) {
      container.targetScale = 1.0;
    }
    
    graphics.clear();
    this.drawCell(graphics, cellData, radius, isLocal, playerName, playerColor);
    
    // Update name text - scale with cell size
    if (nameText) {
      nameText.text = playerName || 'Player';
      const nameFontSize = Math.max(12, Math.min(radius * 0.5, 40)); // Scale more aggressively, max 40px
      nameText.style.fontSize = nameFontSize;
      nameText.style.strokeThickness = Math.max(2, Math.min(4, radius * 0.05)); // Scale stroke
      nameText.y = Math.round(-radius * 0.12); // Better spacing, rounded for crisp rendering
      nameText.x = 0; // Ensure perfectly centered
      nameText.anchor.set(0.5, 0.5); // Ensure center anchor
      // Only show text if cell is large enough
      nameText.visible = radius > 20;
    }
    
    // Update mass text - scale with cell size
    if (massText) {
      massText.text = Math.floor(cellData.mass).toString();
      const massFontSize = Math.max(10, Math.min(radius * 0.4, 32)); // Scale more aggressively, max 32px
      massText.style.fontSize = massFontSize;
      massText.style.strokeThickness = Math.max(1.5, Math.min(3, radius * 0.04)); // Scale stroke
      massText.y = Math.round(radius * 0.12); // Better spacing, rounded for crisp rendering
      massText.x = 0; // Ensure perfectly centered
      massText.anchor.set(0.5, 0.5); // Ensure center anchor
      // Only show mass if cell is large enough
      massText.visible = radius > 20;
    }
  }

  drawCell(graphics, cellData, radius, isLocal, playerName, playerColor) {
    const isBot = playerName && playerName.startsWith('Bot');
    
    // Ensure cell is fully opaque (not translucent)
    graphics.alpha = 1.0;
    
    // Use player's color if available, otherwise fallback to defaults
    let color, borderColor;
    if (playerColor) {
      color = this.hexToNumber(playerColor);
      // Calculate darker border color by reducing lightness
      if (playerColor.startsWith('hsl')) {
        const match = playerColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
        if (match) {
          const h = parseInt(match[1]);
          const s = parseInt(match[2]);
          const l = Math.max(20, parseInt(match[3]) - 20); // Darker
          borderColor = this.hslToHex(h / 360, s / 100, l / 100);
        } else {
          borderColor = color * 0.6; // Fallback: darker version
        }
      } else {
        borderColor = color * 0.6; // Fallback: darker version
      }
    } else if (isLocal) {
      // Fallback: should rarely happen since server always sends color
      color = 0x00ff00; // Green for local player
      borderColor = 0x00ffff; // Cyan border
    } else if (isBot) {
      color = 0xffaa00; // Orange for bots
      borderColor = 0xff6600; // Darker orange border
    } else {
      color = 0xff6b6b; // Red for other players
      borderColor = 0xff0000; // Dark red border
    }

    graphics.beginFill(color, 1.0); // Explicitly set alpha to 1.0
    graphics.lineStyle(2, borderColor, 1.0); // Explicitly set alpha to 1.0
    graphics.drawCircle(0, 0, radius);
    graphics.endFill();
  }

  createPelletEntity(pelletData) {
    const radius = this.massToRadius(pelletData.mass);
    const graphics = new PIXI.Graphics();
    graphics.pelletData = pelletData;
    
    // Set position immediately so pellet appears instantly at spawn location
    graphics.x = pelletData.x;
    graphics.y = pelletData.y;
    
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
    
    // Create visual particles showing mass coming out
    this.createFeedParticles(pelletData.x, pelletData.y, pelletData.vx, pelletData.vy, 0xffff00);
  }
  
  createFeedParticles(x, y, vx, vy, color) {
    // Create 5-8 small particles that fade out
    const particleCount = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.5;
      const speed = 2 + Math.random() * 3;
      const particle = {
        x: x,
        y: y,
        vx: (vx * 0.3) + Math.cos(angle) * speed,
        vy: (vy * 0.3) + Math.sin(angle) * speed,
        life: 1.0,
        maxLife: 1.0,
        size: 2 + Math.random() * 3,
        color: color,
        graphics: new PIXI.Graphics()
      };
      particle.graphics.beginFill(color);
      particle.graphics.drawCircle(0, 0, particle.size);
      particle.graphics.endFill();
      particle.graphics.x = x;
      particle.graphics.y = y;
      this.gameLayer.addChild(particle.graphics);
      this.feedParticles.push(particle);
    }
  }
  
  updateFeedParticles(deltaNormalized) {
    for (let i = this.feedParticles.length - 1; i >= 0; i--) {
      const particle = this.feedParticles[i];
      particle.life -= deltaNormalized * 0.05; // Fade out over time
      
      if (particle.life <= 0) {
        this.gameLayer.removeChild(particle.graphics);
        particle.graphics.destroy();
        this.feedParticles.splice(i, 1);
        continue;
      }
      
      // Update position
      particle.x += particle.vx * deltaNormalized;
      particle.y += particle.vy * deltaNormalized;
      particle.vx *= 0.95; // Slow down
      particle.vy *= 0.95;
      
      // Update graphics
      particle.graphics.x = particle.x;
      particle.graphics.y = particle.y;
      particle.graphics.alpha = particle.life;
      particle.graphics.scale.set(particle.life); // Shrink as it fades
    }
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
    // Match server radius calculation - faster scaling for larger cells
    const baseRadius = Math.sqrt(mass / Math.PI);
    // Scale factor increases with mass for faster growth - INCREASED for larger visual size
    const scaleFactor = 4.5 + Math.min(mass / 5000, 2.5); // Up to 7x for very large cells (was 5.5x)
    return baseRadius * scaleFactor;
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
    if (!this.isPlaying) return;

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
  }

  sendAction(actionType) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (!this.playerId) return;
    if (!this.isPlaying) return;

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

  render(delta = 1) {
    if (!this.serverState) return;
    
    // Frame-rate independent interpolation factor (normalize to 60fps)
    const deltaNormalized = Math.min(delta / 1.0, 2.0); // Cap at 2x for stability

    // Calculate camera position (follow local player)
    const localPlayer = this.players.get(this.playerId);
    if (localPlayer && localPlayer.data.cells.length > 0) {
      const centerX = localPlayer.data.cells.reduce((sum, cell) => sum + cell.x, 0) / localPlayer.data.cells.length;
      const centerY = localPlayer.data.cells.reduce((sum, cell) => sum + cell.y, 0) / localPlayer.data.cells.length;

      // Calculate zoom based on largest cell size
      const largestCell = localPlayer.data.cells.reduce((largest, cell) => 
        cell.mass > largest.mass ? cell : largest, localPlayer.data.cells[0]);
      // Match server radius calculation with faster scaling
      const baseRadius = Math.sqrt(largestCell.mass / Math.PI);
      const scaleFactor = 3.5 + Math.min(largestCell.mass / 5000, 2.0);
      const cellRadius = baseRadius * scaleFactor;
      
      // Dynamic zoom: ensure cell looks good on screen (only if user hasn't manually zoomed)
      if (!this.manualZoom) {
        // For 1500 mass (radius ~122px), we want good visibility
        const baseViewport = Math.min(this.app.screen.width, this.app.screen.height);
        // Want to see about 3-4x the cell radius for good visibility
        const desiredVisibleRadius = cellRadius * 3.5;
        const idealZoom = baseViewport / (desiredVisibleRadius * 2);
        
        // For larger cells, allow much more zoom out
        // Scale maxZoom based on cell size - larger cells need more zoom out capability
        const sizeMultiplier = Math.max(1.0, cellRadius / 200); // Scale up for cells > 200px radius
        const maxZoomForSize = Math.min(8.0, 3.0 + (sizeMultiplier - 1) * 2.5); // Up to 8x zoom out for very large cells
        
        // Set target zoom to ensure cell is clearly visible
        this.targetZoom = Math.max(0.8, Math.min(maxZoomForSize, idealZoom));
        this.maxZoom = Math.min(10.0, maxZoomForSize * 1.5); // Allow much more zoom out (up to 10x)
      } else {
        // User has manually zoomed, update maxZoom based on cell size but don't override targetZoom
        const baseViewport = Math.min(this.app.screen.width, this.app.screen.height);
        const desiredVisibleRadius = cellRadius * 3.5;
        const idealZoom = baseViewport / (desiredVisibleRadius * 2);
        const sizeMultiplier = Math.max(1.0, cellRadius / 200); // Scale up for cells > 200px radius
        const maxZoomForSize = Math.min(8.0, 3.0 + (sizeMultiplier - 1) * 2.5); // Up to 8x zoom out for very large cells
        this.maxZoom = Math.min(10.0, maxZoomForSize * 1.5); // Update maxZoom for bounds, allow much more zoom out (up to 10x)
      }

      // Smooth zoom interpolation
      const zoomSpeed = 0.12;
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

    // Render all entities - render cells first so pellets appear on top (cells are opaque)
    this.renderPlayers(deltaNormalized);
    this.renderViruses();
    // Render pellets after cells so they appear on top (cells are fully opaque)
    this.renderPellets();
    this.renderFeedPellets();
    this.updateFeedParticles(deltaNormalized);
    this.renderVirusProjectiles();
    this.renderMinimap();

    // Update leaderboard
    this.updateLeaderboard();
  }

  renderMinimap() {
    if (!this.minimapCtx || !this.config || !this.serverState) return;

    const ctx = this.minimapCtx;
    const size = this.minimapCanvas.width;
    const mapWidth = this.config.mapWidth || 5000;
    const mapHeight = this.config.mapHeight || 5000;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = this.isDarkMode ? '#0d1117' : '#f5f5f5';
    ctx.fillRect(0, 0, size, size);
    
    // Draw grid (5x5)
    const gridCols = 5;
    const gridRows = 5;
    const cellWidth = size / gridCols;
    const cellHeight = size / gridRows;
    
    ctx.strokeStyle = this.isDarkMode ? '#2e3748' : '#9a9a9a';
    ctx.lineWidth = 1;
    
    // Vertical grid lines
    for (let i = 1; i < gridCols; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cellWidth, 0);
      ctx.lineTo(i * cellWidth, size);
      ctx.stroke();
    }
    
    // Horizontal grid lines
    for (let i = 1; i < gridRows; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * cellHeight);
      ctx.lineTo(size, i * cellHeight);
      ctx.stroke();
    }
    
    // Draw grid labels in each square (A1, A2, etc.)
    ctx.font = 'bold 9px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = this.isDarkMode ? '#6b7280' : '#666666';
    
    const letters = ['A', 'B', 'C', 'D', 'E'];
    for (let col = 0; col < gridCols; col++) {
      for (let row = 0; row < gridRows; row++) {
        const label = letters[col] + (row + 1);
        const x = (col + 0.5) * cellWidth;
        const y = (row + 0.5) * cellHeight;
        ctx.fillText(label, x, y);
      }
    }
    
    // No border - removed green border

    // Draw players ONLY - NO BOTS on minimap (minimap is for you and your team/party)
    const players = (this.serverState.players || []).filter(p => !p.isBot);
    players.forEach((player) => {
      const isLocal = player.id === this.playerId;
      player.cells.forEach((cell) => {
        const x = (cell.x / mapWidth) * size;
        const y = (cell.y / mapHeight) * size;
        const r = Math.max(2, Math.min(6, Math.sqrt(cell.mass / Math.PI) * size / (mapWidth * 0.7)));

        ctx.beginPath();
        ctx.globalAlpha = isLocal ? 0.95 : 0.65;
        ctx.fillStyle = isLocal ? '#00ff00' : '#00aaff';
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    ctx.globalAlpha = 1;
  }

  renderPlayers(deltaNormalized = 1.0) {
    this.players.forEach((player, playerId) => {
      const isLocal = playerId === this.playerId;
      player.data.cells.forEach((cellData, index) => {
        const cellGraphics = player.container.children[index];
        if (cellGraphics) {
          // Ultra-smooth position interpolation with better easing
          const targetX = cellData.x;
          const targetY = cellData.y;
          
          const dx = targetX - cellGraphics.x;
          const dy = targetY - cellGraphics.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          // Use much smoother interpolation - higher alpha for more responsive movement
          // For new cells (splits), use even higher alpha to snap to position faster
          const isNewCell = cellGraphics.animationTime !== undefined;
          const alpha = isNewCell ? 0.9 : (isLocal ? 0.75 : 0.55); // Higher alpha for new cells and local player
          const frameAlpha = 1 - Math.pow(1 - alpha, deltaNormalized);
          
          // Apply smooth easing for very small movements (prevents jitter)
          let interpolationFactor = frameAlpha;
          if (distance < 0.5) {
            // For very small movements, snap immediately to prevent jitter
            interpolationFactor = 1.0;
          } else if (distance < 2) {
            // For small movements, use linear interpolation
            interpolationFactor = Math.min(1, distance);
          }
          
          // Ultra-smooth position interpolation
          cellGraphics.x += dx * interpolationFactor;
          cellGraphics.y += dy * interpolationFactor;
          
          // Smooth scale animation for new cells (split animation) - faster and more visible
          if (cellGraphics.animationTime !== undefined) {
            cellGraphics.animationTime += deltaNormalized * 0.12; // Faster animation (was 0.06)
            if (cellGraphics.animationTime < 1.0) {
              // Smooth ease-out animation with bounce effect for more visible split
              const t = cellGraphics.animationTime;
              // Use elastic ease-out for a more noticeable, smooth split animation
              const easeOut = t < 1 ? 1 - Math.pow(1 - t, 3) * (1 - t * 0.3) : 1;
              const currentScale = easeOut; // Scale from 0 to 1
              cellGraphics.scale.set(currentScale);
            } else {
              // Animation complete
              cellGraphics.scale.set(1.0);
              cellGraphics.animationTime = undefined;
            }
          } else if (cellGraphics.scale.x !== 1.0) {
            // Ensure scale is 1.0 if not animating
            cellGraphics.scale.set(1.0);
          }
        }
      });
    });
  }

  renderPellets() {
    this.pellets.forEach((graphics, id) => {
      if (graphics.pelletData) {
        // Pellets appear instantly at their spawn position (no interpolation)
        graphics.x = graphics.pelletData.x;
        graphics.y = graphics.pelletData.y;
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

