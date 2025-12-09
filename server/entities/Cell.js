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
    // Turn without losing speed: blend toward a mass-scaled target velocity
    const BASE_SPEED = 18.0;      // Much higher base speed for faster movement
    const MASS_FACTOR = 0.003;    // Mass scaling factor (bigger = slower)
    const TURN_RESPONSE = 0.4;    // Faster response for snappier turning
    const FRICTION = 0.97;        // Slow down only when no input
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
      const targetSpeed = BASE_SPEED / (1 + this.mass * MASS_FACTOR);
      const targetVx = dirX * targetSpeed;
      const targetVy = dirY * targetSpeed;

      // Blend toward target velocity so turning keeps momentum
      this.vx = this.vx * (1 - TURN_RESPONSE) + targetVx * TURN_RESPONSE;
      this.vy = this.vy * (1 - TURN_RESPONSE) + targetVy * TURN_RESPONSE;
      
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
    if (config.massDecayRate > 0 && this.mass > 50) {
      const decayAmount = this.mass * config.massDecayRate;
      this.mass = Math.max(50, this.mass - decayAmount); // Minimum mass of 50
    }

    // Boundary clamping
    const radius = this.getRadius();
    this.x = Math.max(radius, Math.min(config.mapWidth - radius, this.x));
    this.y = Math.max(radius, Math.min(config.mapHeight - radius, this.y));
  }

  getRadius() {
    // Increased multiplier to make cells appear larger on screen
    // 1500 mass should look substantial and clearly visible
    return Math.sqrt(this.mass / Math.PI) * 3.5;
  }

  canSplit() {
    return Date.now() - this.lastSplitTime > this.splitCooldown;
  }

  split(targetCount, dirX, dirY) {
    // Allow split if cooldown is passed OR if instant merge is enabled (cooldown = 0)
    if (!this.canSplit() && this.splitCooldown > 0) return null;
    if (this.mass < 100) return null;

    const currentTime = Date.now();
    this.lastSplitTime = currentTime;

    const newMass = this.mass / 2;
    const oldMass = this.mass;
    this.mass = newMass;

    // Calculate radii
    const oldRadius = this.getRadius();
    const newRadius = Math.sqrt(newMass / Math.PI) * 2;

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
    const baseImpulseSpeed = 6.5; // Impulse speed for ejection
    const massFactor = Math.min(oldMass * 0.002, 3);
    const impulseSpeed = baseImpulseSpeed + massFactor;

    // New cell starts slightly offset from original cell center (in split direction)
    // This makes it visually eject FROM the original cell
    const ejectionOffset = oldRadius * 0.2; // Start 20% of radius away from center
    const newCellX = this.x + splitDirX * ejectionOffset;
    const newCellY = this.y + splitDirY * ejectionOffset;

    // Create new cell that will travel FROM original cell TOWARD cursor
    const newCell = new Cell(
      Date.now() + Math.random(),
      newCellX,
      newCellY,
      newMass,
      this.ownerId
    );

    // Original cell gets small backward push (minimal)
    const backwardImpulse = impulseSpeed * 0.3; // Small backward push
    this.vx -= splitDirX * backwardImpulse;
    this.vy -= splitDirY * backwardImpulse;
    
    // Track split direction for merge logic
    this.splitDirectionX = -splitDirX; // Opposite direction for original cell
    this.splitDirectionY = -splitDirY;
    this.splitTime = currentTime;

    // New cell ejects FROM original cell TOWARD cursor with strong forward velocity
    const forwardImpulse = impulseSpeed * 1.2; // Strong forward impulse toward cursor
    newCell.vx = this.vx + splitDirX * forwardImpulse; // Eject toward cursor
    newCell.vy = this.vy + splitDirY * forwardImpulse; // Eject toward cursor
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

