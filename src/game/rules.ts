/**
 * Core pure game logic and calculations for AAAAAAA! Runner.
 * Decoupled from UI and canvas rendering to enable deterministic unit tests.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PlayerActionState = 'running' | 'jumping' | 'double_jumping' | 'sliding' | 'crashed';

export interface PlayerHitboxConfig {
  x: number;
  y: number;
  action: PlayerActionState;
}

/**
 * Standard standing player dimensions
 */
export const PLAYER_DIMS = {
  standWidth: 54,
  standHeight: 80,
  slideWidth: 70,
  slideHeight: 40,
  jumpWidth: 50,
  jumpHeight: 65,
};

/**
 * Calculate Axis-Aligned Bounding Box (AABB) overlap between two rectangles.
 * Applies a slight inner padding tolerance for fair arcade feel.
 */
export function checkAABBOverlap(a: Rect, b: Rect, padding = 4): boolean {
  return (
    a.x + padding < b.x + b.width - padding &&
    a.x + a.width - padding > b.x + padding &&
    a.y + padding < b.y + b.height - padding &&
    a.y + a.height - padding > b.y + padding
  );
}

/**
 * Returns dynamic hitbox bounding box according to current player action.
 * Sliding cuts height in half so player can duck under airborne hazards.
 */
export function getPlayerHitbox(config: PlayerHitboxConfig): Rect {
  if (config.action === 'sliding') {
    return {
      x: config.x,
      y: config.y + (PLAYER_DIMS.standHeight - PLAYER_DIMS.slideHeight),
      width: PLAYER_DIMS.slideWidth,
      height: PLAYER_DIMS.slideHeight,
    };
  }

  if (config.action === 'jumping' || config.action === 'double_jumping') {
    return {
      x: config.x + 2,
      y: config.y + 10,
      width: PLAYER_DIMS.jumpWidth,
      height: PLAYER_DIMS.jumpHeight,
    };
  }

  return {
    x: config.x,
    y: config.y,
    width: PLAYER_DIMS.standWidth,
    height: PLAYER_DIMS.standHeight,
  };
}

/**
 * Calculate dynamic runner speed based on distance traveled and turbo state.
 * Smoothly scales up with an asymptotic cap.
 */
export function calculateSpeed(
  distance: number,
  isTurbo: boolean,
  baseSpeed = 380,
  maxNormalSpeed = 820,
  turboMultiplier = 1.45
): number {
  if (distance < 0) distance = 0;
  // Speed ramp curve: gradual ramp up over 2000 meters
  const progress = Math.min(1, distance / 2200);
  const normalSpeed = baseSpeed + (maxNormalSpeed - baseSpeed) * Math.pow(progress, 0.85);

  if (isTurbo) {
    return normalSpeed * turboMultiplier;
  }
  return normalSpeed;
}

/**
 * Calculate obstacle spawn delay interval in seconds based on distance.
 * Spawns get closer together as distance increases.
 */
export function calculateSpawnInterval(
  distance: number,
  minInterval = 0.9,
  maxInterval = 2.4
): number {
  const progress = Math.min(1, distance / 3000);
  return maxInterval - (maxInterval - minInterval) * progress;
}

/**
 * Calculate overall run score combining distance, stars collected, and combo multiplier.
 */
export function calculateScore(distanceMeters: number, starsCollected: number, maxCombo: number): number {
  const distanceScore = Math.floor(Math.max(0, distanceMeters) * 10);
  const starScore = Math.max(0, starsCollected) * 50;
  const comboBonus = Math.max(0, maxCombo) * 25;
  return distanceScore + starScore + comboBonus;
}

/**
 * Update combo chain: resets if more than comboWindowSeconds has elapsed.
 */
export function evaluateCombo(
  currentCombo: number,
  lastItemTime: number,
  currentTime: number,
  comboWindowSeconds = 2.5
): number {
  if (currentTime - lastItemTime > comboWindowSeconds) {
    return 1;
  }
  return currentCombo + 1;
}

/**
 * Grade performance rank on game over.
 */
export function evaluateRunRank(score: number, distance: number): { rank: string; title: string; color: string } {
  if (score >= 12000 || distance >= 1000) {
    return { rank: 'S', title: 'GODLIKE SCREAMER', color: '#f59e0b' };
  }
  if (score >= 7000 || distance >= 600) {
    return { rank: 'A', title: 'SUPERSONIC SPRINT', color: '#8b5cf6' };
  }
  if (score >= 3500 || distance >= 300) {
    return { rank: 'B', title: 'SPEEDY DOODLER', color: '#3b82f6' };
  }
  if (score >= 1500 || distance >= 120) {
    return { rank: 'C', title: 'ECHOING RUNNER', color: '#059669' };
  }
  return { rank: 'D', title: 'TUMBLING NOVICE', color: '#64748b' };
}
