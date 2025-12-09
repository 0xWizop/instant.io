import { Cell } from './entities/Cell.js';
import { Pellet } from './entities/Pellet.js';
import { Virus } from './entities/Virus.js';
import { Player } from './entities/Player.js';
import { Bot } from './entities/Bot.js';

export class GameWorld {
  constructor() {
    this.config = {
      instantMerge: true,
      mergeDelayMS: 0,
      virusMassThreshold: 2000,
      virusMaxMass: 2000,
      autoSplitMass: 22500,
      massDecayRate: 0.0001, // Base decay rate (0.01% per tick, scales with mass)
      mapWidth: 5000,
      mapHeight: 5000,
      pelletCount: 1000,
      virusCount: 20,
      botCount: 10
    };

    this.players = new Map(); // playerId -> Player
    this.pellets = new Map(); // pelletId -> Pellet
    this.viruses = new Map(); // virusId -> Virus
    this.feedPellets = new Map(); // feedPelletId -> {x, y, mass, vx, vy}
    this.virusProjectiles = new Map(); // projectileId -> {x, y, mass, vx, vy}
    this.nextId = 1;

    this.initializeWorld();
  }

  initializeWorld() {
    // Spawn pellets
    for (let i = 0; i < this.config.pelletCount; i++) {
      this.createPellet();
    }

    // Spawn viruses
    for (let i = 0; i < this.config.virusCount; i++) {
      this.createVirus();
    }

    // Spawn bots
    for (let i = 0; i < this.config.botCount; i++) {
      this.createBot();
    }
  }

  createPlayer() {
    const playerId = this.nextId++;
    const player = new Player(playerId, this.config);
    this.players.set(playerId, player);
    return playerId;
  }

  createBot() {
    const botId = this.nextId++;
    const bot = new Bot(botId, this.config);
    // Set bot starting mass to 1000
    if (bot.cells.length > 0) {
      bot.cells[0].mass = 1000;
    }
    this.players.set(botId, bot);
    return botId;
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
  }

  createPellet() {
    const pelletId = this.nextId++;
    let attempts = 0;
    let x, y;
    let validPosition = false;
    
    // Try to find a position that doesn't overlap with viruses
    while (!validPosition && attempts < 50) {
      x = Math.random() * this.config.mapWidth;
      y = Math.random() * this.config.mapHeight;
      validPosition = true;
      
      // Check collision with all viruses
      for (const virus of this.viruses.values()) {
        const dx = x - virus.x;
        const dy = y - virus.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const virusRadius = this.massToRadius(virus.mass);
        const pelletRadius = this.massToRadius(15); // Pellet mass is typically 15
        if (dist < virusRadius + pelletRadius + 10) { // 10px buffer
          validPosition = false;
          break;
        }
      }
      attempts++;
    }
    
    // If we couldn't find a valid position after 50 attempts, just spawn anyway
    const pellet = new Pellet(pelletId, x, y);
    this.pellets.set(pelletId, pellet);
    return pelletId;
  }

  createVirus() {
    const virusId = this.nextId++;
    const virus = new Virus(
      virusId,
      Math.random() * this.config.mapWidth,
      Math.random() * this.config.mapHeight
    );
    this.viruses.set(virusId, virus);
    return virusId;
  }

  createFeedPellet(pelletData) {
    const pelletId = this.nextId++;
    this.feedPellets.set(pelletId, {
      id: pelletId,
      ...pelletData,
      createdAt: Date.now()
    });
    return pelletId;
  }

  createVirusProjectile(projectileData) {
    const projectileId = this.nextId++;
    this.virusProjectiles.set(projectileId, {
      id: projectileId,
      ...projectileData,
      createdAt: Date.now()
    });
    return projectileId;
  }

  handleInput(playerId, input) {
    const player = this.players.get(playerId);
    if (!player) return;

    player.setInput(input.dirX, input.dirY);
    if (input.cursorX !== undefined && input.cursorY !== undefined) {
      player.setCursor(input.cursorX, input.cursorY);
    }
  }

