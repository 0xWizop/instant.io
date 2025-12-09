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
  }

  setInstantMerge(enabled) {
    // Disable cooldown if instant merge is enabled
    this.splitCooldown = enabled ? 0 : 1000;
  }

  updateMovement(inputDirX, inputDirY, config) {
    const ACCEL = 0.45;
    const DAMPING = 0.92; // Slightly less damping for more fluidity
    const MASS_FACTOR = 0.003;

    // Apply acceleration based on input direction
    const accelFactor = ACCEL * (1 / (1 + this.mass * MASS_FACTOR));
    this.vx += inputDirX * accelFactor;
    this.vy += inputDirY * accelFactor;

    // Apply damping (smoother, more fluid)
    this.vx *= DAMPING;
    this.vy *= DAMPING;

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
    return Math.sqrt(this.mass / Math.PI) * 2;
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

    // Normalize direction (or use random if no direction provided)
    let splitDirX = dirX || 0;
    let splitDirY = dirY || 0;
    const dirLength = Math.sqrt(splitDirX * splitDirX + splitDirY * splitDirY);
    
    if (dirLength === 0) {
      // Random direction if no cursor direction
      const angle = Math.random() * Math.PI * 2;
      splitDirX = Math.cos(angle);
      splitDirY = Math.sin(angle);
    } else {
      // Normalize
      splitDirX /= dirLength;
      splitDirY /= dirLength;
    }

    // Smooth, gradual split impulse (much slower for smooth animation)
    const baseImpulseSpeed = 8; // Reduced from 20 for smoother animation
    const massFactor = Math.min(oldMass * 0.005, 5); // Cap mass influence
    const impulseSpeed = baseImpulseSpeed + massFactor;

    // Start new cell slightly offset (not fully separated - let physics do the work)
    const initialOffset = (oldRadius + newRadius) * 0.3; // Start 30% separated
    const newCellX = this.x + splitDirX * initialOffset;
    const newCellY = this.y + splitDirY * initialOffset;

    // Create new cell at slightly offset position
    const newCell = new Cell(
      Date.now() + Math.random(),
      newCellX,
      newCellY,
      newMass,
      this.ownerId
    );

    // Apply smooth, gradual velocity impulses
    // Original cell moves backward (opposite direction) - smoother
    const backwardImpulse = impulseSpeed * 0.7; // Slightly less for smoother motion
    this.vx -= splitDirX * backwardImpulse;
    this.vy -= splitDirY * backwardImpulse;

    // New cell moves forward (toward cursor direction) - smoother
    const forwardImpulse = impulseSpeed;
    newCell.vx = this.vx + splitDirX * forwardImpulse;
    newCell.vy = this.vy + splitDirY * forwardImpulse;
    newCell.lastSplitTime = currentTime;

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

