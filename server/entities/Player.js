import { Cell, CellState } from './Cell.js';
import { PhysicsConstants } from '../PhysicsConstants.js';

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
    
    // For double split (4-way), use special logic
    if (targetCount === 4) {
      this.performDoubleSplit();
      return;
    }
    
    // For single split, get fresh direction vector from cursor
    // ALWAYS use fresh direction - never reuse previous vectors
    const dirX = this.getFreshSplitDirection();
    if (!dirX) return; // No valid direction
    
    // Use the unified split method with fresh direction
    this.splitToTargetCount(targetCount, dirX.dirX, dirX.dirY, 1.0);
    
    this.lastSplitTime = Date.now();
    this.splitSequence = 0;
  }
  
  getFreshSplitDirection() {
    // Calculate direction from largest cell to cursor (fresh vector every time)
    if (this.cells.length === 0) return null;
    
    // Find largest cell
    let largestCell = this.cells[0];
    for (const cell of this.cells) {
      if (cell.mass > largestCell.mass) {
        largestCell = cell;
      }
    }
    
    // Fresh direction: normalize(mousePosition - cell.position)
    const dx = this.cursorX - largestCell.x;
    const dy = this.cursorY - largestCell.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist > 1) {
      return { dirX: dx / dist, dirY: dy / dist };
    } else {
      // Fallback to velocity or random
      const velLength = Math.sqrt(largestCell.vx * largestCell.vx + largestCell.vy * largestCell.vy);
      if (velLength > 0.1) {
        return { dirX: largestCell.vx / velLength, dirY: largestCell.vy / velLength };
      } else {
        const angle = Math.random() * Math.PI * 2;
        return { dirX: Math.cos(angle), dirY: Math.sin(angle) };
      }
    }
  }
  
  performDoubleSplit() {
    // Double split: 4-way burst from original parent cell
    if (this.cells.length === 0) return;
    
    // Find largest cell (will be the parent)
    let largestCell = this.cells[0];
    for (const cell of this.cells) {
      if (cell.mass > largestCell.mass) {
        largestCell = cell;
      }
    }
    
    // Get fresh forward direction
    const forwardDir = this.getFreshSplitDirection();
    if (!forwardDir) return;
    
    // Calculate 4 directions: forward, +90°, -90°, backward
    const D1 = { x: forwardDir.dirX, y: forwardDir.dirY }; // Forward
    const D2 = { x: -D1.y, y: D1.x }; // Rotate +90°
    const D3 = { x: D1.y, y: -D1.x }; // Rotate -90°
    const D4 = { x: -D1.x, y: -D1.y }; // Backward
    
    const directions = [D1, D2, D3, D4];
    
    // Check if we can split (need enough mass for 4 cells)
    const totalMass = largestCell.mass;
    const minCellMass = PhysicsConstants.MIN_MASS;
    if (totalMass < minCellMass * 4) return;
    if (this.cells.length >= this.getMaxCells()) return;
    
    // Remove original cell
    this.cells = this.cells.filter(c => c.id !== largestCell.id);
    
    // Create 4 cells with equal mass
    const massPerCell = totalMass / 4;
    const currentTime = Date.now();
    
    for (let i = 0; i < 4 && this.cells.length < this.getMaxCells(); i++) {
      const dir = directions[i];
      const newCellId = Date.now() * 1000 + Math.floor(Math.random() * 1000) + i;
      
      // Calculate ejection offset (same for all cells)
      const tempCell = new Cell(0, 0, 0, massPerCell, this.id);
      const newCellRadius = tempCell.getRadius();
      const oldRadius = largestCell.getRadius();
      const minSeparation = oldRadius + newCellRadius;
      const ejectionOffset = minSeparation * PhysicsConstants.SPLIT_EJECTION_GAP;
      
      const newCellX = largestCell.x + dir.x * ejectionOffset;
      const newCellY = largestCell.y + dir.y * ejectionOffset;
      
      const newCell = new Cell(newCellId, newCellX, newCellY, massPerCell, this.id);
      newCell.setInstantMerge(this.config.instantMerge);
      newCell.setState(CellState.SPLIT_TRAVEL);
      newCell.splitImmunityUntil = currentTime + PhysicsConstants.SPLIT_IMMUNITY_DURATION;
      newCell.splitDirectionLockUntil = currentTime + PhysicsConstants.SPLIT_DIRECTION_LOCK_DURATION;
      
      // Apply impulse (same for all cells)
      const baseImpulseSpeed = PhysicsConstants.SPLIT_BASE_IMPULSE;
      const sizeFactor = Math.min(oldRadius * 0.12, 6.0);
      const massFactor = Math.min(totalMass * 0.0015, 3.0);
      const impulseSpeed = (baseImpulseSpeed + sizeFactor + massFactor) * PhysicsConstants.SPLIT_FORWARD_MULTIPLIER;
      
      newCell.vx = dir.x * impulseSpeed;
      newCell.vy = dir.y * impulseSpeed;
      newCell.lastSplitTime = currentTime;
      newCell.splitDirectionX = dir.x;
      newCell.splitDirectionY = dir.y;
      newCell.splitTime = currentTime;
      
      this.cells.push(newCell);
    }
  }
  
  splitToTargetCount(targetCount, dirX, dirY, impulseMultiplier = 1.0) {
    if (this.cells.length === 0) return;
    
    // Enforce maximum cell count based on total mass
    const maxCells = this.getMaxCells();
    
    // Calculate total mass BEFORE splitting to ensure even distribution
    const totalMass = this.getTotalMass();
    const minCellMass = PhysicsConstants.MIN_MASS;
    
    // Check if we can split at all - need at least 2 cells worth of mass
    if (totalMass < minCellMass * 2) {
      return; // Not enough mass to split
    }
    
    // Sort cells by mass DESC (largest first) - split largest cells first
    const sortedCells = [...this.cells].sort((a, b) => b.mass - a.mass);
    
    // Check if eligible cells can split (have enough mass individually)
    const eligibleCells = sortedCells.filter(cell => {
      const canSplitNow = this.config.instantMerge ? true : cell.canSplit();
      return cell.mass >= PhysicsConstants.SPLIT_MIN_MASS && canSplitNow;
    });
    
    if (eligibleCells.length === 0) return;
    
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
        // Split once to double the cell count (largest cells first)
        this.performSingleSplitIteration(dirX, dirY, impulseMultiplier, actualMaxCells, eligibleCells);
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
    
    // Perform all split iterations: split ALL eligible cells simultaneously in each iteration
    for (let iteration = 0; iteration < iterationsNeeded && this.cells.length < effectiveTargetCount && this.cells.length < actualMaxCells; iteration++) {
      // Re-sort and get eligible cells for each iteration
      const currentEligible = this.cells.filter(cell => {
        const canSplitNow = this.config.instantMerge ? true : cell.canSplit();
        return cell.mass >= PhysicsConstants.SPLIT_MIN_MASS && canSplitNow;
      }).sort((a, b) => b.mass - a.mass);
      
      this.performSingleSplitIteration(dirX, dirY, impulseMultiplier, actualMaxCells, currentEligible);
      
      // If we hit maxCells, stop splitting
      if (this.cells.length >= actualMaxCells) break;
    }
    
    // Redistribute mass evenly across ALL cells after all splits are complete
    this.redistributeMassEvenly(totalMass, minCellMass);
  }
  
  performSingleSplitIteration(dirX, dirY, impulseMultiplier, maxCells, eligibleCells = null) {
    const newCells = [];
    
    // Use provided eligible cells (sorted by mass DESC) or all cells
    const cellsToSplit = eligibleCells || this.cells;
    
    // Split each eligible cell once (all at the same time)
    // Use FRESH direction vector for each cell (from cell position to cursor)
    for (let i = 0; i < cellsToSplit.length && this.cells.length + newCells.length < maxCells; i++) {
      const cell = cellsToSplit[i];
      
      // Get fresh direction for THIS cell (never reuse previous vectors)
      const cellDx = this.cursorX - cell.x;
      const cellDy = this.cursorY - cell.y;
      const cellDist = Math.sqrt(cellDx * cellDx + cellDy * cellDy);
      
      let freshDirX, freshDirY;
      if (cellDist > 1) {
        freshDirX = cellDx / cellDist;
        freshDirY = cellDy / cellDist;
      } else {
        // Fallback to provided direction or velocity
        freshDirX = dirX;
        freshDirY = dirY;
      }
      
      const newCell = cell.split(2, freshDirX, freshDirY, impulseMultiplier);
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
      if (this.cells.length >= effectiveCount || largestCell.mass < PhysicsConstants.MIN_MASS * effectiveCount) return;
    
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
    const minCellMass = PhysicsConstants.MIN_MASS;
    
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
    const minCellMass = PhysicsConstants.MIN_MASS;
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
      const scaleFactor = PhysicsConstants.RADIUS_BASE_SCALE + Math.min(finalMassPerCell / PhysicsConstants.RADIUS_SCALE_MASS, PhysicsConstants.RADIUS_MAX_SCALE);
      const newCellRadius = baseRadius * scaleFactor;
      
      for (let i = 0; i < piecesForThisCell && pieceIndex < pieceCount; i++) {
        const angle = (Math.PI * 2 * pieceIndex) / pieceCount;
        // Reduced spacing: cells should be close together, not form empty circle
        const baseRadiusOffset = 0.6; // Much closer spacing (60% of new cell radius)
        const spacing = newCellRadius * (1 + baseRadiusOffset); // Distance from center to cell edge
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
    if (largestCell.mass > PhysicsConstants.MIN_MASS) {
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
    // Mark cell as not alive before removing
    const cell = this.cells.find(c => c.id === cellId);
    if (cell) {
      cell.isAlive = false;
    }
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
    const minCellMass = PhysicsConstants.MIN_MASS;
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

    // Process merges - iterate over actual cells array
    for (let i = 0; i < this.cells.length; i++) {
      for (let j = i + 1; j < this.cells.length; j++) {
        const cell1 = this.cells[i];
        const cell2 = this.cells[j];

        // MERGE CONDITIONS (ALL must be true):
        // 1. Same owner
        if (cell1.ownerId !== cell2.ownerId) {
          continue;
        }
        
        // 2. Merge cooldown <= 0 (300-500ms after split)
        const now = Date.now();
        const timeSinceSplit1 = now - cell1.splitTime;
        const timeSinceSplit2 = now - cell2.splitTime;
        if (timeSinceSplit1 < PhysicsConstants.MERGE_COOLDOWN || timeSinceSplit2 < PhysicsConstants.MERGE_COOLDOWN) {
          continue;
        }
        
        // 3. Skip if either cell has split immunity
        if (cell1.hasSplitImmunity() || cell2.hasSplitImmunity()) {
          continue;
        }

        // 4. Distance check - distance < mergeRadius
        const dx = cell1.x - cell2.x;
        const dy = cell1.y - cell2.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const r1 = cell1.getRadius();
        const r2 = cell2.getRadius();
        const mergeRadius = (r1 + r2) * 0.9; // Merge when 90% overlapping (10% gap)
        
        if (distance < mergeRadius) {
          // Check if cells are already merging
          const isMerging1 = cell1.isInState(CellState.MERGING);
          const isMerging2 = cell2.isInState(CellState.MERGING);
          
          if (isMerging1 || isMerging2) {
            // One cell is already merging - check if merge should complete
            const mergingCell = isMerging1 ? cell1 : cell2;
            if (mergingCell.mergeStartTime && now - mergingCell.mergeStartTime >= PhysicsConstants.MERGE_DELAY_MIN) {
              // Merge timer has passed - complete the merge (physics snap)
              this.completeMerge(cell1, cell2);
              j--; // Adjust index after removal
              continue;
            }
          } else {
            // Start merge process
            cell1.setState(CellState.MERGE_READY);
            cell2.setState(CellState.MERGE_READY);
            cell1.mergeTargetId = cell2.id;
            cell2.mergeTargetId = cell1.id;
            cell1.mergeStartTime = now;
            cell2.mergeStartTime = now;
            
            // If instant merge, merge immediately (physics snap)
            if (config.instantMerge) {
              this.completeMerge(cell1, cell2);
              j--; // Adjust index after removal
              continue;
            } else {
              // Start merge timer - cells will merge after delay
              cell1.setState(CellState.MERGING);
              cell2.setState(CellState.MERGING);
            }
          }
        } else {
          // Cells are not overlapping - clear merge state if set
          if (cell1.mergeTargetId === cell2.id || cell2.mergeTargetId === cell1.id) {
            cell1.mergeTargetId = null;
            cell2.mergeTargetId = null;
            cell1.mergeStartTime = null;
            cell2.mergeStartTime = null;
            if (cell1.isInState(CellState.MERGE_READY) || cell1.isInState(CellState.MERGING)) {
              cell1.setState(cell1.vx !== 0 || cell1.vy !== 0 ? CellState.MOVING : CellState.IDLE);
            }
            if (cell2.isInState(CellState.MERGE_READY) || cell2.isInState(CellState.MERGING)) {
              cell2.setState(cell2.vx !== 0 || cell2.vy !== 0 ? CellState.MOVING : CellState.IDLE);
            }
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

  completeMerge(cell1, cell2) {
    // MERGE IS A PHYSICS SNAP - NOT ANIMATION DRIVEN
    // Calculate weighted center of mass
    const totalMass = cell1.mass + cell2.mass;
    const massRatio1 = cell1.mass / totalMass;
    const massRatio2 = cell2.mass / totalMass;

    // New position = weighted center of mass
    const newPosX = cell1.x * massRatio1 + cell2.x * massRatio2;
    const newPosY = cell1.y * massRatio1 + cell2.y * massRatio2;

    // New mass = sum of masses
    const newMass = totalMass;

    // New velocity = ZERO (cancel all velocities)
    const newVelocityX = 0;
    const newVelocityY = 0;

    // Delete children immediately
    this.removeCell(cell2.id);
    
    // Update cell1 with merged values (physics snap - no lerping)
    cell1.mass = newMass;
    cell1.x = newPosX;
    cell1.y = newPosY;
    cell1.vx = newVelocityX;
    cell1.vy = newVelocityY;
    cell1.mergeTime = null;
    cell1.mergeTargetId = null;
    cell1.mergeStartTime = null;
    cell1.setState(CellState.IDLE);
    
    // Animation is cosmetic only - logic state is instant
  }

  instantMergeCells(cell1, cell2) {
    // Alias for completeMerge (instant merge mode)
    this.completeMerge(cell1, cell2);
  }

  mergeCells(cell1, cell2) {
    // Alias for completeMerge
    this.completeMerge(cell1, cell2);
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
      // Check if cell just spawned (initial spawn only, not split cells) - prevent ALL movement to avoid speed boost
      const now = Date.now();
      const timeSinceSpawn = now - cell.spawnTime;
      const isInSplitTravel = cell.isInState(CellState.SPLIT_TRAVEL);
      const hasSplitTime = cell.splitTime > 0;
      // Only apply spawn immunity to initial spawns, not split cells
      const isRecentlySpawned = timeSinceSpawn < cell.spawnImmunityDuration && !isInSplitTravel && !hasSplitTime;
      
      // If recently spawned, completely prevent movement and skip all movement logic
      if (isRecentlySpawned) {
        // Force velocity to zero and skip all movement updates
        cell.vx = 0;
        cell.vy = 0;
        return; // Skip ALL movement logic including updateMovement and cursor attraction
      }
      
      // Normal movement for non-spawned cells
      cell.updateMovement(this.inputDirX, this.inputDirY, world.config);
      
      // Enhanced cursor responsiveness: cells move toward cursor position for better merge control
      // This adds skill gap - players who position cursor well get faster merges
      const cursorDx = this.cursorX - cell.x;
      const cursorDy = this.cursorY - cell.y;
      const cursorDist = Math.sqrt(cursorDx * cursorDx + cursorDy * cursorDy);
      const cellRadius = cell.getRadius();
      
      // Check if cursor is centered (very close to cell center) - if so, apply heavy damping instead
      const isCursorCenteredOnCell = cursorDist < cellRadius * 0.4;
      
      if (isCursorCenteredOnCell) {
        // Cursor is centered: apply very heavy damping to slow/stop the cell (prevents shake)
        const dampingFactor = 0.75; // Very heavy damping - almost stops the cell
        cell.vx *= dampingFactor;
        cell.vy *= dampingFactor;
        // Don't apply cursor attraction when centered - prevents jitter
        // Skip all cursor attraction logic when centered
      } else if (cursorDist > 0 && cursorDist < avgRadius * 3.0) {
        // Normalize direction toward cursor
        const dirToCursorX = cursorDx / cursorDist;
        const dirToCursorY = cursorDy / cursorDist;
        
        // Stronger attraction when cursor is closer (skill-based: better cursor placement = faster merges)
        let attractionStrength;
        if (cursorDist < avgRadius * 0.8) {
          // Cursor very close: moderate attraction (reduced from 0.8 to prevent shake)
          attractionStrength = 0.4; // Reduced to prevent shake when near center
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
      // BUT only if cursor is NOT centered on this specific cell (prevents shake)
      if (isCursorCentered && this.cells.length > 1 && !isCursorCenteredOnCell) {
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
