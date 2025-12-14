import { PhysicsConstants } from '../PhysicsConstants.js';

// Cell state machine states
export const CellState = {
  IDLE: 'IDLE',
  MOVING: 'MOVING',
  SPLITTING: 'SPLITTING',
  SPLIT_TRAVEL: 'SPLIT_TRAVEL',
  MERGE_READY: 'MERGE_READY',
  MERGING: 'MERGING',
  DEAD: 'DEAD'
};

export class Cell {
  constructor(id, x, y, mass, ownerId) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.mass = mass;
    this.ownerId = ownerId;
    this.vx = 0;
    this.vy = 0;
    
    // State machine
    this.state = CellState.IDLE;
    this.stateStartTime = Date.now();
    
    // Merge state
    this.mergeTime = null;
    this.mergeTargetId = null;
    this.mergeStartTime = null;
    
    // Split state
    this.lastSplitTime = 0;
    this.splitCooldown = PhysicsConstants.SPLIT_COOLDOWN;
    this.splitDirectionX = 0;
    this.splitDirectionY = 0;
    this.splitTime = 0;
    this.splitImmunityUntil = 0; // Timestamp when split immunity expires
    this.splitDirectionLockUntil = 0; // Timestamp when direction lock expires
    this.splitTravelTime = 0; // Remaining split travel time (ms)
    this.steerLocked = false; // Whether steering is locked during split travel
    this.autoSplitTime = 0;
    
    // Spawn state
    this.spawnTime = Date.now(); // Track when cell was spawned
    this.spawnImmunityDuration = 300; // 300ms immunity from cursor attraction after spawn
    
    // Life state
    this.isAlive = true;
    
