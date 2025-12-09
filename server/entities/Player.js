import { Cell } from './Cell.js';

export class Player {
  constructor(id, config) {
    this.id = id;
    this.name = `Player${id}`;
    this.cells = [];
    this.inputDirX = 0;
    this.inputDirY = 0;
    this.cursorX = 0;
    this.cursorY = 0;
    this.score = 0;
    this.config = config;
    this.color = this.generateColor();

    // Spawn initial cell
    this.spawn(config);
  }

  generateColor() {
    const hue = Math.floor(Math.random() * 360);
    return `hsl(${hue}, 70%, 50%)`;
  }

  spawn(config) {
    const startMass = 1500;
    const startX = Math.random() * config.mapWidth;
    const startY = Math.random() * config.mapHeight;

    const cell = new Cell(
      Date.now() + Math.random(),
      startX,
      startY,
      startMass,
      this.id
    );

    // Set split cooldown based on instant merge mode
    cell.setInstantMerge(config.instantMerge);

    this.cells.push(cell);
  }

  setName(name) {
    if (!name) return;
    const trimmed = name.toString().trim().slice(0, 20);
    if (trimmed.length === 0) return;
    this.name = trimmed;
  }

  respawn(config) {
    this.cells = [];
    this.spawn(config);
  }

  setInput(dirX, dirY) {
    this.inputDirX = dirX;
    this.inputDirY = dirY;
  }

  setCursor(x, y) {
    this.cursorX = x;
    this.cursorY = y;
  }

  split(targetCount) {
    if (this.cells.length >= targetCount) return;

    // Calculate direction to cursor
    const centerX = this.getCenterX();
    const centerY = this.getCenterY();
    const dx = this.cursorX - centerX;
    const dy = this.cursorY - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const dirX = dist > 0 ? dx / dist : 0;
    const dirY = dist > 0 ? dy / dist : 0;

    this.splitWithDirection(targetCount, dirX, dirY);
  }

  splitWithDirection(targetCount, dirX, dirY) {
    if (this.cells.length >= targetCount) return;

    // Perform splits until we reach target count
    while (this.cells.length < targetCount) {
      let splitOccurred = false;
      
      // Try to split each cell
      for (let i = this.cells.length - 1; i >= 0; i--) {
        const cell = this.cells[i];
        
        // Check if cell can split (cooldown check is inside canSplit, but allow if instant merge)
        const canSplitNow = cell.canSplit() || (this.config.instantMerge && cell.splitCooldown === 0);
        if (canSplitNow && cell.mass >= 100 && this.cells.length < targetCount) {
          const newCell = cell.split(targetCount, dirX, dirY);
          if (newCell) {
            // Set split cooldown for new cell
            newCell.setInstantMerge(this.config.instantMerge);
            this.cells.push(newCell);
            splitOccurred = true;
            break; // Split one at a time
          }
        }
      }

      // If no split occurred, break to avoid infinite loop
      if (!splitOccurred) break;
    }
  }

  feed(dirX, dirY) {
    if (this.cells.length === 0) return;

    // Find largest cell
    let largestCell = this.cells[0];
    for (const cell of this.cells) {
      if (cell.mass > largestCell.mass) {
        largestCell = cell;
      }
    }

    // Create feed pellet
    if (largestCell.mass > 50) {
      const feedMass = Math.min(35, largestCell.mass * 0.1);
      largestCell.mass -= feedMass;

      // Return feed pellet data (will be handled by world)
      return {
        x: largestCell.x,
        y: largestCell.y,
        mass: feedMass,
        vx: dirX * 20,
        vy: dirY * 20
      };
    }
  }

  macroFeed(dirX, dirY) {
    // Feed multiple times rapidly
    const feeds = [];
    for (let i = 0; i < 3; i++) {
      const feed = this.feed(dirX, dirY);
      if (feed) feeds.push(feed);
    }
    return feeds.length > 0 ? feeds : null;
  }

