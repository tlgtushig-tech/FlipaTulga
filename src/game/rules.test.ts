import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkAABBOverlap,
  getPlayerHitbox,
  calculateSpeed,
  calculateSpawnInterval,
  calculateScore,
  evaluateCombo,
  evaluateRunRank,
  PLAYER_DIMS,
} from './rules.ts';

test('checkAABBOverlap detects overlapping rectangles and misses separated ones', () => {
  const boxA = { x: 50, y: 50, width: 50, height: 50 };
  const overlappingBox = { x: 70, y: 70, width: 50, height: 50 };
  const distantBox = { x: 200, y: 200, width: 50, height: 50 };

  assert.equal(checkAABBOverlap(boxA, overlappingBox), true);
  assert.equal(checkAABBOverlap(boxA, distantBox), false);
});

test('getPlayerHitbox adjusts height correctly for sliding vs standing', () => {
  const standing = getPlayerHitbox({ x: 100, y: 200, action: 'running' });
  assert.equal(standing.height, PLAYER_DIMS.standHeight);
  assert.equal(standing.width, PLAYER_DIMS.standWidth);

  const sliding = getPlayerHitbox({ x: 100, y: 200, action: 'sliding' });
  assert.equal(sliding.height, PLAYER_DIMS.slideHeight);
  assert.equal(sliding.width, PLAYER_DIMS.slideWidth);
  // Sliding hitbox should be lower (near the ground)
  assert.equal(sliding.y, 200 + (PLAYER_DIMS.standHeight - PLAYER_DIMS.slideHeight));
});

test('calculateSpeed scales with distance and increases when turbo is active', () => {
  const startSpeed = calculateSpeed(0, false);
  const midSpeed = calculateSpeed(1000, false);
  const maxSpeed = calculateSpeed(5000, false);

  assert.ok(midSpeed > startSpeed, 'Speed should increase over distance');
  assert.ok(maxSpeed >= midSpeed, 'Speed should reach or approach max');

  const turboSpeed = calculateSpeed(1000, true);
  assert.ok(turboSpeed > midSpeed, 'Turbo speed must be significantly higher than normal speed');
});

test('calculateSpawnInterval decreases with distance to raise difficulty', () => {
  const earlyInterval = calculateSpawnInterval(0);
  const lateInterval = calculateSpawnInterval(3000);

  assert.ok(earlyInterval > lateInterval, 'Obstacle spawn interval should decrease as distance grows');
});

test('calculateScore calculates distance, stars, and combo bonus accurately', () => {
  const score = calculateScore(100, 10, 5);
  // 100 * 10 = 1000, 10 * 50 = 500, 5 * 25 = 125 -> 1625
  assert.equal(score, 1625);
});

test('evaluateCombo increments if collected within window, resets otherwise', () => {
  assert.equal(evaluateCombo(3, 10.0, 11.2, 2.5), 4);
  assert.equal(evaluateCombo(5, 10.0, 13.0, 2.5), 1);
});

test('evaluateRunRank assigns correct tiers based on score and distance', () => {
  assert.equal(evaluateRunRank(15000, 1200).rank, 'S');
  assert.equal(evaluateRunRank(8000, 700).rank, 'A');
  assert.equal(evaluateRunRank(4000, 350).rank, 'B');
  assert.equal(evaluateRunRank(2000, 150).rank, 'C');
  assert.equal(evaluateRunRank(500, 50).rank, 'D');
});
