/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SaveData, Skin, Skateboard, Achievement, DailyChallenge, LeaderboardEntry } from '../types';

const INITIAL_SKINS: Skin[] = [
  {
    id: 'classic',
    name: 'Slider Kid',
    description: 'The standard cool penguin ready to shred.',
    cost: 0,
    unlocked: true,
    color: '#1e293b', // Deep charcoal slate blue
    secondaryColor: '#f1f5f9', // Clean off white
    hatType: 'scarf',
  },
  {
    id: 'explorer',
    name: 'Goggle Scout',
    description: 'Equipped with cold-weather goggles for sub-zero speeds.',
    cost: 150,
    unlocked: false,
    color: '#0284c7', // Sky blue
    secondaryColor: '#e0f2fe',
    hatType: 'goggles',
  },
  {
    id: 'neon',
    name: 'Nocturne Wave',
    description: 'Imbued with bioluminescent cyan markings for night cruising.',
    cost: 400,
    unlocked: false,
    color: '#06b6d4', // Cyan
    secondaryColor: '#ecfeff',
    hatType: 'neon_visor',
  },
  {
    id: 'ninja',
    name: 'Ninja Shadow',
    description: 'Silent and stealthy. Cuts through wind resistance effortlessly.',
    cost: 800,
    unlocked: false,
    color: '#18181b', // Pitch black
    secondaryColor: '#ef4444', // Red scarf/accent
    hatType: 'none',
  },
  {
    id: 'wizard',
    name: 'Glacial Sorcerer',
    description: 'Can summon frost shields and command runic jump spells.',
    cost: 1500,
    unlocked: false,
    color: '#6d28d9', // Royal violet
    secondaryColor: '#f5f3ff',
    hatType: 'wizard',
  },
  {
    id: 'emperor',
    name: 'Gold Emperor',
    description: 'The supreme royalty of the Frozen City.',
    cost: 3000,
    unlocked: false,
    color: '#eab308', // Shiny gold
    secondaryColor: '#fffbeb',
    hatType: 'crown',
  },
];

const INITIAL_SKATEBOARDS: Skateboard[] = [
  {
    id: 'std_wood',
    name: 'Wooden Classic',
    description: 'A responsive reliable deck polished for icy pavement.',
    cost: 0,
    unlocked: true,
    deckColor: '#b45309', // Amber-wood
    wheelColor: '#ef4444', // Red
    speedMultiplier: 1.0,
    jumpMultiplier: 1.0,
    magnetRangeMultiplier: 1.0,
  },
  {
    id: 'neon_slick',
    name: 'Neon Cyberdeck',
    description: 'Magnetic wheels reduce sliding drag in style.',
    cost: 250,
    unlocked: false,
    deckColor: '#06b6d4', // Cyan
    wheelColor: '#f43f5e', // Hot pink
    speedMultiplier: 1.15,
    jumpMultiplier: 1.0,
    magnetRangeMultiplier: 1.1,
  },
  {
    id: 'frost_edge',
    name: 'Glacier Wing',
    description: 'A light composite board designed for incredible jump height.',
    cost: 650,
    unlocked: false,
    deckColor: '#38bdf8', // Blue sky
    wheelColor: '#ffffff', // White
    speedMultiplier: 1.1,
    jumpMultiplier: 1.25,
    magnetRangeMultiplier: 1.1,
  },
  {
    id: 'mag_core',
    name: 'Force Harvester',
    description: 'Generates a passive coin-attracting hyper-density field.',
    cost: 1200,
    unlocked: false,
    deckColor: '#10b981', // Emerald
    wheelColor: '#1e1b4b', // Deep purple
    speedMultiplier: 1.05,
    jumpMultiplier: 1.1,
    magnetRangeMultiplier: 2.0,
  },
  {
    id: 'supernova',
    name: 'Hyper-Engine Jet',
    description: 'The pinnacle of tech. Thrusters in the back for insane speeds.',
    cost: 2500,
    unlocked: false,
    deckColor: '#f43f5e',
    wheelColor: '#fbbf24',
    speedMultiplier: 1.35,
    jumpMultiplier: 1.35,
    magnetRangeMultiplier: 1.4,
  },
];

