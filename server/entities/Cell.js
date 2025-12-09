export class Cell {
  constructor(id, x, y, mass, ownerId) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.mass = mass;
    this.ownerId = ownerId;
    this.vx = 0;
    this.vy = 0;
    this.mergeTime = null;
    this.lastSplitTime = 0;
    this.splitCooldown = 1000; // 1 second cooldown (disabled if instant merge)
    this.splitDirectionX = 0; // Track split direction for merge logic
    this.splitDirectionY = 0;
    this.splitTime = 0; // When this cell was split
  }

  setInstantMerge(enabled) {
    // Disable cooldown if instant merge is enabled
    this.splitCooldown = enabled ? 0 : 1000;
  }

  updateMovement(inputDirX, inputDirY, config) {
    // Silky smooth movement: blend toward a mass-scaled target velocity
    const BASE_SPEED = 18.0;      // Much higher base speed for faster movement
    const MASS_FACTOR = 0.0012;   // Mass scaling factor (bigger = slower) - increased to reduce small cell speed
    const TURN_RESPONSE = 0.15;   // Lower response for smoother, more gradual turning (was 0.4)
    const ACCELERATION = 0.85;    // Higher acceleration for smoother speed changes
    const FRICTION = 0.985;       // Very low friction for smoother deceleration
    const SPLIT_DAMPING = 0.92;   // Extra damping after split if not moving in split direction
    const SPLIT_DAMPING_TIME = 500; // Apply extra damping for 500ms after split

    const hasInput = Math.abs(inputDirX) + Math.abs(inputDirY) > 0;
    const now = Date.now();
    const timeSinceSplit = now - this.splitTime;
    const isRecentSplit = timeSinceSplit < SPLIT_DAMPING_TIME && this.splitTime > 0;
    
    if (hasInput) {
      const dirLen = Math.sqrt(inputDirX * inputDirX + inputDirY * inputDirY) || 1;
      const dirX = inputDirX / dirLen;
      const dirY = inputDirY / dirLen;

      // Check if input opposes split direction (dot product < 0 means opposite)
      let shouldDampenSplit = false;
      if (isRecentSplit && (this.splitDirectionX !== 0 || this.splitDirectionY !== 0)) {
        const dotProduct = dirX * this.splitDirectionX + dirY * this.splitDirectionY;
        // If moving opposite to split direction or perpendicular, dampen split velocity
        shouldDampenSplit = dotProduct < 0.3; // Less than 30% aligned with split direction
      }

      // Speed formula: larger mass = slower speed
      // Add cap to prevent very small cells from being too fast
      const rawSpeed = BASE_SPEED / (1 + this.mass * MASS_FACTOR);
      // Cap maximum speed for very small cells (after virus splits) - they should be faster but not too fast
      const MAX_SPEED = 24.0; // Maximum speed cap (reduced from unlimited)
      const targetSpeed = Math.min(rawSpeed, MAX_SPEED);
      const targetVx = dirX * targetSpeed;
      const targetVy = dirY * targetSpeed;

      // Smooth acceleration: blend velocity more gradually for silky smooth movement
      // Use exponential smoothing for buttery smooth transitions
      const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      const speedDiff = Math.abs(targetSpeed - currentSpeed);
      
      // Adaptive response: faster response when far from target, slower when close
      const adaptiveResponse = Math.min(TURN_RESPONSE + (speedDiff / targetSpeed) * 0.1, ACCELERATION);
      
      // Blend toward target velocity with adaptive response
      this.vx = this.vx * (1 - adaptiveResponse) + targetVx * adaptiveResponse;
      this.vy = this.vy * (1 - adaptiveResponse) + targetVy * adaptiveResponse;
      
      // If recently split and not moving in split direction, dampen split velocity quickly
      if (shouldDampenSplit) {
        this.vx *= SPLIT_DAMPING;
        this.vy *= SPLIT_DAMPING;
      }
    } else {
      // No input: slowly bleed speed
      // If recently split, bleed faster to allow quick merge
      const friction = isRecentSplit ? SPLIT_DAMPING : FRICTION;
      this.vx *= friction;
      this.vy *= friction;
    }

    // Update position
    this.x += this.vx;
    this.y += this.vy;

    // Apply mass decay (only if mass is above minimum threshold)
    // Larger cells decay faster to balance pellet consumption
    if (config.massDecayRate > 0 && this.mass > 50) {
      // Base decay rate scales with mass - larger cells decay faster
      const massMultiplier = 1 + (this.mass / 2000); // 2x decay at 2000 mass, 3x at 4000, etc.
      const decayAmount = this.mass * config.massDecayRate * massMultiplier;
      this.mass = Math.max(50, this.mass - decayAmount); // Minimum mass of 50
    }

    // Boundary clamping
    const radius = this.getRadius();
    this.x = Math.max(radius, Math.min(config.mapWidth - radius, this.x));
    this.y = Math.max(radius, Math.min(config.mapHeight - radius, this.y));
  }

  getRadius() {
    // Faster scaling: cells grow larger more quickly as mass increases
    // Using a power curve for faster scaling at higher masses
    const baseRadius = Math.sqrt(this.mass / Math.PI);
    // Scale factor increases with mass for faster growth
    const scaleFactor = 3.5 + Math.min(this.mass / 5000, 2.0); // Up to 5.5x for very large cells
    return baseRadius * scaleFactor;
  }

  canSplit() {
    // If cooldown is 0 (instant merge), always allow split
    if (this.splitCooldown === 0) return true;
    // Otherwise check if cooldown has passed
    return Date.now() - this.lastSplitTime > this.splitCooldown;
  }

  split(targetCount, dirX, dirY, impulseMultiplier = 1.0) {
    // Allow split if cooldown is passed OR if instant merge is enabled (cooldown = 0)
    if (this.splitCooldown > 0 && !this.canSplit()) return null;
    if (this.mass < 100) return null;

    const currentTime = Date.now();
    this.lastSplitTime = currentTime;

    // Calculate masses - ensure we don't go below minimum
    const oldMass = this.mass;
    const newMass = Math.max(50, oldMass / 2); // Ensure minimum mass of 50
    const remainingMass = oldMass - newMass;
    
    // Update original cell mass
    this.mass = remainingMass;

    // Calculate radii using the dynamic scaling function
    const oldRadius = this.getRadius();
    // Calculate new radius after mass change (will be recalculated with getRadius() on new cell)

    // Determine split direction: prioritize cursor direction (where player is aiming)
    let splitDirX = 0;
    let splitDirY = 0;
    
    // Cursor direction is primary - split goes toward where mouse is pointing
    if (dirX !== undefined && dirY !== undefined) {
      const dirLength = Math.sqrt(dirX * dirX + dirY * dirY);
      if (dirLength > 0) {
        // Use cursor direction directly (toward target like bot1023)
        splitDirX = dirX / dirLength;
        splitDirY = dirY / dirLength;
      } else {
        // No cursor direction, use velocity as fallback
        const velLength = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        if (velLength > 0.1) {
          splitDirX = this.vx / velLength;
          splitDirY = this.vy / velLength;
        } else {
          // Random direction if no input
          const angle = Math.random() * Math.PI * 2;
          splitDirX = Math.cos(angle);
          splitDirY = Math.sin(angle);
        }
      }
    } else {
      // No cursor direction provided, use velocity as fallback
      const velLength = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      if (velLength > 0.1) {
        splitDirX = this.vx / velLength;
        splitDirY = this.vy / velLength;
      } else {
        // Random direction if no input
        const angle = Math.random() * Math.PI * 2;
        splitDirX = Math.cos(angle);
        splitDirY = Math.sin(angle);
      }
    }

    // Split: new cell ejects FROM original cell TOWARD cursor location
    // Base impulse speed - stronger for normal splits, reduced for virus splits
    // Impulse should scale with cell size for proper separation
    const baseImpulseSpeed = 8.5; // Increased base impulse speed for better separation
    const sizeFactor = Math.min(oldRadius * 0.1, 5.0); // Scale with radius (larger cells = more impulse, increased)
    const massFactor = Math.min(oldMass * 0.0012, 2.5); // Slightly increased mass factor
    let impulseSpeed = (baseImpulseSpeed + sizeFactor + massFactor) * impulseMultiplier;
    
    // Reduce impulse for very small cells (after virus splits only)
    if (impulseMultiplier < 0.8 && newMass < 500) {
      impulseSpeed *= 0.5; // Half impulse for very small cells from virus splits
    } else if (impulseMultiplier < 0.8 && newMass < 1000) {
      impulseSpeed *= 0.7; // 70% impulse for small cells from virus splits
    }

    // New cell starts with proper spacing from original cell center (in split direction)
    // Spacing should be relative to cell size and split type:
    // - Normal splits (attack): Much more distance (120% of radius) for long eject with clear space
    // - Virus/burst splits (defensive): More distance (40% of radius) to prevent overlap
    const isAttackSplit = impulseMultiplier >= 0.9; // Normal splits are attacks
    const spacingFactor = isAttackSplit ? 1.2 : 0.4; // 120% for attacks (long eject with space), 40% for defensive
    const ejectionOffset = oldRadius * spacingFactor;
    const newCellX = this.x + splitDirX * ejectionOffset;
    const newCellY = this.y + splitDirY * ejectionOffset;

    // Create new cell that will travel FROM original cell TOWARD cursor
    // Generate unique ID using timestamp and random
    const newCellId = Date.now() * 1000 + Math.floor(Math.random() * 1000);
    const newCell = new Cell(
      newCellId,
      newCellX,
      newCellY,
      newMass,
      this.ownerId
    );
    
    // Ensure new cell has instant merge settings
    newCell.setInstantMerge(this.splitCooldown === 0);

    // Original cell gets backward push (opposite of split direction)
    // More push for attack splits to create clear space between cells
    const backwardMultiplier = isAttackSplit ? 0.85 : 0.4; // More separation for attacks (clear space)
    const backwardImpulse = impulseSpeed * backwardMultiplier;
    this.vx -= splitDirX * backwardImpulse;
    this.vy -= splitDirY * backwardImpulse;
    
    // Track split direction for merge logic
    this.splitDirectionX = -splitDirX; // Opposite direction for original cell
    this.splitDirectionY = -splitDirY;
    this.splitTime = currentTime;

    // New cell ejects FROM original cell TOWARD cursor with smooth, long forward velocity
    // Attack splits need much more distance for long eject with clear space
    const forwardMultiplier = isAttackSplit ? 4.2 : 1.8; // Much more distance for attacks (long eject with space), more for defensive
    const forwardImpulse = impulseSpeed * forwardMultiplier;
    // New cell gets strong impulse in split direction (toward cursor), independent of original cell velocity
    // This ensures it always ejects AWAY from the original cell
    newCell.vx = splitDirX * forwardImpulse; // Pure impulse toward cursor (away from original cell)
    newCell.vy = splitDirY * forwardImpulse; // Pure impulse toward cursor (away from original cell)
    newCell.lastSplitTime = currentTime;
    newCell.splitDirectionX = splitDirX; // Track split direction (toward cursor)
    newCell.splitDirectionY = splitDirY;
    newCell.splitTime = currentTime;

    return newCell;
  }

  serialize() {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      mass: this.mass,
      vx: this.vx,
      vy: this.vy,
      ownerId: this.ownerId
    };
  }
}

