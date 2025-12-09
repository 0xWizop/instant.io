# instant.io Game Engine

A complete .io game engine implementing core mechanics from Agar.io and Tricksplit.io, with a configurable **INSTANT MERGE** mode.

## Features

### ✅ Core Mechanics

1. **Movement System** - Fluid Agar.io-style movement with:
   - Acceleration toward mouse cursor
   - Mass-based speed reduction
   - Velocity + damping system
   - Server-authoritative movement
   - Client-side prediction + interpolation

2. **Split Mechanics** - Full split system:
   - Normal Split (2x)
   - Double Split (4x)
   - Triple Split (8x)
   - 16 Split
   - 32 Split
   - Velocity impulses on split
   - Mass conservation

3. **Instant Merge Mode** - Configurable merge behavior:
   - Instant merge (0ms delay)
   - Classic Agar merge timer (configurable)
   - Server configurable

4. **Virus Logic** - Complete virus system:
   - Virus eating (explodes large cells)
   - Virus feeding (shoot pellets to grow virus)
   - Virus projectiles (when virus pops)
   - Auto-split on virus collision

5. **Mass System**:
   - Mass decay (configurable rate)
   - Mass gain from pellets, players, viruses
   - Auto-split at 22.5k mass

6. **Keybind System**:
   - Fully remappable keybinds
   - localStorage persistence
   - Settings UI

7. **Networking**:
   - WebSocket protocol
   - 60 TPS server tick rate
   - 60 Hz client input rate
   - Snapshot-based state sync
   - Interpolation for smooth rendering

8. **Renderer**:
   - Pixi.js-based rendering
   - Smooth interpolation
   - Camera follows player
   - Leaderboard UI
   - Stats display (mass, cells, score)
   - Ping display

## Installation

```bash
npm install
```

## Running

```bash
npm start
```

Then open `http://localhost:3000` in your browser.

## Configuration

Edit `server/GameWorld.js` to configure:

```javascript
this.config = {
  instantMerge: true,        // Enable instant merge
  mergeDelayMS: 0,           // Merge delay (0 = instant)
  virusMassThreshold: 2000, // Mass threshold for virus explosion
  virusMaxMass: 2000,        // Max virus mass before pop
  autoSplitMass: 22500,      // Auto-split mass threshold
  massDecayRate: 0.002,      // Mass decay per tick
  mapWidth: 5000,            // Map width
  mapHeight: 5000,           // Map height
  pelletCount: 1000,         // Number of pellets
  virusCount: 20             // Number of viruses
};
```

## Default Keybinds

- **Split (2x)**: Space
- **Double Split (4x)**: Shift + Space
- **Triple Split (8x)**: E
- **16 Split**: Q
- **32 Split**: Z
- **Feed**: W
- **Macro Feed**: R
- **Stop Movement**: S
- **Respawn**: Enter

All keybinds can be remapped in the Settings menu.

## Architecture

### Server
- `server/index.js` - Express + WebSocket server
- `server/GameServer.js` - Game server logic
- `server/GameWorld.js` - World simulation
- `server/entities/` - Game entities (Cell, Player, Pellet, Virus)

### Client
- `client/index.html` - Main HTML
- `client/game.js` - Entry point
- `client/GameClient.js` - Game client with Pixi.js renderer
- `client/KeybindManager.js` - Keybind management

## Game Mechanics

### Movement Formula

```javascript
const ACCEL = 0.45;
const DAMPING = 0.90;
const MASS_FACTOR = 0.003;

cell.vx += input.dirX * ACCEL * (1 / (1 + cell.mass * MASS_FACTOR));
cell.vy += input.dirY * ACCEL * (1 / (1 + cell.mass * MASS_FACTOR));
cell.vx *= DAMPING;
cell.vy *= DAMPING;
cell.x += cell.vx;
cell.y += cell.vy;
```

### Split Mechanics

- Each split creates a new cell with half mass
- Velocity impulse applied toward cursor direction
- Cooldown prevents merge exploits (unless instant merge enabled)
- Mass is conserved

### Merge Mechanics

- **Instant Merge**: Cells merge immediately on overlap
- **Classic Merge**: Cells merge after configurable delay
- Merged cells combine mass and average velocity

### Virus Mechanics

- Large cells (>2000 mass) explode when touching virus
- Feed pellets can grow viruses
- Full viruses (2000 mass) pop and shoot projectiles
- Projectiles damage large cells

## License

MIT