const INITIAL_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'slide_pipes',
    title: 'Frost Slider',
    description: 'Slide under 5 frozen pipes securely.',
    target: 5,
    progress: 0,
    rewardCoins: 100,
    completed: false,
  },
  {
    id: 'collect_coins',
    title: 'Fish Millionaire',
    description: 'Collect a total of 300 fish coins across levels.',
    target: 300,
    progress: 0,
    rewardCoins: 150,
    completed: false,
  },
  {
    id: 'shield_breaks',
    title: 'Battering Ram',
    description: 'Shatter 8 obstacles while shielded with the Ice Shield.',
    target: 8,
    progress: 0,
    rewardCoins: 200,
    completed: false,
  },
  {
    id: 'defeat_boss',
    title: 'Robo Tamer',
    description: 'Win a boss battle against the giant robotic polar bear.',
    target: 1,
    progress: 0,
    rewardCoins: 500,
    completed: false,
  },
  {
    id: 'score_ach',
    title: 'Blizzard Legend',
    description: 'Score 5,000 points in a single run.',
    target: 5000,
    progress: 0,
    rewardCoins: 250,
    completed: false,
  },
  {
    id: 'distance_ach',
    title: 'Long-Distance Commute',
    description: 'Survive for a distance of 1,200 meters in one run.',
    target: 1200,
    progress: 0,
    rewardCoins: 300,
    completed: false,
  }
];

const INITIAL_LEADERBOARD: LeaderboardEntry[] = [
  { name: 'SlipperySam', score: 6500, distance: 1500, date: '2026-06-10' },
  { name: 'AuroraShred', score: 4800, distance: 1100, date: '2026-06-09' },
  { name: 'Pudge_007', score: 3200, distance: 850, date: '2026-06-08' },
  { name: 'IceGlide', score: 1800, distance: 600, date: '2026-06-07' },
  { name: 'TobogganPro', score: 950, distance: 400, date: '2026-06-06' }
];

const DAILY_CHALLENGE_POOL: Omit<DailyChallenge, 'progress' | 'completed' | 'claimed'>[] = [
  { id: 'daily_coins', description: 'Collect 50 fish coins in a single run', target: 50, reward: 80 },
  { id: 'daily_distance', description: 'Glide 600 meters in a single run', target: 600, reward: 80 },
  { id: 'daily_powerups', description: 'Pick up 4 power-ups in any mode', target: 4, reward: 100 },
  { id: 'daily_jumps', description: 'Perform 15 super-jumps or jumps', target: 15, reward: 60 },
  { id: 'daily_diamonds', description: 'Find and collect 3 rare diamond coins', target: 3, reward: 120 }
];

export function getInitialSaveData(): SaveData {
  return {
    coins: 30, // give small starting funds
    highScore: 0,
    maxDistance: 0,
    selectedSkin: 'classic',
    selectedSkateboard: 'std_wood',
    skins: INITIAL_SKINS,
    skateboards: INITIAL_SKATEBOARDS,
    leaderboard: INITIAL_LEADERBOARD,
    achievements: INITIAL_ACHIEVEMENTS,
    dailyChallenges: getRandomDailyChallenges(),
    lastChallengeReset: Date.now()
  };
}

function getRandomDailyChallenges(): DailyChallenge[] {
  // Select 2 unique daily challenges randomly
  const shuffled = [...DAILY_CHALLENGE_POOL].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 2).map(challenge => ({
    ...challenge,
    progress: 0,
    completed: false,
    claimed: false
  }));
}

export function loadSaveData(): SaveData {
  try {
    const data = localStorage.getItem('penguin_rush_save_data');
    if (!data) {
      const init = getInitialSaveData();
      saveSaveData(init);
      return init;
    }
    const parsed = JSON.parse(data);

    // Verify consistency & apply updates if new properties added
    const defaults = getInitialSaveData();
    let hasChanges = false;

    if (parsed.skins === undefined || parsed.skins.length === 0) {
      parsed.skins = defaults.skins;
      hasChanges = true;
    }
    if (parsed.skateboards === undefined || parsed.skateboards.length === 0) {
      parsed.skateboards = defaults.skateboards;
      hasChanges = true;
    }
    if (parsed.achievements === undefined || parsed.achievements.length === 0) {
      parsed.achievements = defaults.achievements;
      hasChanges = true;
    }
    if (parsed.leaderboard === undefined) {
      parsed.leaderboard = defaults.leaderboard;
      hasChanges = true;
    }

    // Check if daily challenges need resetting (every 24 hours)
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    if (!parsed.lastChallengeReset || now - parsed.lastChallengeReset > oneDay || !parsed.dailyChallenges || parsed.dailyChallenges.length === 0) {
      parsed.dailyChallenges = getRandomDailyChallenges();
      parsed.lastChallengeReset = now;
      hasChanges = true;
    }

    if (hasChanges) {
      saveSaveData(parsed);
    }
    return parsed;
  } catch (e) {
    console.error('Error loading save data:', e);
    return getInitialSaveData();
  }
}

export function saveSaveData(data: SaveData): void {
  try {
    localStorage.setItem('penguin_rush_save_data', JSON.stringify(data));
  } catch (e) {
    console.error('Error saving save data:', e);
  }
}
