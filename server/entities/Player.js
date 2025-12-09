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
    if (this.cells.length === 0) return;
    
    // Enforce maximum cell count based on total mass
    const maxCells = this.getMaxCells();
    const effectiveTargetCount = Math.min(targetCount, maxCells);
    
    if (this.cells.length >= effectiveTargetCount) return;

    // Calculate direction to cursor
    const centerX = this.getCenterX();
    const centerY = this.getCenterY();
    const dx = this.cursorX - centerX;
    const dy = this.cursorY - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    // Ensure we have a valid direction - use velocity as fallback if cursor is at center
    let dirX, dirY;
    if (dist > 1) {
      dirX = dx / dist;
      dirY = dy / dist;
    } else {
      // Cursor is at center or not set - use velocity direction or random
      if (this.cells.length > 0) {
        const cell = this.cells[0];
        const velLength = Math.sqrt(cell.vx * cell.vx + cell.vy * cell.vy);
        if (velLength > 0.1) {
          dirX = cell.vx / velLength;
          dirY = cell.vy / velLength;
        } else {
          // Random direction if no velocity
          const angle = Math.random() * Math.PI * 2;
          dirX = Math.cos(angle);
          dirY = Math.sin(angle);
        }
      } else {
        const angle = Math.random() * Math.PI * 2;
        dirX = Math.cos(angle);
        dirY = Math.sin(angle);
      }
    }

    // For single split (targetCount = 2), split ALL eligible cells in half
    // This enables recursive splitting: 1 -> 2 -> 4 -> 8, etc.
    if (effectiveTargetCount === 2) {
      // Collect all cells that can split (have enough mass and aren't on cooldown)
      const cellsToSplit = [];
      for (const cell of this.cells) {
        if (cell.mass >= 100 && cell.canSplit() && this.cells.length < this.getMaxCells()) {
          cellsToSplit.push(cell);
        }
      }
      
      // Split each eligible cell in half (recursive splitting)
      // This allows: 1 cell -> 2 cells -> 4 cells -> 8 cells, etc.
      for (const cell of cellsToSplit) {
        if (this.cells.length >= this.getMaxCells()) break; // Respect max cell limit
        
        const newCell = cell.split(2, dirX, dirY, 1.0);
        if (newCell) {
          newCell.setInstantMerge(this.config.instantMerge);
          this.cells.push(newCell);
        }
      }
      
      return; // Done with recursive split
    }

    // For multiple splits, use the existing logic (with max cell limit)
    this.splitWithDirection(effectiveTargetCount, dirX, dirY);
  }

  splitWithDirection(targetCount, dirX, dirY, impulseMultiplier = 1.0) {
    // Enforce maximum cell count based on total mass
    const maxCells = this.getMaxCells();
    const effectiveTargetCount = Math.min(targetCount, maxCells);
    
    if (this.cells.length >= effectiveTargetCount) return;

    // Perform splits until we reach target count (respecting max cell limit)
    while (this.cells.length < effectiveTargetCount) {
      let splitOccurred = false;
      
      // Try to split each cell
      for (let i = this.cells.length - 1; i >= 0; i--) {
        const cell = this.cells[i];
        
        // Check if cell can split and we haven't reached max cells
        if (cell.canSplit() && cell.mass >= 100 && this.cells.length < effectiveTargetCount) {
          const newCell = cell.split(effectiveTargetCount, dirX, dirY, impulseMultiplier);
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

  splitIntoEvenPieces(pieceCount, dirX, dirY, impulseMultiplier = 0.5) {
    // Enforce maximum cell count based on total mass
    const maxCells = this.getMaxCells();
    const effectivePieceCount = Math.min(pieceCount, maxCells);
    
    // Split all cells into even-sized pieces
    const cellsToSplit = [...this.cells];
    this.cells = [];
    
    cellsToSplit.forEach((cell) => {
      // For virus splits, always try to reach target count (16 pieces)
      // If single cell, split into all 16 pieces
      // If multiple cells, distribute pieces across them
      let actualPieceCount;
      if (cellsToSplit.length === 1) {
        // Single cell - split into target count (16 pieces)
        const maxPiecesFromMass = Math.floor(cell.mass / 100); // Each piece needs at least 100 mass
        actualPieceCount = Math.min(effectivePieceCount, maxPiecesFromMass);
      } else {
        // Multiple cells - distribute pieces
        const piecesPerCell = Math.max(1, Math.floor(effectivePieceCount / cellsToSplit.length));
        const maxPiecesFromMass = Math.floor(cell.mass / 100);
        actualPieceCount = Math.min(piecesPerCell, maxPiecesFromMass, effectivePieceCount - this.cells.length);
      }
      
      if (actualPieceCount < 2) {
        // Can't split this cell enough, keep it as is
        this.cells.push(cell);
        return;
      }
      
      const totalMass = cell.mass;
      const massPerPiece = totalMass / actualPieceCount;
      
      // Create all pieces at once
      for (let i = 0; i < actualPieceCount; i++) {
        // Virus/burst splits need proper spacing to prevent overlap
        // Use larger radius offset for better separation - scale with number of pieces
        const angle = (Math.PI * 2 * i) / actualPieceCount;
        // Scale radius offset based on piece count - more pieces = more spacing needed
        const baseRadiusOffset = 0.6; // Base 60% of radius
        const pieceCountFactor = Math.min(actualPieceCount / 8, 1.5); // Scale up to 1.5x for more pieces
        const radiusOffset = baseRadiusOffset * pieceCountFactor;
        const offsetX = Math.cos(angle) * cell.getRadius() * radiusOffset;
        const offsetY = Math.sin(angle) * cell.getRadius() * radiusOffset;
        
        const newCell = new Cell(
          Date.now() + Math.random() + i,
          cell.x + offsetX,
          cell.y + offsetY,
          massPerPiece,
          this.id
        );
        
        // Apply impulse in the split direction (blended with radial direction)
        const radialDirX = Math.cos(angle);
        const radialDirY = Math.sin(angle);
        const blendX = (dirX * 0.6 + radialDirX * 0.4);
        const blendY = (dirY * 0.6 + radialDirY * 0.4);
        const blendLen = Math.sqrt(blendX * blendX + blendY * blendY);
        const finalDirX = blendLen > 0 ? blendX / blendLen : radialDirX;
        const finalDirY = blendLen > 0 ? blendY / blendLen : radialDirY;
        
        // Increased impulse for virus splits to prevent overlap - no overlap until merge attempt
        const baseImpulseSpeed = 7.5; // Increased base for better separation
        const impulseSpeed = baseImpulseSpeed * impulseMultiplier;
        
        // Apply strong impulse for good separation - cells should not overlap initially
        newCell.vx = finalDirX * impulseSpeed * 1.8; // 80% more impulse for better separation
        newCell.vy = finalDirY * impulseSpeed * 1.8;
        newCell.setInstantMerge(this.config.instantMerge);
        newCell.splitTime = Date.now();
        newCell.splitDirectionX = finalDirX;
        newCell.splitDirectionY = finalDirY;
        
        this.cells.push(newCell);
      }
    });
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
    // Feed multiple times rapidly - macro feed for faster feeding
    const feeds = [];
    const feedCount = 5; // Feed 5 times for macro feed
    for (let i = 0; i < feedCount; i++) {
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

  getMaxCells() {
    // Calculate maximum number of cells based on total mass
    // Each cell needs minimum 100 mass to exist
    const totalMass = this.getTotalMass();
    const minCellMass = 100;
    const maxCellsByMass = Math.floor(totalMass / minCellMass);
    
    // Cap at reasonable maximum (32 cells max)
    const absoluteMax = 32;
    
    // Also ensure at least 1 cell
    return Math.max(1, Math.min(maxCellsByMass, absoluteMax));
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
        const combinedRadius = r1 + r2;
        const overlap = combinedRadius - dist;

        if (overlap > 0) {
          // Check cursor position relative to THIS SPECIFIC pair of cells FIRST
          // This allows selective merging: cursor in center of 3 small cells = merge those, keep big cell separate
          const cellMidX = (cell1.x + cell2.x) / 2;
          const cellMidY = (cell1.y + cell2.y) / 2;
          const cursorToMidDx = this.cursorX - cellMidX;
          const cursorToMidDy = this.cursorY - cellMidY;
          const cursorToMidDist = Math.sqrt(cursorToMidDx * cursorToMidDx + cursorToMidDy * cursorToMidDy);
          
          // Also check if cursor is on either cell (more lenient check)
          const cursorToCell1Dx = this.cursorX - cell1.x;
          const cursorToCell1Dy = this.cursorY - cell1.y;
          const cursorToCell1Dist = Math.sqrt(cursorToCell1Dx * cursorToCell1Dx + cursorToCell1Dy * cursorToCell1Dy);
          const cursorToCell2Dx = this.cursorX - cell2.x;
          const cursorToCell2Dy = this.cursorY - cell2.y;
          const cursorToCell2Dist = Math.sqrt(cursorToCell2Dx * cursorToCell2Dx + cursorToCell2Dy * cursorToCell2Dy);
          const isCursorOnCell1 = cursorToCell1Dist < r1 * 1.2; // Cursor within 120% of cell1 radius
          const isCursorOnCell2 = cursorToCell2Dist < r2 * 1.2; // Cursor within 120% of cell2 radius
          const isCursorOnEitherCell = isCursorOnCell1 || isCursorOnCell2;
          
          // Cursor position relative to THIS pair's midpoint determines merge
          const cursorToMidRatio = cursorToMidDist / combinedRadius;
          
          // Short cooldown only to prevent instant re-merge after split
          // BUT: If cursor is centered, allow merge even during cooldown (player intent is clear)
          const timeSinceSplit1 = now - cell1.splitTime;
          const timeSinceSplit2 = now - cell2.splitTime;
          const SPLIT_MERGE_COOLDOWN = 400; // Short 400ms cooldown
          const isRecentSplit1 = cell1.splitTime > 0 && timeSinceSplit1 < SPLIT_MERGE_COOLDOWN;
          const isRecentSplit2 = cell2.splitTime > 0 && timeSinceSplit2 < SPLIT_MERGE_COOLDOWN;
          const isCursorCentered = cursorToMidRatio < 0.3 || isCursorOnEitherCell; // Cursor is centered on this pair OR on either cell
          
          // If either cell was recently split, require minimal separation UNLESS cursor is centered
          if ((isRecentSplit1 || isRecentSplit2) && !isCursorCentered) {
            // Cells that were just split need minimal separation before merging
            const minSeparation = Math.max(r1, r2) * 0.3; // Only 30% separation needed
            if (dist < minSeparation) {
              continue; // Too close, can't merge yet (unless cursor is centered)
            }
          }
          
          // User-controlled merges: cursor position is PRIMARY control for EACH cell pair
          // Calculate overlap percentage (how much cells have merged)
          const overlapPercent = overlap / combinedRadius;
          
          // User-controlled merge logic for THIS specific cell pair:
          // When cursor is centered, merge should happen immediately if cells are overlapping at all
          // When cursor is away, merge should be prevented or very slow
          
          let shouldMerge = false;
          let requiredOverlap = 1.0; // Default: require 100% overlap (prevent merge)
          
          // If cursor is on either cell or very close to center, merge immediately
          if (isCursorOnEitherCell || cursorToMidRatio < 0.25) {
            // Cursor on cell or centered on THIS pair = player wants THESE cells to merge = merge immediately
            // If cells are overlapping at all and cursor is centered, merge right away
            requiredOverlap = 0.001; // Only need 0.1% overlap (instant when cursor centered/on cell)
            shouldMerge = overlapPercent >= requiredOverlap;
          } else if (cursorToMidRatio < 0.4) {
            // Cursor close to THIS pair = player wants quick merge
            requiredOverlap = 0.03; // Need 3% overlap (quick merge)
            shouldMerge = overlapPercent >= requiredOverlap;
          } else if (cursorToMidRatio < 0.65) {
            // Cursor away from THIS pair = player neutral
            requiredOverlap = 0.25; // Need 25% overlap (moderate)
            shouldMerge = overlapPercent >= requiredOverlap;
          } else if (cursorToMidRatio < 1.0) {
            // Cursor far from THIS pair = player hindering merge
            requiredOverlap = 0.55; // Need 55% overlap (hard to merge)
            shouldMerge = overlapPercent >= requiredOverlap;
          } else {
            // Cursor very far from THIS pair = player actively preventing merge
            requiredOverlap = 0.80; // Need 80% overlap (very hard, almost prevents merge)
            shouldMerge = overlapPercent >= requiredOverlap;
          }
          
          // Merge only if user allows it (cursor position relative to THIS pair) AND overlap requirement is met
          if (shouldMerge) {
            this.instantMergeCells(cell1, cell2);
            j--; // Adjust index after removal
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

