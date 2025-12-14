/**
 * Centralized physics constants for the game
 * All timing, speed, and physics values are defined here
 */

export const PhysicsConstants = {
  // Movement constants
  BASE_SPEED: 4.5,
  MIN_MASS: 200,
  MASS_FACTOR: 0.0012,
  ACCELERATION_RATE: 0.85,
  FRICTION: 0.985,
  MAX_SPEED_MULTIPLIER: 1.5, // Max speed can be 1.5x base speed
  
  // Split constants
  SPLIT_MIN_MASS: 300,
  SPLIT_COOLDOWN: 1000, // 1 second (disabled if instant merge)
  SPLIT_IMMUNITY_DURATION: 500, // 500ms collision immunity after split
  SPLIT_DIRECTION_LOCK_DURATION: 120, // Lock direction for 120ms after split
  SPLIT_BASE_IMPULSE: 10.0,
  SPLIT_FORWARD_MULTIPLIER: 4.5, // Attack splits
  SPLIT_BACKWARD_MULTIPLIER: 0.85, // Original cell push
  SPLIT_EJECTION_GAP: 1.25, // Gap factor to prevent overlap
  DOUBLE_SPLIT_ANGLE_OFFSET: Math.PI / 2, // 90 degrees for 4-way split
  
  // Eating constants
  EAT_RADIUS_RATIO: 1.15, // radius(A) >= radius(B) * 1.15
  EAT_DISTANCE_FACTOR: 0.4, // distance < radius(A) - radius(B) * 0.4
  EAT_MASS_TRANSFER: 1.0, // 100% mass transfer (no loss)
  EAT_RADIUS_TWEEN_DURATION: 100, // 80-120ms radius growth tween
  
  // Merge constants
  MERGE_DELAY_MIN: 450, // Minimum merge delay (ms) - increased for slower merges
  MERGE_DELAY_MAX: 600, // Maximum merge delay (ms)
  MERGE_DISTANCE_THRESHOLD: 0.1, // 10% overlap required for merge
  MERGE_FORCE_THRESHOLD: 0.8, // 80% overlap forces merge regardless
  MERGE_COOLDOWN: 300, // Merge cooldown after split (ms)
  
  // Collision constants
  COLLISION_PUSH_STRENGTH: 0.8, // How strongly cells push each other apart
  COLLISION_MIN_DISTANCE: 0.1, // Minimum distance to maintain between cells
  
  // Virus constants
  VIRUS_MASS_THRESHOLD: 2000,
  VIRUS_SPLIT_MIN_PIECES: 2,
  VIRUS_SPLIT_MAX_PIECES: 16,
  VIRUS_SPLIT_IMPULSE: 12.0,
  
  // Mass decay
  MASS_DECAY_RATE: 0.00002,
  MASS_DECAY_THRESHOLD: 200,
  
  // Auto-split
  AUTO_SPLIT_MASS: 22500,
  
  // Radius calculation
  RADIUS_BASE_SCALE: 4.5,
  RADIUS_MAX_SCALE: 2.5, // Additional scale at high mass
  RADIUS_SCALE_MASS: 5000, // Mass at which max scale is reached
};

