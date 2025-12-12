import { Player } from './Player.js';

export class Bot extends Player {
  constructor(id, config) {
    super(id, config);
    this.name = `Bot${id}`;
    this.isBot = true;
    
    // Override starting mass to 1000
    if (this.cells.length > 0) {
      this.cells[0].mass = 1000;
    }
    this.targetX = Math.random() * config.mapWidth;
    this.targetY = Math.random() * config.mapHeight;
    this.lastTargetUpdate = Date.now();
    this.targetUpdateInterval = 4000 + Math.random() * 6000; // 4-10 seconds (slower, more chill)
    this.aggressiveness = 0.2 + Math.random() * 0.3; // 0.2-0.5 (less aggressive)
    this.turnChance = 0.15; // 15% chance to make a turn each update
    this.lastTurnTime = Date.now();
    this.turnInterval = 3000 + Math.random() * 5000; // Turn every 3-8 seconds
    this.wanderAngle = Math.random() * Math.PI * 2; // Random wander direction
  }

  tick(world) {
    const now = Date.now();
    const centerX = this.getCenterX();
    const centerY = this.getCenterY();
    
    // Check for nearby viruses and avoid them
    let avoidVirus = null;
    let avoidVirusDist = Infinity;
    const myRadius = this.cells.length > 0 ? this.cells[0].getRadius() : 50;
    
    world.viruses.forEach((virus) => {
      const dx = virus.x - centerX;
      const dy = virus.y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const safeDistance = myRadius + virus.getRadius() + 200; // Keep 200px away from viruses
      
      if (dist < safeDistance && dist < avoidVirusDist) {
        avoidVirus = virus;
        avoidVirusDist = dist;
      }
    });
    
    // If near a virus, avoid it (unless very close - might be baited)
    if (avoidVirus && avoidVirusDist > 100) {
      // Move away from virus
      const dx = centerX - avoidVirus.x;
      const dy = centerY - avoidVirus.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0) {
        this.targetX = centerX + (dx / dist) * 500; // Move 500px away
        this.targetY = centerY + (dy / dist) * 500;
        this.lastTargetUpdate = now;
      }
    } else {
      // Update target periodically (slower, more chill) - less frequent updates = smoother movement
      if (now - this.lastTargetUpdate > this.targetUpdateInterval) {
        this.updateTarget(world);
        this.lastTargetUpdate = now;
        this.targetUpdateInterval = 6000 + Math.random() * 8000; // 6-14 seconds (longer intervals = less spazzy)
      }

      // Remove random turns - they cause spazzy back-and-forth movement
      // Bots now move smoothly toward their target without random direction changes
    }

    // Calculate direction to target with smooth, gradual movement (no spazzy back-and-forth)
    const dx = this.targetX - centerX;
    const dy = this.targetY - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Smooth input direction changes to prevent spazzy movement
    if (!this.lastInputDirX) {
      this.lastInputDirX = 0;
      this.lastInputDirY = 0;
    }

    if (dist > 100) {
      // Calculate target direction
      const targetDirX = dx / dist;
      const targetDirY = dy / dist;
      
      // Smoothly blend toward target direction (prevents sudden direction changes)
      const blendFactor = 0.15; // Slow blending for smooth movement
      this.lastInputDirX = this.lastInputDirX * (1 - blendFactor) + targetDirX * blendFactor;
      this.lastInputDirY = this.lastInputDirY * (1 - blendFactor) + targetDirY * blendFactor;
      
      // Normalize blended direction
      const blendLen = Math.sqrt(this.lastInputDirX * this.lastInputDirX + this.lastInputDirY * this.lastInputDirY);
      if (blendLen > 0) {
        this.inputDirX = this.lastInputDirX / blendLen;
        this.inputDirY = this.lastInputDirY / blendLen;
      } else {
        this.inputDirX = targetDirX;
        this.inputDirY = targetDirY;
      }
      
      // Reduce input strength for slower, more chill movement
      this.inputDirX *= 0.5; // 50% speed - slower and smoother
      this.inputDirY *= 0.5;
    } else {
      // Close to target, gradually slow down (smooth deceleration)
      const slowFactor = 0.8; // Gradually reduce speed
      this.lastInputDirX *= slowFactor;
      this.lastInputDirY *= slowFactor;
      this.inputDirX = this.lastInputDirX;
      this.inputDirY = this.lastInputDirY;
      
      // Stop if very close
      if (dist < 30) {
        this.inputDirX = 0;
        this.inputDirY = 0;
        this.lastInputDirX = 0;
        this.lastInputDirY = 0;
      }
    }

    // Update cursor position (bots don't split, but keep it updated)
    this.cursorX = this.targetX;
    this.cursorY = this.targetY;

    // Call parent tick
    super.tick(world);

    // Bot AI: decide on actions (no splits)
    this.makeDecisions(world);
  }

  updateTarget(world) {
    // Find nearest pellet (prefer pellets over players for chill bots)
    let nearestPellet = null;
    let nearestPelletDist = Infinity;

    // Find nearest pellet
    world.pellets.forEach((pellet) => {
      const dx = pellet.x - this.getCenterX();
      const dy = pellet.y - this.getCenterY();
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearestPelletDist) {
        nearestPelletDist = dist;
        nearestPellet = pellet;
      }
    });

    // Only chase players if very close and much smaller (rare, less aggressive)
    let nearestPlayer = null;
    let nearestPlayerDist = Infinity;
    const myMass = this.getTotalMass();
    
    world.players.forEach((player) => {
      if (player.id === this.id || player.isBot) return; // Don't chase other bots
      const playerMass = player.getTotalMass();
      const dx = player.getCenterX() - this.getCenterX();
      const dy = player.getCenterY() - this.getCenterY();
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Only chase if player is much smaller and close (less aggressive)
      if (playerMass < myMass * 0.6 && dist < 800 && dist < nearestPlayerDist) {
        nearestPlayerDist = dist;
        nearestPlayer = player;
      }
    });

    // Choose target - prefer pellets, rarely chase players
    if (nearestPlayer && Math.random() < this.aggressiveness * 0.5) {
      // Even less likely to chase
      this.targetX = nearestPlayer.getCenterX();
      this.targetY = nearestPlayer.getCenterY();
    } else if (nearestPellet) {
      this.targetX = nearestPellet.x;
      this.targetY = nearestPellet.y;
    } else {
      // Random wander - more common for chill bots
      this.targetX = Math.random() * world.config.mapWidth;
      this.targetY = Math.random() * world.config.mapHeight;
      this.wanderAngle = Math.random() * Math.PI * 2; // Update wander angle
    }
  }

  split(targetCount) {
    // Bots NEVER split manually - only split when hitting viruses
    // (Virus splits are handled in GameWorld.js collision detection)
    return; // Do nothing
  }

  makeDecisions(world) {
    // Bots should NEVER split on their own - only split when hitting viruses
    // (Virus splits are handled in GameWorld.js collision detection)
    // Completely removed auto-split logic for bots

    // Rarely feed if we're large enough (very low chance for chill bots)
    if (this.getTotalMass() > 2000 && Math.random() < 0.002) {
      const centerX = this.getCenterX();
      const centerY = this.getCenterY();
      const dx = this.targetX - centerX;
      const dy = this.targetY - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0) {
        const dirX = dx / dist;
        const dirY = dy / dist;
        this.feed(dirX, dirY);
      }
    }
  }
}

