/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Difficulty = 'easy' | 'medium' | 'hard' | 'extreme';

export type GameState = 'menu' | 'playing' | 'paused' | 'gameover' | 'victory' | 'boss_introduction' | 'boss_battle';

export interface Skin {
  id: string;
  name: string;
  description: string;
  cost: number;
  unlocked: boolean;
  color: string; // Hex or CSS color
  secondaryColor: string;
  hatType: 'none' | 'goggles' | 'scarf' | 'crown' | 'wizard' | 'neon_visor';
}

export interface Skateboard {
  id: string;
  name: string;
  description: string;
  cost: number;
  unlocked: boolean;
  deckColor: string;
  wheelColor: string;
  speedMultiplier: number;
  jumpMultiplier: number;
  magnetRangeMultiplier: number;
}

export type PowerUpType = 'boost' | 'magnet' | 'double' | 'shield' | 'superjump';

export interface ActivePowerUp {
  type: PowerUpType;
  timeLeft: number; // millisecond or tick count
  duration: number; // initial duration
}

export type ObstacleType =
  | 'ice_barrier'
  | 'snow_truck'
  | 'frozen_pipe'
  | 'falling_icicle'
  | 'cracked_ice'
  | 'abandoned_vehicle'
  | 'giant_snowball'
  | 'polar_bear'
  | 'security_drone';

export interface Obstacle {
  id: string;
  x: number; // horizontal distance along track
  lane: number; // 0, 1, or 2 (representing lanes: Top/Back, Middle, Bottom/Front)
  yOffset: number; // for jumping/flying obstacles (like drones or falling icicles)
  type: ObstacleType;
  width: number;
  height: number;
  length: number; // depth scale along tracking
  passed: boolean;
  behaviorState?: any; // internal calculations for custom logic (e.g., falling trigger, snowball rolling)
}

export interface Coin {
  id: string;
  x: number;
  lane: number;
  yOffset: number;
  collected: boolean;
  isDiamond: boolean; // rare coin
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
}

export interface LeaderboardEntry {
  name: string;
  score: number;
  distance: number;
  date: string;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  target: number;
  progress: number;
  rewardCoins: number;
  completed: boolean;
}

export interface DailyChallenge {
  id: string;
  description: string;
  target: number;
  progress: number;
  reward: number;
  completed: boolean;
  claimed: boolean;
}

export interface SaveData {
  coins: number;
  highScore: number;
  maxDistance: number;
  selectedSkin: string;
  selectedSkateboard: string;
  skins: Skin[];
  skateboards: Skateboard[];
  leaderboard: LeaderboardEntry[];
  achievements: Achievement[];
  dailyChallenges: DailyChallenge[];
  lastChallengeReset: number;
  lastLoginClaimTime?: number;
  dailyLoginStreak?: number;
}
