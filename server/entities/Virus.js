export class Virus {
  constructor(id, x, y) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.mass = 1000; // Starting mass
    this.maxMass = 2000;
    this.vx = 0;
    this.vy = 0;
    this.color = '#00ff00';
  }

  feed(mass) {
    this.mass += mass;
    if (this.mass >= this.maxMass) {
      return true; // Virus is full, should pop
    }
    return false;
  }

  pop(dirX, dirY) {
    // Create virus projectile
    const projectile = {
      x: this.x,
      y: this.y,
      vx: dirX * 30,
      vy: dirY * 30,
      mass: 50 // Reduced from 100 to 50 for slower growth
    };

    // Reset virus
    this.mass = 1000;
    this.x = Math.random() * 5000;
    this.y = Math.random() * 5000;

    return projectile;
  }

  update() {
    // Apply velocity
    this.x += this.vx;
    this.y += this.vy;

    // Apply damping
    this.vx *= 0.95;
    this.vy *= 0.95;

    // Boundary clamping
    const radius = this.getRadius();
    this.x = Math.max(radius, Math.min(5000 - radius, this.x));
    this.y = Math.max(radius, Math.min(5000 - radius, this.y));
  }

  getRadius() {
    return Math.sqrt(this.mass / Math.PI) * 2;
  }

  serialize() {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      mass: this.mass,
      color: this.color
    };
  }
}

