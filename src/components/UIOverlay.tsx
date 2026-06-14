/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { GameState, Difficulty, Skin, Skateboard, LeaderboardEntry, Achievement, DailyChallenge, SaveData } from '../types';
import { Play, Trophy, ShoppingBag, Award, Volume2, VolumeX, Sparkles, RefreshCw, X, Shield, Zap, Flame, Compass, Coins, CircleCheck, Music, SkipForward, Tv, Video, Gamepad2, Gift } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { gameAudio } from './AudioSystem';
import { platformSdk, GamePlatform } from '../utils/platformSdk';

interface UIOverlayProps {
  gameState: GameState;
  difficulty: Difficulty;
  setDifficulty: (diff: Difficulty) => void;
  saveData: SaveData;
  setSaveData: React.Dispatch<React.SetStateAction<SaveData>>;
  currentCoins: number;
  currentDistance: number;
  currentScore: number;
  onStartGame: () => void;
  onResetGame: () => void;
  muted: boolean;
  onToggleMute: () => void;
  lastResults: { score: number; distance: number; coins: number } | null;
  screenMode: 'phone' | 'big';
  onToggleScreenMode: () => void;
  targetDistance: number;
  setTargetDistance: (dist: number) => void;
}

export default function UIOverlay({
  gameState,
  difficulty,
  setDifficulty,
  saveData,
  setSaveData,
  currentCoins,
  currentDistance,
  currentScore,
  onStartGame,
  onResetGame,
  muted,
  onToggleMute,
  lastResults,
  screenMode,
  onToggleScreenMode,
  targetDistance,
  setTargetDistance,
}: UIOverlayProps) {
  const [activeTab, setActiveTab] = useState<'menu' | 'shop' | 'leaderboard' | 'achievements' | 'daily'>('menu');
  const [shopCategory, setShopCategory] = useState<'skins' | 'skateboards'>('skins');
  const [playerNameInput, setPlayerNameInput] = useState('SkaterPenguin');
  const [currentTrackIndex, setCurrentTrackIndex] = useState(gameAudio.getCurrentTrackIndex());

  const [platform, setPlatform] = useState<GamePlatform>(platformSdk.getPlatform());
  const [isAdPlaying, setIsAdPlaying] = useState(false);
  const [adSuccessMessage, setAdSuccessMessage] = useState<string | null>(null);
  const [dailySuccessMsg, setDailySuccessMsg] = useState<string | null>(null);
  const [autoRestartCountdown, setAutoRestartCountdown] = useState<number | null>(null);

  const [isDoubleClaimed, setIsDoubleClaimed] = useState(false);

  // No auto-restart game when game over or victory so player can read popup stats, double rewards, etc.
  useEffect(() => {
    setAutoRestartCountdown(null);
    if (gameState === 'playing' || gameState === 'menu') {
      setIsDoubleClaimed(false);
    }
  }, [gameState]);

  // Sync state initially
  useEffect(() => {
    setPlatform(platformSdk.getPlatform());
  }, []);

  const handleSelectPlatform = (selected: GamePlatform) => {
    platformSdk.setPlatformPreference(selected);
    setPlatform(selected);
  };

  const handleWatchAdDirectCoins = () => {
    setIsAdPlaying(true);
    setAdSuccessMessage(null);
    const wasMuted = gameAudio.getMuted();
    if (!wasMuted) gameAudio.setMute(true);

    platformSdk.showRewardedAd(
      () => {
        console.log('[UIOverlay] Rewarded Ad Commercial Started');
      },
      () => {
        setIsAdPlaying(false);
        if (!wasMuted) gameAudio.setMute(false);

        const updatedCoins = saveData.coins + 100;
        const newData = {
          ...saveData,
          coins: updatedCoins
        };
        setSaveData(newData);
        localStorage.setItem('penguin_rush_save_data', JSON.stringify(newData));

        setAdSuccessMessage('🪙 +100 BONUSES EARNED COMPLIMENTS OF PLATFORM SDK!');
        setTimeout(() => setAdSuccessMessage(null), 4500);
      },
      () => {
        setIsAdPlaying(false);
        if (!wasMuted) gameAudio.setMute(false);
        setAdSuccessMessage('⚠️ SPONSOR CAMPAIGN PREEMPTED OR FAILING');
        setTimeout(() => setAdSuccessMessage(null), 3000);
      }
    );
  };

  const handleDoubleCoinsAd = () => {
    if (!lastResults || isDoubleClaimed) return;
    setIsAdPlaying(true);
    setAdSuccessMessage(null);
    const wasMuted = gameAudio.getMuted();
    if (!wasMuted) gameAudio.setMute(true);

    platformSdk.showRewardedAd(
      () => {
        console.log('[UIOverlay] Double Coins Reward Sequence Triggered');
      },
      () => {
        setIsAdPlaying(false);
        if (!wasMuted) gameAudio.setMute(false);

        const bonus = lastResults.coins; // double rewards!
        const updatedCoins = saveData.coins + bonus;
        const newData = {
          ...saveData,
          coins: updatedCoins
        };
        setSaveData(newData);
        localStorage.setItem('penguin_rush_save_data', JSON.stringify(newData));

        setAdSuccessMessage(`🪙 +${bonus} EXTRA FISH COINS CLAIMED SUCCESSFULLY!`);
        setIsDoubleClaimed(true);
        setTimeout(() => setAdSuccessMessage(null), 4500);
      },
      () => {
        setIsAdPlaying(false);
        if (!wasMuted) gameAudio.setMute(false);
        setAdSuccessMessage('⚠️ AD BLOCKED OR CANCELLED');
        setTimeout(() => setAdSuccessMessage(null), 3500);
      }
    );
  };

  const handleSelectTrack = (idx: number) => {
    gameAudio.selectTrack(idx);
    setCurrentTrackIndex(idx);
  };

  const handleNextTrack = () => {
    gameAudio.nextTrack();
    setCurrentTrackIndex(gameAudio.getCurrentTrackIndex());
  };

  // Multiplier descriptions
  const getSkateboardBonuses = (board: Skateboard) => {
    const arr = [];
    if (board.speedMultiplier > 1) arr.push(`+${Math.round((board.speedMultiplier - 1) * 100)}% Speed`);
    if (board.jumpMultiplier > 1) arr.push(`+${Math.round((board.jumpMultiplier - 1) * 100)}% Jump`);
    if (board.magnetRangeMultiplier > 1) arr.push(`+${Math.round((board.magnetRangeMultiplier - 1) * 100)}% Magnet`);
    return arr.length > 0 ? arr.join(', ') : 'Standard specs';
  };

  // Buy Skin action
  const handleBuySkin = (skin: Skin) => {
    if (saveData.coins < skin.cost) return;

    const updatedSkins = saveData.skins.map(s => {
      if (s.id === skin.id) return { ...s, unlocked: true };
      return s;
    });

    const newData = {
      ...saveData,
      coins: saveData.coins - skin.cost,
      skins: updatedSkins,
      selectedSkin: skin.id,
    };
    setSaveData(newData);
    localStorage.setItem('penguin_rush_save_data', JSON.stringify(newData));
  };

  // Equip Skin action
  const handleEquipSkin = (skin: Skin) => {
    const newData = {
      ...saveData,
      selectedSkin: skin.id,
    };
    setSaveData(newData);
    localStorage.setItem('penguin_rush_save_data', JSON.stringify(newData));
  };

  // Buy Skateboard action
  const handleBuySkateboard = (board: Skateboard) => {
    if (saveData.coins < board.cost) return;

    const updatedBoards = saveData.skateboards.map(b => {
      if (b.id === board.id) return { ...b, unlocked: true };
      return b;
    });

    const newData = {
      ...saveData,
      coins: saveData.coins - board.cost,
      skateboards: updatedBoards,
      selectedSkateboard: board.id,
    };
    setSaveData(newData);
    localStorage.setItem('penguin_rush_save_data', JSON.stringify(newData));
  };

  // Equip Skateboard action
  const handleEquipSkateboard = (board: Skateboard) => {
    const newData = {
      ...saveData,
      selectedSkateboard: board.id,
    };
    setSaveData(newData);
    localStorage.setItem('penguin_rush_save_data', JSON.stringify(newData));
  };

  // Claim Achievement reward
  const handleClaimAchievement = (ach: Achievement) => {
    if (!ach.completed) return;

    // We flag by modifying title or removing, let's keep it and set points
    const updatedAchievements = saveData.achievements.map(a => {
      if (a.id === ach.id) {
        return { ...a, completed: false, progress: 0, target: a.target * 1.5, rewardCoins: Math.round(a.rewardCoins * 1.3) }; // upgrade achievement to next tier
      }
      return a;
    });

    const newData = {
      ...saveData,
      coins: saveData.coins + ach.rewardCoins,
      achievements: updatedAchievements,
    };
    setSaveData(newData);
    localStorage.setItem('penguin_rush_save_data', JSON.stringify(newData));
  };

  // Claim Daily Challenge reward
  const handleClaimDailyChallenge = (challenge: DailyChallenge) => {
    if (!challenge.completed || challenge.claimed) return;

    const updatedChallenges = saveData.dailyChallenges.map(c => {
      if (c.id === challenge.id) return { ...c, claimed: true };
      return c;
    });

    const newData = {
      ...saveData,
      coins: saveData.coins + challenge.reward,
      dailyChallenges: updatedChallenges,
    };
    setSaveData(newData);
    localStorage.setItem('penguin_rush_save_data', JSON.stringify(newData));
  };

  // Claim Daily Login Reward Calendar
  const handleClaimDailyReward = () => {
    const lastClaim = saveData.lastLoginClaimTime || 0;
    const now = Date.now();
    const timeSinceLastClaim = now - lastClaim;
    const canClaim = lastClaim === 0 || timeSinceLastClaim >= 18 * 60 * 60 * 1000;
    if (!canClaim) return;

    const streakBroken = lastClaim > 0 && timeSinceLastClaim > 42 * 60 * 60 * 1000;
    const nextStreak = streakBroken ? 1 : ((saveData.dailyLoginStreak || 0) % 5) + 1;

    const rewards = [50, 120, 200, 350, 600];
    const rewardAmt = rewards[(nextStreak - 1) % 5];

    const updatedCoins = saveData.coins + rewardAmt;
    const newData: SaveData = {
      ...saveData,
      coins: updatedCoins,
      lastLoginClaimTime: now,
      dailyLoginStreak: nextStreak,
    };

    setSaveData(newData);
    localStorage.setItem('penguin_rush_save_data', JSON.stringify(newData));
    gameAudio.playVictory();

    setDailySuccessMsg(`🎁 Day ${nextStreak} Login claimed! Added 🪙 ${rewardAmt} Fish Coins!`);
    setTimeout(() => {
      setDailySuccessMsg(null);
    }, 4500);
  };

  // Save score to leaderboard
  const handleSaveToLeaderboard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lastResults) return;

    // Dispatch to the active platform's native highscore leaderboards
    platformSdk.submitScore(lastResults.score);

    const newEntry: LeaderboardEntry = {
      name: playerNameInput.trim() || 'Anonymous',
      score: lastResults.score,
      distance: lastResults.distance,
      date: new Date().toISOString().split('T')[0],
    };

    const newLeaderboard = [...saveData.leaderboard, newEntry]
      .sort((a, b) => b.score - a.score)
      .slice(0, 8); // Keep top 8

    const newData = {
      ...saveData,
      leaderboard: newLeaderboard,
    };
    setSaveData(newData);
    localStorage.setItem('penguin_rush_save_data', JSON.stringify(newData));
    onResetGame(); // Close the gameover popup modal and return to menu
    setActiveTab('leaderboard');
  };

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-4 Pointer-events-none md:p-6" id="ui_overlay_main">
      <AnimatePresence mode="wait">
        {/* MENU / OVERLAYS CONTAINER */}
        {gameState === 'menu' && (
          <motion.div
            key="overlay_menu"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="pointer-events-auto flex flex-col w-full max-w-2xl max-h-[90%] overflow-hidden rounded-2xl border border-sky-800/40 bg-slate-950/95 p-5 shadow-2xl backdrop-blur-lg md:p-8"
          >
            {/* TOP HEADER STATUS BAR */}
            <div className="flex items-center justify-between border-b border-sky-900/30 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Coins className="h-5 w-5 text-amber-400" />
                <span className="font-mono text-sm tracking-widest text-slate-300">
                  🪙 <strong className="text-amber-300 font-bold text-base">{saveData.coins}</strong> FISH COINS
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {/* Screen size mode switcher */}
                <button
                  onClick={onToggleScreenMode}
                  className="p-1.5 rounded-lg border border-sky-900/30 bg-slate-900/60 text-sky-400 hover:text-sky-300 hover:bg-slate-900/90 hover:scale-[1.05] active:scale-95 transition text-[11px] font-mono font-bold flex items-center gap-1 cursor-pointer"
                  title={screenMode === 'big' ? "Switch to Phone compact screen" : "Switch to big widescreen"}
                >
                  <span className="text-xs">{screenMode === 'big' ? '📱' : '📺'}</span>
                  <span className="hidden sm:inline text-[9px]">{screenMode === 'big' ? "PHONE" : "WIDE"}</span>
                </button>

                {/* Audio button */}
                <button
                  onClick={onToggleMute}
                  id="btn_toggle_audio"
                  className="p-1.5 rounded-lg border border-sky-900/30 bg-slate-900/60 text-sky-400 hover:text-sky-300 hover:bg-slate-900/90 hover:scale-105 active:scale-95 transition cursor-pointer flex items-center justify-center overflow-hidden"
                  title="Toggle Music & Sound Effects"
                >
                  <motion.div
                    animate={{ rotate: muted ? 180 : 0, scale: [1, 1.15, 1] }}
                    transition={{
                      rotate: { type: "spring", stiffness: 220, damping: 14 },
                      scale: { type: "tween", duration: 0.25, ease: "easeInOut" }
                    }}
                    className="flex items-center justify-center pointer-events-none"
                  >
                    {muted ? <VolumeX className="h-4 w-4 text-rose-400" /> : <Volume2 className="h-4 w-4" />}
                  </motion.div>
                </button>

                {activeTab !== 'menu' && (
                  <button
                    onClick={() => setActiveTab('menu')}
                    className="p-1.5 rounded-lg bg-slate-900/60 border border-slate-700/30 text-rose-400 hover:bg-rose-950/20 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {/* TAB ROUTER */}
            {activeTab === 'menu' && (
              <div className="flex flex-col flex-1 overflow-y-auto">
                {/* GAME LOGO */}
                <div className="text-center py-4">
                  <motion.div
                    animate={{ y: [0, -6, 0] }}
                    transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
                    className="inline-flex items-center justify-center gap-1 bg-gradient-to-r from-sky-400 via-cyan-300 to-indigo-400 bg-clip-text pb-1 text-center"
                  >
                    <h1 className="text-3xl font-extrabold tracking-tight text-transparent uppercase font-display md:text-5xl" id="game_title">
                      Penguin Rush
                    </h1>
                  </motion.div>
                  <p className="text-xs font-mono tracking-widest text-cyan-400 uppercase mt-1">
                    ❄️ Frozen City Cyber-Run ❄️
                  </p>
                </div>

                {/* PORTFOLIO-GRADE CONSECUTIVE DAILY LOYALTY CALENDAR */}
                {(() => {
                  const lastClaim = saveData.lastLoginClaimTime || 0;
                  const now = Date.now();
                  const timeSinceLastClaim = now - lastClaim;

                  const canClaim = lastClaim === 0 || timeSinceLastClaim >= 18 * 60 * 60 * 1000;
                  const streakBroken = lastClaim > 0 && timeSinceLastClaim > 42 * 60 * 60 * 1000;

                  const currentStreak = streakBroken ? 0 : (saveData.dailyLoginStreak || 0);
                  const nextTargetClaimIndex = currentStreak % 5;

                  const rewards = [50, 120, 200, 350, 600];

                  let timeStr = "";
                  if (!canClaim) {
                    const msLeft = 18 * 60 * 60 * 1000 - timeSinceLastClaim;
                    const hours = Math.floor(msLeft / (1000 * 60 * 60));
                    const minutes = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60));
                    timeStr = `${hours}h ${minutes}m left`;
                  }

                  return (
                    <div className="mt-2.5 p-3 rounded-xl bg-gradient-to-br from-indigo-950/20 to-slate-900/60 border border-cyan-500/15 backdrop-blur-sm shadow-md">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] text-cyan-300 font-mono tracking-widest uppercase flex items-center gap-1">
                          <Gift className="h-3 w-3 text-cyan-400 animate-pulse" /> DAILY SKATE BONUSES
                        </span>
                        {canClaim ? (
                          <span className="text-[9px] bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 px-1.5 py-0.5 rounded-full font-mono animate-pulse">
                            READY!
                          </span>
                        ) : (
                          <span className="text-[9px] bg-slate-950/60 text-slate-400 border border-slate-800 px-1.5 py-0.5 rounded-full font-mono">
                            {timeStr}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-5 gap-1 mb-2">
                        {rewards.map((reward, idx) => {
                          const dayNum = idx + 1;
                          const isClaimed = idx < currentStreak;
                          const isActive = idx === nextTargetClaimIndex && canClaim;

                          return (
                            <div
                              key={idx}
                              className={`relative flex flex-col items-center justify-center py-1.5 px-0.5 rounded-lg transition-all duration-300 border ${
                                isClaimed
                                  ? 'bg-slate-950/40 border-slate-950 text-slate-500 line-through'
                                  : isActive
                                    ? 'bg-cyan-500/10 border-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.1)] text-cyan-300 scale-[1.02]'
                                    : 'bg-slate-950/60 border-slate-900 text-slate-400'
                              }`}
                            >
                              <span className="text-[7.5px] font-mono tracking-tighter uppercase select-none opacity-80">
                                DAY {dayNum}
                              </span>
                              <span className="text-xs my-0.5 select-none font-sans">
                                {isClaimed ? '✅' : idx === 4 ? '⭐️' : '🪙'}
                              </span>
                              <span className={`text-[9px] font-bold font-mono ${isActive ? 'text-cyan-200' : 'text-amber-400/90'}`}>
                                {reward}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {canClaim ? (
                        <button
                          onClick={handleClaimDailyReward}
                          className="w-full py-2 bg-gradient-to-r from-cyan-500 via-sky-400 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-white font-extrabold font-mono tracking-widest text-[10px] rounded-lg shadow-md cursor-pointer transition active:scale-95"
                        >
                          CLAIM REWARD (+{rewards[nextTargetClaimIndex]} COINS)
                        </button>
                      ) : (
                        <div className="w-full py-1 bg-slate-1000/40 border border-slate-900 font-mono text-[8px] text-center text-slate-400 rounded-lg">
                          Streak: <strong className="text-cyan-400">{currentStreak} days</strong> consecutive. Back in {timeStr}!
                        </div>
                      )}

                      {dailySuccessMsg && (
                        <div className="mt-1.5 text-[8.5px] font-extrabold font-mono text-center text-emerald-400 uppercase leading-none">
                          {dailySuccessMsg}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* MAIN MENU BUTTON PANEL */}
                <div className="grid grid-cols-2 gap-4 mt-4">
                  {/* PLAY TRIGGER BUTTON */}
                  <button
                    onClick={onStartGame}
                    id="btn_start_run"
                    className="col-span-2 flex items-center justify-center gap-3 bg-gradient-to-r from-sky-500 via-cyan-400 to-indigo-500 p-4 rounded-xl text-white font-extrabold text-base tracking-widest shadow-lg shadow-sky-600/20 hover:from-sky-400 hover:to-indigo-400 hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer animate-pulse-glow"
                  >
                    <Play className="h-6 w-6 stroke-[3px]" />
                    {gameState === 'menu' ? 'LAUNCH RUNWAY' : 'RETRY EXPEDITION'}
                  </button>

                  <button
                    onClick={() => setActiveTab('shop')}
                    id="btn_open_shop"
                    className="flex flex-col items-center justify-center p-3.5 rounded-xl border border-sky-950 bg-slate-900/70 hover:bg-slate-900 hover:border-sky-500/45 text-slate-200 hover:text-white transition gap-2"
                  >
                    <ShoppingBag className="h-5 w-5 text-cyan-400" />
                    <span className="text-xs font-bold tracking-wider font-mono">GEAR SHOP</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('leaderboard')}
                    id="btn_open_leaderboard"
                    className="flex flex-col items-center justify-center p-3.5 rounded-xl border border-sky-950 bg-slate-900/70 hover:bg-slate-900 hover:border-sky-500/45 text-slate-200 hover:text-white transition gap-2"
                  >
                    <Trophy className="h-5 w-5 text-amber-400" />
                    <span className="text-xs font-bold tracking-wider font-mono">LEADERBOARDS</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('achievements')}
                    id="btn_open_achievements"
                    className="flex flex-col items-center justify-center p-3.5 rounded-xl border border-sky-950 bg-slate-900/70 hover:bg-slate-900 hover:border-sky-500/45 text-slate-200 hover:text-white transition gap-2"
                  >
                    <Award className="h-5 w-5 text-emerald-400" />
                    <span className="text-xs font-bold tracking-wider font-mono">REWARDS</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('daily')}
                    id="btn_open_daily"
                    className="flex flex-col items-center justify-center p-3.5 rounded-xl border border-sky-950 bg-slate-900/70 hover:bg-slate-900 hover:border-sky-500/45 text-slate-200 hover:text-white transition gap-2"
                  >
                    <Sparkles className="h-5 w-5 text-purple-400" />
                    <span className="text-xs font-bold tracking-wider font-mono">CHALLENGES</span>
                  </button>
                </div>

                {/* DIFFICULTY SELECTOR RAIL */}
                <div className="mt-4 p-3 rounded-xl bg-slate-900/60 border border-sky-950/50">
                  <span className="block text-[10px] text-center text-slate-400 font-mono tracking-wider uppercase mb-2">
                    SELECT BLIZZARD COMPLEXITY
                  </span>
                  <div className="grid grid-cols-4 gap-1.5" id="difficulty_picker">
                    {(['easy', 'medium', 'hard', 'extreme'] as Difficulty[]).map((diff) => (
                      <button
                        key={diff}
                        onClick={() => setDifficulty(diff)}
                        className={`py-1.5 rounded-lg text-[10px] font-bold font-mono tracking-widest uppercase border transition ${
                          difficulty === diff
                            ? 'bg-sky-500 text-white border-sky-300 shadow-sm shadow-sky-600/35'
                            : 'bg-slate-950/80 text-slate-400 border-slate-800 hover:border-slate-700/60'
                        }`}
                      >
                        {diff}
                      </button>
                    ))}
                  </div>
                </div>

                {/* TARGET DISTANCE SELECTOR */}
                <div className="mt-3 p-3 rounded-xl bg-slate-900/60 border border-sky-950/50">
                  <span className="block text-[10px] text-center text-slate-300 font-mono tracking-wider uppercase mb-2">
                    EXPEDITION SHORELINE DISTANCE
                  </span>
                  <div className="grid grid-cols-5 gap-1" id="distance_picker">
                    {([500, 1000, 1500, 3000, -1] as number[]).map((dist) => (
                      <button
                        key={dist}
                        onClick={() => setTargetDistance(dist)}
                        className={`py-1.5 rounded-lg text-[10px] font-bold font-mono tracking-wider uppercase border transition ${
                          targetDistance === dist
                            ? 'bg-cyan-500 text-white border-cyan-300 shadow-sm shadow-cyan-600/35'
                            : 'bg-slate-950/80 text-slate-400 border-slate-800 hover:border-slate-700/60'
                        }`}
                      >
                        {dist === -1 ? '♾️ Endless' : `${dist}m`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* PENGUIN BOOMBOX JUKEBOX TRACK SELECTOR */}
                <div className="mt-3 p-3.5 rounded-xl border border-sky-900/35 bg-gradient-to-br from-slate-900/80 to-slate-950/95 shadow-md">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-sky-400 font-mono tracking-widest uppercase flex items-center gap-1 select-none">
                      <Music className="h-3 w-3 text-cyan-400 animate-bounce" /> PENGUIN BOOMBOX
                    </span>
                    {!muted && (
                      <div className="flex gap-0.5 items-end h-3 px-1 select-none">
                        <span className="w-0.5 h-3 bg-cyan-400 rounded-full animate-pulse" />
                        <span className="w-[1.5px] h-2 bg-cyan-400 rounded-full animate-pulse delay-100" />
                        <span className="w-[1.5px] h-4 bg-cyan-400 rounded-full animate-pulse delay-200" />
                        <span className="w-0.5 h-1.5 bg-cyan-400 rounded-full animate-pulse delay-300" />
                      </div>
                    )}
                  </div>

                  {/* CURRENT CURRENTTRACK DISPLAY */}
                  <div className="flex items-center justify-between bg-slate-950/90 border border-sky-950 px-3 py-2 rounded-lg gap-3 mb-2">
                    <div className="flex items-center gap-2 overflow-hidden select-none">
                      <span className="text-lg">{gameAudio.tracks[currentTrackIndex]?.emoji || '🏂'}</span>
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-xs font-bold text-white tracking-wide truncate">
                          {gameAudio.tracks[currentTrackIndex]?.name || 'Alpine Glow'}
                        </span>
                        <span className="text-[9px] text-slate-400 font-mono flex items-center gap-1">
                          <span>{gameAudio.tracks[currentTrackIndex]?.genre || 'Chiptune'}</span>
                          <span className="text-sky-500/80">•</span>
                          <span className="text-cyan-400">{gameAudio.tracks[currentTrackIndex]?.bpm || 125} BPM</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={onToggleMute}
                        className="p-1 rounded bg-slate-900 hover:bg-slate-850 border border-slate-800 text-sky-400 hover:text-sky-300 transition cursor-pointer flex items-center justify-center overflow-hidden"
                        title="Toggle Sound & Music"
                      >
                        <motion.div
                          animate={{ rotate: muted ? 180 : 0, scale: [1, 1.15, 1] }}
                          transition={{
                            rotate: { type: "spring", stiffness: 220, damping: 14 },
                            scale: { type: "tween", duration: 0.25, ease: "easeInOut" }
                          }}
                          className="flex items-center justify-center pointer-events-none"
                        >
                          {muted ? <VolumeX className="h-3.5 w-3.5 text-rose-400" /> : <Volume2 className="h-3.5 w-3.5 text-emerald-400" />}
                        </motion.div>
                      </button>
                      <button
                        onClick={handleNextTrack}
                        className="p-1 rounded bg-slate-900 hover:bg-slate-850 border border-slate-800 text-cyan-400 hover:text-cyan-300 transition cursor-pointer"
                        title="Skip Track"
                      >
                        <SkipForward className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* PILLS */}
                  <div className="grid grid-cols-4 gap-1">
                    {gameAudio.tracks.slice(0, 4).map((track, idx) => (
                      <button
                        key={track.id}
                        onClick={() => handleSelectTrack(idx)}
                        className={`py-1 rounded text-[9px] font-bold font-mono tracking-wide transition uppercase border flex flex-col items-center justify-center gap-0.5 ${
                          currentTrackIndex === idx && !muted
                            ? 'bg-sky-500/20 text-sky-300 border-sky-400/60 shadow-inner'
                            : 'bg-slate-950/40 text-slate-500 border-slate-900 hover:bg-slate-900 hover:text-slate-300'
                        }`}
                        title={track.description}
                      >
                        <span className="text-[10px]">{track.emoji}</span>
                        <span className="text-[8px] truncate max-w-full px-0.5">{track.name.split(' ')[0]}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* ACTIVE LOADOUT SUMMARY FOOTER CARD */}
                <div className="mt-4 flex items-center justify-between p-3.5 rounded-xl bg-slate-950 border border-sky-950/30">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">ACTIVE SKATER</span>
                    <span className="text-xs font-semibold text-cyan-300 font-sans flex items-center gap-1.5">
                      🐧 {saveData.skins.find(s => s.id === saveData.selectedSkin)?.name}
                    </span>
                  </div>

                  <div className="h-5 border-r border-slate-800" />

                  <div className="flex flex-col text-right">
                    <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">ACTIVE DECK</span>
                    <span className="text-xs font-semibold text-amber-300 font-sans flex items-center gap-1.5 justify-end">
                      🛹 {saveData.skateboards.find(b => b.id === saveData.selectedSkateboard)?.name}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* SHOP TAB PANEL */}
            {activeTab === 'shop' && (
              <div className="flex flex-col flex-1 overflow-hidden">
                <h2 className="text-2xl font-bold font-display text-white mb-2 flex items-center gap-2">
                  <ShoppingBag className="text-cyan-400 h-5 w-5" /> GEAR STORE
                </h2>

                {/* Subcategory toggler */}
                <div className="flex border-b border-sky-900/30 pb-2 mb-4">
                  <button
                    onClick={() => setShopCategory('skins')}
                    className={`flex-1 py-1.5 text-xs font-mono font-bold uppercase ${
                      shopCategory === 'skins' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-450 hover:text-slate-350'
                    }`}
                  >
                    🐧 Skins
                  </button>
                  <button
                    onClick={() => setShopCategory('skateboards')}
                    className={`flex-1 py-1.5 text-xs font-mono font-bold uppercase ${
                      shopCategory === 'skateboards' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-slate-450 hover:text-slate-350'
                    }`}
                  >
                    🛹 Skateboards
                  </button>
                </div>

                {/* Scrollable list container */}
                <div className="flex-1 overflow-y-auto pr-1 gap-2.5 flex flex-col max-h-[380px]">
                  {shopCategory === 'skins' ? (
                    saveData.skins.map((skin) => {
                      const isEquipped = saveData.selectedSkin === skin.id;
                      return (
                        <div
                          key={skin.id}
                          className={`flex items-center justify-between p-3.5 rounded-xl border ${
                            isEquipped
                              ? 'bg-sky-950/35 border-sky-500/50'
                              : 'bg-slate-900/40 border-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {/* skin circle color swatch representative avatar */}
                            <div
                              className="h-9 w-9 rounded-full border-2 border-slate-700/50 flex items-center justify-center shadow"
                              style={{ backgroundColor: skin.color }}
                            >
                              <span className="text-lg">🐧</span>
                            </div>

                            <div className="flex flex-col">
                              <span className="text-sm font-semibold text-white">{skin.name}</span>
                              <span className="text-[11px] text-slate-400 font-sans mt-0.5">{skin.description}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 text-right">
                            {skin.unlocked ? (
                              isEquipped ? (
                                <span className="bg-sky-500 text-white font-bold text-xs px-2.5 py-1 rounded-md uppercase font-mono">
                                  Equipped
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleEquipSkin(skin)}
                                  className="bg-slate-800 hover:bg-slate-700 text-white text-xs px-2.5 py-1 rounded-md cursor-pointer transition font-mono"
                                >
                                  Equip
                                </button>
                              )
                            ) : (
                              <button
                                onClick={() => handleBuySkin(skin)}
                                disabled={saveData.coins < skin.cost}
                                className={`text-xs px-3 py-1.5 rounded-lg font-bold font-mono transition flex items-center gap-1.5 ${
                                  saveData.coins >= skin.cost
                                    ? 'bg-amber-600 hover:bg-amber-500 text-white cursor-pointer'
                                    : 'bg-slate-900 text-slate-500 cursor-not-allowed border border-slate-800'
                                }`}
                              >
                                🪙 {skin.cost}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    saveData.skateboards.map((board) => {
                      const isEquipped = saveData.selectedSkateboard === board.id;
                      return (
                        <div
                          key={board.id}
                          className={`flex items-center justify-between p-3.5 rounded-xl border ${
                            isEquipped
                              ? 'bg-amber-950/20 border-amber-500/50'
                              : 'bg-slate-900/40 border-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="h-9 w-12 rounded-lg border border-slate-700/40 flex items-center justify-center"
                              style={{ backgroundColor: board.deckColor }}
                            >
                              <div
                                className="h-2 w-10 rounded-sm"
                                style={{ backgroundColor: board.wheelColor }}
                              />
                            </div>

                            <div className="flex flex-col">
                              <span className="text-sm font-semibold text-white">{board.name}</span>
                              <span className="text-[10px] font-mono text-cyan-400 mt-0.5 uppercase tracking-wide">
                                {getSkateboardBonuses(board)}
                              </span>
                              <span className="text-[11px] text-slate-400 font-sans">{board.description}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 text-right">
                            {board.unlocked ? (
                              isEquipped ? (
                                <span className="bg-amber-500 text-slate-950 font-bold text-xs px-2.5 py-1 rounded-md uppercase font-mono">
                                  Equipped
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleEquipSkateboard(board)}
                                  className="bg-slate-800 hover:bg-slate-700 text-white text-xs px-2.5 py-1 rounded-md cursor-pointer transition font-mono"
                                >
                                  Equip
                                </button>
                              )
                            ) : (
                              <button
                                onClick={() => handleBuySkateboard(board)}
                                disabled={saveData.coins < board.cost}
                                className={`text-xs px-2 py-1.5 rounded-lg font-bold font-mono transition flex items-center gap-1 ${
                                  saveData.coins >= board.cost
                                    ? 'bg-amber-600 hover:bg-amber-500 text-white cursor-pointer'
                                    : 'bg-slate-900 text-slate-500 cursor-not-allowed border border-slate-800'
                                }`}
                              >
                                🪙 {board.cost}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* LEADERBOARDS TAB PANEL */}
            {activeTab === 'leaderboard' && (
              <div className="flex flex-col flex-1 overflow-hidden">
                <h2 className="text-2xl font-bold font-display text-white mb-2 flex items-center gap-2">
                  <Trophy className="text-amber-400 h-5 w-5" /> TOP RUNWAY TIMES
                </h2>

                <div className="flex-1 overflow-y-auto pr-1 gap-2 flex flex-col max-h-[350px]">
                  {saveData.leaderboard.map((entry, index) => {
                    const medals = ['🥇', '🥈', '🥉'];
                    return (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-850/40 hover:bg-slate-900 transition"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold font-mono text-slate-500 w-6">
                            {medals[index] || `#${index + 1}`}
                          </span>
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold text-white">{entry.name}</span>
                            <span className="text-[10px] font-mono text-slate-400">{entry.date}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-right px-2">
                          <div className="flex flex-col">
                            <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">METERS</span>
                            <span className="text-sm font-mono text-sky-400 font-bold">{entry.distance}m</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">SCORE</span>
                            <span className="text-sm font-mono text-amber-300 font-bold">{entry.score}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* REWARDS & ACHIEVEMENTS TAB PANEL */}
            {activeTab === 'achievements' && (
              <div className="flex flex-col flex-1 overflow-hidden">
                <h2 className="text-2xl font-bold font-display text-white mb-2 flex items-center gap-2">
                  <Award className="text-emerald-400 h-5 w-5" /> EXPEDITION MILESTONES
                </h2>

                <div className="flex-1 overflow-y-auto pr-1 gap-2.5 flex flex-col max-h-[350px]">
                  {saveData.achievements.map((ach) => {
                    // Quick check completed status
                    const isCompleted = ach.progress >= ach.target;

                    return (
                      <div
                        key={ach.id}
                        className={`p-3.5 rounded-xl border transition ${
                          isCompleted
                            ? 'bg-emerald-950/15 border-emerald-500/40 shadow shadow-emerald-550/10'
                            : 'bg-slate-900/50 border-slate-800'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex flex-col pr-3">
                            <span className="text-sm font-semibold text-white flex items-center gap-1">
                              {ach.title} {isCompleted && <Sparkles className="h-3.5 w-3.5 text-emerald-400" />}
                            </span>
                            <span className="text-[11px] text-slate-400 font-sans mt-0.5">{ach.description}</span>
                          </div>

                          <div className="flex flex-col text-right">
                            <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">BOUNTY</span>
                            <span className="text-xs font-bold font-mono text-amber-300">🪙 {ach.rewardCoins}</span>
                          </div>
                        </div>

                        {/* Progress slider bar */}
                        <div className="mt-3 flex items-center justify-between gap-4">
                          <div className="flex-1 h-2 rounded bg-slate-950 border border-slate-800 p-0.5 overflow-hidden">
                            <div
                              className={`h-full rounded-sm ${isCompleted ? 'bg-emerald-500' : 'bg-cyan-500'}`}
                              style={{ width: `${Math.min(100, Math.max(0, (ach.progress / ach.target) * 100))}%` }}
                            />
                          </div>

                          <span className="text-[10px] font-mono text-slate-400 font-semibold uppercase">
                            {ach.progress}/{ach.target}
                          </span>

                          {isCompleted && (
                            <button
                              onClick={() => handleClaimAchievement(ach)}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] px-2.5 py-1 rounded uppercase font-mono transition"
                            >
                              Claim
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* DAILY CHALLENGES TAB PANEL */}
            {activeTab === 'daily' && (
              <div className="flex flex-col flex-1 overflow-hidden">
                <h2 className="text-2xl font-bold font-display text-white mb-2 flex items-center gap-2">
                  <Sparkles className="text-purple-400 h-5 w-5" /> DAILY WEATHER REPORT
                </h2>
                <span className="block text-[10px] font-mono text-slate-400 mb-3 text-center uppercase tracking-wider">
                  Complete challenges to claim extra coin bounties! Resets daily
                </span>

                <div className="flex flex-col gap-3 max-h-[350px] overflow-y-auto pr-1">
                  {saveData.dailyChallenges.map((challenge) => {
                    const progressRatio = Math.min(100, (challenge.progress / challenge.target) * 100);
                    const isCompleted = challenge.progress >= challenge.target;

                    return (
                      <div
                        key={challenge.id}
                        className={`p-3.5 rounded-xl border ${
                          challenge.claimed
                            ? 'bg-slate-950/40 border-slate-900 text-slate-500'
                            : isCompleted
                            ? 'bg-purple-950/15 border-purple-500/40'
                            : 'bg-slate-900/50 border-slate-800'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex flex-col pr-2">
                            <span className={`text-xs font-semibold ${challenge.claimed ? 'text-slate-500 line-through' : 'text-white'}`}>
                              {challenge.description}
                            </span>
                            <span className="text-[10px] text-purple-400 font-mono mt-0.5">BOUNTY: 🪙 {challenge.reward} FISH COINS</span>
                          </div>

                          {challenge.claimed ? (
                            <CircleCheck className="h-5 w-5 text-slate-600" />
                          ) : isCompleted ? (
                            <button
                              onClick={() => handleClaimDailyChallenge(challenge)}
                              className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-[10px] px-2.5 py-1 rounded uppercase font-mono"
                            >
                              Claim
                            </button>
                          ) : (
                            <span className="text-[10px] font-mono text-slate-400 font-semibold">
                              {challenge.progress}/{challenge.target}
                            </span>
                          )}
                        </div>

                        {!challenge.claimed && (
                          <div className="mt-3.5 h-1.5 rounded-full bg-slate-950 border border-slate-800/40 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${isCompleted ? 'bg-purple-500' : 'bg-sky-500'}`}
                              style={{ width: `${progressRatio}%` }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* GAME OVER & VICTORY DEDICATED POPUP MODAL */}
        {(gameState === 'gameover' || gameState === 'victory') && lastResults && (
          <motion.div
            key="game_end_dedicated_popup"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              className={`relative flex flex-col w-full max-w-md max-h-[95%] overflow-y-auto rounded-3xl border p-5 md:p-7 shadow-2xl ${
                gameState === 'gameover'
                  ? 'border-rose-500/50 bg-gradient-to-b from-slate-900 to-slate-950 shadow-rose-950/20'
                  : 'border-cyan-500/50 bg-gradient-to-b from-slate-900 to-slate-950 shadow-cyan-950/20'
              }`}
            >
              <div className="flex flex-col items-center gap-1.5 text-center">
                {gameState === 'gameover' ? (
                  <>
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 border border-rose-500 text-3xl animate-bounce">
                      💥🐧
                    </div>
                    <span className="bg-rose-500/15 border border-rose-500/20 text-rose-400 font-mono tracking-widest text-[9px] py-1 px-3.5 rounded-full inline-block mt-1 uppercase font-bold">
                      Cyber Runway Crashed
                    </span>
                    <h2 className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-red-400 via-rose-300 to-amber-500 uppercase font-display mt-2 leading-tight">
                      Wipe Out!
                    </h2>
                    <p className="text-xs text-slate-400 font-mono tracking-wide max-w-xs mt-1">
                      You benched an electrostatic ice obstacle! Salvaged valuable coin debris before landing.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-400 text-3xl animate-bounce">
                      👑🏂
                    </div>
                    <span className="bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 font-mono tracking-widest text-[9px] py-1 px-3.5 rounded-full inline-block mt-1 uppercase font-bold">
                      Runway Route Conquered
                    </span>
                    <h2 className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 uppercase font-display mt-2 leading-tight">
                      Expedition Clear!
                    </h2>
                    <p className="text-xs text-slate-400 font-mono tracking-wide max-w-xs mt-1">
                      Outstanding navigation! You carved through the howling cyber blizzard safely.
                    </p>
                  </>
                )}
              </div>

              {/* STATS INFOGRAPHIC ROW/GRID */}
              <div className="grid grid-cols-3 gap-2.5 mt-5">
                <div className="p-3 bg-slate-900/40 border border-slate-800/60 rounded-2xl text-center relative overflow-hidden flex flex-col justify-center min-h-[96px]">
                  <span className="block text-[8px] text-slate-400 font-mono tracking-wider uppercase">Run Score</span>
                  <span className={`text-xl font-mono font-black mt-1 ${gameState === 'gameover' ? 'text-red-400' : 'text-emerald-400'}`}>
                    {lastResults.score}
                  </span>
                  {lastResults.score >= saveData.highScore && (
                    <div className="absolute top-1 right-1">
                      <span className="text-[7px] bg-amber-500/25 text-amber-300 border border-amber-500/30 px-1 py-0.5 rounded-full font-mono font-bold leading-none">
                        BEST
                      </span>
                    </div>
                  )}
                </div>

                <div className="p-3 bg-slate-900/40 border border-slate-800/60 rounded-2xl text-center flex flex-col justify-center min-h-[96px]">
                  <span className="block text-[8px] text-slate-400 font-mono tracking-wider uppercase">Distance</span>
                  <span className="text-xl font-mono font-black text-cyan-300 mt-1">
                    {lastResults.distance}m
                  </span>
                  <span className="text-[8px] text-slate-500 font-mono mt-0.5 font-bold">
                    {targetDistance === -1 ? 'Endless' : `of ${targetDistance}m`}
                  </span>
                </div>

                <div className="p-3 bg-slate-900/40 border border-slate-800/60 rounded-2xl text-center flex flex-col justify-center min-h-[96px]">
                  <span className="block text-[8px] text-slate-400 font-mono tracking-wider uppercase">Salvage</span>
                  <span className="text-xl font-mono font-black text-amber-300 mt-1">
                    🪙 {lastResults.coins}
                  </span>
                  <span className="text-[8px] text-amber-400/80 font-mono mt-0.5 font-bold">
                    Caught
                  </span>
                </div>
              </div>

              {/* DOUBLE REWARDS BOOSTER AD BANNER */}
              {lastResults.coins > 0 ? (
                <div className="mt-4 p-3 bg-gradient-to-r from-amber-500/10 via-yellow-500/5 to-transparent border border-yellow-500/20 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex flex-col text-center sm:text-left">
                    <span className="text-xs font-bold text-amber-300 flex items-center justify-center sm:justify-start gap-1 font-mono tracking-wide">
                      <Sparkles className="h-3.5 w-3.5 text-amber-400 animate-pulse" /> SPONSOR AD BOOST
                    </span>
                    <span className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                      {isDoubleClaimed 
                        ? "Reward claimed! Your runway coins have been doubled." 
                        : `Watch a premium ad slot to double your current salvage (+${lastResults.coins} coins!)`
                      }
                    </span>
                  </div>
                  <button
                    onClick={handleDoubleCoinsAd}
                    disabled={isAdPlaying || isDoubleClaimed}
                    className="shrink-0 w-full sm:w-auto flex items-center justify-center gap-1.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-450 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-slate-950 font-black text-[10px] font-mono tracking-widest py-2 px-3.5 rounded-xl shadow-lg border border-yellow-300/40 disabled:border-slate-800/40 cursor-pointer disabled:cursor-not-allowed hover:scale-[1.03] active:scale-95 disabled:scale-100 transition"
                  >
                    <Video className="h-4 w-4 shrink-0" />
                    <span>{isDoubleClaimed ? 'CLAIMED' : 'DOUBLE IT'}</span>
                  </button>
                </div>
              ) : (
                <div className="mt-4 p-3 bg-slate-900/35 border border-slate-800/50 rounded-2xl text-center">
                  <p className="text-[11px] text-slate-400 font-mono">
                    💡 Tip: Collect more Gold and Diamond coins along the tracks to load up on Salvage multipliers next run!
                  </p>
                </div>
              )}

              {/* RECORD NAME STATS LEADERBOARD FORM */}
              <div className="mt-4 p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/40 flex flex-col gap-2">
                <span className="block text-[8px] text-slate-400 font-mono tracking-wider uppercase text-center font-bold">
                  ✒️ INSCRIBE ARCHIVE SCORE HISTORIES
                </span>
                <form onSubmit={handleSaveToLeaderboard} className="flex gap-2">
                  <input
                    type="text"
                    maxLength={14}
                    value={playerNameInput}
                    onChange={(e) => setPlayerNameInput(e.target.value)}
                    placeholder="Skaters Chronicle Name"
                    className="flex-1 bg-slate-900 border border-slate-800/60 rounded-xl px-3.5 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-cyan-400 transition"
                    required
                  />
                  <button
                    type="submit"
                    className="bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs px-3.5 py-1.5 rounded-xl shadow transition cursor-pointer"
                  >
                    Post Score
                  </button>
                </form>
              </div>

              {/* EXTRA ADVENTURE ACTIVE CHALLENGES TRACKER */}
              <div className="mt-4 border-t border-slate-800/50 pt-3.5 flex flex-col gap-2">
                <span className="block text-[8px] text-slate-400 font-mono tracking-wider uppercase text-center font-bold">
                  📊 EXPEDITION CHALLENGES STATUS
                </span>
                <div className="flex flex-col gap-1.5 max-h-[100px] overflow-y-auto pr-1">
                  {saveData.dailyChallenges.slice(0, 2).map((daily) => {
                    const isCompleted = daily.progress >= daily.target;
                    const ratio = Math.min(100, (daily.progress / daily.target) * 100);
                    return (
                      <div key={daily.id} className="p-2 rounded-xl bg-slate-900/20 border border-slate-900/50 text-left flex items-center justify-between text-xs">
                        <div className="flex-1 min-w-0 pr-2">
                          <p className="text-[10px] text-slate-400 truncate leading-none">{daily.description}</p>
                          <div className="mt-1.5 h-1 w-full bg-slate-950 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${isCompleted ? 'bg-purple-500/80 animate-pulse' : 'bg-sky-500'}`} style={{ width: `${ratio}%` }} />
                          </div>
                        </div>
                        <span className={`font-mono text-[9px] shrink-0 font-extrabold ${isCompleted ? 'text-purple-400' : 'text-slate-400'}`}>
                          {isCompleted ? '✅ CLEARED' : `${Math.floor(daily.progress)}/${daily.target}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* CORE PRIMARY CONTROL ACTIONS */}
              <div className="grid grid-cols-2 gap-3 mt-5">
                <button
                  onClick={onStartGame}
                  className="flex items-center justify-center gap-2 bg-gradient-to-r from-sky-500 via-cyan-400 to-indigo-500 p-3 rounded-xl text-white font-black text-xs tracking-wider uppercase border border-sky-300/10 shadow-lg cursor-pointer hover:from-sky-400 hover:to-indigo-400 hover:scale-[1.02] active:scale-95 transition"
                >
                  <Play className="h-4 w-4 shrink-0" />
                  <span>PLAY AGAIN</span>
                </button>

                <button
                  onClick={onResetGame}
                  className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white border border-slate-800/60 p-3 rounded-xl text-xs font-black tracking-wider uppercase transition cursor-pointer"
                >
                  <X className="h-4 w-4 shrink-0" />
                  <span>MAIN MENU</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FULLSCREEN SPONSOR AD UNIT SIMULATION OVERLAY */}
      {isAdPlaying && (
        <div className="absolute inset-0 z-50 pointer-events-auto flex flex-col items-center justify-center bg-slate-950/98 backdrop-blur-md">
          <div className="flex flex-col items-center gap-6 max-w-sm text-center p-8 select-none">
            <div className="relative flex items-center justify-center h-20 w-20 rounded-full bg-indigo-500/10 border-2 border-indigo-500 shadow-lg shadow-indigo-500/20">
              <Tv className="h-10 w-10 text-cyan-400 animate-bounce" />
              <span className="absolute inset-0 rounded-full border border-indigo-400/20 animate-ping opacity-60" />
            </div>

            <div className="space-y-2 col-span-2">
              <h3 className="text-xl font-bold font-display tracking-wider text-white">SPONSOR BROADCAST</h3>
              <p className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">AD UNIT STATUS: RETRIEVING CREATIVE...</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Thank you for supporting <strong>Penguin Rush</strong>! This brief ad allows us to fund high-performance cold runway expansions.
              </p>
            </div>

            {/* Simulating ticking progress */}
            <div className="w-48 h-1.5 rounded-full bg-slate-900 border border-slate-800 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: "100%" }}
                transition={{ duration: 2, ease: "linear" }}
                className="h-full bg-gradient-to-r from-sky-400 to-indigo-500"
              />
            </div>

            <span className="text-[10px] uppercase font-mono text-cyan-400 tracking-widest animate-pulse">Running Simulation...</span>
          </div>
        </div>
      )}

      {/* FLOAT ADS SUCCESS BANNER ALERT */}
      {adSuccessMessage && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-auto w-full max-w-md px-4">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex items-center gap-2.5 bg-slate-950/95 border border-amber-500/40 px-4 py-3 rounded-xl text-center shadow-2xl shadow-amber-500/10 backdrop-blur-md"
          >
            <Gift className="h-5 w-5 text-amber-400 shrink-0 animate-bounce" />
            <span className="text-xs font-bold font-mono text-amber-300 tracking-wider flex-1 text-left">
              {adSuccessMessage}
            </span>
          </motion.div>
        </div>
      )}
    </div>
  );
}
