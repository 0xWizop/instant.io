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
    this.targetUpdateInterval = 2000 + Math.random() * 3000; // 2-5 seconds
    this.aggressiveness = 0.3 + Math.random() * 0.4; // 0.3-0.7
  }

  tick(world) {
    // Update target periodically
    const now = Date.now();
    if (now - this.lastTargetUpdate > this.targetUpdateInterval) {
      this.updateTarget(world);
      this.lastTargetUpdate = now;
      this.targetUpdateInterval = 2000 + Math.random() * 3000;
    }

    // Calculate direction to target
    const centerX = this.getCenterX();
    const centerY = this.getCenterY();
    const dx = this.targetX - centerX;
    const dy = this.targetY - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 10) {
      this.inputDirX = dx / dist;
      this.inputDirY = dy / dist;
    } else {
      this.inputDirX = 0;
      this.inputDirY = 0;
    }

    // Update cursor position (for splits)
    this.cursorX = this.targetX;
    this.cursorY = this.targetY;

    // Call parent tick
    super.tick(world);

    // Bot AI: decide on actions
    this.makeDecisions(world);
  }

  updateTarget(world) {
    // Find nearest pellet or player
    let nearestPellet = null;
    let nearestPelletDist = Infinity;
    let nearestPlayer = null;
    let nearestPlayerDist = Infinity;

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

    // Find nearest smaller player
    const myMass = this.getTotalMass();
    world.players.forEach((player) => {
      if (player.id === this.id) return;
      const playerMass = player.getTotalMass();
      const dx = player.getCenterX() - this.getCenterX();
      const dy = player.getCenterY() - this.getCenterY();
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Prefer smaller players
      if (playerMass < myMass * 0.8 && dist < nearestPlayerDist) {
        nearestPlayerDist = dist;
        nearestPlayer = player;
      }
    });

    // Choose target based on aggressiveness
    if (nearestPlayer && Math.random() < this.aggressiveness) {
      this.targetX = nearestPlayer.getCenterX();
      this.targetY = nearestPlayer.getCenterY();
    } else if (nearestPellet) {
      this.targetX = nearestPellet.x;
      this.targetY = nearestPellet.y;
    } else {
      // Random wander
      this.targetX = Math.random() * world.config.mapWidth;
      this.targetY = Math.random() * world.config.mapHeight;
    }
  }

  makeDecisions(world) {
    // Bots should NOT split on their own - only split when hitting viruses
    // (Virus splits are handled in GameWorld.js collision detection)
    // Removed auto-split logic for bots

    // Feed if we're large enough
    if (this.getTotalMass() > 2000 && Math.random() < 0.005) {
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

