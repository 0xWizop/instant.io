export class Pellet {
  constructor(id, x, y) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.mass = 10 + Math.random() * 5; // 10-15 mass
    this.color = this.generateColor();
  }

  generateColor() {
    const hue = Math.floor(Math.random() * 360);
    return `hsl(${hue}, 70%, 50%)`;
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

