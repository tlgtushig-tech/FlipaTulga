/**
 * Core 2D Canvas Engine for AAAAAAA! Runner.
 * Handles game loop, physics, obstacle spawning, input handling, and drawing.
 */

import {
  checkAABBOverlap,
  getPlayerHitbox,
  calculateSpeed,
  calculateSpawnInterval,
  calculateScore,
  evaluateCombo,
  evaluateRunRank,
  PLAYER_DIMS,
  type PlayerActionState,
  type Rect,
} from './rules.ts';
import { sound } from './audio.ts';

export type GameState = 'title' | 'playing' | 'paused' | 'gameover';

export interface RunStats {
  score: number;
  distance: number;
  stars: number;
  maxCombo: number;
  bestScore: number;
  rank: { rank: string; title: string; color: string };
}

export type SkinId = 'classic' | 'golden' | 'neon' | 'ninja';

export interface SkinConfig {
  id: SkinId;
  name: string;
  outlineColor: string;
  fillColor: string;
  mouthColor: string;
  auraColor: string;
  badge: string;
}

export const SKINS: Record<SkinId, SkinConfig> = {
  classic: {
    id: 'classic',
    name: 'Classic Doodle',
    outlineColor: '#18181b',
    fillColor: '#ffffff',
    mouthColor: '#09090b',
    auraColor: '#f59e0b',
    badge: 'Original Screamer',
  },
  golden: {
    id: 'golden',
    name: 'Super Golden',
    outlineColor: '#b45309',
    fillColor: '#fef08a',
    mouthColor: '#78350f',
    auraColor: '#eab308',
    badge: 'Hypercharged',
  },
  neon: {
    id: 'neon',
    name: 'Cyber Ink',
    outlineColor: '#06b6d4',
    fillColor: '#0f172a',
    mouthColor: '#ec4899',
    auraColor: '#06b6d4',
    badge: 'Glow Runner',
  },
  ninja: {
    id: 'ninja',
    name: 'Ninja Screamer',
    outlineColor: '#1e293b',
    fillColor: '#e2e8f0',
    mouthColor: '#ef4444',
    auraColor: '#ef4444',
    badge: 'Red Headband',
  },
};

interface Obstacle {
  id: number;
  type: 'spike' | 'double_spike' | 'airplane' | 'low_cloud' | 'bouncing_blob';
  x: number;
  y: number;
  width: number;
  height: number;
  initialY: number;
  vy: number;
  animTimer: number;
  destroyed: boolean;
}

interface Collectible {
  id: number;
  type: 'star' | 'coffee' | 'shield' | 'megaphone' | 'springboard';
  x: number;
  y: number;
  width: number;
  height: number;
  collected: boolean;
  pulseTimer: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  type: 'dust' | 'spark' | 'letter' | 'debris';
  text?: string;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number = 1000;
  private height: number = 600;
  private groundY: number = 470;

  public state: GameState = 'title';
  public skin: SkinConfig = SKINS.classic;

  // Run progress
  public score: number = 0;
  public distance: number = 0;
  public stars: number = 0;
  public combo: number = 1;
  public maxCombo: number = 1;
  public screamMeter: number = 0; // 0 to 100
  public isTurbo: boolean = false;
  public turboTimer: number = 0;
  public hasShield: boolean = false;
  public bestScore: number = 0;

  // Player physics
  private playerX: number = 140;
  private playerY: number = 470 - PLAYER_DIMS.standHeight;
  private playerVy: number = 0;
  private isGrounded: boolean = true;
  private jumpsRemaining: number = 2;
  private action: PlayerActionState = 'running';
  private slideTimer: number = 0;
  private coyoteTimer: number = 0;
  private jumpBufferTimer: number = 0;
  private runAnimTime: number = 0;
  private invulnerableTimer: number = 0;