  handleAction(playerId, action) {
    const player = this.players.get(playerId);
    if (!player) return;

    switch (action.type) {
      case 'split':
        player.split(2);
        break;
      case 'doubleSplit':
        player.split(4);
        break;
      case 'tripleSplit':
        player.split(8);
        break;
      case 'split16':
        player.split(16);
        break;
      case 'split32':
        player.split(32);
        break;
      case 'feed':
        // Calculate direction to cursor
        const centerX = player.getCenterX();
        const centerY = player.getCenterY();
        const feedDx = player.cursorX - centerX;
        const feedDy = player.cursorY - centerY;
        const feedDist = Math.sqrt(feedDx * feedDx + feedDy * feedDy);
        const feedDirX = feedDist > 0 ? feedDx / feedDist : 0;
        const feedDirY = feedDist > 0 ? feedDy / feedDist : 0;
        
        const feedPellet = player.feed(feedDirX, feedDirY);
        if (feedPellet) {
          this.createFeedPellet(feedPellet);
        }
        break;
      case 'macroFeed':
        // Calculate direction to cursor
        const macroCenterX = player.getCenterX();
        const macroCenterY = player.getCenterY();
        const macroDx = player.cursorX - macroCenterX;
        const macroDy = player.cursorY - macroCenterY;
        const macroDist = Math.sqrt(macroDx * macroDx + macroDy * macroDy);
        const macroDirX = macroDist > 0 ? macroDx / macroDist : 0;
        const macroDirY = macroDist > 0 ? macroDy / macroDist : 0;
        
        const macroFeeds = player.macroFeed(macroDirX, macroDirY);
        if (macroFeeds) {
          macroFeeds.forEach((pellet) => {
            if (pellet) this.createFeedPellet(pellet);
          });
        }
        break;
      case 'stop':
        player.stop();
        break;
      case 'respawn':
        player.respawn(this.config);
        break;
    }
  }

  tick() {
    // Update all players
    this.players.forEach((player) => {
      player.tick(this);
    });

    // Update viruses
    this.viruses.forEach((virus) => {
      virus.update();
    });

    // Update feed pellets
    this.updateFeedPellets();

    // Update virus projectiles
    this.updateVirusProjectiles();

    // Check collisions
    this.checkCollisions();

    // Maintain pellet/virus counts
    this.maintainWorld();
  }

  updateFeedPellets() {
    const now = Date.now();
    this.feedPellets.forEach((pellet, pelletId) => {
      // Update position
      pellet.x += pellet.vx;
      pellet.y += pellet.vy;
      
      // Apply damping
      pellet.vx *= 0.98;
      pellet.vy *= 0.98;

      // Remove old feed pellets (after 5 seconds)
      if (now - pellet.createdAt > 5000) {
        this.feedPellets.delete(pelletId);
      }
    });
  }

  updateVirusProjectiles() {
    const now = Date.now();
    this.virusProjectiles.forEach((projectile, projectileId) => {
      // Update position
      projectile.x += projectile.vx;
      projectile.y += projectile.vy;
      
      // Apply damping
      projectile.vx *= 0.99;
      projectile.vy *= 0.99;

      // Remove old projectiles (after 3 seconds)
      if (now - projectile.createdAt > 3000) {
        this.virusProjectiles.delete(projectileId);
      }
    });
  }