  stop() {
    this.inputDirX = 0;
    this.inputDirY = 0;
    this.cells.forEach((cell) => {
      cell.vx *= 0.5;
      cell.vy *= 0.5;
    });
  }

  removeCell(cellId) {
    this.cells = this.cells.filter((cell) => cell.id !== cellId);
    // Don't auto-respawn - let player manually respawn
  }

  getCenterX() {
    if (this.cells.length === 0) return 0;
    let sumX = 0;
    this.cells.forEach((cell) => {
      sumX += cell.x;
    });
    return sumX / this.cells.length;
  }

  getCenterY() {
    if (this.cells.length === 0) return 0;
    let sumY = 0;
    this.cells.forEach((cell) => {
      sumY += cell.y;
    });
    return sumY / this.cells.length;
  }

  getTotalMass() {
    let total = 0;
    this.cells.forEach((cell) => {
      total += cell.mass;
    });
    return total;
  }

  checkMerges(config) {
    if (this.cells.length <= 1) return;

    const now = Date.now();
    const mergeDelay = config.instantMerge ? 0 : config.mergeDelayMS;

    // Calculate player center for cursor-based merge prevention
    const centerX = this.getCenterX();
    const centerY = this.getCenterY();
    const cursorDx = this.cursorX - centerX;
    const cursorDy = this.cursorY - centerY;
    const cursorDist = Math.sqrt(cursorDx * cursorDx + cursorDy * cursorDy);
    
    // Cursor-based merge control logic:
    // - Cursor centered (close to player center) = player wants quick merge = instant merge
    // - Cursor away from center = player trying to hinder merge = delay merge
    let avgRadius = 0;
    if (this.cells.length > 0) {
      const radii = this.cells.map(cell => cell.getRadius());
      avgRadius = radii.reduce((sum, r) => sum + r, 0) / radii.length;
    }
    
    // Determine merge delay based on cursor position:
    // - Very close (within 1x avg radius): Cursor centered = quick merge (300ms)
    // - Close (1x-2x avg radius): Medium delay (500ms) - cursor slightly away
    // - Medium (2x-3.5x avg radius): Longer delay (800ms) - cursor away
    // - Far (3.5x+ avg radius): Very long delay (1200ms) - cursor far away = actively hindering merge
    const veryCloseThreshold = avgRadius * 1.0;   // Cursor centered
    const closeThreshold = avgRadius * 2.0;         // Cursor slightly away
    const mediumThreshold = avgRadius * 3.5;        // Cursor away
    
    let mergeDelayMs = 0;
    if (config.instantMerge) {
      if (cursorDist <= veryCloseThreshold) {
        mergeDelayMs = 300;    // Cursor centered = quick merge (not instant)
      } else if (cursorDist <= closeThreshold) {
        mergeDelayMs = 500;   // Cursor slightly away = medium delay
      } else if (cursorDist <= mediumThreshold) {
        mergeDelayMs = 800;   // Cursor away = longer delay
      } else {
        mergeDelayMs = 1200;   // Cursor far away = very long delay (hindering merge)
      }
    }

    // Process merges - iterate over actual cells array
    for (let i = 0; i < this.cells.length; i++) {
      for (let j = i + 1; j < this.cells.length; j++) {
        const cell1 = this.cells[i];
        const cell2 = this.cells[j];

        const dx = cell1.x - cell2.x;
        const dy = cell1.y - cell2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const r1 = cell1.getRadius();
        const r2 = cell2.getRadius();
        const overlap = (r1 + r2) - dist;

        if (overlap > 0) {
          // Cells are overlapping
          
          // Check if cursor is between/centered on the two merging cells
          const cellMidX = (cell1.x + cell2.x) / 2;
          const cellMidY = (cell1.y + cell2.y) / 2;
          const cursorToMidDx = this.cursorX - cellMidX;
          const cursorToMidDy = this.cursorY - cellMidY;
          const cursorToMidDist = Math.sqrt(cursorToMidDx * cursorToMidDx + cursorToMidDy * cursorToMidDy);
          const cellDist = dist;
          
          // If cursor is close to the midpoint between cells, merge very quickly
          let actualMergeDelay = mergeDelayMs;
          if (cursorToMidDist < cellDist * 0.5) {
            // Cursor is between/centered on merging cells - merge quickly
            actualMergeDelay = 100; // Very quick merge when cursor is on the cells
          }
          
          if (config.instantMerge) {
            // Instant merge mode with skill-based delays
            if (cell1.mergeTime && now - cell1.mergeTime >= actualMergeDelay) {
              this.instantMergeCells(cell1, cell2);
              j--; // Adjust index after removal
            } else if (!cell1.mergeTime) {
              // Start merge timer
              cell1.mergeTime = now;
            }
          } else if (cell1.mergeTime && now - cell1.mergeTime >= mergeDelay) {
            // Classic merge after delay
            this.mergeCells(cell1, cell2);
            j--; // Adjust index after removal
          } else if (!cell1.mergeTime) {
            // Start merge timer
            cell1.mergeTime = now;
          }
        } else {
          // Reset merge timer if cells separate
          if (cell1.mergeTime) {
            cell1.mergeTime = null;
          }
        }
      }
    }

    // Check auto-split at 22.5k mass
    this.cells.forEach((cell) => {
      if (cell.mass >= config.autoSplitMass) {
        // Auto-split into multiple pieces
        const splitCount = Math.min(16, Math.floor(cell.mass / 1400));
        cell.mass = config.autoSplitMass / splitCount;
        
        // Create additional cells
        for (let i = 1; i < splitCount; i++) {
          const newCell = new Cell(
            Date.now() + Math.random() + i,
            cell.x + (Math.random() - 0.5) * 50,
            cell.y + (Math.random() - 0.5) * 50,
            config.autoSplitMass / splitCount,
            this.id
          );
          newCell.vx = (Math.random() - 0.5) * 10;
          newCell.vy = (Math.random() - 0.5) * 10;
          newCell.setInstantMerge(config.instantMerge);
          this.cells.push(newCell);
        }
      }
    });
  }