    // Debug
    this.debug = {
      lastStateChange: null,
      stateHistory: []
    };
  }
  
  setState(newState) {
    if (this.state !== newState) {
      const oldState = this.state;
      this.state = newState;
      this.stateStartTime = Date.now();
      this.debug.lastStateChange = { from: oldState, to: newState, time: Date.now() };
      this.debug.stateHistory.push(this.debug.lastStateChange);
      if (this.debug.stateHistory.length > 10) {
        this.debug.stateHistory.shift();
      }
    }
  }
  
  getState() {
    return this.state;
  }
  
  isInState(state) {
    return this.state === state;
  }
  
  getTimeInState() {
    return Date.now() - this.stateStartTime;
  }
  
  hasSplitImmunity() {
    return Date.now() < this.splitImmunityUntil;
  }
  
  getSplitImmunityTimer() {
    const remaining = this.splitImmunityUntil - Date.now();
    return Math.max(0, remaining);
  }
  
  hasDirectionLock() {
    return this.steerLocked && Date.now() < this.splitDirectionLockUntil;
  }
  
  getBaseRadius() {
    // Base radius = sqrt(mass) - used for eating calculations
    return Math.sqrt(this.mass / Math.PI);
  }

  setInstantMerge(enabled) {
    // Disable cooldown if instant merge is enabled
    this.splitCooldown = enabled ? 0 : PhysicsConstants.SPLIT_COOLDOWN;
  }

  updateMovement(inputDirX, inputDirY, config) {
    const hasInput = Math.abs(inputDirX) + Math.abs(inputDirY) > 0;
    const now = Date.now();
    const isInSplitTravel = this.isInState(CellState.SPLIT_TRAVEL);
    const hasDirectionLock = this.hasDirectionLock();
    const timeSinceSplit = now - this.splitTime;
    const isRecentSplit = timeSinceSplit < PhysicsConstants.SPLIT_IMMUNITY_DURATION && this.splitTime > 0;
    
    // Check if input is very small (cursor centered) - apply heavy damping
    const inputMagnitude = Math.sqrt(inputDirX * inputDirX + inputDirY * inputDirY);
    const isInputCentered = inputMagnitude < 0.1; // Very small input = cursor centered
    
    // Update state based on movement
    if (hasInput && !isInSplitTravel && !isInputCentered) {
      if (this.state === CellState.IDLE) {
        this.setState(CellState.MOVING);
      }
    } else if ((!hasInput || isInputCentered) && this.state === CellState.MOVING && !isInSplitTravel) {
      this.setState(CellState.IDLE);
    }
    
    // If direction is locked (first 120ms after split), ignore input and maintain split direction
    // SPLIT TRAVEL IS BALLISTIC - no steering allowed
    if (hasDirectionLock && (this.splitDirectionX !== 0 || this.splitDirectionY !== 0)) {
      // DO NOT apply mouse steering - maintain ballistic trajectory
      // Only apply friction (minimal)
      const friction = 0.998; // Very low friction during ballistic travel
      this.vx *= friction;
      this.vy *= friction;
      // DO NOT process input during direction lock - skip to position update
    } else if (hasInput && !isInputCentered) {
      const dirLen = Math.sqrt(inputDirX * inputDirX + inputDirY * inputDirY) || 1;
      const dirX = inputDirX / dirLen;
      const dirY = inputDirY / dirLen;

      // Calculate target speed based on mass
      const massRatio = Math.max(1, this.mass / PhysicsConstants.MIN_MASS);
      const speedReduction = Math.sqrt(Math.max(0, massRatio - 1)) * PhysicsConstants.MASS_FACTOR * 50;
      let targetSpeed = PhysicsConstants.BASE_SPEED / (1 + speedReduction);
      
      // Clamp max speed
      const maxSpeed = PhysicsConstants.BASE_SPEED * PhysicsConstants.MAX_SPEED_MULTIPLIER;
      targetSpeed = Math.min(targetSpeed, maxSpeed);
      
      const targetVx = dirX * targetSpeed;
      const targetVy = dirY * targetSpeed;

      // Smooth acceleration toward target velocity
      const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      const speedDiff = Math.abs(targetSpeed - currentSpeed);
      
      // Adaptive response: faster when far from target, slower when close
      const TURN_RESPONSE = 0.15;
      const adaptiveResponse = Math.min(TURN_RESPONSE + (speedDiff / targetSpeed) * 0.1, PhysicsConstants.ACCELERATION_RATE);
      
      // During split travel (but after direction lock), allow gradual steering
      if (isInSplitTravel && !hasDirectionLock) {
        const splitResponse = adaptiveResponse * 0.5;
        this.vx = this.vx * (1 - splitResponse) + targetVx * splitResponse;
        this.vy = this.vy * (1 - splitResponse) + targetVy * splitResponse;
      } else if (!isInSplitTravel) {
        this.vx = this.vx * (1 - adaptiveResponse) + targetVx * adaptiveResponse;
        this.vy = this.vy * (1 - adaptiveResponse) + targetVy * adaptiveResponse;
      }
    } else {
      // No input or input centered: apply heavy damping to slow/stop cell
      const dampingFactor = isInputCentered ? 0.85 : (isInSplitTravel ? 0.995 : PhysicsConstants.FRICTION);
      this.vx *= dampingFactor;
      this.vy *= dampingFactor;
    }

    // Update position (velocity-based movement)
    this.x += this.vx;
    this.y += this.vy;

    // Apply mass decay
    if (config.massDecayRate > 0 && this.mass > PhysicsConstants.MASS_DECAY_THRESHOLD) {
      const massMultiplier = 1 + (this.mass / PhysicsConstants.RADIUS_SCALE_MASS);
      const decayAmount = this.mass * config.massDecayRate * massMultiplier;
      this.mass = Math.max(PhysicsConstants.MASS_DECAY_THRESHOLD, this.mass - decayAmount);
    }

    // Boundary clamping
    const radius = this.getRadius();
    this.x = Math.max(radius, Math.min(config.mapWidth - radius, this.x));
    this.y = Math.max(radius, Math.min(config.mapHeight - radius, this.y));
    
    // Update split travel time
    if (isInSplitTravel) {
      this.splitTravelTime = Math.max(0, PhysicsConstants.SPLIT_IMMUNITY_DURATION - timeSinceSplit);
      
      // Check if split travel should end
      if (timeSinceSplit >= PhysicsConstants.SPLIT_IMMUNITY_DURATION) {
        this.steerLocked = false;
        this.splitTravelTime = 0;
        this.setState(hasInput ? CellState.MOVING : CellState.IDLE);
      }
    }
  }

  getRadius() {
    const baseRadius = Math.sqrt(this.mass / Math.PI);
    const scaleFactor = PhysicsConstants.RADIUS_BASE_SCALE + 
                       Math.min(this.mass / PhysicsConstants.RADIUS_SCALE_MASS, PhysicsConstants.RADIUS_MAX_SCALE);
    return baseRadius * scaleFactor;
  }

  canSplit() {
    if (this.mass < PhysicsConstants.SPLIT_MIN_MASS) return false;
    if (this.splitCooldown === 0) return true;
    return Date.now() - this.lastSplitTime > this.splitCooldown;
  }

  split(targetCount, dirX, dirY, impulseMultiplier = 1.0) {
    if (!this.canSplit()) return null;

    const currentTime = Date.now();
    this.lastSplitTime = currentTime;
    this.setState(CellState.SPLITTING);

    // Calculate masses - ensure we don't go below minimum
    const oldMass = this.mass;
    const newMass = Math.max(PhysicsConstants.MIN_MASS, oldMass / 2);
    const remainingMass = oldMass - newMass;
    
    // Update original cell mass
    this.mass = remainingMass;

    // Determine split direction: prioritize cursor direction
    let splitDirX = 0;
    let splitDirY = 0;
    
    if (dirX !== undefined && dirY !== undefined) {
      const dirLength = Math.sqrt(dirX * dirX + dirY * dirY);
      if (dirLength > 0) {
        splitDirX = dirX / dirLength;
        splitDirY = dirY / dirLength;
      } else {
        // Fallback to velocity
        const velLength = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
        if (velLength > 0.1) {
          splitDirX = this.vx / velLength;
          splitDirY = this.vy / velLength;
        } else {
          // Random direction
          const angle = Math.random() * Math.PI * 2;
          splitDirX = Math.cos(angle);
          splitDirY = Math.sin(angle);
        }
      }
    } else {
      // No cursor direction, use velocity
      const velLength = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      if (velLength > 0.1) {
        splitDirX = this.vx / velLength;
        splitDirY = this.vy / velLength;
      } else {
        const angle = Math.random() * Math.PI * 2;
        splitDirX = Math.cos(angle);
        splitDirY = Math.sin(angle);
      }
    }

    // Calculate impulse speed - ultra slow splits
    const oldRadius = this.getRadius();
    const sizeFactor = Math.min(oldRadius * 0.003, 0.15); // Tiny contribution
    const massFactor = Math.min(oldMass * 0.00004, 0.08); // Tiny contribution
    let impulseSpeed = (PhysicsConstants.SPLIT_BASE_IMPULSE + sizeFactor + massFactor) * impulseMultiplier;
    
    // Calculate radii for proper spacing
    const tempNewCell = new Cell(0, 0, 0, newMass, this.ownerId);
    const newCellRadius = tempNewCell.getRadius();
    const oldCellNewRadius = this.getRadius();
    
    // REDUCE ejection distance for smaller cells (after first split) to prevent spreading too far
    // Smaller cells should stay closer together
    const minSeparation = oldCellNewRadius + newCellRadius;
    const isAttackSplit = impulseMultiplier >= 0.9;
    
    // Scale gap factor based on cell size - smaller cells get smaller gap
    // For very small cells (after multiple splits), reduce gap significantly
    const baseGapFactor = isAttackSplit ? PhysicsConstants.SPLIT_EJECTION_GAP : 1.12;
    let gapFactor = baseGapFactor;
    
    // Reduce gap for smaller cells to keep them closer together
    if (newMass < 1000) {
      // Very small cells (after 2+ splits) - much smaller gap
      gapFactor = baseGapFactor * 0.6; // 60% of normal gap
    } else if (newMass < 2000) {
      // Small cells (after 1 split) - reduced gap
      gapFactor = baseGapFactor * 0.75; // 75% of normal gap
    } else if (newMass < 5000) {
      // Medium cells - slightly reduced gap
      gapFactor = baseGapFactor * 0.85; // 85% of normal gap
    }
    
    const ejectionOffset = minSeparation * gapFactor;
    const minSafeDistance = (oldCellNewRadius + newCellRadius) * 1.05; // Reduced from 1.1 to keep closer
    const finalEjectionOffset = Math.max(ejectionOffset, minSafeDistance);
    
    // Also reduce impulse speed for smaller cells to prevent them from traveling too far
    if (newMass < 1000) {
      // Very small cells - much less impulse
      impulseSpeed *= 0.3;
    } else if (newMass < 2000) {
      // Small cells - reduced impulse
      impulseSpeed *= 0.4;
    } else if (newMass < 5000) {
      // Medium cells - slightly reduced impulse
      impulseSpeed *= 0.5;
    }
    
    // Reduce impulse for very small cells (virus splits)
    if (impulseMultiplier < 0.8 && newMass < 500) {
      impulseSpeed *= 0.3;
    } else if (impulseMultiplier < 0.8 && newMass < 1000) {
      impulseSpeed *= 0.4;
    }
    
    const newCellX = this.x + splitDirX * finalEjectionOffset;
    const newCellY = this.y + splitDirY * finalEjectionOffset;
    
    // Create new cell
    const newCellId = Date.now() * 1000 + Math.floor(Math.random() * 1000);
    const newCell = new Cell(newCellId, newCellX, newCellY, newMass, this.ownerId);
    newCell.setInstantMerge(this.splitCooldown === 0);
    newCell.setState(CellState.SPLIT_TRAVEL);
    newCell.splitImmunityUntil = currentTime + PhysicsConstants.SPLIT_IMMUNITY_DURATION;

    // Original cell gets backward push
    // Reduce backward push for smaller cells to keep them closer together
    let backwardMultiplier = isAttackSplit ? PhysicsConstants.SPLIT_BACKWARD_MULTIPLIER : 0.1;
    
    // Scale down backward multiplier for smaller cells
    if (newMass < 1000) {
      backwardMultiplier *= 0.3; // Very small cells - much less backward push
    } else if (newMass < 2000) {
      backwardMultiplier *= 0.4; // Small cells - reduced backward push
    } else if (newMass < 5000) {
      backwardMultiplier *= 0.5; // Medium cells - slightly reduced backward push
    }
    
    const backwardImpulse = impulseSpeed * backwardMultiplier;
    this.vx -= splitDirX * backwardImpulse;
    this.vy -= splitDirY * backwardImpulse;
    
    // Track split direction and lock it for 120ms
    this.splitDirectionX = -splitDirX;
    this.splitDirectionY = -splitDirY;
    this.splitTime = currentTime;
    this.splitImmunityUntil = currentTime + PhysicsConstants.SPLIT_IMMUNITY_DURATION;
    this.splitDirectionLockUntil = currentTime + PhysicsConstants.SPLIT_DIRECTION_LOCK_DURATION;
    this.splitTravelTime = PhysicsConstants.SPLIT_IMMUNITY_DURATION;
    this.steerLocked = true; // Lock steering during split travel
    this.setState(CellState.SPLIT_TRAVEL);

    // New cell gets forward impulse (ballistic velocity)
    // Reduce forward multiplier for smaller cells to prevent spreading too far
    let forwardMultiplier = isAttackSplit ? PhysicsConstants.SPLIT_FORWARD_MULTIPLIER : PhysicsConstants.SPLIT_NON_ATTACK_MULTIPLIER;
    
    // Scale down forward multiplier for smaller cells
    if (newMass < 1000) {
      forwardMultiplier *= 0.3; // Very small cells - much less forward push
    } else if (newMass < 2000) {
      forwardMultiplier *= 0.4; // Small cells - reduced forward push
    } else if (newMass < 5000) {
      forwardMultiplier *= 0.5; // Medium cells - slightly reduced forward push
    }
    
    const forwardImpulse = impulseSpeed * forwardMultiplier;
    
    // Set velocity = splitDirection * splitSpeed (ballistic - no steering)
    newCell.vx = splitDirX * forwardImpulse;
    newCell.vy = splitDirY * forwardImpulse;
    newCell.lastSplitTime = currentTime;
    newCell.splitDirectionX = splitDirX;
    newCell.splitDirectionY = splitDirY;
    newCell.splitTime = currentTime;
    newCell.splitImmunityUntil = currentTime + PhysicsConstants.SPLIT_IMMUNITY_DURATION;
    newCell.splitDirectionLockUntil = currentTime + PhysicsConstants.SPLIT_DIRECTION_LOCK_DURATION;
    newCell.splitTravelTime = PhysicsConstants.SPLIT_IMMUNITY_DURATION;
    newCell.steerLocked = true; // Lock steering during split travel

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
      ownerId: this.ownerId,
      state: this.state,
      splitTime: this.splitTime,
      isAlive: this.isAlive
    };
  }
}