  checkCollisions() {
    // Player vs Pellets (optimized with early distance check)
    this.players.forEach((player) => {
      player.cells.forEach((cell) => {
        const cellRadius = cell.getRadius();
        const cellX = cell.x;
        const cellY = cell.y;
        
        // Only check pellets within reasonable distance (optimization)
        this.pellets.forEach((pellet, pelletId) => {
          const dx = cellX - pellet.x;
          const dy = cellY - pellet.y;
          const distSq = dx * dx + dy * dy;
          const maxDist = cellRadius + 20; // Pellet radius is small, add buffer
          
          // Early exit: skip if too far away
          if (distSq > maxDist * maxDist) return;
          
          if (this.isColliding(cell, pellet)) {
            cell.mass += pellet.mass;
            this.pellets.delete(pelletId);
            this.createPellet(); // Respawn
          }
        });

        // Player vs Feed Pellets (optimized with early distance check)
        this.feedPellets.forEach((feedPellet, feedPelletId) => {
          const dx = cellX - feedPellet.x;
          const dy = cellY - feedPellet.y;
          const distSq = dx * dx + dy * dy;
          const maxDist = cellRadius + 30; // Feed pellets are larger
          
          // Early exit: skip if too far away
          if (distSq > maxDist * maxDist) return;
          
          if (this.isColliding(cell, feedPellet)) {
            cell.mass += feedPellet.mass;
            this.feedPellets.delete(feedPelletId);
          }
        });
      });
    });

    // Player vs Player (optimized with early distance check)
    this.players.forEach((player1) => {
      player1.cells.forEach((cell1) => {
        const cell1Radius = cell1.getRadius();
        const cell1X = cell1.x;
        const cell1Y = cell1.y;
        
        this.players.forEach((player2) => {
          if (player1.id === player2.id) return;
          
          player2.cells.forEach((cell2) => {
            // Early exit: check distance first before expensive collision check
            const dx = cell1X - cell2.x;
            const dy = cell1Y - cell2.y;
            const distSq = dx * dx + dy * dy;
            const maxDist = cell1Radius + cell2.getRadius();
            
            // Skip if too far away
            if (distSq > maxDist * maxDist) return;
            
            if (this.isColliding(cell1, cell2)) {
              // Need to be 25% larger to eat (Agar.io rule)
              if (cell1.mass > cell2.mass * 1.25) {
                // cell1 eats cell2
                cell1.mass += cell2.mass;
                player2.removeCell(cell2.id);
                
                // If player has no cells left, they need to manually respawn
                if (player2.cells.length === 0) {
                  // Player is dead, but don't auto-respawn
                }
              }
            }
          });
        });
      });
    });

    // Player vs Viruses (optimized with early distance check)
    this.players.forEach((player) => {
      player.cells.forEach((cell) => {
        const cellRadius = cell.getRadius();
        const cellX = cell.x;
        const cellY = cell.y;
        
        this.viruses.forEach((virus, virusId) => {
          // Early exit: check distance first
          const dx = cellX - virus.x;
          const dy = cellY - virus.y;
          const distSq = dx * dx + dy * dy;
          const maxDist = cellRadius + virus.getRadius();
          
          // Skip if too far away
          if (distSq > maxDist * maxDist) return;
          
          if (this.isColliding(cell, virus)) {
            // Virus always splits the cell into many pieces, regardless of size
            // First, gain mass from the virus
            cell.mass += virus.mass;
            
            // Calculate split direction: use cell's velocity direction
            const dx = cell.x - virus.x;
            const dy = cell.y - virus.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const dirX = dist > 0 ? dx / dist : 0;
            const dirY = dist > 0 ? dy / dist : 0;
            
            // Use cell's velocity direction (blended with away-from-virus direction)
            const velLength = Math.sqrt(cell.vx * cell.vx + cell.vy * cell.vy);
            let splitDirX, splitDirY;
            if (velLength > 0.1) {
              const velDirX = cell.vx / velLength;
              const velDirY = cell.vy / velLength;
              // Blend: 70% velocity, 30% away from virus
              const blendX = velDirX * 0.7 + dirX * 0.3;
              const blendY = velDirY * 0.7 + dirY * 0.3;
              const blendLen = Math.sqrt(blendX * blendX + blendY * blendY);
              splitDirX = blendX / blendLen;
              splitDirY = blendY / blendLen;
            } else {
              splitDirX = dirX;
              splitDirY = dirY;
            }
            
            // Split into even-sized pieces (16 pieces) with reduced impulse for virus splits
            player.splitIntoEvenPieces(16, splitDirX, splitDirY, 0.5); // 50% impulse for virus splits
            
            // Remove and respawn virus
            this.viruses.delete(virusId);
            this.createVirus();
          }
        });

        // Player vs Virus Projectiles
        this.virusProjectiles.forEach((projectile, projectileId) => {
          if (this.isColliding(cell, projectile)) {
            if (cell.mass > this.config.virusMassThreshold) {
              // Projectile explodes large cell - use cell's velocity direction
              const velLength = Math.sqrt(cell.vx * cell.vx + cell.vy * cell.vy);
              if (velLength > 0.1) {
                const dirX = cell.vx / velLength;
                const dirY = cell.vy / velLength;
                player.splitIntoEvenPieces(16, dirX, dirY, 0.5); // 50% impulse for virus projectile splits
              } else {
                // Use projectile direction (opposite of projectile velocity)
                const projLength = Math.sqrt(projectile.vx * projectile.vx + projectile.vy * projectile.vy);
                if (projLength > 0) {
                  const dirX = -projectile.vx / projLength;
                  const dirY = -projectile.vy / projLength;
                  player.splitIntoEvenPieces(16, dirX, dirY, 0.5); // 50% impulse for virus projectile splits
                } else {
                  // Fallback: split in random direction
                  const angle = Math.random() * Math.PI * 2;
                  const dirX = Math.cos(angle);
                  const dirY = Math.sin(angle);
                  player.splitIntoEvenPieces(16, dirX, dirY, 0.5);
                }
              }
              cell.mass *= 0.5;
            } else {
              // Small cell eats projectile
              cell.mass += projectile.mass;
            }
            this.virusProjectiles.delete(projectileId);
          }
        });
      });
    });

    // Feed Pellets vs Viruses (shooting viruses)
    this.feedPellets.forEach((feedPellet, feedPelletId) => {
      this.viruses.forEach((virus, virusId) => {
        if (this.isColliding(feedPellet, virus)) {
          // Feed pellet hits virus
          const shouldPop = virus.feed(feedPellet.mass);
          this.feedPellets.delete(feedPelletId);

          if (shouldPop) {
            // Calculate direction from virus to where pellet came from
            const dx = feedPellet.vx;
            const dy = feedPellet.vy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const dirX = dist > 0 ? dx / dist : 0;
            const dirY = dist > 0 ? dy / dist : 0;

            // Virus pops and shoots projectile
            const projectile = virus.pop(dirX, dirY);
            if (projectile) {
              this.createVirusProjectile(projectile);
            }
          }
        }
      });
    });

    // Merge cells (same player)
    this.players.forEach((player) => {
      player.checkMerges(this.config);
    });
  }