  instantMergeCells(cell1, cell2) {
    // Instant merge with proper physics
    const totalMass = cell1.mass + cell2.mass;
    const massRatio1 = cell1.mass / totalMass;
    const massRatio2 = cell2.mass / totalMass;

    // Calculate center of mass position
    const centerX = cell1.x * massRatio1 + cell2.x * massRatio2;
    const centerY = cell1.y * massRatio1 + cell2.y * massRatio2;

    // Calculate momentum-preserving velocity
    const totalMomentumX = cell1.vx * cell1.mass + cell2.vx * cell2.mass;
    const totalMomentumY = cell1.vy * cell1.mass + cell2.vy * cell2.mass;
    const mergedVx = totalMomentumX / totalMass;
    const mergedVy = totalMomentumY / totalMass;

    // Merge into cell1
    cell1.mass = totalMass;
    cell1.x = centerX;
    cell1.y = centerY;
    cell1.vx = mergedVx;
    cell1.vy = mergedVy;
    cell1.mergeTime = null; // Clear merge timer

    // Remove cell2
    this.removeCell(cell2.id);
  }

  mergeCells(cell1, cell2) {
    // Classic merge (same as instant but with delay)
    this.instantMergeCells(cell1, cell2);
  }

  tick(world) {
    // Update each cell's movement
    this.cells.forEach((cell) => {
      cell.updateMovement(this.inputDirX, this.inputDirY, world.config);
    });

    // Update score
    this.score = Math.floor(this.getTotalMass());
  }

  serialize() {
    return {
      id: this.id,
      name: this.name,
      cells: this.cells.map((cell) => cell.serialize()),
      score: this.score,
      isBot: this.isBot || false,
      color: this.color
    };
  }
}

