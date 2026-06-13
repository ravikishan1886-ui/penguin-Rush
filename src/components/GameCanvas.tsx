/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, ArrowUp, ArrowDown } from 'lucide-react';
import { GameState, Difficulty, Skin, Skateboard, Obstacle, Coin, Particle, ActivePowerUp, PowerUpType, ObstacleType } from '../types';
import { gameAudio } from './AudioSystem';

interface GameCanvasProps {
  gameState: GameState;
  difficulty: Difficulty;
  selectedSkin: Skin;
  selectedSkateboard: Skateboard;
  onGameOver: (finalScore: number, finalDistance: number, collectedCoins: number) => void;
  onVictory: (finalScore: number, finalDistance: number, collectedCoins: number) => void;
  onCoinCollected: (isDiamond: boolean) => void;
  onPowerUpActive: (type: PowerUpType) => void;
  onAchievementProgress: (id: string, progress: number) => void;
  onStatsUpdate: (distance: number, coins: number, score: number) => void;
  isPaused: boolean;
  bossHealth: number;
  setBossHealth: React.Dispatch<React.SetStateAction<number>>;
  perspectiveFactor?: number;
  targetDistance: number;
  manualDistanceOverride?: number | null;
}

export default function GameCanvas({
  gameState,
  difficulty,
  selectedSkin,
  selectedSkateboard,
  onGameOver,
  onVictory,
  onCoinCollected,
  onPowerUpActive,
  onAchievementProgress,
  onStatsUpdate,
  isPaused,
  bossHealth,
  setBossHealth,
  perspectiveFactor = 50,
  targetDistance,
  manualDistanceOverride = null,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Core gameplay states
  const [activePowerUps, setActivePowerUps] = useState<ActivePowerUp[]>([]);
  const powerUpsRef = useRef<ActivePowerUp[]>([]);
  const [showTouchControls, setShowTouchControls] = useState(true);

  // Double-trigger prevention mechanism for virtual touch gamepad controls
  const lastButtonInputTimeRef = useRef<number>(0);
  const throttleButtonInput = (callback: () => void) => {
    const now = Date.now();
    if (now - lastButtonInputTimeRef.current < 140) {
      return;
    }
    lastButtonInputTimeRef.current = now;
    callback();
  };

  // Use refs in the animation loop to achieve high-performance 60fps and bypass React re-render lag
  const stateRef = useRef({
    gameState,
    difficulty,
    isPaused,
    distanceTravelled: 0,
    score: 0,
    coinsCollected: 0,
    speed: 6.0, // base speed
    maxSpeed: 14.0,
    playerLane: 1, // 0 = Left, 1 = Center, 2 = Right
    playerVisualLane: 1.0, // for smooth lane change transition
    playerY: 0, // height
    playerJumpV: 0, // jump velocity
    playerSlideTime: 0, // sliding crouch ticks left
    playerHitCooldown: 0, // invincible frames after hit
    playerFrontViewTimer: 0, // frame ticks to show front view of penguin when jumping or landing
    trackLength: 3000, // meters to finish line
    bossSpawnDistance: 1200, // distance where boss battle triggers
    fireCooldown: 0, // weapon projectile cooldown
    missiles: 0, // weapon ammo count
    distanceSinceLastSpawn: 0,
    distanceSinceLastCoin: 0,
    frameCount: 0,
    gameTime: 0,
    curveFactor: 0, // controls horizon curve wobble
    cameraShake: 0, // screenshake duration/intensity
    perspectiveFactor: 50, // default 50%
    targetDistanceOverride: null as number | null,
  });

  // Sync perspectiveFactor prop with stateRef
  useEffect(() => {
    stateRef.current.perspectiveFactor = perspectiveFactor;
  }, [perspectiveFactor]);

  // Sync manual distance override prop with stateRef
  useEffect(() => {
    stateRef.current.targetDistanceOverride = manualDistanceOverride;
  }, [manualDistanceOverride]);

  // Sync state variables from props to ref
  useEffect(() => {
    stateRef.current.gameState = gameState;
    stateRef.current.difficulty = difficulty;
    stateRef.current.isPaused = isPaused;

    // Adjust difficulty variables
    if (gameState === 'playing' && stateRef.current.distanceTravelled === 0) {
      let baseSpeed = 6.0;
      let maxSpeed = 12.0;

      switch (difficulty) {
        case 'easy':
          baseSpeed = 5.0; maxSpeed = 9.0; break;
        case 'medium':
          baseSpeed = 6.5; maxSpeed = 12.0; break;
        case 'hard':
          baseSpeed = 8.0; maxSpeed = 15.0; break;
        case 'extreme':
          baseSpeed = 10.0; maxSpeed = 20.0; break;
      }

      let len = targetDistance === -1 ? 9999999 : targetDistance;
      let bSpawn = targetDistance === -1 ? 1200 : Math.floor(targetDistance * 0.7);

      stateRef.current.speed = baseSpeed;
      stateRef.current.maxSpeed = maxSpeed;
      stateRef.current.trackLength = len;
      stateRef.current.bossSpawnDistance = bSpawn;
      stateRef.current.score = 0;
      stateRef.current.coinsCollected = 0;
      stateRef.current.distanceTravelled = 0;
      stateRef.current.missiles = 0;
      stateRef.current.playerLane = 1;
      stateRef.current.playerVisualLane = 1.0;
      stateRef.current.playerY = 0;
      stateRef.current.playerJumpV = 0;
      stateRef.current.playerSlideTime = 0;
      stateRef.current.playerHitCooldown = 0;
      setBossHealth(100);

      obstaclesRef.current = [];
      coinsRef.current = [];
      particlesRef.current = [];
      projectilesRef.current = [];
      powerUpsRef.current = [];
      setActivePowerUps([]);

      // Start music and skating sound
      gameAudio.stopBossMusic();
      gameAudio.setSpeedFactor(1.0);
      gameAudio.startMusic();
      gameAudio.startSkateSound();
    }

    if (isPaused) {
      gameAudio.stopSkateSound();
    } else {
      if (gameState === 'playing' || gameState === 'boss_battle') {
        gameAudio.startSkateSound();
      }
    }
  }, [gameState, difficulty, isPaused]);

  // Game assets / arrays stored as refs
  const obstaclesRef = useRef<Obstacle[]>([]);
  const coinsRef = useRef<Coin[]>([]);
  const projectilesRef = useRef<{ id: string; x: number; y: number; lane: number; faction: 'player' | 'boss'; speed: number }[]>([]);
  const particlesRef = useRef<Particle[]>([]);

  // Key configurations for Lane geometry in perspective
  const LANES_COUNT = 3;
  const VISUAL_DEP_MAX = 220; // Draw distance of obstacles/scenery

  // Snow Particle Generator
  const createSnowFlakes = (canvasWidth: number, canvasHeight: number, count = 100) => {
    const arr: { x: number; y: number; z: number; size: number; speed: number }[] = [];
    for (let i = 0; i < count; i++) {
      arr.push({
        x: Math.random() * canvasWidth,
        y: Math.random() * canvasHeight,
        z: Math.random() * VISUAL_DEP_MAX,
        size: Math.random() * 2 + 1,
        speed: Math.random() * 1.5 + 0.5,
      });
    }
    return arr;
  };

  const snowflakes = useMemo(() => createSnowFlakes(800, 600, 150), []);

  // Event handlers for action gestures
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return; // Prevent double trigger on keyboard down-repeat
      const s = stateRef.current;
      if (s.isPaused || (s.gameState !== 'playing' && s.gameState !== 'boss_battle')) return;

      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        if (s.playerLane > 0) {
          s.playerLane -= 1;
          gameAudio.playSlide();
        }
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        if (s.playerLane < LANES_COUNT - 1) {
          s.playerLane += 1;
          gameAudio.playSlide();
        }
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') {
        // Jump if on ground
        if (s.playerY === 0 && s.playerSlideTime === 0) {
          const skateBonus = selectedSkateboard.jumpMultiplier;
          const superjumpActive = powerUpsRef.current.some(p => p.type === 'superjump');
          const jumpPower = 9.5 * (superjumpActive ? 1.6 : 1.0) * skateBonus;
          s.playerJumpV = jumpPower;
          s.playerY = 1; // start jump
          gameAudio.playJump();
          // achievement progress
          onAchievementProgress('daily_jumps', 1);
        }
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        // Slide / Crouch
        if (s.playerY === 0) {
          s.playerSlideTime = 25; // 25 frames of crouch slide
          gameAudio.playSlide();
          onAchievementProgress('slide_pipes', 1);
        } else {
          // Fast fall gravity plunge
          s.playerJumpV = -10;
        }
      } else if (e.key === 'f' || e.key === 'F' || e.key === 'Enter') {
        // Shoot frozen fish missile if in boss stage and ammo > 0
        if (s.gameState === 'boss_battle' && s.missiles > 0 && s.fireCooldown === 0) {
          s.missiles -= 1;
          s.fireCooldown = 20; // frames
          projectilesRef.current.push({
            id: Math.random().toString(),
            x: 10, // relative to player
            y: s.playerY + 8,
            lane: s.playerLane,
            faction: 'player',
            speed: 5.5,
          });
          gameAudio.playShieldShatter();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSkateboard, onAchievementProgress, onGameOver]);

  // Mobile Swipe and Tap controller with immediate response in touchMove
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  
  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    const thresh = 30; // Highly responsive threshold for immediate swipe action

    const s = stateRef.current;
    if (s.isPaused || (s.gameState !== 'playing' && s.gameState !== 'boss_battle')) return;

    if (Math.abs(dx) > thresh || Math.abs(dy) > thresh) {
      if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal swipe move
        if (dx > thresh) {
          if (s.playerLane < LANES_COUNT - 1) {
            s.playerLane += 1;
            gameAudio.playSlide();
          }
        } else if (dx < -thresh) {
          if (s.playerLane > 0) {
            s.playerLane -= 1;
            gameAudio.playSlide();
          }
        }
      } else {
        // Vertical swipe move
        if (dy < -thresh) {
          // Swipe Up -> Jump
          if (s.playerY === 0 && s.playerSlideTime === 0) {
            const skateBonus = selectedSkateboard.jumpMultiplier;
            const superjumpActive = powerUpsRef.current.some(p => p.type === 'superjump');
            const jumpPower = 9.5 * (superjumpActive ? 1.6 : 1.0) * skateBonus;
            s.playerJumpV = jumpPower;
            s.playerY = 1;
            gameAudio.playJump();
            onAchievementProgress('daily_jumps', 1);
          }
        } else if (dy > thresh) {
          // Swipe Down -> Slide
          if (s.playerY === 0) {
            s.playerSlideTime = 25;
            gameAudio.playSlide();
            onAchievementProgress('slide_pipes', 1);
          } else {
            s.playerJumpV = -10;
          }
        }
      }
      touchStartRef.current = null; // consume touch gesture so it triggers exactly once
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    // Fallback if swipe did not exceed the threshold during touchMove
    if (!touchStartRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    const thresh = 40;

    const s = stateRef.current;
    if (s.isPaused || (s.gameState !== 'playing' && s.gameState !== 'boss_battle')) return;

    // Detect tap to fire missile
    if (Math.abs(dx) < 15 && Math.abs(dy) < 15) {
      handleMobileFire();
      touchStartRef.current = null;
      return;
    }

    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > thresh && s.playerLane < LANES_COUNT - 1) {
        s.playerLane += 1;
        gameAudio.playSlide();
      } else if (dx < -thresh && s.playerLane > 0) {
        s.playerLane -= 1;
        gameAudio.playSlide();
      }
    } else {
      if (dy < -thresh && s.playerY === 0 && s.playerSlideTime === 0) {
        const skateBonus = selectedSkateboard.jumpMultiplier;
        const superjumpActive = powerUpsRef.current.some(p => p.type === 'superjump');
        const jumpPower = 9.5 * (superjumpActive ? 1.6 : 1.0) * skateBonus;
        s.playerJumpV = jumpPower;
        s.playerY = 1;
        gameAudio.playJump();
        onAchievementProgress('daily_jumps', 1);
      } else if (dy > thresh) {
        if (s.playerY === 0) {
          s.playerSlideTime = 25;
          gameAudio.playSlide();
          onAchievementProgress('slide_pipes', 1);
        } else {
          s.playerJumpV = -10;
        }
      }
    }
    touchStartRef.current = null;
  };

  // Weapon projectile button trigger for mobile tap
  const handleMobileFire = () => {
    const s = stateRef.current;
    if (s.gameState === 'boss_battle' && s.missiles > 0 && s.fireCooldown === 0) {
      s.missiles -= 1;
      s.fireCooldown = 20;
      projectilesRef.current.push({
        id: Math.random().toString(),
        x: 10,
        y: s.playerY + 8,
        lane: s.playerLane,
        faction: 'player',
        speed: 5.5,
      });
      gameAudio.playShieldShatter();
    }
  };

  // Simulation, Draw & Canvas resize loops
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const updateDimensions = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);

    // Obstacle Spawning engine
    // Spawns obstacles ahead based on distance and speed
    const processObstacleSpawning = (s: typeof stateRef.current) => {
      s.distanceSinceLastSpawn += s.speed * 0.15; // metric progress
      s.distanceSinceLastCoin += s.speed * 0.15;

      const minSpawnWait = Math.max(35, 75 - s.speed * 2); // gets faster
      if (s.distanceSinceLastSpawn > minSpawnWait && s.gameState === 'playing') {
        s.distanceSinceLastSpawn = 0;

        // Choose a random lane and double or single obstacles
        const numObstacles = Math.random() > 0.6 ? 2 : 1;
        const availableLanes = [0, 1, 2];

        for (let oIdx = 0; oIdx < numObstacles; oIdx++) {
          if (availableLanes.length === 0) break;
          const laneIdx = Math.floor(Math.random() * availableLanes.length);
          const lane = availableLanes.splice(laneIdx, 1)[0];

          // Determine obstacle type
          const types: ObstacleType[] = [
            'ice_barrier',
            'frozen_pipe',
            'falling_icicle',
            'cracked_ice',
            'security_drone',
            'polar_bear',
            'giant_snowball',
          ];

          if (s.speed > 8) {
            types.push('snow_truck');
            types.push('abandoned_vehicle');
          }

          const chosenType = types[Math.floor(Math.random() * types.length)];
          let width = 25;
          let height = 30;
          let yOffset = 0;

          // Align visual bounding box
          switch (chosenType) {
            case 'frozen_pipe':
              height = 20;
              yOffset = 30; // MUST slide under
              break;
            case 'falling_icicle':
              height = 32;
              yOffset = 45; // hanging, triggers falling logic
              break;
            case 'security_drone':
              height = 15;
              width = 20;
              yOffset = 22; // middle level drone
              break;
            case 'snow_truck':
              width = 38;
              height = 55;
              break;
            case 'polar_bear':
              width = 30;
              height = 38;
              break;
            case 'giant_snowball':
              width = 28;
              height = 28;
              break;
            case 'cracked_ice':
              height = 5;
              width = 32;
              break;
          }

          obstaclesRef.current.push({
            id: Math.random().toString(),
            x: VISUAL_DEP_MAX, // Spawn far at the horizon
            lane,
            type: chosenType,
            width,
            height,
            length: 12,
            yOffset,
            passed: false,
            behaviorState: chosenType === 'falling_icicle'
              ? { isFalling: false, fallSpeed: 0 }
              : chosenType === 'giant_snowball'
              ? { angle: 0 }
              : null,
          });
        }
      }

      // Spawning Coins / Power-ups
      if (s.distanceSinceLastCoin > 12) {
        s.distanceSinceLastCoin = 0;
        const coinLane = Math.floor(Math.random() * LANES_COUNT);

        // Spawn a coin pattern or sometimes a powerup
        const isPowerSpawning = Math.random() > 0.88;

        if (isPowerSpawning) {
          // Spawn one of the five powerups
          const types: PowerUpType[] = ['boost', 'magnet', 'double', 'shield', 'superjump'];
          const powerType = types[Math.floor(Math.random() * types.length)];

          // We represent powerups as uniquely flagged obstacle objects so they travel along the perspective grid!
          obstaclesRef.current.push({
            id: `powerup_${powerType}_${Math.random()}`,
            x: VISUAL_DEP_MAX,
            lane: coinLane,
            type: choosingPowerupObstacleType(powerType), // custom type wrapping
            width: 22,
            height: 22,
            length: 10,
            yOffset: Math.random() > 0.7 && selectedSkateboard.id === 'frost_edge' ? 20 : 5,
            passed: false,
          });
        } else {
          // Spawn cluster of coins
          const isDiamond = Math.random() > 0.94;
          const chainLength = Math.floor(Math.random() * 3) + 2;
          for (let c = 0; c < chainLength; c++) {
            coinsRef.current.push({
              id: Math.random().toString(),
              x: VISUAL_DEP_MAX + c * 15,
              lane: coinLane,
              yOffset: 0,
              collected: false,
              isDiamond,
            });
          }
        }
      }
    };

    const choosingPowerupObstacleType = (p: PowerUpType): ObstacleType => {
      // Abuse types safely by casting or mapping
      return `powerup_${p}` as any;
    };

    // Main physics/animation render logic loop running at 60 FPS
    const mainLoop = () => {
      const s = stateRef.current;
      s.frameCount++;

      if (s.isPaused) {
        animId = requestAnimationFrame(mainLoop);
        return;
      }

      // Game state transitions (Victory / Finish line check)
      if (s.gameState === 'playing' && s.distanceTravelled >= s.bossSpawnDistance) {
        // Transition to boss battle
        s.gameState = 'boss_battle';
        gameAudio.playBossRoar();
        gameAudio.startBossMusic();
      }

      if (s.gameState === 'playing' && s.distanceTravelled >= s.trackLength) {
        s.gameState = 'victory';
        gameAudio.setMute(true); // mute game audio loop
        const finalCoins = s.coinsCollected;
        const totalScore = s.score + finalCoins * 15;
        onVictory(totalScore, Math.floor(s.distanceTravelled), finalCoins);
      }

      // Game engine counters
      s.gameTime += 0.016;
      if (s.fireCooldown > 0) s.fireCooldown--;

      // Modify game progression speeds
      const turboBoosted = powerUpsRef.current.some(pw => pw.type === 'boost');
      const targetSpeed = turboBoosted ? s.maxSpeed * 1.6 : (s.gameState === 'boss_battle' ? s.maxSpeed * 0.8 : s.maxSpeed);
      s.speed += (targetSpeed - s.speed) * 0.015; // smooth speed-up curve
      gameAudio.setSpeedFactor(s.speed / s.maxSpeed);

      if (s.targetDistanceOverride !== null) {
        const diff = s.targetDistanceOverride - s.distanceTravelled;
        s.distanceTravelled += diff * 0.12; // buttery smooth linear interpolation
        if (Math.abs(diff) < 0.2) {
          s.distanceTravelled = s.targetDistanceOverride;
        }
      } else if (s.gameState === 'playing') {
        s.distanceTravelled += s.speed * 0.025; // meters
        s.score += Math.round(s.speed * (powerUpsRef.current.some(p => p.type === 'double') ? 0.35 : 0.18));
      } else if (s.gameState === 'boss_battle') {
        s.score += Math.round(s.speed * 0.15);
      }

      onStatsUpdate(Math.floor(s.distanceTravelled), s.coinsCollected, s.score);

      // Interpolate horizontal position of player smoothly between grid tracks
      s.playerVisualLane += (s.playerLane - s.playerVisualLane) * 0.22;

      // Handle Gravity & Jump Physics
      if (s.playerY > 0) {
        s.playerY += s.playerJumpV;
        s.playerJumpV -= 0.45; // Gravity
        s.playerFrontViewTimer = 120; // 2 seconds of front-view during and right after a jump
        if (s.playerY <= 0) {
          s.playerY = 0;
          s.playerJumpV = 0;
        }
      }

      // Decrement front view timer when on ground
      if (s.playerY === 0 && s.playerFrontViewTimer > 0) {
        s.playerFrontViewTimer--;
      }

      // Handle Slide cooldowns
      if (s.playerSlideTime > 0) {
        s.playerSlideTime--;
      }

      // Handle Hit Vulnerability cooldown frame timer
      if (s.playerHitCooldown > 0) {
        s.playerHitCooldown--;
      }

      // Handle custom camera shake dampeners
      if (s.cameraShake > 0) {
        s.cameraShake -= 0.1;
      }

      // Track highway horizontal curve sway calculations
      s.curveFactor += 0.004 * s.speed;

      // Power Up Duration Countdown tick down
      const updatedPowers = powerUpsRef.current
        .map(p => ({ ...p, timeLeft: p.timeLeft - 16 })) // minus 16 ms
        .filter(p => p.timeLeft > 0);

      // sync ref
      powerUpsRef.current = updatedPowers;
      if (updatedPowers.length !== activePowerUps.length) {
        setActivePowerUps(updatedPowers);
      }

      // Spawn manager routines
      if (s.gameState === 'playing') {
        processObstacleSpawning(s);
      } else if (s.gameState === 'boss_battle') {
        // Boss Battle Spawning Mechanics!
        bossBattleTick(s);
      }

      // Physics/Collision movement for Obstacles traveling closer
      const obstacleMoveSpeed = s.speed * 0.72;
      obstaclesRef.current = obstaclesRef.current.map(obs => {
        let newX = obs.x - obstacleMoveSpeed * 0.15;
        let yOff = obs.yOffset;
        let behavior = obs.behaviorState;

        // Custom behaviors per obstacle
        if (obs.type === 'falling_icicle' && behavior) {
          // Drop icicle if player is nearby
          if (!behavior.isFalling && obs.x < 110) {
            behavior.isFalling = true;
          }
          if (behavior.isFalling) {
            behavior.fallSpeed += 1.8;
            yOff = Math.max(0, obs.yOffset - behavior.fallSpeed);
          }
        } else if (obs.type === 'giant_snowball' && behavior) {
          behavior.angle += 0.15 * s.speed;
        }

        return {
          ...obs,
          x: newX,
          yOffset: yOff,
          behaviorState: behavior,
        };
      });

      // Filter out obstacles that sailed past player perspective
      obstaclesRef.current.forEach(obs => {
        if (obs.x < -15 && !obs.passed) {
          obs.passed = true;
        }
      });
      obstaclesRef.current = obstaclesRef.current.filter(obs => obs.x > -20);

      // Coin tracking
      coinsRef.current = coinsRef.current.map(cn => ({
        ...cn,
        x: cn.x - obstacleMoveSpeed * 0.15,
      }));

      // Magnet power-up attractor pull mechanics!
      const magnetActive = powerUpsRef.current.some(pw => pw.type === 'magnet');
      const magnetRange = 85 * selectedSkateboard.magnetRangeMultiplier;

      if (magnetActive) {
        coinsRef.current = coinsRef.current.map(cn => {
          if (!cn.collected && cn.x < magnetRange && cn.x > -2) {
            // Pull coordinates directly to player grid
            const targetLane = s.playerVisualLane;
            const targetY = s.playerY;

            // Shift lane and height coordinates towards player
            const deltaLane = targetLane - cn.lane;
            const deltaY = targetY - cn.yOffset;

            return {
              ...cn,
              lane: cn.lane + deltaLane * 0.18,
              yOffset: cn.yOffset + deltaY * 0.18,
              x: cn.x + (2.0 - cn.x) * 0.15, // accelerate horizontally back
            };
          }
          return cn;
        });
      }

      // Filter collected and offscreen coins
      coinsRef.current = coinsRef.current.filter(cn => cn.x > -10);

      // Projectiles mechanics (Player missiles & boss red snowballs)
      projectilesRef.current = projectilesRef.current.map(proj => ({
        ...proj,
        x: proj.faction === 'player' ? proj.x + proj.speed : proj.x - proj.speed,
      }));

      // Boss hit-to-projectile checks
      if (s.gameState === 'boss_battle') {
        const playerProjectiles = projectilesRef.current.filter(p => p.faction === 'player');
        playerProjectiles.forEach(proj => {
          // Boss starts visually at x ~ 110 at the horizon, but let's check distance
          if (proj.x > 80) { // reached the boss!
            // Hit boss!
            setBossHealth(prev => {
              const next = Math.max(0, prev - 10);
              s.score += 200; // rewarding hit points
              createExplosion(80, proj.lane, 15, '#e0f2fe');
              gameAudio.playShieldShatter();
              s.cameraShake = 4;

              if (next <= 0) {
                // Victory!
                setTimeout(() => {
                  s.gameState = 'playing'; // Boss defeated, resume to finish line!
                  gameAudio.stopBossMusic();
                  s.distanceTravelled = s.bossSpawnDistance + 200; // allow passing boss
                  if (targetDistance === -1) {
                    s.bossSpawnDistance = s.distanceTravelled + 1200; // next boss triggers after 1200m
                    s.trackLength = 9999999; // stay as endless
                  } else {
                    s.trackLength = s.bossSpawnDistance + 450; // shorten track slightly to end fast
                  }
                  onAchievementProgress('defeat_boss', 1);
                }, 100);
              }
              return next;
            });
            proj.x = 999; // destroy projectile
          }
        });
      }

      // Boss weapon shots hits Player
      const enemyProjectiles = projectilesRef.current.filter(p => p.faction === 'boss');
      enemyProjectiles.forEach(proj => {
        if (proj.x < 12 && proj.x > 0 && Math.round(proj.lane) === s.playerLane) {
          // Within player bounding zone
          if (s.playerY < 20) { // low height
            // Hit!
            triggerPlayerHit(s);
            proj.x = -999;
          }
        }
      });

      projectilesRef.current = projectilesRef.current.filter(p => p.x > -10 && p.x < 140);

      // Particle physics decay tick down
      particlesRef.current = particlesRef.current.map(part => ({
        ...part,
        x: part.x + part.vx,
        y: part.y + part.vy,
        alpha: Math.max(0, part.alpha - 0.025),
        life: part.life + 1,
      })).filter(part => part.life < part.maxLife && part.alpha > 0);

      // Perform Core Collision Detection algorithms
      performCollisions(s);

      // Background Snowstorm atmospheric drift
      snowflakes.forEach(flake => {
        flake.z -= s.speed * 0.45;
        flake.y += flake.speed;
        if (flake.z <= 1) {
          flake.z = VISUAL_DEP_MAX; // respawn at deep horizon
          flake.x = Math.random() * canvas.width;
          flake.y = Math.random() * (canvas.height * 0.4);
        }
      });

      // Clear Screen with beautiful gradients
      drawBackground(ctx, canvas, s);

      // Draw futuristic environment
      drawHighwayScenery(ctx, canvas, s);

      // Draw scrolling track lines
      drawIceRoad(ctx, canvas, s);

      // Draw Coins
      drawCoinsOnGrid(ctx, canvas, s);

      // Draw projectiles
      drawProjectilesOnGrid(ctx, canvas, s);

      // Draw obstacles / powerups
      drawObstaclesOnGrid(ctx, canvas, s);

      // Draw Boss (Cyber Polar Bear) if active
      if (s.gameState === 'boss_battle') {
        drawGiantRoboticPolarBear(ctx, canvas, s);
      }

      // Draw sliding dust / sparks from skateboard
      drawSkatingParticles(ctx, canvas, s);

      // Draw slingshot rope
      drawSlingshot(ctx, canvas, s);

      // Draw our cute protagonist Penguin!
      drawCutePenguin(ctx, canvas, s);

      // Render overlay indicators inside Canvas (e.g. missile warning lasers, item popups)
      drawVFXWarnings(ctx, canvas, s);

      // Animation frame request loop callback
      animId = requestAnimationFrame(mainLoop);
    };

    // Trigger projectile spawners for the boss AI
    const bossBattleTick = (s: typeof stateRef.current) => {
      // Boss skates at distance x ~ 95
      // Shoots, triggers snow storms, charges
      if (s.frameCount % 90 === 0) {
        // Randomly choose attack
        const attackType = Math.random();

        if (attackType < 0.4) {
          // Strike 1: Laser blast or warning shot across a lane!
          const targetLane = Math.floor(Math.random() * LANES_COUNT);
          projectilesRef.current.push({
            id: Math.random().toString(),
            x: 95,
            y: 12,
            lane: targetLane,
            faction: 'boss',
            speed: 3.5,
          });
          gameAudio.playJump();
        } else if (attackType < 0.75) {
          // Strike 2: Throw mega snowball down multiple lanes
          const targetLane = Math.floor(Math.random() * LANES_COUNT);
          obstaclesRef.current.push({
            id: `boss_snowball_${Math.random()}`,
            x: 95,
            lane: targetLane,
            type: 'giant_snowball',
            width: 32,
            height: 32,
            length: 12,
            yOffset: 0,
            passed: false,
            behaviorState: { angle: 0 },
          });
        } else {
          // Strike 3: Security drone escort sweepers!
          const targetLane = Math.floor(Math.random() * LANES_COUNT);
          obstaclesRef.current.push({
            id: `boss_drone_${Math.random()}`,
            x: 95,
            lane: targetLane,
            type: 'security_drone',
            width: 25,
            height: 20,
            length: 10,
            yOffset: 20,
            passed: false,
          });
        }
      }

      // Spawn weapon ammo to fight back!
      if (s.frameCount % 110 === 0) {
        const ammoLane = Math.floor(Math.random() * LANES_COUNT);
        // We use obstacle list representation with dynamic weapon type
        obstaclesRef.current.push({
          id: `ammo_${Math.random()}`,
          x: 95,
          lane: ammoLane,
          type: 'powerup_superjump' as any, // reuse glowing item render
          width: 20,
          height: 20,
          length: 10,
          yOffset: 4,
          passed: false,
          behaviorState: { isAmmo: true }, // trigger custom handler
        });
      }
    };

    // Helper to throw explosive debris particles
    const createExplosion = (x3d: number, laneGrid: number, count: number, color: string) => {
      const parent = canvas;
      if (!parent) return;

      const s = stateRef.current;
      // Convert 3D coordinate placeholder roughly to 2D screen positions for blast
      const { x, y } = project3D(x3d, laneGrid, 5, parent.width, parent.height, s);

      for (let i = 0; i < count; i++) {
        particlesRef.current.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 8,
          vy: (Math.random() - 0.8) * 8,
          size: Math.random() * 4 + 2,
          color,
          alpha: 1.0,
          life: 0,
          maxLife: Math.floor(Math.random() * 30) + 15,
        });
      }
    };

    // Core Collision Detection algorithm
    const performCollisions = (s: typeof stateRef.current) => {
      const shieldActive = powerUpsRef.current.some(p => p.type === 'shield');
      const turboBoosted = powerUpsRef.current.some(p => p.type === 'boost');

      // 1. Coins checks
      coinsRef.current.forEach(cn => {
        if (!cn.collected && cn.x < 11 && cn.x > 0.5) {
          // Coordinate depth is near player!
          // Check horizontal coordinate tolerance
          if (Math.abs(cn.lane - s.playerVisualLane) < 0.42) {
            // Check vertical coordinate tolerance
            if (s.playerY < cn.yOffset + 18 && s.playerY + 28 > cn.yOffset) {
              cn.collected = true;
              s.coinsCollected += cn.isDiamond ? 5 : 1;
              s.score += cn.isDiamond ? 100 : 15;

              if (cn.isDiamond) {
                gameAudio.playDiamond();
                onCoinCollected(true);
                onAchievementProgress('daily_diamonds', 1);
              } else {
                gameAudio.playCoin();
                onCoinCollected(false);
              }
              onAchievementProgress('collect_coins', 1);
              onAchievementProgress('daily_coins', 1);

              // spark ring
              createExplosion(cn.x, cn.lane, 6, cn.isDiamond ? '#22d3ee' : '#fbbf24');
            }
          }
        }
      });

      // 2. Obstacles / Items checks
      obstaclesRef.current.forEach(obs => {
        if (!obs.passed && obs.x < 11 && obs.x > 0.2) {
          if (Math.abs(obs.lane - s.playerVisualLane) < 0.45) {
            // Determine if power-up or hazard
            const typeStr = obs.type as string;
            const isPowerup = typeStr.startsWith('powerup_');

            if (isPowerup) {
              // Parse out powerup identifier
              const powerType = typeStr.replace('powerup_', '') as PowerUpType;
              obs.passed = true;

              if (obs.behaviorState?.isAmmo) {
                // Collect missile
                s.missiles = Math.min(5, s.missiles + 1);
                gameAudio.playDiamond();
              } else {
                // Collect standard powerup
                triggerPowerUpPickup(powerType, s);
              }
              createExplosion(obs.x, obs.lane, 12, '#38bdf8');
            } else {
              // It is a real obstacle!
              // Collision height tolerances
              let collisionDetected = false;

              if (obs.type === 'frozen_pipe') {
                // Frozen high pipe -> must be sliding on ground
                if (s.playerSlideTime === 0) {
                  collisionDetected = true;
                }
              } else if (obs.type === 'security_drone') {
                // Drone hovers mid-air -> hits if jumping, clean pass if sliding/ground
                if (s.playerY > 5) {
                  collisionDetected = true;
                }
              } else if (obs.type === 'cracked_ice') {
                // Must jump over cracked ice -> ground/slide hits, air passes
                if (s.playerY <= 5) {
                  collisionDetected = true;
                }
              } else {
                // Standard block / bear / truck -> hits unless player jumps above its bounding height
                if (s.playerY < obs.yOffset + obs.height * 0.72) {
                  collisionDetected = true;
                }
              }

              if (collisionDetected) {
                obs.passed = true;

                if (turboBoosted) {
                  // Simply smash the obstacle!
                  gameAudio.playShieldShatter();
                  createExplosion(obs.x, obs.lane, 20, '#bae6fd');
                  s.cameraShake = 5;
                } else if (shieldActive) {
                  // Protect player first
                  // Shatter shield
                  powerUpsRef.current = powerUpsRef.current.filter(p => p.type !== 'shield');
                  setActivePowerUps(prev => prev.filter(p => p.type !== 'shield'));
                  gameAudio.playShieldShatter();
                  s.playerHitCooldown = 40; // invincible frames

                  // Achievement progress
                  onAchievementProgress('shield_breaks', 1);
                  onAchievementProgress('daily_powerups', 1);

                  createExplosion(obs.x, obs.lane, 25, '#7dd3fc');
                  s.cameraShake = 6;
                } else {
                  // Direct Impact Hit
                  triggerPlayerHit(s);
                }
              }
            }
          }
        }
      });
    };

    // Handle hit damage calculations
    const triggerPlayerHit = (s: typeof stateRef.current) => {
      if (s.playerHitCooldown > 0) return; // avoid double hit lag

      s.playerHitCooldown = 50; // frames
      s.cameraShake = 12;
      s.speed = Math.max(3.0, s.speed * 0.5); // halt speed
      gameAudio.playCrash();

      // Explode frost sparks
      createExplosion(6, s.playerLane, 18, '#78716c');

      // Handle fail state
      s.gameState = 'gameover';
      gameAudio.stopSkateSound();
      gameAudio.stopMusic();

      const finalCoins = s.coinsCollected;
      const totalScore = s.score + finalCoins * 15;
      onGameOver(totalScore, Math.floor(s.distanceTravelled), finalCoins);
    };

    // Activate power-up
    const triggerPowerUpPickup = (powerType: PowerUpType, s: typeof stateRef.current) => {
      gameAudio.playPowerUp();
      onPowerUpActive(powerType);

      // Track achievements
      onAchievementProgress('daily_powerups', 1);

      // Add to running active list
      const durationMap: Record<PowerUpType, number> = {
        boost: 6500, // ms
        magnet: 9000,
        double: 9000,
        shield: 10000,
        superjump: 8000,
      };

      const duration = durationMap[powerType];

      // Insert or renew
      const existingIdx = powerUpsRef.current.findIndex(p => p.type === powerType);
      if (existingIdx !== -1) {
        powerUpsRef.current[existingIdx].timeLeft = duration;
      } else {
        powerUpsRef.current.push({
          type: powerType,
          timeLeft: duration,
          duration,
        });
      }
    };

    // Launch Loop
    animId = requestAnimationFrame(mainLoop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', updateDimensions);
    };
  }, [difficulty, selectedSkin, selectedSkateboard, isPaused]);

  // Direct 3D perspective to 2D Canvas mapper function
  const project3D = (
    x3d: number, // horizontal coordinate lane: 0=Left, 1=Center, 2=Right
    laneVisual: number, // supporting floats for smoothing
    y3dOffset: number, // height from road
    width: number,
    height: number,
    s: typeof stateRef.current
  ) => {
    const horizonY = height * 0.38;
    const roadBaseY = height * 0.95;

    // Use standard non-linear scale of depth
    const dPos = Math.max(0.01, x3d / VISUAL_DEP_MAX);
    const scale = Math.pow(1.0 - dPos, 2.5); // curves nicely

    // Introduce curvature offsets of city streets
    const curveDeviation = Math.sin(x3d * 0.012 + s.curveFactor) * s.curveFactor * 0.8;

    // Horizontal stretch controlled by interactive perspective slider
    const pMultiplier = 0.45 + ((s.perspectiveFactor ?? 50) / 100.0) * 1.65;
    const roadWidth = width * 1.5 * pMultiplier;
    const laneWidth = roadWidth * 0.28;

    // Center lane is 1. xLane ranges from -1 (Left) to 1 (Right)
    const xLane = (laneVisual - 1.0) * laneWidth;

    const sx = width * 0.5 + xLane * scale + curveDeviation * scale;
    const sy = horizonY + (roadBaseY - horizonY) * scale - y3dOffset * scale * 3.5;

    return { x: sx, y: sy, scale };
  };

  const getStage = (dist: number) => {
    if (dist < 320) return 1; // City Ice Road
    if (dist < 780) return 2; // Glacier Slide
    if (dist < 1250) return 3; // Snowy Mill Valley
    if (dist < 1720) return 4; // Saguaro Desert Sled
    return 5; // Metropolis Finish
  };

  const drawSlingshot = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, s: typeof stateRef.current) => {
    const ssPos = 16.0 - s.distanceTravelled; // relative depth metric
    if (ssPos > -15 && ssPos < 100) {
      const leftPost = project3D(ssPos, -0.22, 0, canvas.width, canvas.height, s);
      const rightPost = project3D(ssPos, 3.22, 0, canvas.width, canvas.height, s);

      // Draw Left Wood Post
      if (leftPost.scale > 0.04) {
        const pW = 10 * leftPost.scale * 3.5;
        const pH = 52 * leftPost.scale * 3.5;
        ctx.fillStyle = '#854d0e'; // rustic brown wood
        ctx.strokeStyle = '#3b1c0a';
        ctx.lineWidth = 1 * leftPost.scale;
        ctx.beginPath();
        ctx.roundRect(leftPost.x - pW * 0.5, leftPost.y - pH, pW, pH, pW * 0.2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#1e293b'; // strapping
        ctx.fillRect(leftPost.x - pW * 0.5, leftPost.y - pH * 0.65, pW, pH * 0.12);
      }

      // Draw Right Wood Post
      if (rightPost.scale > 0.04) {
        const pW = 10 * rightPost.scale * 3.5;
        const pH = 52 * rightPost.scale * 3.5;
        ctx.fillStyle = '#854d0e'; // rustic brown wood
        ctx.strokeStyle = '#3b1c0a';
        ctx.lineWidth = 1 * rightPost.scale;
        ctx.beginPath();
        ctx.roundRect(rightPost.x - pW * 0.5, rightPost.y - pH, pW, pH, pW * 0.2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#1e293b'; 
        ctx.fillRect(rightPost.x - pW * 0.5, rightPost.y - pH * 0.65, pW, pH * 0.12);
      }

      // Draw Slingshot Elastic Rope
      ctx.save();
      ctx.strokeStyle = '#d97706'; // thick golden hemp fiber thread
      ctx.lineWidth = 5 * Math.max(leftPost.scale, rightPost.scale);
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = 4;

      if (ssPos > 11.2) {
        const playerPos = project3D(11.2, s.playerVisualLane, s.playerY, canvas.width, canvas.height, s);
        ctx.beginPath();
        ctx.moveTo(leftPost.x, leftPost.y - 32 * leftPost.scale);
        ctx.quadraticCurveTo(
          playerPos.x, 
          playerPos.y + 12 * playerPos.scale, 
          rightPost.x, 
          rightPost.y - 32 * rightPost.scale
        );
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(leftPost.x, leftPost.y - 32 * leftPost.scale);
        ctx.lineTo(rightPost.x, rightPost.y - 32 * rightPost.scale);
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  // Drawing routines inside canvas context
  const drawBackground = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, s: typeof stateRef.current) => {
    const stage = getStage(s.distanceTravelled);

    // Sky colors matching each unique stage theme across the screenshots
    const skyGrad = ctx.createLinearGradient(0, 0, 0, canvas.height * 0.42);
    if (stage === 1) { // City Ice Road (Screenshot 1 & 2)
      skyGrad.addColorStop(0, '#53a0f7'); 
      skyGrad.addColorStop(0.5, '#bae6fd');
      skyGrad.addColorStop(1, '#e0f2fe');
    } else if (stage === 2) { // Glacier Slide (Screenshot 3 canyon columns)
      skyGrad.addColorStop(0, '#0284c7');
      skyGrad.addColorStop(0.5, '#7dd3fc');
      skyGrad.addColorStop(1, '#f1f5f9');
    } else if (stage === 3) { // Snowy Mill Valley (Screenshot 4)
      skyGrad.addColorStop(0, '#38bdf8');
      skyGrad.addColorStop(0.6, '#bae6fd');
      skyGrad.addColorStop(1, '#ffffff');
    } else if (stage === 4) { // Saguaro Desert (Screenshot 5)
      skyGrad.addColorStop(0, '#0ea5e9');
      skyGrad.addColorStop(0.5, '#cbd5e1');
      skyGrad.addColorStop(1, '#ffedd5'); // warm sun glow
    } else { // Metropolis Finish
      skyGrad.addColorStop(0, '#38bdf8');
      skyGrad.addColorStop(0.5, '#cbd5e1');
      skyGrad.addColorStop(1, '#ffffff');
    }

    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw the scenic ground below the horizon
    let groundColor = '#f1f5f9'; // fallback snow white
    if (stage === 1) {
      groundColor = '#e0f2fe'; // snow/soft ice blue
    } else if (stage === 2) {
      groundColor = '#0369a1'; // glacier blue/water
    } else if (stage === 3) {
      groundColor = '#ffffff'; // snow white
    } else if (stage === 4) {
      groundColor = '#fed7aa'; // desert orange/sand
    } else {
      groundColor = '#f1f5f9';
    }
    ctx.fillStyle = groundColor;
    ctx.fillRect(0, canvas.height * 0.38, canvas.width, canvas.height * 0.62);

    ctx.save();
    if (s.cameraShake > 0) {
      ctx.translate((Math.random() - 0.5) * s.cameraShake, (Math.random() - 0.5) * s.cameraShake);
    }

    const cityXOffset = (s.distanceTravelled * 0.22) % 320;
    
    if (stage === 1 || stage === 5) {
      // 🏙️ DRAWS HIGH-REALISM MULTI-LAYERED PARALLAX 3D CITY SKYLINE SYSTEM
      const centerX = canvas.width * 0.5;
      const groundY = canvas.height * 0.38;

      // Helper for drawing 3D faceted buildings with varying architectural silhouettes
      const draw3DBuilding = (
        bx: number,
        by: number,
        bw: number,
        bh: number,
        isFar: boolean,
        index: number
      ) => {
        const bCenterX = bx + bw * 0.5;
        const dx = bCenterX - centerX;
        
        // Responsive 3D side perspective factor fanning outward from screen center
        const sideW = Math.max(5, Math.min(bw * 0.22, Math.abs(dx) * 0.08));
        const isLeftSide = dx > 0; // True if building is on right side of view, meaning left side is visible

        let frontColor: string | CanvasGradient;
        let sideColor: string | CanvasGradient;
        let roofColor = '';
        let windowGlow = '';

        if (isFar) {
          // Atmospheric deep-blue silhouettes for depth layer
          const frontGrad = ctx.createLinearGradient(bx, by, bx, groundY);
          frontGrad.addColorStop(0, index % 2 === 0 ? '#1e3a8a' : '#2563eb');
          frontGrad.addColorStop(1, '#0f172a');
          frontColor = frontGrad;

          const sideGrad = ctx.createLinearGradient(bx, by, bx, groundY);
          sideGrad.addColorStop(0, '#172554');
          sideGrad.addColorStop(1, '#020617');
          sideColor = sideGrad;

          roofColor = '#1d4ed8';
          windowGlow = 'rgba(147, 197, 253, 0.22)';
        } else {
          // Bright, crisp near towers with interactive lighting
          const frontGrad = ctx.createLinearGradient(bx, by, bx, groundY);
          frontGrad.addColorStop(0, index % 2 === 0 ? '#38bdf8' : '#0ea5e9'); // light teal/sky cyan
          frontGrad.addColorStop(0.7, index % 2 === 0 ? '#1e40af' : '#1d4ed8');
          frontGrad.addColorStop(1, '#0f172a');
          frontColor = frontGrad;

          const sideGrad = ctx.createLinearGradient(bx, by, bx, groundY);
          sideGrad.addColorStop(0, index % 2 === 0 ? '#0284c7' : '#0369a1'); // darker side shading
          sideGrad.addColorStop(1, '#020617');
          sideColor = sideGrad;

          roofColor = index % 2 === 0 ? '#bae6fd' : '#93c5fd';
          windowGlow = index % 2 === 0 ? 'rgba(253, 224, 71, 0.85)' : 'rgba(34, 211, 238, 0.9)'; // yellow & neon cyber windows
        }

        // Divide building width into front face and 3D extruded side face
        let frontX = bx;
        let frontW = bw - sideW;
        let sideX = bx + bw - sideW;

        if (isLeftSide) {
          sideX = bx;
          frontX = bx + sideW;
          frontW = bw - sideW;
        }

        // Subdivide architectural styles by index to create marvelous silhouette variety
        const style = Math.abs(index) % 4; // 0=slanted roof, 1=stepped, 2=spire apex, 3=flat LED ridge
        const roofH = Math.min(15, bh * 0.08);

        if (style === 0) {
          // --- STYLE 0: Angle-cut modern glass block ---
          // Draw Side face
          ctx.fillStyle = sideColor;
          ctx.beginPath();
          ctx.moveTo(sideX, by + (isLeftSide ? roofH : 0));
          ctx.lineTo(sideX + sideW, by + (isLeftSide ? 0 : roofH));
          ctx.lineTo(sideX + sideW, groundY);
          ctx.lineTo(sideX, groundY);
          ctx.closePath();
          ctx.fill();

          // Draw Front face
          ctx.fillStyle = frontColor;
          ctx.beginPath();
          ctx.moveTo(frontX, by + (isLeftSide ? 0 : roofH));
          ctx.lineTo(frontX + frontW, by + (isLeftSide ? roofH : 0));
          ctx.lineTo(frontX + frontW, groundY);
          ctx.lineTo(frontX, groundY);
          ctx.closePath();
          ctx.fill();

          // Bevel reflective glass line at the 3D corner intersection to pop the visual dimension!
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.38)';
          ctx.lineWidth = isFar ? 0.6 : 1.3;
          ctx.beginPath();
          ctx.moveTo(isLeftSide ? sideX + sideW : sideX, by + roofH);
          ctx.lineTo(isLeftSide ? sideX + sideW : sideX, groundY);
          ctx.stroke();
        } else if (style === 1) {
          // --- STYLE 1: 3D Stepped bento block ---
          const baseH = bh * 0.66;
          const stepW = bw * 0.12;

          // Lower tier
          ctx.fillStyle = sideColor;
          ctx.fillRect(sideX, by + bh - baseH, sideW, baseH);
          ctx.fillStyle = frontColor;
          ctx.fillRect(frontX, by + bh - baseH, frontW, baseH);

          // Upper tier (shrunk)
          const topW = bw - stepW * 2;
          const topX = bx + stepW;
          const topH = bh - baseH;
          const topY = by;

          let topFrontX = topX;
          let topFrontW = topW - sideW;
          let topSideX = topX + topW - sideW;

          if (isLeftSide) {
            topSideX = topX;
            topFrontX = topX + sideW;
            topFrontW = topW - sideW;
          }

          ctx.fillStyle = sideColor;
          ctx.fillRect(topSideX, topY, sideW, topH);
          ctx.fillStyle = frontColor;
          ctx.fillRect(topFrontX, topY, topFrontW, topH);

          // Roof highlight cap
          ctx.fillStyle = roofColor;
          ctx.fillRect(topFrontX, topY, topFrontW, 2);
        } else if (style === 2) {
          // --- STYLE 2: Spire-crowned tower ---
          ctx.fillStyle = sideColor;
          ctx.fillRect(sideX, by, sideW, bh);
          ctx.fillStyle = frontColor;
          ctx.fillRect(frontX, by, frontW, bh);

          // 3D Spire antenna
          ctx.strokeStyle = isFar ? '#3b82f6' : '#22d3ee';
          ctx.lineWidth = isFar ? 0.8 : 1.8;
          ctx.beginPath();
          const spireX = frontX + frontW * 0.5;
          ctx.moveTo(spireX, by);
          ctx.lineTo(spireX, by - bh * 0.22);
          ctx.stroke();

          // Red beacon lights blinking
          if (!isFar) {
            const flash = Math.floor(s.frameCount / 18) % 2 === 0;
            ctx.fillStyle = flash ? '#ef4444' : '#7f1d1d';
            ctx.beginPath();
            ctx.arc(spireX, by - bh * 0.22, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          // --- STYLE 3: Modern solid panel block with vertical cyber stripes ---
          ctx.fillStyle = sideColor;
          ctx.fillRect(sideX, by, sideW, bh);
          ctx.fillStyle = frontColor;
          ctx.fillRect(frontX, by, frontW, bh);

          if (!isFar) {
            // Neon neon framing stripe
            ctx.fillStyle = '#06b6d4';
            ctx.fillRect(isLeftSide ? sideX + sideW - 1.5 : sideX - 0.5, by, 1.8, bh);
          }
        }

        // Holographic vertical skyscraper windows
        if (style !== 1) {
          const rows = isFar ? 4 : 7;
          const cols = 2;
          const wGapY = bh / (rows + 1);
          const wGapX = frontW / (cols + 1);

          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              // Interactive sparkling lights
              if (!isFar && (r + c + index) % 4 === 0 && Math.sin(s.gameTime * 3.5 + r) > 0.7) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
              } else {
                ctx.fillStyle = windowGlow;
              }
              ctx.fillRect(
                frontX + wGapX * (c + 1) - 2.5,
                by + wGapY * (r + 1) - 3,
                Math.max(2, frontW * 0.12),
                Math.max(1.5, bh * 0.04)
              );
            }
          }
        } else {
          // Render Style 1 layered banding slots
          ctx.fillStyle = windowGlow;
          ctx.fillRect(frontX + frontW * 0.25, by + bh * 0.2, frontW * 0.5, 3);
          ctx.fillRect(frontX + frontW * 0.25, by + bh * 0.55, frontW * 0.5, 3);
        }
      };

      // 1. BACKLAYER SKYLINE (Darker, slower parallax)
      const bCountFar = 10;
      const cityXOffsetFar = (s.distanceTravelled * 0.09) % 350;
      for (let i = -1; i < bCountFar + 2; i++) {
        const bw = canvas.width / (bCountFar - 2);
        const bh = 85 + Math.sin(i * 12.3) * 28;
        const bx = i * bw - cityXOffsetFar;
        const by = groundY - bh;

        draw3DBuilding(bx, by, bw, bh, true, i);
      }

      // 2. FOREGROUND TALL SKYLINE (Crisp, colorful detailed towers)
      const bCountNear = 7;
      const cityXOffsetNear = (s.distanceTravelled * 0.23) % 450;
      for (let i = -1; i < bCountNear + 2; i++) {
        const bw = canvas.width / (bCountNear - 2);
        const bh = 135 + Math.cos(i * 5.4) * 45;
        const bx = i * bw - cityXOffsetNear;
        const by = groundY - bh;

        draw3DBuilding(bx, by, bw, bh, false, i + 10);
      }
    } else if (stage === 2) {
      // 🏔️ DRAWS LAYERED CANYON CLIFF PILLARS for the Glacial glacier slide stage (Screenshot 3)
      const bCount = 5;
      for (let i = -1; i < bCount + 2; i++) {
        const bWidth = canvas.width / (bCount - 1);
        const bHeight = 140 + Math.cos(i * 3) * 50;
        const bx = i * bWidth - cityXOffset;
        const by = canvas.height * 0.38 - bHeight;

        ctx.fillStyle = i % 2 === 0 ? '#78350f' : '#92400e'; // warm brown canyon walls
        // Draw cliff columns
        ctx.beginPath();
        ctx.moveTo(bx, canvas.height * 0.38);
        ctx.lineTo(bx, by);
        ctx.quadraticCurveTo(bx + bWidth * 0.4, by - 12, bx + bWidth * 0.5, by - 5);
        ctx.quadraticCurveTo(bx + bWidth * 0.6, by, bx + bWidth, by - 10);
        ctx.lineTo(bx + bWidth, canvas.height * 0.38);
        ctx.fill();

        // draw icy dusting on top of canyon cliff
        ctx.fillStyle = '#bae6fd';
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(bx + bWidth * 0.4, by - 12, bx + bWidth * 0.5, by - 5);
        ctx.lineTo(bx + bWidth * 0.5, by + 4);
        ctx.lineTo(bx, by + 12);
        ctx.fill();
      }
    } else if (stage === 3) {
      // 🏡 DRAWS SNOWY MILL PEAKS & TRADITIONAL WINDMILL HOUSES (Screenshot 4)
      const bCount = 5;
      for (let i = -1; i < bCount + 2; i++) {
        const bWidth = canvas.width / (bCount - 1);
        const bHeight = 100 + Math.cos(i * 12) * 35;
        const bx = i * bWidth - cityXOffset;
        const by = canvas.height * 0.38 - bHeight;

        ctx.beginPath();
        ctx.moveTo(bx, canvas.height * 0.38);
        ctx.lineTo(bx, by);
        ctx.lineTo(bx + bWidth * 0.5, by - 24); // triangular snowy peak
        ctx.lineTo(bx + bWidth, by);
        ctx.lineTo(bx + bWidth, canvas.height * 0.38);
        ctx.fillStyle = i % 2 === 0 ? '#bae6fd' : '#93c5fa';
        ctx.fill();

        // Snow peaks caps
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(bx + bWidth * 0.38, by - 8);
        ctx.lineTo(bx + bWidth * 0.5, by - 24);
        ctx.lineTo(bx + bWidth * 0.62, by - 8);
        ctx.closePath();
        ctx.fill();
      }
    } else if (stage === 4) {
      // 🌵 DRAWS SANDSTONE RIDGE CLIFS & LANDMARK ARCH SECTIONS (Screenshot 5)
      const bCount = 4;
      for (let i = -1; i < bCount + 2; i++) {
        const bWidth = canvas.width / (bCount - 1);
        const bHeight = 90 + Math.sin(i * 3.3) * 25;
        const bx = i * bWidth - cityXOffset;
        const by = canvas.height * 0.38 - bHeight;

        ctx.fillStyle = i % 2 === 0 ? '#b45309' : '#c2410c'; // Saturated red stones
        ctx.beginPath();
        ctx.ellipse(bx + bWidth * 0.5, canvas.height * 0.38, bWidth * 0.6, bHeight, 0, Math.PI, 0);
        ctx.fill();

        // draw sandstone stratification lines
        ctx.strokeStyle = '#7c2d12';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(bx, canvas.height * 0.38 - bHeight * 0.35);
        ctx.lineTo(bx + bWidth, canvas.height * 0.38 - bHeight * 0.35);
        ctx.stroke();
      }
    }

    // Snowy round ground hills overlays
    ctx.fillStyle = stage === 4 ? '#fed7aa' : '#f1f5f9'; // Orange sand hills for desert, soft snow hills for other stages
    ctx.beginPath();
    ctx.ellipse(canvas.width * 0.3, canvas.height * 0.38, canvas.width * 0.5, 40, 0, 0, Math.PI * 2);
    ctx.ellipse(canvas.width * 0.8, canvas.height * 0.38, canvas.width * 0.6, 30, 0, 0, Math.PI * 2);
    ctx.fill();

    // Snowfall particles drifting past the viewer
    snowflakes.forEach(flake => {
      const scale = 1.0 - flake.z / VISUAL_DEP_MAX;
      const rSize = flake.size * scale * 3.5;
      const flakeX = (flake.x + Math.sin(s.gameTime * 2 + flake.y * 0.01) * 30) % canvas.width;

      ctx.beginPath();
      ctx.arc(flakeX, flake.y, Math.max(1, rSize), 0, Math.PI * 2);
      ctx.fillStyle = stage === 4 
        ? `rgba(254, 215, 170, ${scale * 0.6})` // sandy dust storm for desert
        : `rgba(255, 255, 255, ${scale * 0.85})`; // snow flakes for ice stages
      ctx.fill();
    });

    ctx.restore();
  };

  const drawHighwayScenery = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, s: typeof stateRef.current) => {
    ctx.save();
    if (s.cameraShake > 0) {
      ctx.translate((Math.random() - 0.5) * s.cameraShake, (Math.random() - 0.5) * s.cameraShake);
    }

    const stage = getStage(s.distanceTravelled);

    // 1. Draw parallel rails/fences on sidewalk edges
    const fenceSpeed = (s.distanceTravelled * 4.2) % 65;
    const fenceSegments = 9;
    for (let f = 0; f < fenceSegments; f++) {
      const fDepth = f * 30 - fenceSpeed + 200;
      if (fDepth > 4 && fDepth < VISUAL_DEP_MAX) {
        const leftFenceStart = project3D(fDepth, -0.15, 0, canvas.width, canvas.height, s);
        const leftFenceEnd = project3D(fDepth + 15, -0.15, 0, canvas.width, canvas.height, s);

        const rightFenceStart = project3D(fDepth, 3.15, 0, canvas.width, canvas.height, s);
        const rightFenceEnd = project3D(fDepth + 15, 3.15, 0, canvas.width, canvas.height, s);

        ctx.lineWidth = 1.8 * leftFenceStart.scale;

        if (stage === 2) {
          // Glacier Wall Blocks casing! (Screenshot 3)
          ctx.fillStyle = `rgba(56, 189, 248, ${leftFenceStart.scale * 0.8})`;
          ctx.strokeStyle = `rgba(255, 255, 255, ${leftFenceStart.scale})`;
          const bW = 12 * leftFenceStart.scale * 3.5;
          const bH = 35 * leftFenceStart.scale * 3.5;

          // Left glacier wall piece
          ctx.beginPath();
          ctx.roundRect(leftFenceStart.x - bW * 0.5, leftFenceStart.y - bH, bW, bH, 4);
          ctx.fill(); ctx.stroke();

          // Right glacier wall piece
          ctx.beginPath();
          ctx.roundRect(rightFenceStart.x - bW * 0.5, rightFenceStart.y - bH, bW, bH, 4);
          ctx.fill(); ctx.stroke();
        } else {
          // Elegant white fences with connecting rails (Screenshot 1-2)
          ctx.strokeStyle = stage === 4 
            ? `rgba(249, 115, 22, ${leftFenceStart.scale * 0.9})` // orange warning fences in desert
            : `rgba(255, 255, 255, ${leftFenceStart.scale * 0.95})`;

          ctx.beginPath();
          ctx.moveTo(leftFenceStart.x, leftFenceStart.y - 10 * leftFenceStart.scale);
          ctx.lineTo(leftFenceEnd.x, leftFenceEnd.y - 10 * leftFenceEnd.scale);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(rightFenceStart.x, rightFenceStart.y - 10 * rightFenceStart.scale);
          ctx.lineTo(rightFenceEnd.x, rightFenceEnd.y - 10 * rightFenceEnd.scale);
          ctx.stroke();

          // Verticals
          ctx.lineWidth = 2.6 * leftFenceStart.scale;
          ctx.beginPath();
          ctx.moveTo(leftFenceStart.x, leftFenceStart.y);
          ctx.lineTo(leftFenceStart.x, leftFenceStart.y - 14 * leftFenceStart.scale);
          ctx.moveTo(rightFenceStart.x, rightFenceStart.y);
          ctx.lineTo(rightFenceStart.x, rightFenceStart.y - 14 * rightFenceStart.scale);
          ctx.stroke();
        }
      }
    }

    // 2. Render scenic objects based on the stage environment (Deciduous Sidewalk trees, spruce, windmills, cactuses)
    const decSpeed = (s.distanceTravelled * 4.0) % 110;
    const decSegments = 6;
    for (let t = 0; t < decSegments; t++) {
      const tDepth = t * 35 - decSpeed + 190;
      if (tDepth > 8 && tDepth < VISUAL_DEP_MAX) {
        const sideLane = t % 2 === 0 ? -0.42 : 3.42;
        const pObj = project3D(tDepth, sideLane, 0, canvas.width, canvas.height, s);

        if (pObj.scale > 0.08) {
          const tW = 20 * pObj.scale * 3.5;
          const tH = 34 * pObj.scale * 3.5;

          ctx.save();
          ctx.translate(pObj.x, pObj.y);

          if (stage === 1 || stage === 5) {
            // Deciduous Trees with warm orange trunks and saturated green leafy crowns (Screenshot 1 & 2)
            ctx.fillStyle = '#d97706'; // bright orange/brown trunk
            ctx.fillRect(-tW * 0.08, -tH * 0.4, tW * 0.16, tH * 0.45);

            ctx.fillStyle = t % 2 === 0 ? '#15803d font-extrabold' : '#22c55e'; // leafy bubble crown
            ctx.beginPath();
            ctx.ellipse(0, -tH * 0.65, tW * 0.42, tH * 0.32, 0, 0, Math.PI * 2);
            ctx.fill();
          } else if (stage === 3) {
            // Rotating Windmill on sides of road! (Screenshot 4)
            const wH = 55 * pObj.scale * 3.5;
            const wW = 16 * pObj.scale * 3.5;

            // Cream body
            ctx.fillStyle = '#f8fafc';
            ctx.strokeStyle = '#cbd5e1';
            ctx.beginPath();
            ctx.moveTo(-wW * 0.4, 0);
            ctx.lineTo(-wW * 0.25, -wH);
            ctx.lineTo(wW * 0.25, -wH);
            ctx.lineTo(wW * 0.4, 0);
            ctx.closePath();
            ctx.fill(); ctx.stroke();

            // Orange roof dome
            ctx.fillStyle = '#f97316';
            ctx.beginPath();
            ctx.arc(0, -wH, wW * 0.28, Math.PI, 0);
            ctx.fill();

            // Turbine blades
            ctx.save();
            ctx.translate(0, -wH);
            ctx.rotate(s.gameTime * 2.5 + t);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2.5 * pObj.scale;
            for (let b = 0; b < 4; b++) {
              ctx.rotate(Math.PI / 2);
              ctx.beginPath();
              ctx.moveTo(0, 0);
              ctx.lineTo(0, -wH * 0.6);
              ctx.stroke();

              ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
              ctx.fillRect(-wW * 0.14, -wH * 0.5, wW * 0.28, wH * 0.3);
            }
            ctx.restore();
          } else if (stage === 4) {
            // Giant Saguaro Cacti Trees cover in soft snow (Screenshot 5)
            ctx.fillStyle = '#16a34a'; // deep cactus green
            // main column
            ctx.beginPath();
            ctx.roundRect(-tW * 0.2, -tH, tW * 0.4, tH, tW * 0.16);
            ctx.fill();

            // left branch
            ctx.beginPath();
            ctx.roundRect(-tW * 0.55, -tH * 0.65, tW * 0.4, tW * 0.18, 4);
            ctx.roundRect(-tW * 0.55, -tH * 0.88, tW * 0.18, tW * 0.38, 4);
            ctx.fill();

            // right branch
            ctx.beginPath();
            ctx.roundRect(tW * 0.15, -tH * 0.5, tW * 0.4, tW * 0.18, 4);
            ctx.roundRect(tW * 0.37, -tH * 0.76, tW * 0.18, tW * 0.38, 4);
            ctx.fill();

            // White snow cap sitting on cactus main column
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.ellipse(0, -tH, tW * 0.22, 4 * pObj.scale, 0, 0, Math.PI * 2);
            ctx.fill();

            // Draw Frog warning signboard once in a while (Screenshot 5)
            if (t % 3 === 0) {
              ctx.save();
              ctx.translate(sideLane > 0 ? tW * 0.78 : -tW * 0.78, 0);
              // brown wooden post
              ctx.fillStyle = '#b45309';
              ctx.fillRect(-1.5 * pObj.scale, -tH * 0.45, 3 * pObj.scale, tH * 0.45);

              // Circular white sign with red border
              ctx.fillStyle = '#ffffff';
              ctx.strokeStyle = '#ef4444'; // Red frame outline
              ctx.lineWidth = 1.8 * pObj.scale;
              ctx.beginPath();
              ctx.arc(0, -tH * 0.45, tW * 0.38, 0, Math.PI * 2);
              ctx.fill(); ctx.stroke();

              // Draw green frog outline or a funny simplified green cartoon blob strike crossed
              ctx.fillStyle = '#22c55e'; // green frog body
              ctx.beginPath();
              ctx.arc(0, -tH * 0.45, tW * 0.18, 0, Math.PI * 2);
              ctx.fill();

              // Red diagonal ban line! (Screenshot 5)
              ctx.strokeStyle = '#ef4444';
              ctx.lineWidth = 2 * pObj.scale;
              ctx.beginPath();
              ctx.moveTo(-tW * 0.26, -tH * 0.45 + tW * 0.26);
              ctx.lineTo(tW * 0.26, -tH * 0.45 - tW * 0.26);
              ctx.stroke();
              ctx.restore();
            }
          } else {
            // Stage 2 & 5 generic pine trees
            ctx.fillStyle = '#ea580c';
            ctx.fillRect(-tW * 0.08, -tH * 0.4, tW * 0.16, tH * 0.45);

            ctx.fillStyle = t % 2 === 0 ? '#15803d font-medium' : '#166534';
            ctx.beginPath();
            ctx.moveTo(0, -tH);
            ctx.lineTo(-tW * 0.45, -tH * 0.32);
            ctx.lineTo(tW * 0.45, -tH * 0.32);
            ctx.closePath();
            ctx.fill();
          }

          ctx.restore();
        }
      }
    }

    // Draw Metropolitan Metropolis Finish structures near the runway endpoints! (Screenshot 6)
    const finishPos = s.trackLength - s.distanceTravelled;
    if (finishPos > -20 && finishPos < 180) {
      const pFin = project3D(finishPos, 1.5, 0, canvas.width, canvas.height, s);
      if (pFin.scale > 0.05) {
        ctx.save();
        ctx.translate(pFin.x, pFin.y);

        // Draw STOP sign barrier on right side (Screenshot 6)
        const postH = 44 * pFin.scale * 3.5;
        const signW = 18 * pFin.scale * 3.5;

        // wooden post
        ctx.fillStyle = '#78350f';
        ctx.fillRect(-2 * pFin.scale, -postH, 4 * pFin.scale, postH);

        // Red Hexagonal STOP Signboard
        ctx.fillStyle = '#ef4444';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.6 * pFin.scale;
        
        ctx.beginPath();
        const hexRad = signW * 0.5;
        for (let side = 0; side < 6; side++) {
          const sAngle = (side * Math.PI) / 3;
          const hx = Math.cos(sAngle) * hexRad;
          const hy = -postH + Math.sin(sAngle) * hexRad;
          if (side === 0) ctx.moveTo(hx, hy);
          else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.fill(); ctx.stroke();

        // Write STOP text
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(6.5 * pFin.scale * 3.5)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('STOP', 0, -postH);

        ctx.restore();
      }
    }

    ctx.restore();
  };

  const drawIceRoad = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, s: typeof stateRef.current) => {
    ctx.save();
    if (s.cameraShake > 0) {
      ctx.translate((Math.random() - 0.5) * s.cameraShake, (Math.random() - 0.5) * s.cameraShake);
    }

    const stage = getStage(s.distanceTravelled);

    // Dynamic bright glistening ice road textures (No dark moody techno roads, pure high key bright winter)
    const totalSegments = 40;
    const scrollOffset = (s.distanceTravelled * 6) % 15;

    for (let seg = totalSegments; seg >= 0; seg--) {
      const dNear = seg * (VISUAL_DEP_MAX / totalSegments) - scrollOffset;
      const dFar = (seg + 1) * (VISUAL_DEP_MAX / totalSegments) - scrollOffset;

      if (dNear < 2) continue;

      const pLeftNear = project3D(dNear, 0, 0, canvas.width, canvas.height, s);
      const pLeftFar = project3D(dFar, 0, 0, canvas.width, canvas.height, s);
      const pRightNear = project3D(dNear, LANES_COUNT, 0, canvas.width, canvas.height, s);
      const pRightFar = project3D(dFar, LANES_COUNT, 0, canvas.width, canvas.height, s);

      const isAlt = seg % 2 === 0;

      // Select bright glistening background color matching each gorgeous screenshot layout
      if (stage === 1) { // City Ice Slide (Screenshot 1-2): Saturated bright sky blue & snow white speculars
        ctx.fillStyle = isAlt ? '#eff6ff' : '#bae6fd'; 
      } else if (stage === 2) { // Glacier Slide (Screenshot 3): Saturated deep ocean sliding water blue
        ctx.fillStyle = isAlt ? '#0284c7' : '#0369a1';
      } else if (stage === 3) { // Snowy Mill Valley: Frost white ice
        ctx.fillStyle = isAlt ? '#f1f5f9' : '#e2e8f0';
      } else if (stage === 4) { // Saguaro Desert: Turquoise blue ice sitting over warm orange borders
        ctx.fillStyle = isAlt ? '#e0f2fe' : '#7dd3fc';
      } else { // Metropolis finished runway
        ctx.fillStyle = isAlt ? '#eff6ff' : '#cbd5e1';
      }

      ctx.beginPath();
      ctx.moveTo(pLeftNear.x, pLeftNear.y);
      ctx.lineTo(pLeftFar.x, pLeftFar.y);
      ctx.lineTo(pRightFar.x, pRightFar.y);
      ctx.lineTo(pRightNear.x, pRightNear.y);
      ctx.closePath();
      ctx.fill();

      // Gleaming Neon Left Rail lines
      ctx.strokeStyle = stage === 2 ? '#38bdf8' : 'rgba(34, 211, 238, 0.75)'; // cyan glowing edges
      ctx.lineWidth = 1.8 * pLeftNear.scale;
      ctx.beginPath();
      ctx.moveTo(pLeftNear.x, pLeftNear.y);
      ctx.lineTo(pLeftFar.x, pLeftFar.y);
      ctx.stroke();

      // Gleaming Neon Right Rail lines
      ctx.strokeStyle = stage === 2 ? '#f43f5e' : 'rgba(236, 72, 153, 0.75)'; // vibrant pink right edges
      ctx.beginPath();
      ctx.moveTo(pRightNear.x, pRightNear.y);
      ctx.lineTo(pRightFar.x, pRightFar.y);
      ctx.stroke();

      // Add horizontal glistening reflection highlights across road to look like ice cracks or specular highlights!
      if (seg % 3 === 0) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 0.8 * pLeftNear.scale;
        ctx.beginPath();
        ctx.moveTo(pLeftNear.x + (pRightNear.x - pLeftNear.x) * 0.15, pLeftNear.y);
        ctx.lineTo(pLeftNear.x + (pRightNear.x - pLeftNear.x) * 0.85, pLeftNear.y);
        ctx.stroke();
      }
    }

    // Splitter dashed lane markers inside Roadway
    for (let seg = totalSegments; seg >= 0; seg--) {
      const dNear = seg * (VISUAL_DEP_MAX / totalSegments) - scrollOffset;
      const dFar = (seg + 0.45) * (VISUAL_DEP_MAX / totalSegments) - scrollOffset;

      for (let l = 1; l < LANES_COUNT; l++) {
        const laneNear = project3D(dNear, l, 0, canvas.width, canvas.height, s);
        const laneFar = project3D(dFar, l, 0, canvas.width, canvas.height, s);

        ctx.strokeStyle = stage === 2 ? 'rgba(255,255,255,0.22)' : 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 2 * laneNear.scale;
        ctx.beginPath();
        ctx.moveTo(laneNear.x, laneNear.y);
        ctx.lineTo(laneFar.x, laneFar.y);
        ctx.stroke();
      }
    }

    ctx.restore();
  };

  const drawCoinsOnGrid = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, s: typeof stateRef.current) => {
    ctx.save();
    if (s.cameraShake > 0) {
      ctx.translate((Math.random() - 0.5) * s.cameraShake, (Math.random() - 0.5) * s.cameraShake);
    }

    // Draw individual gold shiny fishes and ice diamonds
    coinsRef.current.forEach(cn => {
      if (cn.collected || cn.x > VISUAL_DEP_MAX || cn.x < 1.5) return;

      const pSec = project3D(cn.x, cn.lane, cn.yOffset + 5, canvas.width, canvas.height, s);
      const rad = 10 * pSec.scale;

      if (pSec.scale < 0.05) return;

      // Draw shiny spinning cartoon fish silhouette
      ctx.save();
      ctx.translate(pSec.x, pSec.y);

      // spin animation
      const angle = s.gameTime * 6;
      ctx.rotate(Math.sin(angle) * 0.4);

      if (cn.isDiamond) {
        // Cyan sparkling ice jewel
        ctx.fillStyle = '#06b6d4';
        ctx.strokeStyle = '#e0f2fe';
        ctx.lineWidth = 2 * pSec.scale;

        ctx.beginPath();
        ctx.moveTo(0, -rad * 1.3);
        ctx.lineTo(rad * 0.9, 0);
        ctx.lineTo(0, rad * 1.3);
        ctx.lineTo(-rad * 0.9, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillRect(-rad * 0.3, -rad * 0.3, rad * 0.2, rad * 0.2);
      } else {
        // Gold fish coin
        ctx.fillStyle = '#f59e0b'; // Amber Gold
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1 * pSec.scale;

        // draw cute fish shape
        ctx.beginPath();
        // Fish body
        ctx.ellipse(0, 0, rad * 1.4, rad * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Fin tail
        ctx.beginPath();
        ctx.moveTo(-rad * 1.2, 0);
        ctx.lineTo(-rad * 1.8, -rad * 0.6);
        ctx.lineTo(-rad * 1.8, rad * 0.6);
        ctx.closePath();
        ctx.fillStyle = '#d97706';
        ctx.fill();

        // Shiny gold eye
        ctx.beginPath();
        ctx.arc(rad * 0.7, -rad * 0.2, rad * 0.15, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
      }
      ctx.restore();
    });
    ctx.restore();
  };

  const drawProjectilesOnGrid = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, s: typeof stateRef.current) => {
    projectilesRef.current.forEach(proj => {
      const pSec = project3D(proj.x, proj.lane, proj.y, canvas.width, canvas.height, s);
      const rad = 8 * pSec.scale;

      ctx.save();
      ctx.translate(pSec.x, pSec.y);

      if (proj.faction === 'player') {
        // Glowing cyan water rocket blast
        const grad = ctx.createRadialGradient(0, 0, 1, 0, 0, rad * 2);
        grad.addColorStop(0, '#e0f2fe');
        grad.addColorStop(0.5, '#06b6d4');
        grad.addColorStop(1, 'rgba(6, 182, 212, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, rad * 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Red electronic snowball projectile
        const grad = ctx.createRadialGradient(0, 0, 1, 0, 0, rad * 2.2);
        grad.addColorStop(0, '#fff1f2');
        grad.addColorStop(0.4, '#f43f5e');
        grad.addColorStop(1, 'rgba(244, 63, 94, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, rad * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
  };

  const drawObstaclesOnGrid = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, s: typeof stateRef.current) => {
    ctx.save();
    if (s.cameraShake > 0) {
      ctx.translate((Math.random() - 0.5) * s.cameraShake, (Math.random() - 0.5) * s.cameraShake);
    }

    obstaclesRef.current.forEach(obs => {
      if (obs.passed || obs.x > VISUAL_DEP_MAX || obs.x < 1.5) return;

      const pSec = project3D(obs.x, obs.lane, obs.yOffset, canvas.width, canvas.height, s);
      if (pSec.scale < 0.05) return;

      const w = obs.width * pSec.scale * 3.5;
      const h = obs.height * pSec.scale * 3.5;

      const typeStr = obs.type as string;

      if (typeStr.startsWith('powerup_')) {
        // RENDER POWERUPS WITH FLOATING BUBBLES
        const powerType = typeStr.replace('powerup_', '') as PowerUpType;
        const bounce = Math.sin(s.gameTime * 8 + obs.x * 0.1) * 8 * pSec.scale;

        ctx.save();
        ctx.translate(pSec.x, pSec.y - bounce);

        // draw background halo glow pulsing
        const glowRad = w * 1.25;
        const gradGlow = ctx.createRadialGradient(0, 0, w * 0.2, 0, 0, glowRad);
        let colorTheme = '#38bdf8';
        let iconText = '🔋';

        switch (powerType) {
          case 'boost': colorTheme = '#f43f5e'; iconText = '🔥'; break;
          case 'magnet': colorTheme = '#eab308'; iconText = '🧲'; break;
          case 'double': colorTheme = '#10b981'; iconText = '⭐'; break;
          case 'shield': colorTheme = '#a855f7'; iconText = '🛡️'; break;
          case 'superjump': colorTheme = '#6366f1'; iconText = '⚡'; break;
        }

        gradGlow.addColorStop(0, 'rgba(255,255,255,0.95)');
        gradGlow.addColorStop(0.35, colorTheme);
        gradGlow.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.fillStyle = gradGlow;
        ctx.beginPath();
        ctx.arc(0, 0, glowRad, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.6 * pSec.scale;
        ctx.beginPath();
        ctx.arc(0, 0, w * 0.58, 0, Math.PI * 2);
        ctx.stroke();

        ctx.font = `${Math.round(w * 0.65)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(obs.behaviorState?.isAmmo ? '🚀' : iconText, 0, 0);

        ctx.restore();
        return;
      }

      // RENDER REGULAR OBSTACLES (COMPRESSED REDIRECTION TO THE PRECISE STYLED SCREENSHOT GRAPHICS)
      ctx.save();
      ctx.translate(pSec.x, pSec.y);

      switch (obs.type) {
        case 'ice_barrier': {
          // Bright red 3D safety fire hydrant (Screenshot 1)
          const baseW = w * 0.5;
          const baseH = h * 1.05;

          // Red main cylinder body
          ctx.fillStyle = '#dc2626';
          ctx.fillRect(-baseW * 0.5, -baseH, baseW, baseH);

          // Top dome head round
          ctx.beginPath();
          ctx.arc(0, -baseH, baseW * 0.5, Math.PI, 0);
          ctx.fill();

          // Top yellow/amber hexagon cap bolt
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(-baseW * 0.12, -baseH - baseW * 0.16, baseW * 0.24, baseW * 0.18);

          // Center horizontal protruding rim
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(-baseW * 0.6, -baseH * 0.62, baseW * 1.2, baseH * 0.12);

          // Side brass nozzle ports left & right
          ctx.fillStyle = '#f59e0b';
          ctx.fillRect(-baseW * 0.72, -baseH * 0.55, baseW * 0.22, baseH * 0.16);
          ctx.fillRect(baseW * 0.5, -baseH * 0.55, baseW * 0.22, baseH * 0.16);

          // Front center white/black water output cap
          ctx.fillStyle = '#f8fafc';
          ctx.beginPath();
          ctx.arc(0, -baseH * 0.78, baseW * 0.18, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#1e293b';
          ctx.beginPath();
          ctx.arc(0, -baseH * 0.78, baseW * 0.08, 0, Math.PI * 2);
          ctx.fill();

          // Bottom black flange mount stand
          ctx.fillStyle = '#451a03';
          ctx.fillRect(-baseW * 0.65, -baseH * 0.08, baseW * 1.3, baseH * 0.1);
          break;
        }

        case 'snow_truck': {
          // Saturated Red & White Subway train with a Checkerboard warning jump ramp in front of it (Screenshot 1 & 7)
          const truckW = w * 0.95;
          const truckH = h * 1.25;

          // Draw the yellow inclined jump ramp in perspective
          ctx.fillStyle = '#eab308';
          ctx.beginPath();
          ctx.moveTo(-truckW * 0.7, 0);
          ctx.lineTo(-truckW * 0.5, -truckH * 0.35); // ramp rise height
          ctx.lineTo(truckW * 0.5, -truckH * 0.35);
          ctx.lineTo(truckW * 0.7, 0);
          ctx.closePath();
          ctx.fill();

          // Black checker safety hazard diagonal lines on ramp (Screenshot 1)
          ctx.strokeStyle = '#1e293b';
          ctx.lineWidth = 3.5 * pSec.scale;
          ctx.beginPath();
          for (let sx = -truckW * 0.6; sx < truckW * 0.6; sx += 12 * pSec.scale) {
            ctx.moveTo(sx, 0);
            ctx.lineTo(sx + 8 * pSec.scale, -truckH * 0.32);
          }
          ctx.stroke();

          // Subway Train carriage behind/above the ramp
          ctx.fillStyle = '#dc2626'; // Deep Red lower half
          ctx.fillRect(-truckW * 0.5, -truckH, truckW, truckH * 0.65);

          ctx.fillStyle = '#f8fafc'; // White clean upper half
          ctx.fillRect(-truckW * 0.5, -truckH - truckH * 0.25, truckW, truckH * 0.26);

          // Black sleek continuous cabin glass windows
          ctx.fillStyle = '#0f172a';
          for (let win = 0; win < 3; win++) {
            const wx = -truckW * 0.42 + win * (truckW * 0.3);
            ctx.fillRect(wx, -truckH - truckH * 0.12, truckW * 0.22, truckH * 0.16);
          }

          // Blinking hazard strobe light on top
          const blink = Math.floor(s.frameCount / 10) % 2 === 0;
          ctx.fillStyle = blink ? '#ef4444' : '#450a0a';
          ctx.beginPath();
          ctx.arc(0, -truckH - truckH * 0.25, truckW * 0.08, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'frozen_pipe': {
          // Bus Stop Shelter structure (Screenshot 2) that the player slides under
          const shW = w * 1.35;
          const shH = h * 0.85;

          // Back transparent cyan/teal glass wind blocker
          ctx.fillStyle = 'rgba(6, 182, 212, 0.22)';
          ctx.fillRect(-shW * 0.8, -shH, shW * 1.6, shH);

          // Supporting neon cyan framing pillars on sides
          ctx.strokeStyle = '#06b6d4';
          ctx.lineWidth = 3 * pSec.scale;
          ctx.beginPath();
          ctx.moveTo(-shW * 0.8, 0);
          ctx.lineTo(-shW * 0.8, -shH);
          ctx.moveTo(shW * 0.8, 0);
          ctx.lineTo(shW * 0.8, -shH);
          ctx.stroke();

          // Horizontal modern shelter top roof
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(-shW * 0.9, -shH * 1.1, shW * 1.8, shH * 0.15);

          // Text branding labels
          ctx.fillStyle = '#94a3b8';
          ctx.font = `bold ${Math.round(8 * pSec.scale)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText('BUS STOP', 0, -shH * 1.02);
          break;
        }

        case 'falling_icicle': {
          const grad = ctx.createLinearGradient(0, -h, 0, 0);
          grad.addColorStop(0, 'rgba(56, 189, 248, 0.4)');
          grad.addColorStop(1, '#e0f2fe');
          ctx.fillStyle = grad;

          ctx.beginPath();
          ctx.moveTo(-w * 0.35, -h * 1.4);
          ctx.lineTo(w * 0.35, -h * 1.4);
          ctx.lineTo(0, -h * 0.3);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1 * pSec.scale;
          ctx.stroke();
          break;
        }

        case 'cracked_ice': {
          // Hole on the ground with deep blue freezing water inside
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.ellipse(0, 0, w * 0.85, h * 0.45, 0, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2 * pSec.scale;
          ctx.beginPath();
          ctx.ellipse(0, 0, w * 0.9, h * 0.48, 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }

        case 'abandoned_vehicle': {
          // Cyber Ambulance rescue shuttle with Medical cross (Screenshot 2)
          const ambW = w * 0.82;
          const ambH = h * 1.05;

          // Clean white body
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(-ambW * 0.5, -ambH, ambW, ambH);

          // Safety red lateral horizontal striping
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(-ambW * 0.5, -ambH * 0.55, ambW, ambH * 0.14);

          // Dark cockpit windshield
          ctx.fillStyle = '#111827';
          ctx.fillRect(-ambW * 0.42, -ambH * 0.92, ambW * 0.84, ambH * 0.28);

          // Red Cross symbol on the side
          ctx.fillStyle = '#ef4444';
          const size = ambW * 0.18;
          ctx.fillRect(-size * 0.5, -ambH * 0.35, size, size * 0.3);
          ctx.fillRect(-size * 0.15, -ambH * 0.35 - size * 0.35, size * 0.3, size * 1.0);

          // Cyber blue wheel pods
          ctx.fillStyle = '#0284c7';
          ctx.fillRect(-ambW * 0.45, -ambH * 0.08, ambW * 0.22, ambH * 0.08);
          ctx.fillRect(ambW * 0.23, -ambH * 0.08, ambW * 0.22, ambH * 0.08);

          // Alternating Sirens
          const flash = Math.floor(s.frameCount / 6) % 2 === 0;
          ctx.fillStyle = flash ? '#06b6d4' : '#083344';
          ctx.beginPath();
          ctx.arc(-ambW * 0.25, -ambH * 1.05, ambW * 0.08, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = !flash ? '#ef4444' : '#450a0a';
          ctx.beginPath();
          ctx.arc(ambW * 0.25, -ambH * 1.05, ambW * 0.08, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'giant_snowball': {
          ctx.save();
          const angle = obs.behaviorState?.angle || 0;
          ctx.rotate(angle);

          const sGrad = ctx.createRadialGradient(-w * 0.15, -h * 0.15, h * 0.1, 0, 0, h * 0.55);
          sGrad.addColorStop(0, '#ffffff');
          sGrad.addColorStop(0.65, '#e0f2fe');
          sGrad.addColorStop(1, '#93c5fd');
          ctx.fillStyle = sGrad;

          ctx.beginPath();
          ctx.arc(0, 0, h * 0.55, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#60a5fa';
          ctx.lineWidth = 1.3 * pSec.scale;
          ctx.beginPath();
          for (let r = 2; r < h * 0.45; r += 5 * pSec.scale) {
            ctx.ellipse(0, 0, r, r * 0.7, Math.PI * 0.2, 0, Math.PI * 1.5);
          }
          ctx.stroke();
          ctx.restore();
          break;
        }

        case 'polar_bear': {
          const swing = Math.sin(s.gameTime * 9) * 0.3;

          // Body
          ctx.fillStyle = '#f8fafc';
          ctx.beginPath();
          ctx.arc(0, -h * 0.45, w * 0.55, 0, Math.PI * 2);
          ctx.fill();

          // Head
          ctx.beginPath();
          ctx.arc(0, -h * 0.95, w * 0.4, 0, Math.PI * 2);
          ctx.fill();

          // Ears
          ctx.beginPath();
          ctx.arc(-w * 0.35, -h * 1.25, w * 0.13, 0, Math.PI * 2);
          ctx.arc(w * 0.35, -h * 1.25, w * 0.13, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#ef4444'; // Red headband
          ctx.fillRect(-w * 0.32, -h * 1.05, w * 0.64, h * 0.1);

          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.arc(0, -h * 0.9, w * 0.08, 0, Math.PI * 2);
          ctx.fill();

          ctx.save();
          ctx.translate(-w * 0.5, -h * 0.5);
          ctx.rotate(-0.5 + swing);
          ctx.fillStyle = '#f1f5f9';
          ctx.fillRect(-w * 0.28, -h * 0.1, w * 0.3, h * 0.4);
          ctx.restore();

          ctx.save();
          ctx.translate(w * 0.5, -h * 0.5);
          ctx.rotate(0.5 - swing);
          ctx.fillStyle = '#f1f5f9';
          ctx.fillRect(-w * 0.02, -w * 0.3, w * 0.3, h * 0.4);
          ctx.restore();
          break;
        }

        case 'security_drone': {
          const hover = Math.sin(s.gameTime * 12) * h * 0.15;
          ctx.translate(0, -hover);

          const diskGrad = ctx.createLinearGradient(-w * 0.5, 0, w * 0.5, 0);
          diskGrad.addColorStop(0, '#475569');
          diskGrad.addColorStop(0.5, '#cbd5e1');
          diskGrad.addColorStop(1, '#475569');
          ctx.fillStyle = diskGrad;

          ctx.beginPath();
          ctx.ellipse(0, 0, w * 0.65, h * 0.22, 0, 0, Math.PI * 2);
          ctx.fill();

          const neonP = Math.abs(Math.sin(s.gameTime * 9)) > 0.4;
          ctx.fillStyle = neonP ? '#ef4444' : '#7f1d1d';
          ctx.beginPath();
          ctx.arc(0, -h * 0.1, w * 0.22, Math.PI, 0);
          ctx.fill();

          const beamW = w * 2.8;
          const laserGrad = ctx.createLinearGradient(0, 0, 0, h * 2);
          laserGrad.addColorStop(0, 'rgba(239, 68, 68, 0.4)');
          laserGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
          ctx.fillStyle = laserGrad;

          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-beamW * 0.55, h * 2);
          ctx.lineTo(beamW * 0.55, h * 2);
          ctx.closePath();
          ctx.fill();
          break;
        }
      }
      ctx.restore();
    });
    ctx.restore();
  };

  const drawGiantRoboticPolarBear = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, s: typeof stateRef.current) => {
    // Spawns/Draws a gigantic robot polar bear back at 3D x ~ 90.
    const pSec = project3D(92, s.playerVisualLane, 5, canvas.width, canvas.height, s);
    const w = 180 * pSec.scale * 3.5;
    const h = 210 * pSec.scale * 3.5;

    ctx.save();
    ctx.translate(pSec.x, pSec.y);

    // Hover bobbing breathing
    const breath = Math.sin(s.gameTime * 6) * h * 0.04;

    // Laser eye glowing lines target warning down lane
    // Draw target laser lines down selected drone project lanes
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.7)';
    ctx.lineWidth = 3;

    // Cyber Bear Body metal
    ctx.fillStyle = '#e2e8f0'; // bright steel titanium
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;

    // Body base
    ctx.beginPath();
    ctx.ellipse(0, -h * 0.4 + breath, w * 0.5, h * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Metallic Shield plates on chest
    ctx.fillStyle = '#38bdf8'; // glowing neon reactor core!
    ctx.beginPath();
    ctx.arc(0, -h * 0.45 + breath, w * 0.16, 0, Math.PI * 2);
    ctx.fill();

    // head steel plating
    ctx.fillStyle = '#f1f5f9';
    ctx.beginPath();
    ctx.arc(0, -h * 0.82 + breath, w * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Robot ears
    ctx.fillStyle = '#64748b';
    ctx.fillRect(-w * 0.28, -h * 1.05 + breath, w * 0.1, h * 0.12);
    ctx.fillRect(w * 0.18, -h * 1.05 + breath, w * 0.1, h * 0.12);

    // Glowing Neon Cyan visor eyes
    ctx.fillStyle = '#f43f5e'; // evil red robot light
    ctx.fillRect(-w * 0.18, -h * 0.88 + breath, w * 0.36, h * 0.06);

    // steel jaw
    ctx.fillStyle = '#475569';
    ctx.fillRect(-w * 0.12, -h * 0.75 + breath, w * 0.24, h * 0.08);

    // Cyber arms
    ctx.fillStyle = '#cbd5e1';
    const armSwing = Math.sin(s.gameTime * 4) * 0.4;

    ctx.save();
    ctx.translate(-w * 0.45, -h * 0.5);
    ctx.rotate(armSwing);
    ctx.fillRect(-w * 0.15, 0, w * 0.18, h * 0.3);
    ctx.fillStyle = '#f43f5e'; // red metal claws
    ctx.fillRect(-w * 0.15, h * 0.28, w * 0.18, h * 0.04);
    ctx.restore();

    ctx.save();
    ctx.translate(w * 0.45, -h * 0.5);
    ctx.rotate(-armSwing);
    ctx.fillRect(-w * 0.03, 0, w * 0.18, h * 0.3);
    ctx.fillStyle = '#f43f5e';
    ctx.fillRect(-w * 0.03, h * 0.28, w * 0.18, h * 0.04);
    ctx.restore();

    // Draw Boss Health Bar hovering above its massive cyber crown
    const barW = w * 1.1;
    const barH = h * 0.09;

    ctx.fillStyle = '#334155';
    ctx.fillRect(-barW * 0.5, -h * 1.25, barW, barH);

    ctx.fillStyle = '#ef4444'; // Red health inside
    ctx.fillRect(-barW * 0.5, -h * 1.25, barW * (bossHealth / 100), barH);

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(-barW * 0.5, -h * 1.25, barW, barH);

    ctx.restore();
  };

  const drawSkatingParticles = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, s: typeof stateRef.current) => {
    // Generate two gorgeous continuous parallel white snow spray jet tracks fanning out behind the circular donut tube!
    if (s.playerY === 0 && !s.isPaused) {
      const pLeft = project3D(11.2, s.playerVisualLane - 0.12, 0, canvas.width, canvas.height, s);
      const pRight = project3D(11.2, s.playerVisualLane + 0.12, 0, canvas.width, canvas.height, s);
      
      const pFarLeft = project3D(13.8, s.playerVisualLane - 0.35, 0, canvas.width, canvas.height, s);
      const pFarRight = project3D(13.8, s.playerVisualLane + 0.35, 0, canvas.width, canvas.height, s);

      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      
      // Left wide spray jet polygon
      ctx.beginPath();
      ctx.moveTo(pLeft.x, pLeft.y);
      ctx.lineTo(pFarLeft.x, pFarLeft.y);
      ctx.lineTo(pFarLeft.x - 14 * pFarLeft.scale, pFarLeft.y + 2);
      ctx.closePath();
      ctx.fill();

      // Right wide spray jet polygon
      ctx.beginPath();
      ctx.moveTo(pRight.x, pRight.y);
      ctx.lineTo(pFarRight.x, pFarRight.y);
      ctx.lineTo(pFarRight.x + 14 * pFarRight.scale, pFarRight.y + 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      const parent = canvas;
      const pyScale = project3D(11, s.playerLane, 0, parent.width, parent.height, s);

      // Create little ice crystal speed particles
      for (let i = 0; i < 2; i++) {
        particlesRef.current.push({
          x: pyScale.x + (Math.random() - 0.5) * 15,
          y: pyScale.y + 12 * pyScale.scale,
          vx: -s.speed * 0.45 - Math.random() * 3,
          vy: (Math.random() - 0.5) * 1.6,
          size: Math.random() * 2 + 1,
          color: selectedSkateboard.wheelColor || '#fff',
          alpha: 0.8,
          life: 0,
          maxLife: 15,
        });
      }
    }

    // Render active decaying blast particles
    particlesRef.current.forEach(part => {
      ctx.fillStyle = part.color;
      ctx.globalAlpha = part.alpha;
      ctx.beginPath();
      ctx.arc(part.x, part.y, part.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1.0; // restore
  };

  const drawCutePenguin = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, s: typeof stateRef.current) => {
    // Draw candidate penguin at player position
    // Center lane visual projection
    const parent = canvas;
    const pScale = project3D(11.2, s.playerVisualLane, s.playerY, parent.width, parent.height, s);

    if (pScale.scale < 0.1) return;

    const w = 48 * pScale.scale * 3.5;
    const h = 55 * pScale.scale * 3.5;

    ctx.save();
    ctx.translate(pScale.x, pScale.y);

    // Apply scaling / squashing jump deformation
    if (s.playerY > 0) {
      // Rotate skateboard tricks during jump!
      const spinAngle = (s.playerY * 0.02) % (Math.PI * 2);
      ctx.rotate(Math.sin(spinAngle) * 0.3);
    }

    // Squishing for slide crouching
    let slideYScale = 1.0;
    if (s.playerSlideTime > 0) {
      slideYScale = 0.42; // compressed penguin!
    }

    // Shading blink vulnerability
    if (s.playerHitCooldown > 0 && Math.floor(s.frameCount / 4) % 2 === 0) {
      ctx.globalAlpha = 0.3; // flicker opacity
    }

    // DRAW THE CIRCULAR DONUT SLED FIRST UNDER THE PENGUIN TO MATCH THE SCHEMATIC IN SCREENSHOTS!
    ctx.save();
    // Skateboard angle lean based on lane transition movement
    const laneShiftSpeed = s.playerLane - s.playerVisualLane;
    ctx.rotate(laneShiftSpeed * 0.25);

    const boardW = w * 1.35;
    const boardH = h * 0.15 * slideYScale;

    if (selectedSkateboard.id === 'frost_edge') {
      // 🛩️ GREEN AIRPLANE SLED (Screenshot 1-2 green airplane with wings & front yellow spinning propeller)
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = s.speed > 8 ? 8 : 2;

      // Symmetrical wood green wing panels fanning outward
      ctx.fillStyle = '#15803d'; // Forest green body shell
      ctx.strokeStyle = '#166534';
      ctx.lineWidth = 2 * pScale.scale;

      ctx.beginPath();
      // Left wings
      ctx.ellipse(-boardW * 0.48, h * 0.16, boardW * 0.35, boardH * 0.4, -0.15, 0, Math.PI * 2);
      // Right wings
      ctx.ellipse(boardW * 0.48, h * 0.16, boardW * 0.35, boardH * 0.4, 0.15, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();

      // Golden wing tips
      ctx.fillStyle = '#eab308'; // Bright yellow tips
      ctx.beginPath();
      ctx.ellipse(-boardW * 0.72, h * 0.12, boardW * 0.12, boardH * 0.3, -0.15, 0, Math.PI * 2);
      ctx.ellipse(boardW * 0.72, h * 0.12, boardW * 0.12, boardH * 0.3, 0.15, 0, Math.PI * 2);
      ctx.fill();

      // Nose fuselage
      ctx.fillStyle = '#16a34a';
      ctx.beginPath();
      ctx.ellipse(0, h * 0.14, boardW * 0.35, boardH * 1.25, 0, 0, Math.PI * 2);
      ctx.fill();

      // Spinning yellow propeller at the nose center
      ctx.save();
      ctx.translate(0, h * 0.24);
      ctx.rotate(s.gameTime * 22); // super high rotation
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2.5 * pScale.scale;
      ctx.beginPath();
      ctx.moveTo(0, -boardH * 1.8);
      ctx.lineTo(0, boardH * 1.8);
      ctx.stroke();

      // Propeller cap
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.arc(0, 0, boardW * 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

    } else if (selectedSkateboard.id === 'supernova') {
      // 🚀 ROCKET RETRO ENGINE SLED (Screenshot 7 twin cylindrical exhaust tubes firing flame)
      ctx.shadowColor = '#f97316';
      ctx.shadowBlur = s.speed > 8 ? 10 : 3;

      // Central platform metal plate
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.ellipse(0, h * 0.17, boardW * 0.48, boardH * 1.1, 0, 0, Math.PI * 2);
      ctx.fill();

      // Twin steel cylindrical engine canisters
      ctx.fillStyle = '#64748b';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1 * pScale.scale;

      // Left Rocket Cylinder
      ctx.beginPath();
      ctx.ellipse(-boardW * 0.35, h * 0.15, boardW * 0.15, boardH * 1.4, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      // Right Rocket Cylinder
      ctx.beginPath();
      ctx.ellipse(boardW * 0.35, h * 0.15, boardW * 0.15, boardH * 1.4, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();

      // Fire Exhaust nozzle outlets
      ctx.fillStyle = '#ea580c';
      ctx.fillRect(-boardW * 0.45, h * 0.04, boardW * 0.2, h * 0.04);
      ctx.fillRect(boardW * 0.25, h * 0.04, boardW * 0.2, h * 0.04);

      // Blazing rocket exhaust jets firing back!
      const flameP = Math.sin(s.gameTime * 30) * boardW * 0.2;
      const flameGrad = ctx.createLinearGradient(0, h * 0.12, 0, h * -0.4);
      flameGrad.addColorStop(0, '#f59e0b');
      flameGrad.addColorStop(0.5, '#ef4444');
      flameGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
      ctx.fillStyle = flameGrad;

      // Fire trail projections
      ctx.beginPath();
      ctx.moveTo(-boardW * 0.44, h * 0.08);
      ctx.lineTo(-boardW * 0.35, h * -0.15 - flameP);
      ctx.lineTo(-boardW * 0.26, h * 0.08);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(boardW * 0.26, h * 0.08);
      ctx.lineTo(boardW * 0.35, h * -0.15 - flameP);
      ctx.lineTo(boardW * 0.44, h * 0.08);
      ctx.closePath();
      ctx.fill();

    } else if (selectedSkateboard.id === 'std_wood') {
      // 🛷 TRADITIONAL SNOW sled Sleigh with custom wooden cross bars & ski rails
      ctx.shadowColor = '#d97706';
      ctx.shadowBlur = 3;

      // Parallel dark ski runners underneath
      ctx.fillStyle = '#451a03';
      ctx.fillRect(-boardW * 0.4, h * 0.19, boardW * 0.08, h * 0.1);
      ctx.fillRect(boardW * 0.32, h * 0.19, boardW * 0.08, h * 0.1);

      // Curve sleigh tips pointing forward
      ctx.fillStyle = '#ea580c'; // red sleigh tips
      ctx.beginPath();
      ctx.ellipse(-boardW * 0.36, h * 0.24, boardW * 0.05, boardH * 0.8, -0.4, 0, Math.PI * 2);
      ctx.ellipse(boardW * 0.36, h * 0.24, boardW * 0.05, boardH * 0.8, 0.4, 0, Math.PI * 2);
      ctx.fill();

      // Main heavy wood slats board
      ctx.fillStyle = '#854d0e'; // Warm natural oak
      ctx.strokeStyle = '#3f1a04';
      ctx.lineWidth = 1.5 * pScale.scale;

      ctx.beginPath();
      ctx.roundRect(-boardW * 0.3, h * 0.12, boardW * 0.6, h * 0.09 * slideYScale, 3);
      ctx.fill(); ctx.stroke();

      // Horizontal plank slats lines
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fillRect(-boardW * 0.24, h * 0.14, boardW * 0.48, h * 0.012);

    } else {
      // 🍩 MAG_CORE or DEFAULT NEON CYBER DONUT TIRE (Screenshot 3 & 7)
      ctx.fillStyle = selectedSkateboard.deckColor || '#f43f5e'; // Sweet glowing magenta/pink circular shell
      ctx.strokeStyle = selectedSkateboard.wheelColor || '#06b6d4'; // Cyber accent light frame
      ctx.lineWidth = 4 * pScale.scale;

      ctx.shadowColor = selectedSkateboard.wheelColor || '#06b6d4';
      ctx.shadowBlur = s.speed > 8 ? 12 : 5;
      ctx.beginPath();
      ctx.ellipse(0, h * 0.16, boardW * 0.58, h * 0.14 * slideYScale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0; // reset indicator

      // Sitting inner black tire core hole
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.ellipse(0, h * 0.16, boardW * 0.25, h * 0.05 * slideYScale, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Skate Spark Jet flame if boosts are running
    if (powerUpsRef.current.some(pw => pw.type === 'boost')) {
      const jetGrad = ctx.createLinearGradient(-boardW * 0.6, h * 0.14, -boardW * 1.2, h * 0.14);
      jetGrad.addColorStop(0, '#f43f5e');
      jetGrad.addColorStop(1, 'rgba(251, 191, 36, 0)');
      ctx.fillStyle = jetGrad;
      ctx.beginPath();
      ctx.moveTo(-boardW * 0.5, h * 0.08);
      ctx.lineTo(-boardW * 1.3, h * 0.14);
      ctx.lineTo(-boardW * 0.5, h * 0.2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // DRAW PENGUIN BODY
    const showFrontView = s.playerY > 0 || s.playerFrontViewTimer > 0;

    // Base oval shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(0, h * 0.18, w * 0.42, 6 * pScale.scale, 0, 0, Math.PI * 2);
    ctx.fill();

    // Main torso
    ctx.save();
    ctx.scale(1.0, slideYScale);

    // Deep realistic charcoal/blue plumage gradient body (biological shape)
    const primaryColor = selectedSkin.color || '#1e293b';
    const bodyGrad = ctx.createLinearGradient(0, -h * 0.9, 0, h * 0.1);
    bodyGrad.addColorStop(0, primaryColor);
    bodyGrad.addColorStop(0.6, '#0f172a'); // rich twilight body core
    bodyGrad.addColorStop(1, '#020617'); // dark shaded base tail feathers
    ctx.fillStyle = bodyGrad;

    // Craft a realistic tapering pear-shaped penguin body silhouette (joining head, neck, and full lower abdomen)
    ctx.beginPath();
    // Round smooth top of head
    ctx.moveTo(-w * 0.26, -h * 0.72);
    ctx.bezierCurveTo(-w * 0.28, -h * 0.95, w * 0.28, -h * 0.95, w * 0.26, -h * 0.72);
    // Sleek neck slope and shoulder expansion
    ctx.bezierCurveTo(w * 0.28, -h * 0.58, w * 0.45, -h * 0.46, w * 0.44, -h * 0.28);
    // Plump heavy lower belly sitting on board
    ctx.bezierCurveTo(w * 0.43, h * 0.08, -w * 0.43, h * 0.08, -w * 0.44, -h * 0.28);
    // Left shoulder and neck curve back to crown
    ctx.bezierCurveTo(-w * 0.45, -h * 0.46, -w * 0.28, -h * 0.58, -w * 0.26, -h * 0.72);
    ctx.closePath();
    ctx.fill();

    if (showFrontView) {
      // Emperor orange-gold throat collar gradient
      const throatGrad = ctx.createLinearGradient(0, -h * 0.68, 0, -h * 0.42);
      throatGrad.addColorStop(0, '#ea580c'); // warm fire-orange collar
      throatGrad.addColorStop(0.35, '#fbbf24'); // golden yellow sunshine blend
      throatGrad.addColorStop(1, selectedSkin.secondaryColor || '#f1f5f9'); // gradient down to stomach
      throatGrad.addColorStop(1, selectedSkin.secondaryColor || '#f1f5f9');

      // White gorgeous smooth breast overlay
      ctx.fillStyle = throatGrad;
      ctx.beginPath();
      ctx.moveTo(-w * 0.22, -h * 0.48);
      ctx.bezierCurveTo(-w * 0.22, -h * 0.64, w * 0.22, -h * 0.64, w * 0.22, -h * 0.48);
      ctx.bezierCurveTo(w * 0.33, -h * 0.22, w * 0.33, h * 0.03, 0, h * 0.04);
      ctx.bezierCurveTo(-w * 0.33, h * 0.03, -w * 0.33, -h * 0.22, -w * 0.22, -h * 0.48);
      ctx.closePath();
      ctx.fill();

      // Soft under shadow shading overlay on plump white belly for absolute high depth realism
      const bellyShadowDef = ctx.createRadialGradient(0, h * 0.05, 0, 0, -h * 0.15, w * 0.42);
      bellyShadowDef.addColorStop(0, 'rgba(148, 163, 184, 0.28)'); // slate shadow
      bellyShadowDef.addColorStop(0.6, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = bellyShadowDef;
      ctx.beginPath();
      ctx.ellipse(0, -h * 0.16, w * 0.3, h * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Natural flapping paddle-shaped wings fanning out with realistic biological shape trim
    const wingWiggle = Math.sin(s.gameTime * 14) * 0.25;

    // Left Wing (Paddle shape with leading edge light trim)
    ctx.save();
    ctx.translate(-w * 0.38, -h * 0.46);
    ctx.rotate(-0.35 + wingWiggle + laneShiftSpeed * 0.3);
    const flipperLeftGrad = ctx.createLinearGradient(0, 0, -w * 0.22, h * 0.42);
    flipperLeftGrad.addColorStop(0, primaryColor);
    flipperLeftGrad.addColorStop(0.5, '#0f172a');
    flipperLeftGrad.addColorStop(1, '#020617');
    ctx.fillStyle = flipperLeftGrad;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-w * 0.24, h * 0.15, -w * 0.26, h * 0.38, -w * 0.15, h * 0.45);
    ctx.bezierCurveTo(-w * 0.05, h * 0.42, w * 0.05, h * 0.24, w * 0.07, h * 0.05);
    ctx.closePath();
    ctx.fill();

    // Flipping white edge trim
    ctx.strokeStyle = 'rgba(241, 245, 249, 0.55)';
    ctx.lineWidth = 1 * pScale.scale;
    ctx.beginPath();
    ctx.moveTo(-w * 0.15, h * 0.45);
    ctx.bezierCurveTo(-w * 0.05, h * 0.42, w * 0.05, h * 0.24, w * 0.07, h * 0.05);
    ctx.stroke();
    ctx.restore();

    // Right Wing (Paddle shape)
    ctx.save();
    ctx.translate(w * 0.38, -h * 0.46);
    ctx.rotate(0.35 - wingWiggle - laneShiftSpeed * 0.3);
    const flipperRightGrad = ctx.createLinearGradient(0, 0, w * 0.22, h * 0.42);
    flipperRightGrad.addColorStop(0, primaryColor);
    flipperRightGrad.addColorStop(0.5, '#0f172a');
    flipperRightGrad.addColorStop(1, '#020617');
    ctx.fillStyle = flipperRightGrad;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(w * 0.24, h * 0.15, w * 0.26, h * 0.38, w * 0.15, h * 0.45);
    ctx.bezierCurveTo(w * 0.05, h * 0.42, -w * 0.05, h * 0.24, -w * 0.07, h * 0.05);
    ctx.closePath();
    ctx.fill();

    // Flipping white edge trim
    ctx.strokeStyle = 'rgba(241, 245, 249, 0.55)';
    ctx.lineWidth = 1 * pScale.scale;
    ctx.beginPath();
    ctx.moveTo(w * 0.15, h * 0.45);
    ctx.bezierCurveTo(w * 0.05, h * 0.42, -w * 0.05, h * 0.24, -w * 0.07, h * 0.05);
    ctx.stroke();
    ctx.restore();

    if (showFrontView) {
      // Elegant side golden/orange ear patches characteristic of real penguins
      ctx.fillStyle = '#f59e0b'; // warm crown yellow
      ctx.beginPath();
      ctx.ellipse(-w * 0.23, -h * 0.72, w * 0.1, h * 0.11, -0.4, 0, Math.PI * 2);
      ctx.ellipse(w * 0.23, -h * 0.72, w * 0.1, h * 0.11, 0.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ea580c'; // fiery core glow
      ctx.beginPath();
      ctx.ellipse(-w * 0.21, -h * 0.71, w * 0.05, h * 0.07, -0.4, 0, Math.PI * 2);
      ctx.ellipse(w * 0.21, -h * 0.71, w * 0.05, h * 0.07, 0.4, 0, Math.PI * 2);
      ctx.fill();

      // White gorgeous mask on face to nestle pupil sockets nicely
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-w * 0.12, -h * 0.75, w * 0.13, 0, Math.PI * 2);
      ctx.arc(w * 0.12, -h * 0.75, w * 0.13, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.ellipse(0, -h * 0.68, w * 0.16, h * 0.11, 0, 0, Math.PI * 2);
      ctx.fill();

      // Highly realistic animated eyes with depth (blue highlights & pupil scaling)
      const eyeBlink = Math.floor(s.frameCount / 140) % 20 === 0;

      if (eyeBlink) {
        // Sleek closed lids
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 3.2 * pScale.scale;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-w * 0.20, -h * 0.75);
        ctx.lineTo(-w * 0.05, -h * 0.75);
        ctx.moveTo(w * 0.05, -h * 0.75);
        ctx.lineTo(w * 0.20, -h * 0.75);
        ctx.stroke();
      } else {
        // Left Eye Depth
        ctx.save();
        ctx.translate(-w * 0.125, -h * 0.75);
        // Iris shadow
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(0, 0, w * 0.075, 0, Math.PI * 2);
        ctx.fill();
        // Pupil core
        ctx.fillStyle = '#020617';
        ctx.beginPath();
        ctx.arc(0, 0, w * 0.05, 0, Math.PI * 2);
        ctx.fill();
        // Glistening highlight reflections
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-w * 0.02, -h * 0.02, w * 0.026, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(w * 0.022, h * 0.022, w * 0.012, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Right Eye Depth
        ctx.save();
        ctx.translate(w * 0.125, -h * 0.75);
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(0, 0, w * 0.075, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#020617';
        ctx.beginPath();
        ctx.arc(0, 0, w * 0.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-w * 0.02, -h * 0.02, w * 0.026, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(w * 0.022, h * 0.022, w * 0.012, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Realistic beak bill (long, sleek, downward tapers with fiery side mandible highlight)
      const beakGrad = ctx.createLinearGradient(0, -h * 0.7, 0, -h * 0.55);
      beakGrad.addColorStop(0, '#090d16'); // dense dark obsidian upper ridge
      beakGrad.addColorStop(1, '#1e293b');
      ctx.fillStyle = beakGrad;

      ctx.beginPath();
      ctx.moveTo(-w * 0.09, -h * 0.68);
      ctx.bezierCurveTo(-w * 0.03, -h * 0.68, w * 0.03, -h * 0.68, w * 0.09, -h * 0.68);
      ctx.bezierCurveTo(w * 0.025, -h * 0.53, -w * 0.025, -h * 0.53, -w * 0.09, -h * 0.68);
      ctx.closePath();
      ctx.fill();

      // Bi-colored mandible stripe (Emperor species feature)
      ctx.fillStyle = '#ea580c'; // intense vibrant red-orange bill splash
      ctx.beginPath();
      ctx.moveTo(-w * 0.075, -h * 0.64);
      ctx.lineTo(w * 0.075, -h * 0.64);
      ctx.lineTo(0, -h * 0.53);
      ctx.closePath();
      ctx.fill();

      // Bill shine
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1 * pScale.scale;
      ctx.beginPath();
      ctx.moveTo(-w * 0.05, -h * 0.67);
      ctx.bezierCurveTo(0, -h * 0.66, w * 0.05, -h * 0.67, w * 0.05, -h * 0.67);
      ctx.stroke();
    }

    // Realistic webbed claws/feet sitting perfectly flat on snowboard
    // Left Foot
    ctx.save();
    ctx.translate(-w * 0.23, h * 0.1);
    ctx.fillStyle = '#f97316';
    ctx.strokeStyle = '#c2410c';
    ctx.lineWidth = 1 * pScale.scale;
    ctx.beginPath();
    ctx.moveTo(0, 0); // heel joint
    ctx.lineTo(-w * 0.12, h * 0.03); // outer webbed toe
    ctx.quadraticCurveTo(-w * 0.06, h * 0.06, -w * 0.04, h * 0.08); // webbing curve
    ctx.lineTo(0, h * 0.09); // center webbed toe
    ctx.quadraticCurveTo(w * 0.04, h * 0.06, w * 0.06, h * 0.08);
    ctx.lineTo(w * 0.1, h * 0.03); // inner webbed toe
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Nail tips
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(-w * 0.12, h * 0.03, 1.4 * pScale.scale, 0, Math.PI * 2);
    ctx.arc(0, h * 0.09, 1.4 * pScale.scale, 0, Math.PI * 2);
    ctx.arc(w * 0.1, h * 0.03, 1.4 * pScale.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Right Foot
    ctx.save();
    ctx.translate(w * 0.23, h * 0.1);
    ctx.fillStyle = '#f97316';
    ctx.strokeStyle = '#c2410c';
    ctx.lineWidth = 1 * pScale.scale;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-w * 0.1, h * 0.03);
    ctx.quadraticCurveTo(-w * 0.04, h * 0.06, -w * 0.06, h * 0.08);
    ctx.lineTo(0, h * 0.09);
    ctx.quadraticCurveTo(w * 0.06, h * 0.06, w * 0.04, h * 0.08);
    ctx.lineTo(w * 0.12, h * 0.03);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Nail tips
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(-w * 0.1, h * 0.03, 1.4 * pScale.scale, 0, Math.PI * 2);
    ctx.arc(0, h * 0.09, 1.4 * pScale.scale, 0, Math.PI * 2);
    ctx.arc(w * 0.12, h * 0.03, 1.4 * pScale.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // SKIN ACCESSORIES & HATS DRAWING
    ctx.restore(); // restore body squash scale to draw accessories with correct proportions

    const hatType = selectedSkin.hatType;

    if (hatType === 'scarf') {
      // Cute warm red/yellow winter stripey scarf waving on the wind!
      ctx.fillStyle = '#ef4444'; // Red base scarf knot
      ctx.beginPath();
      ctx.roundRect(-w * 0.35, -h * 0.52 * slideYScale, w * 0.7, h * 0.08, 3);
      ctx.fill();

      // scarf trails waving behind
      ctx.fillStyle = '#fbbf24'; // Yellow stripes
      const wave = Math.sin(s.gameTime * 15) * 12 * pScale.scale;
      ctx.beginPath();
      ctx.moveTo(-w * 0.22, -h * 0.48 * slideYScale);
      ctx.bezierCurveTo(
        -w * 0.5, -h * 0.45 * slideYScale - wave,
        -w * 0.65, -h * 0.35 * slideYScale + wave,
        -w * 0.9, -h * 0.38 * slideYScale + wave
      );
      ctx.lineTo(-w * 0.9, -h * 0.44 * slideYScale + wave);
      ctx.lineTo(-w * 0.22, -h * 0.48 * slideYScale);
      ctx.closePath();
      ctx.fillStyle = '#ef4444';
      ctx.fill();
    } else if (hatType === 'goggles') {
      // Winter scouting goggles strapped on head/visor
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-w * 0.38, -h * 0.78 * slideYScale);
      ctx.lineTo(w * 0.38, -h * 0.78 * slideYScale);
      ctx.stroke();

      if (showFrontView) {
        ctx.fillStyle = '#06b6d4'; // Cyan lenses
        ctx.shadowColor = '#06b6d4';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.roundRect(-w * 0.26, -h * 0.85 * slideYScale, w * 0.21, h * 0.12, 3);
        ctx.roundRect(w * 0.05, -h * 0.85 * slideYScale, w * 0.21, h * 0.12, 3);
        ctx.fill();
        ctx.shadowBlur = 0; // reset
      }
    } else if (hatType === 'neon_visor') {
      if (showFrontView) {
        // Cyber neon teal glowing eye glasses visor
        ctx.fillStyle = 'rgba(6,182,212,0.95)';
        ctx.shadowColor = '#22d3ee';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.roundRect(-w * 0.3, -h * 0.82 * slideYScale, w * 0.6, h * 0.08, 4);
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        // glowing band strap around the back
        ctx.strokeStyle = '#0891b2';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-w * 0.3, -h * 0.8 * slideYScale);
        ctx.lineTo(w * 0.3, -h * 0.8 * slideYScale);
        ctx.stroke();
      }
    } else if (hatType === 'wizard') {
      // Starry wizard velvet purple hat
      ctx.fillStyle = '#6d28d9';
      ctx.beginPath();
      ctx.moveTo(-w * 0.45, -h * 0.8 * slideYScale);
      ctx.lineTo(w * 0.45, -h * 0.8 * slideYScale);
      ctx.lineTo(w * 0.05, -h * 1.5 * slideYScale); // wizard peak tilted slightly
      ctx.closePath();
      ctx.fill();

      // yellow brim star
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(w * 0.05, -h * 1.5 * slideYScale, 3 * pScale.scale * 3.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (hatType === 'crown') {
      // Gold Emperor Crown
      ctx.fillStyle = '#fbbf24';
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-w * 0.3, -h * 0.8 * slideYScale);
      ctx.lineTo(-w * 0.35, -h * 1.05 * slideYScale); // peaks
      ctx.lineTo(-w * 0.15, -h * 0.9 * slideYScale);
      ctx.lineTo(0, -h * 1.15 * slideYScale); // middle peak
      ctx.lineTo(w * 0.15, -h * 0.9 * slideYScale);
      ctx.lineTo(w * 0.35, -h * 1.05 * slideYScale);
      ctx.lineTo(w * 0.3, -h * 0.8 * slideYScale);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // POWER-UP SHIELD / TURBO COSMIC RING VFX OVERLAYS
    if (powerUpsRef.current.some(p => p.type === 'shield')) {
      // Blue translucent protective ice shield ring
      const pulse = 1.0 + Math.sin(s.gameTime * 12) * 0.08;
      const grad = ctx.createRadialGradient(0, -h * 0.35, w * 0.5, 0, -h * 0.35, w * 1.05 * pulse);
      grad.addColorStop(0, 'rgba(56, 189, 248, 0)');
      grad.addColorStop(0.78, 'rgba(56, 189, 248, 0.45)');
      grad.addColorStop(0.95, '#e0f2fe');
      grad.addColorStop(1, 'rgba(255,255,255,0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, -h * 0.35, w * 1.15 * pulse, 0, Math.PI * 2);
      ctx.fill();
    }

    if (powerUpsRef.current.some(p => p.type === 'boost')) {
      // Red supersonic wind trail surrounding
      const rWave = Math.sin(s.gameTime * 20) * 8;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, -h * 0.3, w * 0.85 + rWave, h * 0.62 + rWave, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
    ctx.globalAlpha = 1.0; // reset
  };

  const drawVFXWarnings = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, s: typeof stateRef.current) => {
    // 1. Draw alert warning icons if boss attacks or snowballs are very close in our lane
    const warningFlash = Math.floor(s.frameCount / 12) % 2 === 0;

    obstaclesRef.current.forEach(obs => {
      // Draw red warning arrows if a giant snowball or polar bear is incoming fast!
      if (obs.x > 80 && obs.x < 115 && obs.lane === s.playerLane && !obs.passed) {
        if (warningFlash) {
          ctx.font = 'bold 30px sans-serif';
          ctx.fillStyle = '#ef4444';
          ctx.textAlign = 'center';
          ctx.fillText('⚠️', canvas.width * 0.5, canvas.height * 0.48);
        }
      }
    });

    // 2. Missile sights target cursor in boss battles
    if (s.gameState === 'boss_battle') {
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 13px Courier New';
      ctx.textAlign = 'center';

      if (s.missiles > 0) {
        ctx.fillStyle = '#22c55e';
        ctx.fillText(`🚀 [ENTER/TAP FIRE] AMMO: ${s.missiles}/5`, canvas.width * 0.5, canvas.height * 0.88);
      } else {
        ctx.fillStyle = '#ef4444';
        ctx.fillText('⚠️ NO MISSILE AMMO! COLLECT BOXES!', canvas.width * 0.5, canvas.height * 0.88);
      }
    }
  };

  return (
    <div className="relative w-full h-full cursor-pointer select-none overflow-hidden rounded-2xl border border-sky-950 bg-slate-950 shadow-2xl shadow-cyan-950/20">
      {/* HTML5 Canvas viewport rendering */}
      <canvas
        ref={canvasRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="block w-full h-full touch-none"
        id="penguin_rush_canvas"
      />

      {/* active state counters rendering */}
      {gameState === 'playing' && (
        <div className="absolute top-4 left-4 flex flex-col gap-1.5 pointer-events-none md:top-6 md:left-6 md:gap-2">
          {/* Active Power-up Progress bars side rail */}
          {activePowerUps.map(pw => {
            let label = 'BOOST';
            let bgTheme = 'bg-rose-500';

            switch (pw.type) {
              case 'boost': label = '🚀 CYBER TURBO'; bgTheme = 'bg-rose-500'; break;
              case 'magnet': label = '🧲 COIN VACUUM'; bgTheme = 'bg-amber-500'; break;
              case 'double': label = '⭐ DOUBLE SCORE'; bgTheme = 'bg-emerald-500'; break;
              case 'shield': label = '🛡️ ICE SHIELD'; bgTheme = 'bg-purple-500'; break;
              case 'superjump': label = '⚡ SUPER JUMP'; bgTheme = 'bg-indigo-500'; break;
            }

            const percent = Math.min(100, Math.max(0, (pw.timeLeft / pw.duration) * 100));

            return (
              <div key={pw.type} className="flex flex-col w-36 gap-0.5 md:w-44">
                <span className="text-[10px] md:text-xs font-mono font-bold text-white drop-shadow">{label}</span>
                <div className="h-1.5 w-full rounded bg-slate-900/60 p-0.5 border border-slate-700/30 overflow-hidden">
                  <div className={`h-full rounded-sm ${bgTheme} transition-all duration-75`} style={{ width: `${percent}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dynamic Virtual Touch Gamepad Overlay */}
      {(gameState === 'playing' || gameState === 'boss_battle') && (
        <>
          {showTouchControls ? (
            <>
              {/* Left Control Group (Move Left & Move Right) */}
              <div className="absolute bottom-5 left-5 z-25 flex items-center gap-3.5 pointer-events-auto select-none">
                {/* Shift Left Button */}
                <button
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    throttleButtonInput(() => {
                      const s = stateRef.current;
                      if (s.playerLane > 0) {
                        s.playerLane -= 1;
                        gameAudio.playSlide();
                      }
                    });
                  }}
                  className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-cyan-400 bg-slate-950/85 text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.4)] hover:scale-105 active:scale-90 hover:bg-slate-900 transition-all cursor-pointer backdrop-blur-sm"
                  title="Move Left"
                >
                  <ChevronLeft className="h-7 w-7 stroke-[3]" />
                </button>

                {/* Shift Right Button */}
                <button
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    throttleButtonInput(() => {
                      const s = stateRef.current;
                      if (s.playerLane < LANES_COUNT - 1) {
                        s.playerLane += 1;
                        gameAudio.playSlide();
                      }
                    });
                  }}
                  className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-cyan-400 bg-slate-950/85 text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.4)] hover:scale-105 active:scale-90 hover:bg-slate-900 transition-all cursor-pointer backdrop-blur-sm"
                  title="Move Right"
                >
                  <ChevronRight className="h-7 w-7 stroke-[3]" />
                </button>
              </div>

              {/* Right Control Group: Actions (Jump, Slide, Fire) */}
              <div className="absolute bottom-5 right-5 z-25 flex flex-col gap-2 items-end pointer-events-auto select-none">
                {/* Hide touch controls button */}
                <button
                  onTouchStart={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowTouchControls(false);
                  }}
                  onClick={() => setShowTouchControls(false)}
                  className="h-6 px-2 rounded-full border border-slate-700 bg-slate-950/80 flex items-center justify-center text-[9px] font-mono font-bold text-slate-400 hover:text-white hover:border-slate-500 transition cursor-pointer mb-1 shadow-md"
                  title="Hide gamepad"
                >
                  ✕ HIDE CONTROL
                </button>

                <div className="flex gap-3.5">
                  {/* Slide / Crouch Button */}
                  <button
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      throttleButtonInput(() => {
                        const s = stateRef.current;
                        if (s.playerY === 0) {
                          s.playerSlideTime = 25;
                          gameAudio.playSlide();
                          onAchievementProgress('slide_pipes', 1);
                        } else {
                          s.playerJumpV = -10;
                        }
                      });
                    }}
                    className="flex h-14 w-14 flex-col items-center justify-center rounded-full border-2 border-pink-500 bg-pink-950/84 text-pink-300 shadow-[0_0_12px_rgba(244,63,94,0.4)] hover:scale-105 active:scale-90 hover:bg-pink-900/40 transition-all cursor-pointer backdrop-blur-sm"
                    title="Slide / Crouch (Down)"
                  >
                    <ArrowDown className="h-5 w-5 stroke-[3]" />
                    <span className="text-[7px] font-bold font-mono tracking-tighter leading-none">SLIDE</span>
                  </button>

                  {/* Jump Button */}
                  <button
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      throttleButtonInput(() => {
                        const s = stateRef.current;
                        if (s.playerY === 0 && s.playerSlideTime === 0) {
                          const skateBonus = selectedSkateboard.jumpMultiplier;
                          const superjumpActive = powerUpsRef.current.some(p => p.type === 'superjump');
                          const jumpPower = 9.5 * (superjumpActive ? 1.6 : 1.0) * skateBonus;
                          s.playerJumpV = jumpPower;
                          s.playerY = 1;
                          gameAudio.playJump();
                          onAchievementProgress('daily_jumps', 1);
                        }
                      });
                    }}
                    className="flex h-14 w-14 flex-col items-center justify-center rounded-full border-2 border-emerald-500 bg-emerald-950/85 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.4)] hover:scale-105 active:scale-90 hover:bg-emerald-900/40 transition-all cursor-pointer backdrop-blur-sm"
                    title="Jump (Up)"
                  >
                    <ArrowUp className="h-5 w-5 stroke-[3]" />
                    <span className="text-[7px] font-bold font-mono tracking-tighter leading-none">JUMP</span>
                  </button>

                  {/* Unified Fire Missile Button (Visible in Action bar when gamepad is up!) */}
                  {gameState === 'boss_battle' && stateRef.current.missiles > 0 && (
                    <button
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        throttleButtonInput(handleMobileFire);
                      }}
                      className="flex h-14 w-14 flex-col items-center justify-center rounded-full border-2 border-teal-400 bg-teal-950/85 text-teal-300 shadow-[0_0_14px_rgba(45,212,191,0.5)] hover:scale-105 active:scale-90 hover:bg-teal-900/40 transition-all cursor-pointer backdrop-blur-sm animate-pulse"
                      title="Fire Frozen Fish Missile"
                    >
                      <span className="text-base">🚀</span>
                      <span className="text-[7px] font-bold font-mono tracking-tighter leading-none mt-0.5">LAUNCH</span>
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* Mini floating controller reactivation bubble */
            <button
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowTouchControls(true);
              }}
              className="absolute bottom-5 left-5 z-25 h-9 px-3 rounded-full border-2 border-cyan-400 bg-slate-950/90 text-cyan-300 hover:bg-slate-900 hover:text-white flex items-center gap-1.5 shadow-[0_0_10px_rgba(34,211,238,0.3)] active:scale-95 transition-all text-xs font-bold cursor-pointer backdrop-blur-sm"
              title="Show interactive touch gamepad"
            >
              <span>🎮</span>
              <span className="text-[10px] font-mono tracking-wide">TOUCH ON</span>
            </button>
          )}
        </>
      )}

      {/* Legacy/Fallback trigger button overlay for mobile devices when gamepad controls are collapsed */}
      {!showTouchControls && gameState === 'boss_battle' && stateRef.current.missiles > 0 && (
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            throttleButtonInput(handleMobileFire);
          }}
          id="btn_mobile_fire_missile"
          className="absolute bottom-6 right-6 z-20 flex h-14 w-14 items-center justify-center rounded-full border-2 border-teal-400 bg-teal-950/90 text-2xl text-white shadow-xl shadow-teal-900/40 transition-all active:scale-90 select-none cursor-pointer pointer-events-auto"
        >
          🚀
        </button>
      )}
    </div>
  );
}