  // World & Spawning
  private obstacles: Obstacle[] = [];
  private collectibles: Collectible[] = [];
  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];
  private nextObstacleSpawn: number = 1.2;
  private nextCollectibleSpawn: number = 0.8;
  private nextEntityId: number = 1;

  // Feel & Screen Effects
  private cameraShake: number = 0;
  private hitstopTimer: number = 0;
  private speedlineAlpha: number = 0;
  private screamLetterTimer: number = 0;

  // Input states
  private keysHeld: Set<string> = new Set();
  private lastStarTime: number = 0;

  // Callbacks for UI sync
  public onStateChange?: (state: GameState, stats?: RunStats) => void;
  public onHudUpdate?: (hud: {
    score: number;
    distance: number;
    stars: number;
    combo: number;
    screamMeter: number;
    isTurbo: boolean;
    hasShield: boolean;
  }) => void;

  private animFrameId: number | null = null;
  private lastTime: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Failed to get 2D canvas context');
    this.ctx = context;

    try {
      const savedBest = localStorage.getItem('aaaa_best_score');
      if (savedBest) this.bestScore = parseInt(savedBest, 10) || 0;
      const savedSkin = localStorage.getItem('aaaa_skin') as SkinId;
      if (savedSkin && SKINS[savedSkin]) this.skin = SKINS[savedSkin];
    } catch {}

    this.handleResize();
    window.addEventListener('resize', this.handleResize);
    this.setupInputs();
  }

  private handleResize = () => {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    if (!rect) return;
    this.width = rect.width || 1000;
    this.height = rect.height || 600;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.groundY = Math.max(380, this.height - 130);
  };

  private setupInputs() {
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'KeyW', 'ArrowDown', 'KeyS'].includes(e.code)) {
        e.preventDefault();
      }
      this.keysHeld.add(e.code);

      if (e.code === 'KeyM') {
        sound.toggleMute();
        return;
      }

      if (this.state === 'title') {
        if (e.code === 'Space' || e.code === 'Enter') {
          this.startGame();
        }
        return;
      }

      if (this.state === 'gameover') {
        if (e.code === 'Space' || e.code === 'Enter') {
          this.startGame();
        }
        return;
      }

      if (e.code === 'KeyP' || e.code === 'Escape') {
        this.togglePause();
        return;
      }

      if (this.state === 'playing') {
        if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
          this.queueJump();
        } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
          this.startSlide();
        } else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyX' || e.code === 'ArrowRight') {
          this.triggerTurbo();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysHeld.delete(e.code);
      if (this.state === 'playing') {
        if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
          // Variable jump cut
          if (this.playerVy < -180) {
            this.playerVy *= 0.48;
          }
        }
        if (e.code === 'ArrowDown' || e.code === 'KeyS') {
          if (this.action === 'sliding') {
            this.slideTimer = 0;
            this.action = 'running';
          }
        }
      }
    });

    window.addEventListener('blur', () => {
      this.keysHeld.clear();
    });
  }

  // External trigger for UI buttons & Touch
  public triggerJump() {
    if (this.state === 'title' || this.state === 'gameover') {
      this.startGame();
      return;
    }
    if (this.state === 'playing') {
      this.queueJump();
    }
  }

  public triggerSlide() {
    if (this.state === 'playing') {
      this.startSlide();
    }
  }

  public releaseSlide() {
    if (this.action === 'sliding') {
      this.slideTimer = 0;
      this.action = 'running';
    }
  }

  public triggerTurbo() {
    if (this.state === 'playing' && this.screamMeter >= 99 && !this.isTurbo) {
      this.activateTurboMode();
    }
  }

  public setSkin(skinId: SkinId) {
    if (SKINS[skinId]) {
      this.skin = SKINS[skinId];
      try {
        localStorage.setItem('aaaa_skin', skinId);
      } catch {}
    }
  }

  public startGame() {
    this.score = 0;
    this.distance = 0;
    this.stars = 0;
    this.combo = 1;
    this.maxCombo = 1;
    this.screamMeter = 0;
    this.isTurbo = false;
    this.turboTimer = 0;
    this.hasShield = false;
    this.playerVy = 0;
    this.isGrounded = true;
    this.jumpsRemaining = 2;
    this.action = 'running';
    this.slideTimer = 0;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.invulnerableTimer = 0;
    this.cameraShake = 0;
    this.hitstopTimer = 0;

    this.obstacles = [];
    this.collectibles = [];
    this.particles = [];
    this.floatingTexts = [];
    this.nextObstacleSpawn = 3.8; // Generous opening grace period (survives 3-4s without input)
    this.nextCollectibleSpawn = 0.8;

    this.playerY = this.groundY - PLAYER_DIMS.standHeight;

    this.state = 'playing';
    document.body.dataset.state = 'playing';
    sound.startBgm();
    this.onStateChange?.('playing');
  }

  public togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      document.body.dataset.state = 'paused';
      sound.stopBgm();
      this.onStateChange?.('paused');
    } else if (this.state === 'paused') {
      this.state = 'playing';
      document.body.dataset.state = 'playing';
      sound.startBgm();
      this.onStateChange?.('playing');
    }
  }

  public returnToTitle() {
    this.state = 'title';
    document.body.dataset.state = 'title';
    sound.stopBgm();
    this.onStateChange?.('title');
  }

  private queueJump() {
    this.jumpBufferTimer = 0.14; // Input buffer window
  }

  private executeJump() {
    if (this.isGrounded || this.coyoteTimer > 0) {
      // First jump
      this.playerVy = -640;
      this.isGrounded = false;
      this.coyoteTimer = 0;
      this.jumpsRemaining = 1;
      this.action = 'jumping';
      this.slideTimer = 0;
      sound.playJump();
      this.spawnDust(this.playerX + 25, this.groundY, 6);
    } else if (this.jumpsRemaining > 0) {
      // Double jump
      this.playerVy = -560;
      this.jumpsRemaining = 0;
      this.action = 'double_jumping';
      sound.playDoubleJump();
      this.spawnSparks(this.playerX + 25, this.playerY + 40, '#38bdf8', 8);
      this.addFloatingText(this.playerX + 25, this.playerY - 10, 'DOUBLE AAAAA!', '#0284c7');
    }
  }

  private startSlide() {
    if (this.isGrounded) {
      this.action = 'sliding';
      this.slideTimer = 0.55; // Slide duration
      sound.playSlide();
      this.spawnDust(this.playerX + 10, this.groundY, 4);
    } else {
      // Fast fall dive down
      this.playerVy = Math.max(this.playerVy, 650);
    }
  }

  private activateTurboMode() {
    this.isTurbo = true;
    this.turboTimer = 5.5; // 5.5 seconds of supersonic chaos
    this.screamMeter = 0;
    this.cameraShake = 0.5;
    sound.playTurbo();
    this.addFloatingText(this.playerX + 60, this.playerY - 20, 'TURBO SCREAM!!', '#eab308');

    // Blow away all nearby obstacles
    this.obstacles.forEach((obs) => {
      if (obs.x < this.width) {
        obs.destroyed = true;
        this.spawnDebris(obs.x + obs.width / 2, obs.y + obs.height / 2, 10);
      }
    });
  }

  private blastAllObstacles() {
    sound.playBlast();
    this.cameraShake = 0.6;
    this.hitstopTimer = 0.05;
    this.addFloatingText(this.width / 2, this.height / 2 - 40, 'SUPER MEGAPHONE BLAST!', '#f97316');
    this.obstacles.forEach((obs) => {
      obs.destroyed = true;
      this.spawnDebris(obs.x + obs.width / 2, obs.y + obs.height / 2, 12);
    });
  }

  private handleCrash() {
    if (this.invulnerableTimer > 0) return;

    if (this.hasShield) {
      this.hasShield = false;
      this.invulnerableTimer = 1.2;
      this.cameraShake = 0.4;
      sound.playHit();
      this.addFloatingText(this.playerX, this.playerY - 10, 'SHIELD BROKEN!', '#38bdf8');
      return;
    }

    if (this.isTurbo) {
      // Turbo destroys obstacle instead
      return;
    }

    // Game over!
    this.state = 'gameover';
    this.action = 'crashed';
    document.body.dataset.state = 'gameover';
    this.cameraShake = 0.8;
    this.hitstopTimer = 0.08;
    sound.stopBgm();
    sound.playGameOver();

    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      try {
        localStorage.setItem('aaaa_best_score', String(this.bestScore));
      } catch {}
    }

    const rank = evaluateRunRank(this.score, this.distance);
    const stats: RunStats = {
      score: this.score,
      distance: Math.floor(this.distance),
      stars: this.stars,
      maxCombo: this.maxCombo,
      bestScore: this.bestScore,
      rank,
    };

    this.spawnDebris(this.playerX + 25, this.playerY + 40, 20);
    this.onStateChange?.('gameover', stats);
  }

  // --- Particle & Text Helpers ---
  private spawnDust(x: number, y: number, count: number) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x,
        y: y - Math.random() * 6,
        vx: -120 - Math.random() * 120,
        vy: -20 - Math.random() * 40,
        life: 0.35,
        maxLife: 0.35,
        size: 3 + Math.random() * 4,
        color: '#a1a1aa',
        type: 'dust',
      });
    }
  }

  private spawnSparks(x: number, y: number, color: string, count: number) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 100 + Math.random() * 180;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.45,
        maxLife: 0.45,
        size: 4 + Math.random() * 4,
        color,
        type: 'spark',
      });
    }
  }

  private spawnDebris(x: number, y: number, count: number) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 400,
        vy: -150 - Math.random() * 300,
        life: 0.6,
        maxLife: 0.6,
        size: 4 + Math.random() * 6,
        color: '#27272a',
        type: 'debris',
      });
    }
  }

  private spawnScreamLetter() {
    const letters = ['A', 'A', 'A', '!', 'A', 'AA'];
    const letter = letters[Math.floor(Math.random() * letters.length)];
    this.particles.push({
      x: this.playerX - 10,
      y: this.playerY + 15 + (Math.random() - 0.5) * 20,
      vx: -160 - Math.random() * 100,
      vy: -30 - Math.random() * 60,
      life: 0.6,
      maxLife: 0.6,
      size: 14 + Math.random() * 8,
      color: this.isTurbo ? '#f59e0b' : '#3f3f46',
      type: 'letter',
      text: letter,
    });
  }

  private addFloatingText(x: number, y: number, text: string, color: string) {
    this.floatingTexts.push({
      x,
      y,
      text,
      color,
      life: 0.8,
      maxLife: 0.8,
    });
  }

  // --- Main Tick & Update Loop ---
  public start() {
    this.lastTime = performance.now();
    const loop = (time: number) => {
      const rawDt = (time - this.lastTime) / 1000;
      this.lastTime = time;
      // Clamp delta time to avoid tunneling on frame spikes
      const dt = Math.min(rawDt, 0.05);

      this.update(dt);
      this.render();

      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  public stop() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    window.removeEventListener('resize', this.handleResize);
  }

  private update(dt: number) {
    // Hitstop freeze
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      return;
    }

    // Camera shake decay
    if (this.cameraShake > 0) {
      this.cameraShake = Math.max(0, this.cameraShake - dt * 2.2);
    }

    // Invulnerability decay
    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer -= dt;
    }

    const currentSpeed = calculateSpeed(this.distance, this.isTurbo);

    // Speedline alpha
    const speedRatio = Math.min(1, (currentSpeed - 380) / 450);
    this.speedlineAlpha = this.isTurbo ? 0.9 : speedRatio * 0.5;

    // Background title idle animation
    if (this.state === 'title') {
      this.runAnimTime += dt * 6;
      this.playerY = this.groundY - PLAYER_DIMS.standHeight + Math.sin(this.runAnimTime) * 4;
      this.updateParticles(dt);
      return;
    }

    if (this.state === 'paused') {
      return;
    }

    if (this.state === 'gameover') {
      this.updateParticles(dt);
      return;
    }

    // --- State: PLAYING ---
    this.runAnimTime += dt * (currentSpeed / 30);
    this.distance += (currentSpeed * dt) / 40;
    this.score = calculateScore(this.distance, this.stars, this.maxCombo);

    // Turbo timer
    if (this.isTurbo) {
      this.turboTimer -= dt;
      if (this.turboTimer <= 0) {
        this.isTurbo = false;
        this.screamMeter = 0;
      }
    } else {
      // Passive scream meter fill over distance
      this.screamMeter = Math.min(100, this.screamMeter + dt * 3.5);
    }

    // Emit comic AAAAA letters
    this.screamLetterTimer += dt;
    const screamLetterInterval = this.isTurbo ? 0.06 : 0.2;
    if (this.screamLetterTimer >= screamLetterInterval) {
      this.screamLetterTimer = 0;
      this.spawnScreamLetter();
    }

    // Input buffer & coyote time
    if (this.jumpBufferTimer > 0) {
      this.jumpBufferTimer -= dt;
      if (this.isGrounded || this.coyoteTimer > 0 || this.jumpsRemaining > 0) {
        this.jumpBufferTimer = 0;
        this.executeJump();
      }
    }

    if (!this.isGrounded) {
      if (this.coyoteTimer > 0) this.coyoteTimer -= dt;
    }

    // Slide duration
    if (this.action === 'sliding') {
      this.slideTimer -= dt;
      if (this.slideTimer <= 0) {
        if (!this.keysHeld.has('ArrowDown') && !this.keysHeld.has('KeyS')) {
          this.action = 'running';
        } else {
          // Continue sliding while holding key down
          this.slideTimer = 0.2;
        }
      }
      this.spawnDust(this.playerX + 5, this.groundY, 1);
    }

    // Player physics & gravity
    const gravity = 1750;
    this.playerVy += gravity * dt;
    this.playerY += this.playerVy * dt;

    const floorY = this.groundY - (this.action === 'sliding' ? PLAYER_DIMS.slideHeight : PLAYER_DIMS.standHeight);

    if (this.playerY >= floorY) {
      this.playerY = floorY;
      this.playerVy = 0;
      if (!this.isGrounded) {
        // Just landed!
        this.isGrounded = true;
        this.jumpsRemaining = 2;
        if (this.action === 'jumping' || this.action === 'double_jumping') {
          this.action = 'running';
        }
        this.spawnDust(this.playerX + 25, this.groundY, 5);
      }
    } else {
      this.isGrounded = false;
    }

    // Spawn obstacles
    this.nextObstacleSpawn -= dt;
    if (this.nextObstacleSpawn <= 0) {
      this.spawnObstacle();
      this.nextObstacleSpawn = calculateSpawnInterval(this.distance);
    }

    // Spawn collectibles
    this.nextCollectibleSpawn -= dt;
    if (this.nextCollectibleSpawn <= 0) {
      this.spawnCollectible();
      this.nextCollectibleSpawn = 0.8 + Math.random() * 1.4;
    }

    // Update obstacles
    const playerHitbox = getPlayerHitbox({
      x: this.playerX,
      y: this.playerY,
      action: this.action,
    });

    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      obs.x -= currentSpeed * dt;
      obs.animTimer += dt;

      // Obstacle specific physics
      if (obs.type === 'bouncing_blob') {
        obs.y += obs.vy * dt;
        obs.vy += 1200 * dt;
        if (obs.y >= obs.initialY) {
          obs.y = obs.initialY;
          obs.vy = -450;
        }
      } else if (obs.type === 'airplane') {
        obs.y = obs.initialY + Math.sin(obs.animTimer * 4) * 25;
      }

      // Check collision
      if (!obs.destroyed) {
        const obsHitbox: Rect = {
          x: obs.x,
          y: obs.y,
          width: obs.width,
          height: obs.height,
        };

        if (checkAABBOverlap(playerHitbox, obsHitbox)) {
          if (this.isTurbo) {
            // Turbo breaks through obstacles!
            obs.destroyed = true;
            this.spawnDebris(obs.x + obs.width / 2, obs.y + obs.height / 2, 8);
            sound.playBlast();
            this.score += 200;
            this.addFloatingText(obs.x, obs.y - 10, 'SMASH! +200', '#f59e0b');
          } else {
            this.handleCrash();
            break;
          }
        }
      }

      // Despawn off-screen
      if (obs.x + obs.width < -100) {
        this.obstacles.splice(i, 1);
      }
    }

    // Update collectibles
    for (let i = this.collectibles.length - 1; i >= 0; i--) {
      const item = this.collectibles[i];
      item.x -= currentSpeed * dt;
      item.pulseTimer += dt * 5;

      if (!item.collected) {
        const itemHitbox: Rect = {
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
        };

        if (checkAABBOverlap(playerHitbox, itemHitbox, 0)) {
          item.collected = true;
          this.handleCollectiblePickup(item);
        }
      }

      if (item.x + item.width < -100 || item.collected) {
        this.collectibles.splice(i, 1);
      }
    }

    this.updateParticles(dt);

    // Combo timeout check
    if (this.combo > 1 && performance.now() / 1000 - this.lastStarTime > 2.5) {
      this.combo = 1;
    }

    // Sync HUD callback
    this.onHudUpdate?.({
      score: this.score,
      distance: Math.floor(this.distance),
      stars: this.stars,
      combo: this.combo,
      screamMeter: Math.floor(this.screamMeter),
      isTurbo: this.isTurbo,
      hasShield: this.hasShield,
    });
  }

  private handleCollectiblePickup(item: Collectible) {
    const now = performance.now() / 1000;

    if (item.type === 'star') {
      this.combo = evaluateCombo(this.combo, this.lastStarTime, now);
      this.lastStarTime = now;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;

      this.stars += 1;
      this.screamMeter = Math.min(100, this.screamMeter + 7);
      sound.playStar(this.combo);
      this.spawnSparks(item.x + 15, item.y + 15, '#fbbf24', 6);
      this.addFloatingText(item.x, item.y - 12, `+50 ${this.combo > 1 ? `x${this.combo}!` : ''}`, '#f59e0b');
    } else if (item.type === 'coffee') {
      sound.playPowerup();
      this.activateTurboMode();
      this.spawnSparks(item.x + 15, item.y + 15, '#d97706', 10);
      this.addFloatingText(item.x, item.y - 15, 'TURBO COFFEE!', '#b45309');
    } else if (item.type === 'shield') {
      this.hasShield = true;
      sound.playPowerup();
      this.spawnSparks(item.x + 15, item.y + 15, '#38bdf8', 10);
      this.addFloatingText(item.x, item.y - 15, 'INK SHIELD!', '#0284c7');
    } else if (item.type === 'megaphone') {
      this.blastAllObstacles();
    } else if (item.type === 'springboard') {
      // Launch player high into the air!
      this.playerVy = -880;
      this.isGrounded = false;
      this.jumpsRemaining = 1;
      sound.playDoubleJump();
      this.spawnSparks(item.x + 20, item.y, '#10b981', 8);
      this.addFloatingText(item.x, item.y - 20, 'BOOOOOING!', '#059669');
    }
  }

  private spawnObstacle() {
    const types: Obstacle['type'][] = ['spike', 'double_spike', 'airplane', 'low_cloud', 'bouncing_blob'];
    // Weighted selection
    const rand = Math.random();
    let type: Obstacle['type'] = 'spike';
    if (rand < 0.32) type = 'spike';
    else if (rand < 0.55) type = 'double_spike';
    else if (rand < 0.75) type = 'airplane';
    else if (rand < 0.88) type = 'low_cloud';
    else type = 'bouncing_blob';

    let width = 36;
    let height = 44;
    let y = this.groundY - height;

    if (type === 'double_spike') {
      width = 72;
      height = 48;
      y = this.groundY - height;
    } else if (type === 'airplane') {
      width = 54;
      height = 30;
      // High enough to slide under, low enough to jump over if timed well
      y = this.groundY - 60 - Math.random() * 20;
    } else if (type === 'low_cloud') {
      width = 70;
      height = 40;
      y = this.groundY - 78; // Must slide under!
    } else if (type === 'bouncing_blob') {
      width = 40;
      height = 40;
      y = this.groundY - height;
    }

    this.obstacles.push({
      id: this.nextEntityId++,
      type,
      x: this.width + 40,
      y,
      width,
      height,
      initialY: y,
      vy: type === 'bouncing_blob' ? -400 : 0,
      animTimer: 0,
      destroyed: false,
    });
  }

  private spawnCollectible() {
    const rand = Math.random();
    let type: Collectible['type'] = 'star';

    if (rand < 0.70) {
      type = 'star';
    } else if (rand < 0.82) {
      type = 'springboard';
    } else if (rand < 0.90) {
      type = 'coffee';
    } else if (rand < 0.96) {
      type = 'shield';
    } else {
      type = 'megaphone';
    }

    let y = this.groundY - 45 - Math.random() * 110;
    let width = 30;
    let height = 30;

    if (type === 'springboard') {
      width = 44;
      height = 22;
      y = this.groundY - height;
    }

    this.collectibles.push({
      id: this.nextEntityId++,
      type,
      x: this.width + 30,
      y,
      width,
      height,
      collected: false,
      pulseTimer: 0,
    });
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.type === 'debris') {
        p.vy += 800 * dt; // gravity
      }
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const t = this.floatingTexts[i];
      t.life -= dt;
      t.y -= 35 * dt;
      if (t.life <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }
  }

  // --- Rendering Pipeline ---
  private render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    ctx.save();

    // Camera shake
    if (this.cameraShake > 0) {
      const shakeAmt = this.cameraShake * this.cameraShake * 16;
      const offsetX = (Math.random() - 0.5) * shakeAmt;
      const offsetY = (Math.random() - 0.5) * shakeAmt;
      ctx.translate(offsetX, offsetY);
    }

    // 1. Draw notebook paper background
    this.drawBackground(ctx);

    // 2. Draw Speedlines if high speed
    if (this.speedlineAlpha > 0.05) {
      this.drawSpeedlines(ctx);
    }

    // 3. Draw Collectibles
    this.drawCollectibles(ctx);

    // 4. Draw Obstacles
    this.drawObstacles(ctx);

    // 5. Draw Ground baseline
    this.drawGround(ctx);

    // 6. Draw Player Character
    this.drawPlayer(ctx);

    // 7. Draw Particles and Comic letters
    this.drawParticles(ctx);

    // 8. Draw Floating Damage/Combo Texts
    this.drawFloatingTexts(ctx);

    ctx.restore();
  }

  private drawBackground(ctx: CanvasRenderingContext2D) {
    // Warm doodle paper background
    ctx.fillStyle = '#faf8f5';
    ctx.fillRect(0, 0, this.width, this.height);

    // Notebook ruled blue lines
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    const lineSpacing = 32;
    for (let y = lineSpacing; y < this.height; y += lineSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
      ctx.stroke();
    }

    // Left red margin line
    ctx.strokeStyle = '#fca5a5';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(70, 0);
    ctx.lineTo(70, this.height);
    ctx.stroke();

    // Parallax background doodles (distant city & clouds)
    const distantOffset = (this.distance * 0.15) % 800;
    ctx.save();
    ctx.translate(-distantOffset, 0);

    // Draw repeating doodle skyline
    for (let rep = -1; rep <= Math.ceil(this.width / 800) + 1; rep++) {
      const bx = rep * 800;

      // Smiling Sun
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(bx + 140, 90, 24, 0, Math.PI * 2);
      ctx.stroke();
      // Sun sunglasses
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(bx + 128, 84, 11, 8);
      ctx.fillRect(bx + 142, 84, 11, 8);

      // Distant doodle buildings
      ctx.beginPath();
      ctx.strokeRect(bx + 260, 220, 70, 160);
      ctx.strokeRect(bx + 350, 180, 85, 200);
      ctx.strokeRect(bx + 460, 240, 60, 140);
      ctx.strokeRect(bx + 540, 200, 90, 180);

      // Sketchy windows
      for (let w = 0; w < 3; w++) {
        ctx.strokeRect(bx + 365, 200 + w * 30, 16, 16);
        ctx.strokeRect(bx + 400, 200 + w * 30, 16, 16);
      }

      // Doodle cloud
      this.drawDoodleCloud(ctx, bx + 650, 110);
    }
    ctx.restore();
  }

  private drawDoodleCloud(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.arc(cx + 20, cy - 8, 22, 0, Math.PI * 2);
    ctx.arc(cx + 44, cy, 18, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawGround(ctx: CanvasRenderingContext2D) {
    const gy = this.groundY;

    // Bold ink floor line
    ctx.strokeStyle = '#18181b';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(this.width, gy);
    ctx.stroke();

    // Floor scribble fill
    ctx.fillStyle = '#f4f4f5';
    ctx.fillRect(0, gy, this.width, this.height - gy);

    // Running tick marks moving with speed
    ctx.strokeStyle = '#71717a';
    ctx.lineWidth = 2;
    const tickSpacing = 40;
    const tickOffset = (this.distance * 10) % tickSpacing;
    for (let x = -tickSpacing; x < this.width + tickSpacing; x += tickSpacing) {
      ctx.beginPath();
      ctx.moveTo(x - tickOffset, gy + 8);
      ctx.lineTo(x - tickOffset - 12, gy + 22);
      ctx.stroke();
    }
  }

  private drawSpeedlines(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.strokeStyle = this.isTurbo ? 'rgba(234, 179, 8, 0.45)' : 'rgba(113, 113, 122, 0.25)';
    ctx.lineWidth = this.isTurbo ? 3 : 2;

    const lineCount = this.isTurbo ? 22 : 12;
    for (let i = 0; i < lineCount; i++) {
      const y = (i * 37 + (this.distance * 14) % 130) % this.height;
      const xStart = this.width - (Math.random() * 250 + 100);
      ctx.beginPath();
      ctx.moveTo(xStart, y);
      ctx.lineTo(this.width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Faithfully draws the screaming stickman from the user-provided image!
   * Big round/oval head, expressive slit eyes, giant open screaming D-mouth,
   * animated stick arms in thumbs-up / pump pose, dynamic running legs.
   */
  private drawPlayer(ctx: CanvasRenderingContext2D) {
    ctx.save();

    // Invulnerability blink
    if (this.invulnerableTimer > 0 && Math.floor(this.invulnerableTimer * 14) % 2 === 0) {
      ctx.restore();
      return;
    }

    const px = this.playerX;
    const py = this.playerY;

    // Turbo Aura & Afterimages
    if (this.isTurbo) {
      // Golden screaming aura
      ctx.save();
      ctx.strokeStyle = this.skin.auraColor;
      ctx.lineWidth = 5;
      ctx.shadowColor = this.skin.auraColor;
      ctx.shadowBlur = 15;

      const auraPulse = Math.sin(this.runAnimTime * 8) * 6;
      ctx.beginPath();
      ctx.arc(px + 27, py + 24, 38 + auraPulse, 0, Math.PI * 2);
      ctx.stroke();

      // Electric spark arcs
      for (let s = 0; s < 4; s++) {
        const sa = (s * Math.PI) / 2 + this.runAnimTime * 4;
        ctx.beginPath();
        ctx.moveTo(px + 27 + Math.cos(sa) * 35, py + 24 + Math.sin(sa) * 35);
        ctx.lineTo(px + 27 + Math.cos(sa) * 50, py + 24 + Math.sin(sa) * 50);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Ink Shield Bubble
    if (this.hasShield) {
      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3.5;
      ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
      ctx.beginPath();
      ctx.arc(px + 27, py + 38, 48, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // --- DRAWING THE HERO ---
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (this.action === 'sliding') {
      // SLIDING POSE: Flattened, sliding on back/knees, hands forward, head back
      ctx.translate(px, py);

      // Skidding sneakers & dust
      ctx.strokeStyle = this.skin.outlineColor;
      ctx.lineWidth = 5;

      // Stick Torso (horizontal)
      ctx.beginPath();
      ctx.moveTo(10, 24);
      ctx.lineTo(55, 24);
      ctx.stroke();

      // Head (tilted back)
      ctx.fillStyle = this.skin.fillColor;
      ctx.beginPath();
      ctx.ellipse(60, 18, 16, 20, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Screaming open mouth
      ctx.fillStyle = this.skin.mouthColor;
      ctx.beginPath();
      ctx.arc(63, 20, 8, 0, Math.PI);
      ctx.fill();

      // Slit eyes
      ctx.strokeStyle = this.skin.outlineColor;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(56, 12);
      ctx.lineTo(60, 15);
      ctx.moveTo(64, 13);
      ctx.lineTo(66, 16);
      ctx.stroke();

      // Arms pointing forward
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(25, 24);
      ctx.lineTo(50, 32);
      ctx.stroke();
    } else {
      // STANDING / RUNNING / JUMPING POSE
      const bob = this.isGrounded ? Math.sin(this.runAnimTime * 2) * 3 : 0;
      const tilt = this.isGrounded ? 0.12 : (this.playerVy < 0 ? -0.1 : 0.18);

      ctx.translate(px + 27, py + 26 + bob);
      ctx.rotate(tilt);

      // --- 1. HEAD (Matches the exact uploaded illustration) ---
      // Big oval head
      ctx.fillStyle = this.skin.fillColor;
      ctx.strokeStyle = this.skin.outlineColor;
      ctx.lineWidth = 5;

      ctx.beginPath();
      // Ellipse head with characteristic doodle wobble
      ctx.ellipse(0, 0, 24, 21, -0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Slit Eyes: tilted cartoon expression
      ctx.fillStyle = this.skin.outlineColor;
      ctx.strokeStyle = this.skin.outlineColor;
      ctx.lineWidth = 4;
      ctx.beginPath();
      // Left eye (\)
      ctx.moveTo(-10, -11);
      ctx.lineTo(-7, 1);
      // Right eye (|)
      ctx.moveTo(9, -10);
      ctx.lineTo(12, 1);
      ctx.stroke();

      // GIANT OPEN SCREAMING MOUTH ("D" shaped shouting mouth)
      ctx.fillStyle = this.skin.mouthColor;
      ctx.beginPath();
      ctx.moveTo(-9, -2);
      ctx.quadraticCurveTo(8, -5, 10, -2);
      ctx.quadraticCurveTo(14, 14, 0, 16);
      ctx.quadraticCurveTo(-11, 14, -9, -2);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.stroke();

      // Tongue inside mouth
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.arc(0, 12, 5, 0, Math.PI * 2);
      ctx.fill();

      // Mouth outline accent (lower lip curve)
      ctx.strokeStyle = this.skin.outlineColor;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(-3, 14, 7, 0.2, Math.PI - 0.2);
      ctx.stroke();

      // Ninja Headband if ninja skin
      if (this.skin.id === 'ninja') {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-22, -8);
        ctx.lineTo(22, -8);
        ctx.stroke();
        // Headband tails flying back
        ctx.beginPath();
        ctx.moveTo(-22, -8);
        ctx.lineTo(-38, -12);
        ctx.moveTo(-22, -8);
        ctx.lineTo(-36, -3);
        ctx.stroke();
      }

      // --- 2. TORSO & ARMS ---
      // Stick Torso
      ctx.strokeStyle = this.skin.outlineColor;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, 21);
      ctx.lineTo(-3, 44);
      ctx.stroke();

      // Stick Arms in enthusiastic pumping thumbs-up pose (as in uploaded image!)
      const armCycle = this.isGrounded ? Math.sin(this.runAnimTime) : 0;
      ctx.lineWidth = 4.5;

      // Back arm
      ctx.beginPath();
      ctx.moveTo(-1, 26);
      ctx.lineTo(-18 - armCycle * 10, 32);
      ctx.lineTo(-24 - armCycle * 8, 22);
      ctx.stroke();

      // Front arm (giving thumbs up / pointing forward)
      ctx.beginPath();
      ctx.moveTo(-1, 26);
      ctx.lineTo(16 + armCycle * 10, 34);
      ctx.lineTo(26 + armCycle * 12, 22);
      ctx.stroke();

      // Thumbs up hand doodle
      ctx.fillStyle = this.skin.outlineColor;
      ctx.beginPath();
      ctx.arc(28 + armCycle * 12, 20, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // --- 3. LEGS ---
      if (this.isGrounded) {
        // Cycling run legs
        const legAngle1 = Math.sin(this.runAnimTime);
        const legAngle2 = Math.sin(this.runAnimTime + Math.PI);

        // Leg 1
        ctx.beginPath();
        ctx.moveTo(-3, 44);
        ctx.lineTo(-3 + legAngle1 * 18, 56);
        ctx.lineTo(-3 + legAngle1 * 22, 68);
        ctx.stroke();

        // Leg 2
        ctx.beginPath();
        ctx.moveTo(-3, 44);
        ctx.lineTo(-3 + legAngle2 * 18, 56);
        ctx.lineTo(-3 + legAngle2 * 22, 68);
        ctx.stroke();
      } else {
        // Jumping legs (tucked or kicked)
        ctx.beginPath();
        ctx.moveTo(-3, 44);
        ctx.lineTo(-16, 54);
        ctx.lineTo(-10, 64);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-3, 44);
        ctx.lineTo(12, 52);
        ctx.lineTo(8, 62);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  private drawObstacles(ctx: CanvasRenderingContext2D) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    this.obstacles.forEach((obs) => {
      if (obs.destroyed) return;

      ctx.save();
      ctx.translate(obs.x, obs.y);

      if (obs.type === 'spike') {
        // Sharp pencil spike
        ctx.fillStyle = '#fca5a5';
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(0, obs.height);
        ctx.lineTo(obs.width / 2, 0);
        ctx.lineTo(obs.width, obs.height);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Lead pencil tip
        ctx.fillStyle = '#18181b';
        ctx.beginPath();
        ctx.moveTo(obs.width / 2 - 4, 12);
        ctx.lineTo(obs.width / 2, 0);
        ctx.lineTo(obs.width / 2 + 4, 12);
        ctx.closePath();
        ctx.fill();
      } else if (obs.type === 'double_spike') {
        // Double spike hazard
        ctx.fillStyle = '#fca5a5';
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 3.5;

        // Spike 1
        ctx.beginPath();
        ctx.moveTo(0, obs.height);
        ctx.lineTo(obs.width / 4, 0);
        ctx.lineTo(obs.width / 2, obs.height);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Spike 2
        ctx.beginPath();
        ctx.moveTo(obs.width / 2, obs.height);
        ctx.lineTo((obs.width * 3) / 4, 0);
        ctx.lineTo(obs.width, obs.height);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (obs.type === 'airplane') {
        // Folded Paper Airplane
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 3;

        ctx.beginPath();
        ctx.moveTo(0, obs.height / 2);
        ctx.lineTo(obs.width, 0);
        ctx.lineTo(obs.width - 15, obs.height);
        ctx.lineTo(obs.width / 2, obs.height / 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Center fold
        ctx.beginPath();
        ctx.moveTo(obs.width, 0);
        ctx.lineTo(obs.width / 2, obs.height / 2);
        ctx.stroke();
      } else if (obs.type === 'low_cloud') {
        // Angry Storm Cloud
        ctx.fillStyle = '#e2e8f0';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(20, 20, 16, 0, Math.PI * 2);
        ctx.arc(36, 12, 18, 0, Math.PI * 2);
        ctx.arc(52, 20, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Lightning bolt dangling down
        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(34, 30);
        ctx.lineTo(28, 42);
        ctx.lineTo(36, 42);
        ctx.lineTo(30, 52);
        ctx.stroke();
      } else if (obs.type === 'bouncing_blob') {
        // Ink Blob Monster
        ctx.fillStyle = '#7c3aed';
        ctx.strokeStyle = '#4c1d95';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(obs.width / 2, obs.height / 2, obs.width / 2 - 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Angry eyes
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(obs.width / 2 - 6, obs.height / 2 - 3, 4, 0, Math.PI * 2);
        ctx.arc(obs.width / 2 + 6, obs.height / 2 - 3, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(obs.width / 2 - 5, obs.height / 2 - 3, 2, 0, Math.PI * 2);
        ctx.arc(obs.width / 2 + 7, obs.height / 2 - 3, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    });
  }

  private drawCollectibles(ctx: CanvasRenderingContext2D) {
    this.collectibles.forEach((item) => {
      if (item.collected) return;

      ctx.save();
      const cx = item.x + item.width / 2;
      const cy = item.y + item.height / 2;
      ctx.translate(cx, cy);

      if (item.type === 'star') {
        // Golden Star
        const scale = 1 + Math.sin(item.pulseTimer) * 0.12;
        ctx.scale(scale, scale);
        ctx.fillStyle = '#facc15';
        ctx.strokeStyle = '#ca8a04';
        ctx.lineWidth = 2.5;

        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const rOuter = 15;
          const rInner = 7;
          const aOuter = (i * Math.PI * 2) / 5 - Math.PI / 2;
          const aInner = aOuter + Math.PI / 5;
          ctx.lineTo(Math.cos(aOuter) * rOuter, Math.sin(aOuter) * rOuter);
          ctx.lineTo(Math.cos(aInner) * rInner, Math.sin(aInner) * rInner);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (item.type === 'coffee') {
        // Hot Coffee Mug (Turbo!)
        ctx.fillStyle = '#b45309';
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 2.5;
        ctx.fillRect(-10, -8, 20, 18);
        ctx.strokeRect(-10, -8, 20, 18);

        // Mug handle
        ctx.beginPath();
        ctx.arc(10, 0, 5, -Math.PI / 2, Math.PI / 2);
        ctx.stroke();

        // Steam swirl
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-4, -10);
        ctx.quadraticCurveTo(-1, -15, -4, -19);
        ctx.moveTo(3, -10);
        ctx.quadraticCurveTo(6, -15, 3, -19);
        ctx.stroke();
      } else if (item.type === 'shield') {
        // Ink Shield Pickup
        ctx.fillStyle = '#38bdf8';
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-11, -12);
        ctx.lineTo(11, -12);
        ctx.lineTo(11, 2);
        ctx.quadraticCurveTo(0, 14, 0, 15);
        ctx.quadraticCurveTo(0, 14, -11, 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (item.type === 'megaphone') {
        // Golden Megaphone
        ctx.fillStyle = '#f97316';
        ctx.strokeStyle = '#c2410c';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-12, -4);
        ctx.lineTo(8, -12);
        ctx.lineTo(8, 12);
        ctx.lineTo(-12, 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (item.type === 'springboard') {
        // Springboard launcher pad
        ctx.fillStyle = '#10b981';
        ctx.strokeStyle = '#047857';
        ctx.lineWidth = 3;
        // Bouncy top plate
        ctx.fillRect(-18, -10, 36, 8);
        ctx.strokeRect(-18, -10, 36, 8);
        // Coil spring
        ctx.beginPath();
        ctx.moveTo(-8, -2);
        ctx.lineTo(8, 2);
        ctx.lineTo(-8, 6);
        ctx.lineTo(8, 10);
        ctx.stroke();
      }

      ctx.restore();
    });
  }

  private drawParticles(ctx: CanvasRenderingContext2D) {
    this.particles.forEach((p) => {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;

      if (p.type === 'letter' && p.text) {
        ctx.font = `bold ${p.size}px "Comic Sans MS", "Chalkboard SE", sans-serif`;
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, p.y);
      } else if (p.type === 'spark') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'dust') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'debris') {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }

      ctx.restore();
    });
  }

  private drawFloatingTexts(ctx: CanvasRenderingContext2D) {
    this.floatingTexts.forEach((t) => {
      const alpha = Math.max(0, t.life / t.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = '900 18px "Impact", "Arial Black", sans-serif';
      ctx.fillStyle = t.color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    });
  }
}
