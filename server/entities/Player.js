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
    
    // Use the unified split method
    this.splitToTargetCount(targetCount, dirX, dirY, 1.0);
    
    this.lastSplitTime = Date.now();
    this.splitSequence = 0;
  }
  
  splitToTargetCount(targetCount, dirX, dirY, impulseMultiplier = 1.0) {
    if (this.cells.length === 0) return;
    
    // Enforce maximum cell count based on total mass
    const maxCells = this.getMaxCells();
    
    // Calculate total mass BEFORE splitting to ensure even distribution
    const totalMass = this.getTotalMass();
    const minCellMass = 200; // Minimum mass per cell
    
    // Check if we can split at all - need at least 2 cells worth of mass
    if (totalMass < minCellMass * 2) {
      return; // Not enough mass to split
    }
    
    // Check if ALL cells can split (have enough mass individually)
    // For even splitting, each cell needs at least 300 mass to split in half
    let allCellsCanSplit = true;
    for (const cell of this.cells) {
      const canSplitNow = this.config.instantMerge ? true : cell.canSplit();
      if (cell.mass < 300 || !canSplitNow) {
        allCellsCanSplit = false;
        break;
      }
    }
    
    if (!allCellsCanSplit) return;
    
    // Calculate how many cells we can actually create based on total mass
    const maxAffordableCells = Math.floor(totalMass / minCellMass);
    const actualMaxCells = Math.min(maxCells, maxAffordableCells);
    
    // If we're already at max, can't split more
    if (this.cells.length >= actualMaxCells) return;
    
    // Calculate next power of 2 target (but don't exceed actualMaxCells)
    const currentCount = this.cells.length;
    let nextPowerOf2 = currentCount;
    while (nextPowerOf2 < actualMaxCells && nextPowerOf2 < targetCount) {
      nextPowerOf2 *= 2;
    }
    const effectiveTargetCount = Math.min(nextPowerOf2, actualMaxCells);
    
    // If we're already at or above effective target, try to split to next power of 2
    if (this.cells.length >= effectiveTargetCount && this.cells.length < actualMaxCells) {
      // Can still split more - calculate next power of 2
      let nextTarget = this.cells.length * 2;
      if (nextTarget <= actualMaxCells) {
        // Split once to double the cell count
        this.performSingleSplitIteration(dirX, dirY, impulseMultiplier, actualMaxCells);
        // Redistribute mass after split
        this.redistributeMassEvenly(totalMass, minCellMass);
        return;
      }
      return; // Can't split more
    }
    
    // Calculate how many split iterations we need
    // Each iteration doubles the cell count (splits each cell once)
    const targetMultiplier = effectiveTargetCount / currentCount;
    const iterationsNeeded = Math.ceil(Math.log2(targetMultiplier));
    
    // Perform all split iterations: split ALL cells simultaneously in each iteration
    for (let iteration = 0; iteration < iterationsNeeded && this.cells.length < effectiveTargetCount && this.cells.length < actualMaxCells; iteration++) {
      this.performSingleSplitIteration(dirX, dirY, impulseMultiplier, actualMaxCells);
      
      // If we hit maxCells, stop splitting
      if (this.cells.length >= actualMaxCells) break;
    }
    
    // Redistribute mass evenly across ALL cells after all splits are complete
    this.redistributeMassEvenly(totalMass, minCellMass);
  }
  
  performSingleSplitIteration(dirX, dirY, impulseMultiplier, maxCells) {
    const newCells = [];
    const currentCellCount = this.cells.length;
    
    // Split each existing cell once (all at the same time)
    for (let i = 0; i < currentCellCount && this.cells.length + newCells.length < maxCells; i++) {
      const cell = this.cells[i];
      const newCell = cell.split(2, dirX, dirY, impulseMultiplier);
      if (newCell) {
        newCell.setInstantMerge(this.config.instantMerge);
        cell.setInstantMerge(this.config.instantMerge);
        newCells.push(newCell);
      }
    }
    
    // Add all new cells at once (safety check for maxCells)
    const cellsToAdd = newCells.slice(0, maxCells - this.cells.length);
    this.cells.push(...cellsToAdd);
  }
  
  redistributeMassEvenly(totalMass, minCellMass) {
    if (this.cells.length === 0) return;
    
    // Redistribute mass evenly across ALL cells after all splits are complete
    const evenMass = totalMass / this.cells.length;
    const finalEvenMass = Math.max(minCellMass, evenMass);
    
    // Redistribute mass evenly
    for (const cell of this.cells) {
      cell.mass = finalEvenMass;
    }
    
    // Distribute any remaining mass evenly (handle rounding)
    const actualTotalMass = this.cells.length * finalEvenMass;
    const massDifference = totalMass - actualTotalMass;
    if (massDifference > 0 && this.cells.length > 0) {
      const massPerCell = massDifference / this.cells.length;
      for (const cell of this.cells) {
        cell.mass += massPerCell;
      }
    }
  }

  splitWithDirection(targetCount, dirX, dirY, impulseMultiplier = 1.0) {
    // Use the unified split method
    this.splitToTargetCount(targetCount, dirX, dirY, impulseMultiplier);
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
    
    // Calculate total mass BEFORE splitting to ensure even distribution
    const totalMass = this.getTotalMass();
    const minCellMass = 200; // Minimum mass per cell
    
    // Check if we have enough total mass to split into target count
    const requiredMass = effectivePieceCount * minCellMass;
    if (totalMass < requiredMass) {
      // Not enough mass - split into as many pieces as we can afford
      const maxAffordablePieces = Math.floor(totalMass / minCellMass);
      if (maxAffordablePieces < 2) {
        // Can't split at all
        return;
      }
      // Use max affordable pieces, but cap at effectivePieceCount
      const finalPieceCount = Math.min(maxAffordablePieces, effectivePieceCount);
      
      // Split all cells into even pieces with even mass distribution
      this.splitAllCellsIntoEvenPieces(finalPieceCount, totalMass, dirX, dirY, impulseMultiplier);
      return;
    }
    
    // Split all cells into even pieces with even mass distribution
    this.splitAllCellsIntoEvenPieces(effectivePieceCount, totalMass, dirX, dirY, impulseMultiplier);
  }
  
  splitAllCellsIntoEvenPieces(pieceCount, totalMass, dirX, dirY, impulseMultiplier) {
    // Clear existing cells and create new ones with even mass distribution
    const cellsToSplit = [...this.cells];
    this.cells = [];
    
    // Calculate even mass per cell
    const massPerCell = totalMass / pieceCount;
    const minCellMass = 200;
    const finalMassPerCell = Math.max(minCellMass, massPerCell);
    
    // Distribute cells across the split pieces
    // If we have multiple cells, we need to split them all into pieces
    const piecesPerOriginalCell = Math.ceil(pieceCount / cellsToSplit.length);
    
    let pieceIndex = 0;
    for (const cell of cellsToSplit) {
      if (pieceIndex >= pieceCount) break;
      
      // Calculate how many pieces this cell should split into
      const remainingPieces = pieceCount - pieceIndex;
      const piecesForThisCell = Math.min(piecesPerOriginalCell, remainingPieces);
      
      if (piecesForThisCell < 1) break;
      
      // Create pieces from this cell
      // Calculate the radius of the new cells directly (same formula as Cell.getRadius())
      const baseRadius = Math.sqrt(finalMassPerCell / Math.PI);
      const scaleFactor = 4.5 + Math.min(finalMassPerCell / 5000, 2.5);
      const newCellRadius = baseRadius * scaleFactor;
      
      for (let i = 0; i < piecesForThisCell && pieceIndex < pieceCount; i++) {
        const angle = (Math.PI * 2 * pieceIndex) / pieceCount;
        // Reduced spacing: cells should be close together, not form empty circle
        // Use new cell radius for spacing, and place them closer (0.6x = 60% of radius)
        // This ensures cells are border-to-border or slightly overlapping, not far apart
        const baseRadiusOffset = 0.6; // Much closer spacing (60% of new cell radius)
        const radiusOffset = baseRadiusOffset;
        // Calculate spacing based on new cell size, not old cell size
        const spacing = newCellRadius * (1 + radiusOffset); // Distance from center to cell edge
        const offsetX = Math.cos(angle) * spacing;
        const offsetY = Math.sin(angle) * spacing;
        
        const newCell = new Cell(
          Date.now() * 1000 + Math.floor(Math.random() * 1000) + pieceIndex,
          cell.x + offsetX,
          cell.y + offsetY,
          finalMassPerCell, // Even mass for all pieces
          this.id
        );
        
        // Apply strong impulse - pieces should fly apart
        const radialDirX = Math.cos(angle);
        const radialDirY = Math.sin(angle);
        
        const baseImpulseSpeed = 12.0;
        const sizeFactor = Math.min(newCell.getRadius() * 0.15, 8.0);
        const impulseSpeed = (baseImpulseSpeed + sizeFactor) * impulseMultiplier;
        
        newCell.vx = radialDirX * impulseSpeed;
        newCell.vy = radialDirY * impulseSpeed;
        newCell.setInstantMerge(this.config.instantMerge);
        newCell.splitTime = Date.now();
        newCell.splitDirectionX = radialDirX;
        newCell.splitDirectionY = radialDirY;
        
        this.cells.push(newCell);
        pieceIndex++;
      }
    }
    
    // Redistribute any remaining mass evenly
    const actualTotalMass = this.cells.length * finalMassPerCell;
    const massDifference = totalMass - actualTotalMass;
    if (massDifference > 0 && this.cells.length > 0) {
      const massPerCell = massDifference / this.cells.length;
      for (const cell of this.cells) {
        cell.mass += massPerCell;
      }
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
    
    // When instantMerge is enabled, NO delays - merges are truly instant
    // Cursor position only affects overlap requirements, not delays
    let mergeDelayMs = 0;
    if (!config.instantMerge) {
      // Only apply delays if instantMerge is disabled
      const veryCloseThreshold = avgRadius * 1.0;
      const closeThreshold = avgRadius * 2.0;
      const mediumThreshold = avgRadius * 3.5;
      
      if (cursorDist <= veryCloseThreshold) {
        mergeDelayMs = 800;
      } else if (cursorDist <= closeThreshold) {
        mergeDelayMs = 1200;
      } else if (cursorDist <= mediumThreshold) {
        mergeDelayMs = 1800;
      } else {
        mergeDelayMs = 2500;
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

        // ANY overlap should trigger merge check - cells should never fully overlap
        // Check if cells are overlapping at all (distance < sum of radii)
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
          // More responsive cursor detection - skill-based merge control
          const isCursorOnCell1 = cursorToCell1Dist < r1 * 1.5; // Cursor within 150% of cell1 radius (more lenient)
          const isCursorOnCell2 = cursorToCell2Dist < r2 * 1.5; // Cursor within 150% of cell2 radius (more lenient)
          const isCursorOnEitherCell = isCursorOnCell1 || isCursorOnCell2;
          
          // Cursor position relative to THIS pair's midpoint determines merge
          const cursorToMidRatio = cursorToMidDist / combinedRadius;
          
          // Minimal cooldown only to prevent instant re-merge after split (only if instantMerge disabled)
          // When instantMerge is enabled, allow immediate merges after split (skill-based)
          const timeSinceSplit1 = now - cell1.splitTime;
          const timeSinceSplit2 = now - cell2.splitTime;
          const SPLIT_MERGE_COOLDOWN = config.instantMerge ? 50 : 800; // Even shorter cooldown (50ms vs 100ms) for skilled players
          const isRecentSplit1 = cell1.splitTime > 0 && timeSinceSplit1 < SPLIT_MERGE_COOLDOWN;
          const isRecentSplit2 = cell2.splitTime > 0 && timeSinceSplit2 < SPLIT_MERGE_COOLDOWN;
          // More lenient cursor centered check - skill-based: better cursor placement = faster merges
          const isCursorCentered = cursorToMidRatio < 0.5 || isCursorOnEitherCell; // Increased from 0.4 to 0.5
          
          // If instantMerge is enabled OR cursor is centered, allow merge even after split
          if (config.instantMerge || isCursorCentered) {
            // Instant merge mode or cursor centered = allow immediate merge
            // Continue to merge logic below
          } else if ((isRecentSplit1 || isRecentSplit2)) {
            // Only apply separation requirement if instantMerge is disabled and cursor not centered
            const minSeparation = Math.max(r1, r2) * 0.2;
            if (dist < minSeparation) {
              continue; // Too close, can't merge yet
            }
          }
          
          // User-controlled merges: cursor position is PRIMARY control for EACH cell pair
          // Calculate overlap percentage (how much cells have merged)
          const overlapPercent = overlap / combinedRadius;
          
          // Check if either cell was auto-split (slightly deeper merge for auto-split cells)
          const isAutoSplit1 = cell1.autoSplitTime > 0;
          const isAutoSplit2 = cell2.autoSplitTime > 0;
          const isAutoSplitPair = isAutoSplit1 || isAutoSplit2;
          
          // User-controlled merge logic for THIS specific cell pair:
          // When instantMerge is enabled, merges happen with minimal overlap requirements
          // When cursor is centered, merge should happen immediately if cells are overlapping at all
          
          let shouldMerge = false;
          let requiredOverlap = 1.0; // Default: require 100% overlap (prevent merge)
          
          // ANY overlap should cause merge - cells should never fully overlap
          // Cursor position controls merge speed, but any overlap triggers merge check
          // Skill-based: better cursor placement = instant merge, poor placement = slight delay
          let baseRequiredOverlap;
          if (config.instantMerge) {
            // Instant merge mode: merge immediately on any overlap when cursor is well-placed
            // Skill gap: cursor placement determines merge speed
            if (isCursorOnEitherCell || cursorToMidRatio < 0.2) {
              baseRequiredOverlap = 0.0; // Merge immediately on any overlap when cursor is perfectly centered (skill reward)
            } else if (cursorToMidRatio < 0.3) {
              baseRequiredOverlap = 0.01; // Need only 1% overlap when cursor is very close
            } else if (cursorToMidRatio < 0.45) {
              baseRequiredOverlap = 0.02; // Need 2% overlap when cursor is close
            } else if (cursorToMidRatio < 0.65) {
              baseRequiredOverlap = 0.05; // Need 5% overlap when cursor is medium distance
            } else if (cursorToMidRatio < 1.0) {
              baseRequiredOverlap = 0.10; // Need 10% overlap when cursor is far
            } else {
              baseRequiredOverlap = 0.20; // Need 20% overlap (cursor very far away - skill penalty)
            }
          } else {
            // Classic merge mode: still merge on overlap, but with higher requirements
            if (isCursorOnEitherCell || cursorToMidRatio < 0.25) {
              baseRequiredOverlap = 0.05; // Need 5% overlap when cursor is centered
            } else if (cursorToMidRatio < 0.4) {
              baseRequiredOverlap = 0.10; // Need 10% overlap
            } else if (cursorToMidRatio < 0.65) {
              baseRequiredOverlap = 0.20; // Need 20% overlap
            } else if (cursorToMidRatio < 1.0) {
              baseRequiredOverlap = 0.40; // Need 40% overlap
            } else {
              baseRequiredOverlap = 0.60; // Need 60% overlap
            }
          }
          
          // Auto-split cells require slightly deeper merge (only if instantMerge disabled)
          if (isAutoSplitPair && !config.instantMerge) {
            requiredOverlap = Math.min(1.0, baseRequiredOverlap + 0.20); // Deeper merge for auto-split cells (classic mode only)
          } else if (isAutoSplitPair && config.instantMerge) {
            requiredOverlap = Math.min(1.0, baseRequiredOverlap + 0.05); // Slightly deeper for auto-split (instant mode)
          } else {
            requiredOverlap = baseRequiredOverlap;
          }
          
          // Merge if overlap meets requirement - prevents full overlap
          shouldMerge = overlapPercent >= requiredOverlap;
          
          // Safety check: if cells are heavily overlapping (>80%), force merge regardless of cursor
          // This prevents cells from fully overlapping
          if (overlapPercent > 0.80) {
            shouldMerge = true; // Force merge to prevent full overlap
          }
          
          // No mass-based delays when instantMerge is enabled - merges are truly instant
          
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
      
      // Enhanced cursor responsiveness: cells move toward cursor position for better merge control
      // This adds skill gap - players who position cursor well get faster merges
      const cursorDx = this.cursorX - cell.x;
      const cursorDy = this.cursorY - cell.y;
      const cursorDist = Math.sqrt(cursorDx * cursorDx + cursorDy * cursorDy);
      
      if (cursorDist > 0 && cursorDist < avgRadius * 3.0) {
        // Normalize direction toward cursor
        const dirToCursorX = cursorDx / cursorDist;
        const dirToCursorY = cursorDy / cursorDist;
        
        // Stronger attraction when cursor is closer (skill-based: better cursor placement = faster merges)
        let attractionStrength;
        if (cursorDist < avgRadius * 0.8) {
          // Cursor very close/centered: very strong attraction for quick merges
          attractionStrength = 0.8; // Very strong - cells converge quickly
        } else if (cursorDist < avgRadius * 1.5) {
          // Cursor close: strong attraction
          attractionStrength = 0.5;
        } else if (cursorDist < avgRadius * 2.5) {
          // Cursor medium distance: moderate attraction
          attractionStrength = 0.3;
        } else {
          // Cursor far: weak attraction
          attractionStrength = 0.15;
        }
        
        // Base speed scales with distance - closer cursor = faster response
        const baseAttractionSpeed = 5.5; // Increased from 3.0 for more responsiveness
        const distanceFactor = Math.min(1.0, avgRadius / Math.max(cursorDist, 1)); // Stronger when closer
        const attractionSpeed = baseAttractionSpeed * (1 + distanceFactor * 0.5); // Up to 50% faster when close
        
        // Add velocity toward cursor (skill-based: better cursor placement = faster cell movement)
        cell.vx += dirToCursorX * attractionSpeed * attractionStrength;
        cell.vy += dirToCursorY * attractionSpeed * attractionStrength;
      }
      
      // If cursor is centered, add additional attraction force toward center to bring cells together
      if (isCursorCentered && this.cells.length > 1) {
        const cellToCenterDx = centerX - cell.x;
        const cellToCenterDy = centerY - cell.y;
        const cellToCenterDist = Math.sqrt(cellToCenterDx * cellToCenterDx + cellToCenterDy * cellToCenterDy);
        
        if (cellToCenterDist > 0) {
          // Normalize direction toward center
          const dirToCenterX = cellToCenterDx / cellToCenterDist;
          const dirToCenterY = cellToCenterDy / cellToCenterDist;
          
          // Apply strong attraction force when cursor is centered (skill-based merge boost)
          const attractionStrength = Math.min(0.5, cellToCenterDist / 80); // Increased max from 0.3 to 0.5
          const attractionSpeed = 4.5; // Increased from 3.0 for faster convergence
          
          // Add velocity toward center (stronger for better merge control)
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

