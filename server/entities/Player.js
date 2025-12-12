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
    
    // Always split to next power of 2 (even numbers only): 1->2->4->8->16->32
    // Never allow odd numbers
    let currentCount = this.cells.length;
    let nextPowerOf2 = 1;
    while (nextPowerOf2 <= currentCount) {
      nextPowerOf2 *= 2;
    }
    
    // Cap at max cells
    let effectiveTargetCount = Math.min(nextPowerOf2, maxCells);
    
    // If we're already at max or at the target power of 2, can't split more
    if (this.cells.length >= effectiveTargetCount || this.cells.length >= maxCells) return;

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
    
    // Always ensure even numbers: split ALL cells to reach next power of 2
    // This ensures: 1->2, 2->4, 4->8, 8->16, 16->32 (never odd numbers)
    // Collect all cells that can split (have enough mass)
    const cellsToSplit = [];
    for (const cell of this.cells) {
        // If instant merge is enabled, always allow splits if mass >= 300
        const canSplitNow = this.config.instantMerge ? true : cell.canSplit();
        
        // Can split if: has enough mass (>= 300) to split in half
        if (cell.mass >= 300 && canSplitNow) {
        cellsToSplit.push(cell);
      }
    }
    
    // Only split if we can split ALL cells (to maintain even numbers)
    // For 1 cell: need to split 1 -> 2
    // For 2 cells: need to split both -> 4
    // For 4 cells: need to split all -> 8
    // etc.
    if (cellsToSplit.length === this.cells.length && cellsToSplit.length > 0) {
      // Split ALL cells in half to reach next power of 2
      for (const cell of cellsToSplit) {
        if (this.cells.length >= effectiveTargetCount) break;
        
        const newCell = cell.split(2, dirX, dirY, 1.0);
        if (newCell) {
          newCell.setInstantMerge(this.config.instantMerge);
          cell.setInstantMerge(this.config.instantMerge);
          this.cells.push(newCell);
        }
      }
      
      this.lastSplitTime = now;
      this.splitSequence = 0; // Reset sequence for even-number splits
    }
  }

  splitWithDirection(targetCount, dirX, dirY, impulseMultiplier = 1.0) {
    // Enforce maximum cell count based on total mass
    const maxCells = this.getMaxCells();
    
    // Ensure target is always a power of 2 (even number)
    let powerOf2 = 1;
    while (powerOf2 < targetCount && powerOf2 < maxCells) {
      powerOf2 *= 2;
    }
    const effectiveTargetCount = Math.min(powerOf2, maxCells);
    
    if (this.cells.length >= effectiveTargetCount) return;

    // For multiple splits (4, 8, 16, 32), split all cells until we reach target
    // This ensures we always have even numbers
    while (this.cells.length < effectiveTargetCount) {
      let splitOccurred = false;
      
      // Try to split each cell
      for (let i = this.cells.length - 1; i >= 0; i--) {
        const cell = this.cells[i];
        
        // Check if cell can split and we haven't reached max cells
        // If instant merge is enabled, always allow splits if mass >= 300
        const canSplitNow = this.config.instantMerge ? true : cell.canSplit();
        
        // Can split if has enough mass (>= 300) - size cap doesn't prevent splitting
        if (cell.mass >= 300 && canSplitNow && this.cells.length < effectiveTargetCount) {
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
      if (this.cells.length >= effectiveCount || largestCell.mass < 200 * effectiveCount) return;
    
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
        const maxPiecesFromMass = Math.floor(cell.mass / 200); // Each piece needs at least 200 mass
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
      
      // Create all pieces at once - place them far apart so they don't overlap
      for (let i = 0; i < actualPieceCount; i++) {
        // Virus/burst splits: place pieces far apart to prevent immediate overlap
        const angle = (Math.PI * 2 * i) / actualPieceCount;
        // Much larger radius offset - pieces start far apart to prevent overlap
        const baseRadiusOffset = 1.5; // 150% of radius - much further apart
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
        
        // Apply strong impulse - pieces should fly apart and not overlap
        // Use radial direction with strong impulse so they separate well
        const radialDirX = Math.cos(angle);
        const radialDirY = Math.sin(angle);
        
        // Strong impulse to ensure good separation - prevent immediate overlap
        const baseImpulseSpeed = 12.0; // Much higher base impulse for virus splits
        const sizeFactor = Math.min(newCell.getRadius() * 0.15, 8.0); // Scale with new cell size
        const impulseSpeed = (baseImpulseSpeed + sizeFactor) * impulseMultiplier;
        
        // Apply strong radial impulse - pieces will fly apart and not overlap
        newCell.vx = radialDirX * impulseSpeed;
        newCell.vy = radialDirY * impulseSpeed;
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
    if (largestCell.mass > 200) {
      const feedMass = Math.min(20, largestCell.mass * 0.05); // Reduced from 35/10% to 20/5%
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
    // Each cell needs minimum 200 mass to exist
    const totalMass = this.getTotalMass();
    const minCellMass = 200;
    const maxCellsByMass = Math.floor(totalMass / minCellMass);
    
    // Cap at reasonable maximum (32 cells max)
    const absoluteMax = 32;
    
    // Also ensure at least 1 cell
    return Math.max(1, Math.min(maxCellsByMass, absoluteMax));
  }

  getMaxMassPerCell(cellCount) {
    // Size caps based on cell count - prevents cells from getting too large
    // Return 0 means no cap (unlimited)
    // This encourages splitting when you have fewer cells
    if (cellCount <= 1) {
      return 0; // No cap for single cell
    } else if (cellCount === 2) {
      return 15000; // Max 15k mass per cell when you have 2 cells
    } else if (cellCount <= 4) {
      return 8000; // Max 8k mass per cell when you have 3-4 cells
    } else if (cellCount <= 8) {
      return 5000; // Max 5k mass per cell when you have 5-8 cells
    } else if (cellCount <= 16) {
      return 3000; // Max 3k mass per cell when you have 9-16 cells
    } else {
      return 2000; // Max 2k mass per cell when you have 17+ cells
    }
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
    // - Very close (within 1x avg radius): Cursor centered = quick merge (800ms)
    // - Close (1x-2x avg radius): Medium delay (1200ms) - cursor slightly away
    // - Medium (2x-3.5x avg radius): Longer delay (1800ms) - cursor away
    // - Far (3.5x+ avg radius): Very long delay (2500ms) - cursor far away = actively hindering merge
    const veryCloseThreshold = avgRadius * 1.0;   // Cursor centered
    const closeThreshold = avgRadius * 2.0;         // Cursor slightly away
    const mediumThreshold = avgRadius * 3.5;        // Cursor away
    
    let mergeDelayMs = 0;
    if (config.instantMerge) {
      if (cursorDist <= veryCloseThreshold) {
        mergeDelayMs = 800;    // Cursor centered = slower merge
      } else if (cursorDist <= closeThreshold) {
        mergeDelayMs = 1200;   // Cursor slightly away = medium delay
      } else if (cursorDist <= mediumThreshold) {
        mergeDelayMs = 1800;   // Cursor away = longer delay
      } else {
        mergeDelayMs = 2500;   // Cursor far away = very long delay (hindering merge)
      }
    }
    
    // Calculate average cell mass for mass-based merge delay scaling
    let avgMass = 0;
    if (this.cells.length > 0) {
      const masses = this.cells.map(cell => cell.mass);
      avgMass = masses.reduce((sum, m) => sum + m, 0) / masses.length;
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

        // Require minimum overlap before considering merge (cells must be closer together)
        const minOverlapRequired = combinedRadius * 0.10; // Cells must overlap at least 10% before merge is considered
        if (overlap > minOverlapRequired) {
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
          const SPLIT_MERGE_COOLDOWN = 800; // Increased to 800ms cooldown to slow merges
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
          
          // Check if either cell was auto-split (deeper merge required)
          const isAutoSplit1 = cell1.autoSplitTime > 0;
          const isAutoSplit2 = cell2.autoSplitTime > 0;
          const isAutoSplitPair = isAutoSplit1 || isAutoSplit2;
          
          // Calculate mass-based merge delay scaling (bigger cells = slower merges)
          // Small increments: every 1000 mass adds ~50ms to merge delay
          const avgCellMass = (cell1.mass + cell2.mass) / 2;
          const massDelayBonus = Math.floor(avgCellMass / 1000) * 50; // 50ms per 1000 mass
          
          // User-controlled merge logic for THIS specific cell pair:
          // When cursor is centered, merge should happen immediately if cells are overlapping at all
          // When cursor is away, merge should be prevented or very slow
          
          let shouldMerge = false;
          let requiredOverlap = 1.0; // Default: require 100% overlap (prevent merge)
          
          // Base overlap requirements
          let baseRequiredOverlap = 0.15;
          if (isCursorOnEitherCell || cursorToMidRatio < 0.25) {
            baseRequiredOverlap = 0.15; // Need 15% overlap
          } else if (cursorToMidRatio < 0.4) {
            baseRequiredOverlap = 0.25; // Need 25% overlap
          } else if (cursorToMidRatio < 0.65) {
            baseRequiredOverlap = 0.45; // Need 45% overlap
          } else if (cursorToMidRatio < 1.0) {
            baseRequiredOverlap = 0.70; // Need 70% overlap
          } else {
            baseRequiredOverlap = 0.90; // Need 90% overlap
          }
          
          // Auto-split cells require much deeper merge (add 0.50 to required overlap for much deeper merge)
          if (isAutoSplitPair) {
            requiredOverlap = Math.min(1.0, baseRequiredOverlap + 0.50); // Much deeper merge for auto-split cells
          } else {
            requiredOverlap = baseRequiredOverlap;
          }
          
          shouldMerge = overlapPercent >= requiredOverlap;
          
          // Apply mass-based delay: bigger cells need more time before merging
          // Check if enough time has passed since split (mass-based cooldown)
          if (shouldMerge && massDelayBonus > 0) {
            const timeSinceSplit1 = now - cell1.splitTime;
            const timeSinceSplit2 = now - cell2.splitTime;
            const minTimeSinceSplit = Math.min(timeSinceSplit1, timeSinceSplit2);
            
            // Require additional delay based on mass before allowing merge
            if (minTimeSinceSplit < massDelayBonus) {
              shouldMerge = false; // Wait for mass-based delay
            }
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
          // Mark both cells as auto-split for deeper merge requirements
          const now = Date.now();
          newCell.autoSplitTime = now;
          cellToAutoSplit.autoSplitTime = now;
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
    // Check if cursor is centered (close to player center) - if so, bring cells together
    const centerX = this.getCenterX();
    const centerY = this.getCenterY();
    const cursorDx = this.cursorX - centerX;
    const cursorDy = this.cursorY - centerY;
    const cursorDist = Math.sqrt(cursorDx * cursorDx + cursorDy * cursorDy);
    
    // Calculate average radius to determine if cursor is "centered"
    let avgRadius = 0;
    if (this.cells.length > 0) {
      const radii = this.cells.map(cell => cell.getRadius());
      avgRadius = radii.reduce((sum, r) => sum + r, 0) / radii.length;
    }
    
    // If cursor is within 1.5x average radius of center, bring cells together
    const isCursorCentered = cursorDist < avgRadius * 1.5;
    
    // Update each cell's movement
    this.cells.forEach((cell) => {
      cell.updateMovement(this.inputDirX, this.inputDirY, world.config);
      
      // If cursor is centered, add attraction force toward center to bring cells together
      if (isCursorCentered && this.cells.length > 1) {
        const cellToCenterDx = centerX - cell.x;
        const cellToCenterDy = centerY - cell.y;
        const cellToCenterDist = Math.sqrt(cellToCenterDx * cellToCenterDx + cellToCenterDy * cellToCenterDy);
        
        if (cellToCenterDist > 0) {
          // Normalize direction toward center
          const dirToCenterX = cellToCenterDx / cellToCenterDist;
          const dirToCenterY = cellToCenterDy / cellToCenterDist;
          
          // Apply attraction force (stronger when further from center)
          // Scale by distance so cells closer to center aren't pulled as hard
          const attractionStrength = Math.min(0.3, cellToCenterDist / 100); // Max 0.3, scales with distance
          const attractionSpeed = 3.0; // Base speed for attraction
          
          // Add velocity toward center
          cell.vx += dirToCenterX * attractionSpeed * attractionStrength;
          cell.vy += dirToCenterY * attractionSpeed * attractionStrength;
        }
      }
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

