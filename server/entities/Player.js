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
    
    // Track split timing for double/triple splits
    this.lastSplitTime = 0;
    this.splitSequence = 0; // 0 = no split, 1 = single split, 2 = double split, 3 = triple split
    this.SPLIT_SEQUENCE_WINDOW = 300; // 300ms window for split sequences

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

    // Check for split sequence (double/triple split) - only for rapid consecutive splits
    const now = Date.now();
    const timeSinceLastSplit = now - this.lastSplitTime;
    
    // Reset sequence if too much time has passed
    if (timeSinceLastSplit >= this.SPLIT_SEQUENCE_WINDOW) {
      this.splitSequence = 0;
    }
    
    if (effectiveTargetCount === 2) {
      // Single split - ALWAYS allow if mass is available, regardless of previous splits
      // Only use sequence logic for RAPID consecutive splits (within 300ms)
      if (timeSinceLastSplit < this.SPLIT_SEQUENCE_WINDOW && this.splitSequence > 0) {
        // This is a rapid consecutive split - could be double or triple
        this.splitSequence++;
        if (this.splitSequence === 2) {
          // Double split: create 4 cells in a line, border-to-border
          this.splitIntoLine(4, dirX, dirY);
          this.lastSplitTime = now;
          return;
        } else if (this.splitSequence >= 3) {
          // Triple split: create 8 cells in a line, border-to-border
          this.splitIntoLine(8, dirX, dirY);
          this.splitSequence = 0; // Reset sequence
          this.lastSplitTime = now;
          return;
        }
      }
      
      // Normal single split - ALWAYS works if mass is available
      // Collect all cells that can split (have enough mass)
      const cellsToSplit = [];
      for (const cell of this.cells) {
        // If instant merge is enabled, always allow splits if mass >= 100
        const canSplitNow = this.config.instantMerge ? true : cell.canSplit();
        if (cell.mass >= 100 && canSplitNow && this.cells.length < this.getMaxCells()) {
          cellsToSplit.push(cell);
        }
      }
      
      // Split each eligible cell in half (recursive splitting)
      if (cellsToSplit.length > 0) {
        for (const cell of cellsToSplit) {
          if (this.cells.length >= this.getMaxCells()) break;
          
          const newCell = cell.split(2, dirX, dirY, 1.0);
          if (newCell) {
            newCell.setInstantMerge(this.config.instantMerge);
            cell.setInstantMerge(this.config.instantMerge);
            this.cells.push(newCell);
          }
        }
        
        // Update sequence tracking (only for rapid splits)
        if (timeSinceLastSplit < this.SPLIT_SEQUENCE_WINDOW) {
          this.splitSequence = 1; // Mark as first in potential sequence
        } else {
          this.splitSequence = 0; // Reset if too much time passed
        }
        this.lastSplitTime = now;
      }
      
      return;
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
        // If instant merge is enabled, always allow splits if mass >= 100
        const canSplitNow = this.config.instantMerge ? true : cell.canSplit();
        if (canSplitNow && cell.mass >= 100 && this.cells.length < effectiveTargetCount) {
          const newCell = cell.split(effectiveTargetCount, dirX, dirY, impulseMultiplier);
          if (newCell) {
            // Set split cooldown for new cell
            newCell.setInstantMerge(this.config.instantMerge);
            // Ensure original cell also maintains instant merge setting
            cell.setInstantMerge(this.config.instantMerge);
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

  splitIntoLine(cellCount, dirX, dirY) {
    // Split into a line formation: cells placed border-to-border in a line
    // ALWAYS split into even pieces (4 for double, 8 for triple)
    if (this.cells.length === 0) return;
    
    let largestCell = this.cells[0];
    for (const cell of this.cells) {
      if (cell.mass > largestCell.mass) {
        largestCell = cell;
      }
    }
    
    // Ensure even split count (4 or 8)
    const evenCount = cellCount === 4 ? 4 : 8; // Always 4 or 8
    const maxCells = this.getMaxCells();
    const effectiveCount = Math.min(evenCount, maxCells);
    if (this.cells.length >= effectiveCount || largestCell.mass < 100 * effectiveCount) return;
    
    // Calculate mass per cell - ensure perfectly even distribution
    const totalMass = largestCell.mass;
    const massPerCell = totalMass / effectiveCount; // Perfectly even split
    
    // Remove the original cell
    this.cells = this.cells.filter(c => c.id !== largestCell.id);
    
    // Create cells in a line, border-to-border
    // Use actual radius calculation to get proper spacing
    const tempCell = new Cell(0, 0, 0, massPerCell, this.id);
    const cellRadius = tempCell.getRadius();
    const spacing = cellRadius * 2.1; // Border-to-border spacing (slightly more than 2 * radius for slight gap)
    
    // Start position: offset backward from center so line extends forward
    const startOffset = -(effectiveCount - 1) * spacing / 2;
    
    for (let i = 0; i < effectiveCount; i++) {
      const offset = startOffset + i * spacing;
      const newX = largestCell.x + dirX * offset;
      const newY = largestCell.y + dirY * offset;
      
      const newCell = new Cell(
        Date.now() + Math.random() + i,
        newX,
        newY,
        massPerCell,
        this.id
      );
      
      // Minimal velocity - cells should stay in line
      newCell.vx = dirX * 1.5; // Small forward velocity
      newCell.vy = dirY * 1.5;
      newCell.setInstantMerge(this.config.instantMerge);
      newCell.splitTime = Date.now();
      newCell.splitDirectionX = dirX;
      newCell.splitDirectionY = dirY;
      
      this.cells.push(newCell);
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
      
      // Create all pieces at once - place them closer together so they can merge naturally
      for (let i = 0; i < actualPieceCount; i++) {
        // Virus/burst splits: place pieces closer together (not in a wide circle)
        // They should be able to merge naturally, not stuck in a circle
        const angle = (Math.PI * 2 * i) / actualPieceCount;
        // Much smaller radius offset - pieces start close together
        const baseRadiusOffset = 0.25; // Only 25% of radius - much closer together
        const pieceCountFactor = Math.min(actualPieceCount / 16, 1.0); // Scale down for more pieces
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
        
        // Apply minimal impulse - pieces should stay close and merge naturally
        // Use radial direction but with very low impulse so they don't fly apart
        const radialDirX = Math.cos(angle);
        const radialDirY = Math.sin(angle);
        
        // Very low impulse - just enough to prevent initial overlap, not enough to keep them apart
        const baseImpulseSpeed = 2.0; // Much lower base impulse
        const impulseSpeed = baseImpulseSpeed * impulseMultiplier;
        
        // Apply minimal radial impulse - pieces will naturally come together
        newCell.vx = radialDirX * impulseSpeed * 0.5; // Very low impulse
        newCell.vy = radialDirY * impulseSpeed * 0.5;
        newCell.setInstantMerge(this.config.instantMerge);
        newCell.splitTime = Date.now();
        newCell.splitDirectionX = radialDirX; // Use radial direction for split tracking
        newCell.splitDirectionY = radialDirY;
        
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
          const SPLIT_MERGE_COOLDOWN = 200; // Reduced to 200ms cooldown
          const isRecentSplit1 = cell1.splitTime > 0 && timeSinceSplit1 < SPLIT_MERGE_COOLDOWN;
          const isRecentSplit2 = cell2.splitTime > 0 && timeSinceSplit2 < SPLIT_MERGE_COOLDOWN;
          const isCursorCentered = cursorToMidRatio < 0.4 || isCursorOnEitherCell; // More lenient - cursor is centered on this pair OR on either cell
          
          // If cursor is centered, allow instant merge even after split
          if (isCursorCentered) {
            // Cursor centered = player wants to merge immediately, bypass cooldown
            // Continue to merge logic below
          } else if ((isRecentSplit1 || isRecentSplit2)) {
            // Cells that were just split need minimal separation before merging (only if cursor not centered)
            const minSeparation = Math.max(r1, r2) * 0.2; // Only 20% separation needed
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

    // Check auto-split at 22.5k mass - find largest cell over threshold
    let cellToAutoSplit = null;
    let maxMass = 0;
    for (const cell of this.cells) {
      if (cell.mass >= config.autoSplitMass && cell.mass > maxMass) {
        cellToAutoSplit = cell;
        maxMass = cell.mass;
      }
    }
    
    if (cellToAutoSplit) {
      // Auto-split: split once into 2 cells (22.5k -> 2 cells of 11.25k each)
      const centerX = this.getCenterX();
      const centerY = this.getCenterY();
      const dx = this.cursorX - centerX;
      const dy = this.cursorY - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const dirX = dist > 0 ? dx / dist : 1;
      const dirY = dist > 0 ? dy / dist : 0;
      
      // Just split once into 2 cells (same as single split)
      if (this.cells.length < this.getMaxCells()) {
        const newCell = cellToAutoSplit.split(2, dirX, dirY, 1.0);
        if (newCell) {
          newCell.setInstantMerge(this.config.instantMerge);
          cellToAutoSplit.setInstantMerge(this.config.instantMerge);
          this.cells.push(newCell);
        }
      }
    }
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

