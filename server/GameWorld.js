import { Cell, CellState } from './entities/Cell.js';
import { Pellet } from './entities/Pellet.js';
import { Virus } from './entities/Virus.js';
import { Player } from './entities/Player.js';
import { Bot } from './entities/Bot.js';
import { PhysicsConstants } from './PhysicsConstants.js';

export class GameWorld {
  constructor() {
    this.config = {
      instantMerge: true,
      mergeDelayMS: 0,
      virusMassThreshold: 2000,
      virusMaxMass: 2000,
      autoSplitMass: 22500,
      massDecayRate: 0.00002, // Base decay rate (0.002% per tick, scales with mass) - much slower
      mapWidth: 8000,
      mapHeight: 8000,
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
        const pelletRadius = this.massToRadius(8); // Pellet mass is typically 5-8 (reduced)
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
    // CRITICAL: Process in correct priority order
    
    // 1. Movement integration
    this.players.forEach((player) => {
      player.tick(this);
    });

    // 2. Split travel decay (update split immunity timers)
    this.players.forEach((player) => {
      player.cells.forEach((cell) => {
        // Split travel state is managed in Cell.updateMovement
      });
    });

    // 3. Collision resolution (push-out for same-player cells)
    this.resolveCollisions();

    // 4. Eating resolution (largest first)
    this.resolveEating();

    // 5. Merge checks
    this.players.forEach((player) => {
      player.checkMerges(this.config);
    });

    // 6. Update other entities
    this.viruses.forEach((virus) => {
      virus.update();
    });
    this.updateFeedPellets();
    this.updateVirusProjectiles();

    // 7. Check other collisions (pellets, viruses, etc.)
    this.checkOtherCollisions();

    // 8. Maintain pellet/virus counts
    this.maintainWorld();
  }
  
  resolveCollisions() {
    // OVERLAP RESOLUTION (push-out only) - NEVER cancels eat checks
    // This only pushes cells apart physically, does not affect eating logic
    this.players.forEach((player) => {
      const cells = player.cells;
      for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
          const cell1 = cells[i];
          const cell2 = cells[j];
          
          // Skip if either cell has split immunity (they can overlap during split travel)
          if (cell1.hasSplitImmunity() || cell2.hasSplitImmunity()) {
            continue;
          }
          
          // Skip if cells are not alive
          if (!cell1.isAlive || !cell2.isAlive) {
            continue;
          }
          
          const dx = cell1.x - cell2.x;
          const dy = cell1.y - cell2.y;
          const distSq = dx * dx + dy * dy;
          
          if (distSq === 0) continue; // Same position
          
          const r1 = cell1.getRadius();
          const r2 = cell2.getRadius();
          const minDist = r1 + r2;
          
          if (distSq < minDist * minDist) {
            // Cells are overlapping - push them apart
            const dist = Math.sqrt(distSq);
            const overlap = minDist - dist;
            if (overlap > 0) {
              // Push-out formula: normalize(A.pos - B.pos) * overlap * 0.5
              const pushX = (dx / dist) * overlap * 0.5;
              const pushY = (dy / dist) * overlap * 0.5;
              
              // Apply push-out (weighted by mass - heavier pushes less)
              const totalMass = cell1.mass + cell2.mass;
              const pushRatio1 = cell2.mass / totalMass;
              const pushRatio2 = cell1.mass / totalMass;
              
              cell1.x += pushX * pushRatio1;
              cell1.y += pushY * pushRatio1;
              cell2.x -= pushX * pushRatio2;
              cell2.y -= pushY * pushRatio2;
            }
          }
        }
      }
    });
  }
  
  resolveEating() {
    // EATING IS A MANUAL DOMINANCE CHECK - NOT A COLLISION CALLBACK
    // Collect all cells from all players and bots
    const allCells = [];
    this.players.forEach((player) => {
      player.cells.forEach((cell) => {
        if (cell.isAlive) { // Only check alive cells
          allCells.push({ cell, player, isBot: player.isBot || false });
        }
      });
    });
    
    // Track cells that have been eaten (to avoid double-eating)
    const eatenCellIds = new Set();
    
    // Check each cell against all other cells
    for (let i = 0; i < allCells.length; i++) {
      const eater = allCells[i];
      if (eatenCellIds.has(eater.cell.id)) continue; // Already eaten
      if (!eater.cell.isAlive) continue; // Not alive
      
      // Get base radius (sqrt(mass)) for eating calculations
      const eaterBaseRadius = eater.cell.getBaseRadius();
      const eaterX = eater.cell.x;
      const eaterY = eater.cell.y;
      const eaterMass = eater.cell.mass;
      
      // Find all potential victims (sort by distance ASC - eat closest first)
      const potentialVictims = [];
      
      for (let j = 0; j < allCells.length; j++) {
        if (i === j) continue;
        const target = allCells[j];
        if (eatenCellIds.has(target.cell.id)) continue; // Already eaten
        if (!target.cell.isAlive) continue; // Not alive
        if (eater.player.id === target.player.id) continue; // Same owner - can't eat own cells
        
        const targetBaseRadius = target.cell.getBaseRadius();
        const targetMass = target.cell.mass;
        
        // Calculate distance
        const dx = eaterX - target.cell.x;
        const dy = eaterY - target.cell.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // EATING CONDITIONS (ALL must be true):
        // A.owner !== B.owner ✓ (checked above)
        // A.mass > B.mass
        if (eaterMass <= targetMass) continue;
        
        // A.radius >= B.radius * 1.15
        if (eaterBaseRadius < targetBaseRadius * PhysicsConstants.EAT_RADIUS_RATIO) continue;
        
        // distance < A.radius - (B.radius * 0.4)
        const eatDistance = eaterBaseRadius - (targetBaseRadius * PhysicsConstants.EAT_DISTANCE_FACTOR);
        if (distance >= eatDistance) continue;
        
        // B.isAlive === true ✓ (checked above)
        // B.splitImmunityTimer <= 0
        if (target.cell.getSplitImmunityTimer() > 0) continue;
        
        // All conditions met - add to potential victims
        potentialVictims.push({ target, distance });
      }
      
      // MULTI-EAT PRIORITY: Sort by distance ASC, eat only ONE per frame
      if (potentialVictims.length > 0) {
        potentialVictims.sort((a, b) => a.distance - b.distance);
        const victim = potentialVictims[0].target;
        
        // EAT: Transfer 100% mass instantly (NO DELAY)
        eater.cell.mass += victim.cell.mass;
        
        // Mark target as dead and remove immediately
        victim.cell.isAlive = false;
        victim.player.removeCell(victim.cell.id);
        eatenCellIds.add(victim.cell.id);
        
        // Cancel velocities on eater (smooth stop after eating)
        eater.cell.vx = 0;
        eater.cell.vy = 0;
      }
    }
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

  checkOtherCollisions() {
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
            // Feed pellets are worth more than regular pellets (2.5x value for feeding mechanics)
            cell.mass += feedPellet.mass * 2.5;
            this.feedPellets.delete(feedPelletId);
          }
        });
      });
    });

    // Player vs Player collisions (pellets, viruses, etc.)
    // Eating is now handled in resolveEating() with proper priority

    // Player vs Viruses (optimized with early distance check)
    this.players.forEach((player) => {
      player.cells.forEach((cell) => {
        // Skip if cell has split immunity
        if (cell.hasSplitImmunity()) {
          return;
        }
        
        const cellRadius = cell.getRadius();
        const cellX = cell.x;
        const cellY = cell.y;
        let cellHandled = false; // Flag to track if cell was handled by virus collision
        
        this.viruses.forEach((virus, virusId) => {
          // Skip if cell was already handled
          if (cellHandled) return;
          
          // Early exit: check distance first
          const dx = cellX - virus.x;
          const dy = cellY - virus.y;
          const distSq = dx * dx + dy * dy;
          const maxDist = cellRadius + virus.getRadius();
          
          // Skip if too far away
          if (distSq > maxDist * maxDist) return;
          
          if (this.isColliding(cell, virus)) {
            // Only trigger if cell mass is above threshold
            if (cell.mass < PhysicsConstants.VIRUS_MASS_THRESHOLD) {
              return; // Cell too small to trigger virus split
            }
            // Virus causes clean burst split - no mass gain, just split the cell
            // Calculate split direction: radial burst from virus collision point
            const dx = cell.x - virus.x;
            const dy = cell.y - virus.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const dirX = dist > 0 ? dx / dist : 0;
            const dirY = dist > 0 ? dy / dist : 0;
            
            // Store the cell's position and mass before splitting (use original mass, no gain)
            const cellX = cell.x;
            const cellY = cell.y;
            const cellVx = cell.vx;
            const cellVy = cell.vy;
            const cellId = cell.id;
            
            // Use original cell mass (no virus mass added)
            const totalMass = cell.mass;
            
            // Remove the cell that hit the virus
            player.removeCell(cellId);
            
            // Calculate how many pieces we can create (based on mass)
            const minCellMass = PhysicsConstants.MIN_MASS;
            const maxPieces = Math.floor(totalMass / minCellMass);
            const pieceCount = Math.min(PhysicsConstants.VIRUS_SPLIT_MAX_PIECES, maxPieces, player.getMaxCells() - player.cells.length);
            
            if (pieceCount >= 2) {
              // Create pieces in a circle around the virus collision point
              const massPerPiece = totalMass / pieceCount;
              
              for (let i = 0; i < pieceCount; i++) {
                const angle = (Math.PI * 2 * i) / pieceCount;
                
                // Calculate radius of new cell for spacing
                const baseRadius = Math.sqrt(massPerPiece / Math.PI);
                const scaleFactor = 4.5 + Math.min(massPerPiece / 5000, 2.5);
                const newCellRadius = baseRadius * scaleFactor;
                
                // Place cells close together (60% of radius spacing)
                const spacing = newCellRadius * 1.6; // Border-to-border spacing
                const offsetX = Math.cos(angle) * spacing;
                const offsetY = Math.sin(angle) * spacing;
                
                const newCell = new Cell(
                  Date.now() * 1000 + Math.floor(Math.random() * 1000) + i,
                  cellX + offsetX,
                  cellY + offsetY,
                  massPerPiece,
                  player.id
                );
                
                // Apply clean radial burst impulse (no speed boost, just clean separation)
                const radialDirX = Math.cos(angle);
                const radialDirY = Math.sin(angle);
                const impulseSpeed = PhysicsConstants.VIRUS_SPLIT_IMPULSE;
                newCell.vx = radialDirX * impulseSpeed + cellVx * 0.2; // Minimal original velocity
                newCell.vy = radialDirY * impulseSpeed + cellVy * 0.2;
                newCell.setInstantMerge(player.config.instantMerge);
                newCell.setState(CellState.SPLIT_TRAVEL);
                newCell.splitTime = Date.now();
                newCell.splitImmunityUntil = Date.now() + PhysicsConstants.SPLIT_IMMUNITY_DURATION;
                newCell.splitDirectionX = radialDirX;
                newCell.splitDirectionY = radialDirY;
                
                player.cells.push(newCell);
              }
            } else {
              // Can't split enough, just keep the cell
              const remainingCell = new Cell(
                cellId,
                cellX,
                cellY,
                totalMass,
                player.id
              );
              remainingCell.vx = cellVx;
              remainingCell.vy = cellVy;
              remainingCell.setInstantMerge(player.config.instantMerge);
              player.cells.push(remainingCell);
            }
            
            // Remove and respawn virus
            this.viruses.delete(virusId);
            this.createVirus();
            
            // Mark cell as handled to avoid processing same cell multiple times
            cellHandled = true;
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
                player.splitIntoEvenPieces(16, dirX, dirY, 1.2); // 120% impulse for virus projectile splits - strong separation
              } else {
                // Use projectile direction (opposite of projectile velocity)
                const projLength = Math.sqrt(projectile.vx * projectile.vx + projectile.vy * projectile.vy);
                if (projLength > 0) {
                  const dirX = -projectile.vx / projLength;
                  const dirY = -projectile.vy / projLength;
                  player.splitIntoEvenPieces(16, dirX, dirY, 1.2); // 120% impulse for virus projectile splits - strong separation
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

    // Note: Feed pellets are already checked in the Player vs Feed Pellets section above
    // This allows players to feed themselves and others with the same collision logic

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

    // Note: Merges are handled in tick() method with proper priority order
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

