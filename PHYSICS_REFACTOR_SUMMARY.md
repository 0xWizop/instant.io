# Physics Refactor Summary

## ✅ Core Fixes Implemented

### 1. **Eating Logic - Manual Dominance Check** ✅
- **NOT a collision callback** - Eating is now a separate dominance check
- Uses base radius (`sqrt(mass)`) for calculations, not scaled radius
- Exact conditions implemented:
  - `A.owner !== B.owner` ✓
  - `A.mass > B.mass` ✓
  - `A.radius >= B.radius * 1.15` ✓
  - `distance < A.radius - (B.radius * 0.4)` ✓
  - `B.isAlive === true` ✓
  - `B.splitImmunityTimer <= 0` ✓
- **100% mass transfer** (no 85% loss)
- **Instant transfer** (no delays)
- **Multi-eat priority**: Sort by distance ASC, eat only ONE per frame
- Works during motion, after split, while merging

### 2. **Game Tick Order (ABSOLUTE)** ✅
Every tick executes in this exact order:
1. ✅ Movement integration (`position += velocity`)
2. ✅ Split travel decay (update timers)
3. ✅ Resolve physical overlaps (push-out only)
4. ✅ Resolve EATING (dominance check)
5. ✅ Resolve MERGING
6. ✅ Cleanup / despawn

### 3. **Split Logic - Ballistic Travel** ✅
- **Fresh direction vectors**: Each split uses `normalize(mousePosition - cell.position)`
- **Never reuses** previous impulse vectors
- **Largest cells split first**: Sorted by mass DESC
- **Ballistic travel**: 
  - `steerLocked = true` for 120ms
  - No mouse steering during lock
  - Only minimal friction applied
- **Direction lock**: 120ms no-steering period

### 4. **Double Split (True 4-Way)** ✅
- **NOT cascading** - All 4 cells spawn from original parent in ONE tick
- Directions: forward, +90°, -90°, 180° (backward)
- All cells share:
  - Same travel time
  - Same merge cooldown
  - Same immunity window
  - Equal mass distribution

### 5. **Merge Logic - Physics Snap** ✅
- **NOT animation-driven** - Merge is instant physics snap
- Conditions:
  - Same owner ✓
  - `mergeCooldown <= 0` (300ms after split) ✓
  - `distance < mergeRadius` ✓
- Merge resolution:
  - `newPos = weightedCenterOfMass` ✓
  - `newMass = sum(masses)` ✓
  - `newVelocity = ZERO` ✓
- **Delete children immediately** - No lerping logic state
- Animation is cosmetic only

### 6. **Overlap Resolution** ✅
- Push-out formula: `normalize(A.pos - B.pos) * overlap * 0.5`
- Weighted by mass (heavier pushes less)
- **NEVER cancels eat checks** - Only physical push-out

### 7. **Debug Overlays (F3)** ✅
- Cell radius (red)
- Eat threshold ring (cyan) - shows `baseRadius - (smallRadius * 0.4)`
- Merge radius ring (yellow, when merging)
- Split immunity timer (purple, fades as expires)
- Cell state label
- Velocity vectors (green)

## 🔧 Technical Changes

### Files Modified:
- `server/PhysicsConstants.js` - Added eating constants, merge cooldown
- `server/entities/Cell.js` - Added state machine, ballistic split travel, base radius
- `server/entities/Player.js` - Fixed eating, split logic, merge logic
- `server/GameWorld.js` - Reorganized tick order, eating as dominance check
- `client/GameClient.js` - Enhanced debug overlays

### Key Methods:
- `Cell.getBaseRadius()` - Returns `sqrt(mass)` for eating calculations
- `Cell.hasDirectionLock()` - Checks if steering is locked
- `Cell.getSplitImmunityTimer()` - Returns remaining immunity time
- `GameWorld.resolveEating()` - Manual dominance check (NOT collision callback)
- `GameWorld.resolveCollisions()` - Push-out only (never cancels eating)
- `Player.performDoubleSplit()` - True 4-way split from parent

## ✅ Acceptance Tests

All tests should pass:
- ✅ Split into smaller bot → eat immediately on contact
- ✅ Split, then eat within 200ms → works
- ✅ Double split → 4 clean rays
- ✅ Merge after 0.3–0.5s → no jitter
- ✅ No cell ever vibrates or gets stuck

## 🚫 Removed Anti-Patterns

- ❌ `onCollisionEat()` - Eating is now manual check
- ❌ Animation-based scaling for logic
- ❌ Delayed despawn timers
- ❌ Reuse of velocity during split
- ❌ Overlap-based eat triggers

## 📝 Notes

- Eating uses **base radius** (`sqrt(mass)`), not scaled radius
- Split travel is **ballistic** - no steering for 120ms
- Merge is **physics snap** - instant, no lerping
- Tick order is **absolute** - eating happens AFTER overlap resolution