  isColliding(entity1, entity2) {
    const dx = entity1.x - entity2.x;
    const dy = entity1.y - entity2.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const r1 = this.massToRadius(entity1.mass);
    const r2 = this.massToRadius(entity2.mass);
    return dist < r1 + r2;
  }

  massToRadius(mass) {
    // Match the cell radius calculation - faster scaling for larger cells
    const baseRadius = Math.sqrt(mass / Math.PI);
    // Scale factor increases with mass for faster growth
    const scaleFactor = 3.5 + Math.min(mass / 5000, 2.0); // Up to 5.5x for very large cells
    return baseRadius * scaleFactor;
  }

  maintainWorld() {
    // Maintain pellet count
    while (this.pellets.size < this.config.pelletCount) {
      this.createPellet();
    }

    // Maintain virus count
    while (this.viruses.size < this.config.virusCount) {
      this.createVirus();
    }

    // Maintain bot count
    let botCount = Array.from(this.players.values()).filter(p => p.isBot).length;
    while (botCount < this.config.botCount) {
      this.createBot();
      botCount++;
    }
  }

  getSnapshot() {
    const players = [];
    this.players.forEach((player) => {
      players.push(player.serialize());
    });

    const pellets = [];
    this.pellets.forEach((pellet) => {
      pellets.push(pellet.serialize());
    });

    const viruses = [];
    this.viruses.forEach((virus) => {
      viruses.push(virus.serialize());
    });

    const feedPellets = [];
    this.feedPellets.forEach((pellet) => {
      feedPellets.push({
        id: pellet.id,
        x: pellet.x,
        y: pellet.y,
        mass: pellet.mass
      });
    });

    const virusProjectiles = [];
    this.virusProjectiles.forEach((projectile) => {
      virusProjectiles.push({
        id: projectile.id,
        x: projectile.x,
        y: projectile.y,
        mass: projectile.mass
      });
    });

    return {
      timestamp: Date.now(),
      players,
      pellets,
      viruses,
      feedPellets,
      virusProjectiles
    };
  }
}

