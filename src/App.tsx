/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import GameCanvas from './components/GameCanvas';
import UIOverlay from './components/UIOverlay';
import { GameState, Difficulty, SaveData, PowerUpType } from './types';
import { loadSaveData, saveSaveData } from './utils/gameData';
import { gameAudio } from './components/AudioSystem';
import { platformSdk } from './utils/platformSdk';
import { Activity, Coins, Award, Compass, RefreshCw, Volume2, VolumeX, Shield, Play, Pause, Zap, Sword, HelpCircle, Settings, RotateCw, Trophy } from 'lucide-react';

interface GameToast {
  id: string;
  title: string;
  description: string;
  rewardCoins?: number;
  icon?: string;
}

export default function App() {
  const [saveData, setSaveData] = useState<SaveData | null>(null);
  const [gameState, setGameState] = useState<GameState>('menu');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [isPaused, setIsPaused] = useState(false);
  const [muted, setMuted] = useState(false);

  // Active game session counters
  const [currentDistance, setCurrentDistance] = useState(0);
  const [currentCoins, setCurrentCoins] = useState(0);
  const [currentScore, setCurrentScore] = useState(0);
  const [bossHealth, setBossHealth] = useState(100);
  const [targetDistance, setTargetDistance] = useState<number>(1500); // selected target run distance (m) or -1 for endless

  // Real-time toast notifications
  const [toasts, setToasts] = useState<GameToast[]>([]);

  const triggerToast = (title: string, description: string, rewardCoins?: number, icon = '🏆') => {
    const id = Math.random().toString();
    setToasts(prev => [...prev, { id, title, description, rewardCoins, icon }]);
    gameAudio.playAchievementComplete();
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4200);
  };

  // Keep tracking historic session outputs
  const [lastResults, setLastResults] = useState<{ score: number; distance: number; coins: number } | null>(null);
  const [showTutorial, setShowTutorial] = useState(true);

  // Screen display mode ('phone' or 'big') defaulting to 'big' as requested
  const [screenMode, setScreenMode] = useState<'phone' | 'big'>('big');

  // Manual distance overrides when sliding/scrubbing the Side Distance Measure track
  const [manualDistanceOverride, setManualDistanceOverride] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    handlePointerMove(e);
    if (trackRef.current) {
      trackRef.current.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const relativeY = e.clientY - rect.top;
    const clampedY = Math.max(0, Math.min(rect.height, relativeY));
    const percentage = 1.0 - (clampedY / rect.height);
    
    const maxTrackDistance = targetDistance === -1 ? 5000 : targetDistance;
    const computedDistance = Math.round(percentage * maxTrackDistance);
    
    setManualDistanceOverride(computedDistance);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = false;
    if (trackRef.current) {
      trackRef.current.releasePointerCapture(e.pointerId);
    }
    setManualDistanceOverride(null);
  };

  // Initialize data on start mount
  useEffect(() => {
    const data = loadSaveData();
    setSaveData(data);
    setDifficulty('medium');
    setMuted(gameAudio.getMuted());
    // Auto initiate the Active Platform SDK
    platformSdk.init().catch(err => {
      console.warn("Platform SDK failed to load asynchronously:", err);
    });
  }, []);

  // Keyboard monitoring for Pause State
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        if (gameState === 'playing' || gameState === 'boss_battle') {
          setIsPaused(prev => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState]);

  // Handle music playing based on states
  useEffect(() => {
    if (gameState === 'playing' && !isPaused) {
      gameAudio.setMute(muted);
    }
  }, [gameState, muted, isPaused]);

  const levelProgress = useMemo(() => {
    if (targetDistance === -1) return 0;
    return Math.min(100, Math.floor((currentDistance / targetDistance) * 100));
  }, [currentDistance, targetDistance]);

  if (!saveData) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950 font-mono text-cyan-400">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="h-8 w-8 animate-spin" />
          <span className="text-sm uppercase tracking-widest">BOOTING CYBER RUNWAY...</span>
        </div>
      </div>
    );
  }

  // Get currently selected Skin and Skateboard objects
  const activeSkin = saveData.skins.find(s => s.id === saveData.selectedSkin) || saveData.skins[0];
  const activeSkateboard = saveData.skateboards.find(b => b.id === saveData.selectedSkateboard) || saveData.skateboards[0];

  // Callback when starting a fresh game run
  const handleStartGame = () => {
    setCurrentDistance(0);
    setCurrentCoins(0);
    setCurrentScore(0);
    setBossHealth(100);
    setIsPaused(false);
    setGameState('playing');
    setLastResults(null);
    platformSdk.gameplayStart();
  };

  // Callback when crash is hit (GAME OVER)
  const handleGameOver = (finalScore: number, finalDistance: number, collectedCoins: number) => {
    setGameState('gameover');
    setLastResults({ score: finalScore, distance: finalDistance, coins: collectedCoins });
    platformSdk.gameplayStop();
    platformSdk.submitScore(finalScore);

    // Update global resources & save
    const updatedCoins = saveData.coins + collectedCoins;
    const isNewHighScore = finalScore > saveData.highScore;
    const isNewMaxDistance = finalDistance > saveData.maxDistance;

    // Compile achievement advancements
    const updatedAchievements = saveData.achievements.map(ach => {
      let newProgress = ach.progress;
      if (ach.id === 'score_ach') {
        newProgress = Math.max(ach.progress, finalScore);
      } else if (ach.id === 'distance_ach') {
        newProgress = Math.max(ach.progress, finalDistance);
      }
      const newlyCompleted = newProgress >= ach.target && !ach.completed;
      if (newlyCompleted) {
        triggerToast('MILESTONE UNLOCKED!', ach.title, ach.rewardCoins, '🏅');
      }
      return {
        ...ach,
        progress: newProgress,
        completed: newProgress >= ach.target ? true : ach.completed,
      };
    });

    // Compile daily challenge advancements
    const updatedDailies = saveData.dailyChallenges.map(daily => {
      let extra = 0;
      if (daily.id === 'daily_distance') {
        extra = finalDistance;
      }
      const newProgress = Math.min(daily.target, daily.progress + extra);
      const newlyCompleted = newProgress >= daily.target && !daily.completed;
      if (newlyCompleted) {
        triggerToast('DAILY CHALLENGE DONE!', daily.description, daily.reward, '📅');
      }
      return {
        ...daily,
        progress: newProgress,
        completed: newProgress >= daily.target ? true : daily.completed,
      };
    });

    const refreshedData = {
      ...saveData,
      coins: updatedCoins,
      highScore: isNewHighScore ? finalScore : saveData.highScore,
      maxDistance: isNewMaxDistance ? finalDistance : saveData.maxDistance,
      achievements: updatedAchievements,
      dailyChallenges: updatedDailies,
    };

    setSaveData(refreshedData);
    saveSaveData(refreshedData);
  };

  // Callback when reaching the finish line successfully (VICTORY)
  const handleVictory = (finalScore: number, finalDistance: number, collectedCoins: number) => {
    setGameState('victory');
    setLastResults({ score: finalScore, distance: finalDistance, coins: collectedCoins });
    platformSdk.gameplayStop();
    platformSdk.submitScore(finalScore);

    // Add extra 100 completion coin reward!
    const updatedCoins = saveData.coins + collectedCoins + 100;
    const refreshedData = {
      ...saveData,
      coins: updatedCoins,
      highScore: finalScore > saveData.highScore ? finalScore : saveData.highScore,
      maxDistance: finalDistance > saveData.maxDistance ? finalDistance : saveData.maxDistance,
    };

    setSaveData(refreshedData);
    saveSaveData(refreshedData);
  };

  const handleCoinCollected = (isDiamond: boolean) => {
    // Collect fish coin
    setCurrentCoins(prev => prev + (isDiamond ? 5 : 1));
  };

  const handlePowerUpActive = (type: PowerUpType) => {
    // Feed rewards count or state
  };

  // Sync partial achievement additions in middle of run
  const handleAchievementProgress = (id: string, increment: number) => {
    if (!saveData) return;

    let toastToTrigger: { title: string; description: string; reward: number; icon: string } | null = null;

    const updatedAchievements = saveData.achievements.map(ach => {
      if (ach.id === id) {
        const nextProgress = Math.min(ach.target, ach.progress + increment);
        const newlyCompleted = nextProgress >= ach.target && !ach.completed;
        if (newlyCompleted) {
          toastToTrigger = {
            title: 'MILESTONE UNLOCKED!',
            description: ach.title,
            reward: ach.rewardCoins,
            icon: '🏅',
          };
        }
        return {
          ...ach,
          progress: nextProgress,
          completed: nextProgress >= ach.target ? true : ach.completed,
        };
      }
      return ach;
    });

    const updatedDailies = saveData.dailyChallenges.map(daily => {
      let extra = 0;
      if (id === 'collect_coins' && daily.id === 'daily_coins') {
        extra = increment;
      } else if (id === 'daily_jumps' && daily.id === 'daily_jumps') {
        extra = increment;
      } else if (id === 'daily_powerups' && daily.id === 'daily_powerups') {
        extra = increment;
      } else if (id === 'daily_diamonds' && daily.id === 'daily_diamonds') {
        extra = increment;
      }

      if (extra > 0) {
        const nextProgress = Math.min(daily.target, daily.progress + extra);
        const newlyCompleted = nextProgress >= daily.target && !daily.completed;
        if (newlyCompleted && !toastToTrigger) { // prioritize milestone but fallback to daily
          toastToTrigger = {
            title: 'DAILY CHALLENGE DONE!',
            description: daily.description,
            reward: daily.reward,
            icon: '📅',
          };
        }
        return {
          ...daily,
          progress: nextProgress,
          completed: nextProgress >= daily.target ? true : daily.completed,
        };
      }
      return daily;
    });

    const refreshedData = {
      ...saveData,
      achievements: updatedAchievements,
      dailyChallenges: updatedDailies,
    };
    setSaveData(refreshedData);
    saveSaveData(refreshedData);

    if (toastToTrigger) {
      triggerToast(toastToTrigger.title, toastToTrigger.description, toastToTrigger.reward, toastToTrigger.icon);
    }
  };

  // Sync real-time ticking values
  const handleStatsUpdate = (distance: number, coins: number, score: number) => {
    setCurrentDistance(distance);
    setCurrentCoins(coins);
    setCurrentScore(score);
  };

  const handleRestartGame = () => {
    gameAudio.stopSkateSound();
    gameAudio.stopMusic();
    handleStartGame();
  };

  const handleToggleMute = () => {
    const newMuteState = !muted;
    setMuted(newMuteState);
    gameAudio.setMute(newMuteState);
  };

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-slate-950 font-sans text-slate-100 select-none items-center justify-center">
      {/* GLOWING WINTER GRID STREAMERS IN CORNER DECORATION */}
      <div className="absolute top-0 right-0 z-0 h-96 w-96 bg-cyan-500/10 rounded-full blur-[140px] pointer-events-none animate-pulse" />
      <div className="absolute bottom-0 left-0 z-0 h-[450px] w-[450px] bg-indigo-500/10 rounded-full blur-[160px] pointer-events-none" />

      {/* QUICK FLOATING VIEW MODE HEADER SWITCH FOR DESKTOP USER FRIENDLINESS */}
      <div className="absolute top-4 left-4 z-30 hidden md:flex items-center gap-2 pointer-events-auto">
        <button
          onClick={() => setScreenMode(prev => prev === 'big' ? 'phone' : 'big')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-sky-400/30 bg-slate-950/90 text-[10px] font-bold font-mono tracking-wider text-cyan-400 uppercase shadow-lg shadow-cyan-950/40 hover:bg-slate-900 hover:border-cyan-400 transition active:scale-95 cursor-pointer backdrop-blur"
          title="Toggle view layouts"
        >
          <span>{screenMode === 'big' ? '📱 PHONE COMPACT' : '📺 DESKTOP WIDESCREEN'}</span>
        </button>
      </div>

      {/* CORE FRAME SIMULATING EITHER AN ARCADE CABINET BIG SCREEN OR PORTRAIT CHASSIS */}
      <main className={`relative z-10 w-full h-full md:h-[92vh] flex flex-col p-1.5 md:p-2 bg-slate-950 overflow-hidden transition-all duration-300 md:rounded-[36px] md:border-[10px] md:border-slate-800/90 md:shadow-[0_25px_60px_rgba(0,0,0,0.85),_0_0_50px_rgba(34,211,238,0.2)] ${
        screenMode === 'big' 
          ? 'md:max-w-[1000px] md:aspect-[16/10]' 
          : 'md:max-w-[430px] md:aspect-[9/18.5]'
      }`}>
        
        {/* INTERACTIVE COMPREHENSIVE VIEWPORT GAMEPLAY FRAME */}
        <div className="relative flex-1 w-full overflow-hidden rounded-[24px] md:rounded-3xl border border-sky-450/15">
          <GameCanvas
            gameState={gameState}
            difficulty={difficulty}
            selectedSkin={activeSkin}
            selectedSkateboard={activeSkateboard}
            onGameOver={handleGameOver}
            onVictory={handleVictory}
            onCoinCollected={handleCoinCollected}
            onPowerUpActive={handlePowerUpActive}
            onAchievementProgress={handleAchievementProgress}
            onStatsUpdate={handleStatsUpdate}
            isPaused={isPaused}
            bossHealth={bossHealth}
            setBossHealth={setBossHealth}
            perspectiveFactor={45}
            targetDistance={targetDistance}
            manualDistanceOverride={manualDistanceOverride}
          />

          {/* TOP REAL-TIME HORIZONTAL RUNWAY EXPEDITION PROGRESS BAR */}
          {(gameState === 'playing' || gameState === 'boss_battle') && (
            <div className="absolute top-[72px] left-4 right-16 z-20 flex flex-col gap-1 select-none">
              <div className="flex justify-between items-center text-[8px] font-mono font-semibold tracking-wider text-cyan-300">
                <span>STARTING LINE (0m)</span>
                <span className="bg-sky-950/40 px-2 py-0.5 rounded-full border border-sky-400/20">
                  EXPEDITION: {targetDistance === -1 ? 'ENDLESS GLIDE' : `${targetDistance}m TARGET`}
                </span>
                <span>{targetDistance === -1 ? '♾️ ENDLESS' : '🏁 FINISH'}</span>
              </div>
              <div className="relative w-full h-2.5 bg-slate-950/80 border border-cyan-500/30 rounded-full overflow-visible p-0.5">
                {/* Visual progression bar fill */}
                <div 
                  className="h-full bg-gradient-to-r from-cyan-500 via-sky-400 to-indigo-500 rounded-full transition-all duration-150 relative shadow-[0_0_8px_rgba(34,211,238,0.5)]"
                  style={{ width: `${targetDistance === -1 ? Math.min(100, currentDistance / 50) : Math.min(100, (currentDistance / targetDistance) * 100)}%` }}
                >
                  {/* Absolute cute skating penguin marker precisely positioned at flow edge */}
                  <div className="absolute -right-2.5 -top-1.5 h-5 w-5 bg-slate-900 border border-cyan-400 rounded-full flex items-center justify-center text-[10px] shadow-md shadow-cyan-950/50">
                    🐧
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* FLOATING IN-GAME TOP LEFT METADATA STATISTICS PANEL (Screenshot 2, 7) */}
          {(gameState === 'playing' || gameState === 'boss_battle') && (
            <div className="absolute top-4 left-4 z-20 flex flex-col gap-1 pointer-events-none select-none">
              <div className="flex items-center gap-3 bg-slate-950/50 px-3 py-1.5 rounded-full border border-sky-400/20 backdrop-blur-sm shadow-md">
                <div className="flex items-center gap-1 font-mono text-cyan-300">
                  <Compass className="h-3.5 w-3.5 text-cyan-400 stroke-[2.5]" />
                  <strong className="text-xs font-black">{currentDistance}m</strong>
                </div>

                <div className="flex items-center gap-0.5 font-mono text-amber-300">
                  <span className="text-[11px]">🪙</span>
                  <strong className="text-xs font-black">{currentCoins}</strong>
                </div>

                <div className="flex items-center gap-1 font-mono text-emerald-300">
                  <strong className="text-xs font-extrabold">{currentScore}</strong>
                </div>
              </div>
            </div>
          )}

          {/* TOP RIGHT CONSOLE CHASSIS CONTROLS (Screenshot 1, 6) */}
          {(gameState === 'playing' || gameState === 'boss_battle') && (
            <div className="absolute right-4 top-4 flex flex-col gap-2 z-20 pointer-events-auto">
              {/* Settings button */}
              <button
                onClick={() => setIsPaused(true)}
                className="h-10 w-10 rounded-full border border-slate-700/50 bg-slate-950/75 hover:bg-slate-800 flex items-center justify-center text-white shadow-md transition active:scale-90 cursor-pointer animate-none"
                title="Pause Glide"
                id="btn_hud_pause_cog"
              >
                <Settings className="h-4.5 w-4.5 text-sky-200" />
              </button>

              {/* Instant Reboot button */}
              <button
                onClick={handleRestartGame}
                className="h-10 w-10 rounded-full border border-slate-700/50 bg-slate-950/75 hover:bg-slate-800 flex items-center justify-center text-white shadow-md transition active:scale-90 cursor-pointer"
                title="Instant Reboot"
                id="btn_hud_reboot"
              >
                <RotateCw className="h-4.5 w-4.5 text-sky-200" />
              </button>

              {/* Aspect Ratio Screen toggle button in HUD */}
              <button
                onClick={() => setScreenMode(prev => prev === 'big' ? 'phone' : 'big')}
                className="h-10 w-10 rounded-full border border-slate-700/50 bg-slate-950/75 hover:bg-slate-800 flex items-center justify-center text-white shadow-md transition active:scale-90 cursor-pointer"
                title={screenMode === 'big' ? "Switch to Phone Frame" : "Switch to Widescreen View"}
                id="btn_hud_screen_toggle"
              >
                <span className="text-sm">{screenMode === 'big' ? '📱' : '📺'}</span>
              </button>
            </div>
          )}

          {/* SLIDABLE VERTICAL RUNWAY PROGRESS SLIDER BAR (Screenshot 1, 7) */}
          {(gameState === 'playing' || gameState === 'boss_battle') && (() => {
            const maxTrackDistance = targetDistance === -1 ? 5000 : targetDistance;
            const sideProgress = Math.min(100, (currentDistance / maxTrackDistance) * 100);
            return (
              <div 
                ref={trackRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                className="absolute right-4 top-[32%] h-[38%] w-8 bg-slate-950/75 border border-cyan-500/30 rounded-full flex flex-col items-center justify-between p-1.5 z-20 backdrop-blur-sm pointer-events-auto touch-none select-none cursor-ns-resize shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
                title="Side distance measure (Drag to scroll/teleport along course!)"
              >
                <span className="text-[11px] select-none leading-none mt-0.5">🏁</span>
                
                {/* Progress track */}
                <div className="relative flex-1 w-1 bg-slate-900 border border-slate-800 rounded-full my-2 flex flex-col justify-end">
                  <div 
                    className="w-full bg-gradient-to-t from-cyan-400 to-sky-300 rounded-full"
                    style={{ height: `${sideProgress}%` }}
                  />
                  
                  {/* Floating active skating penguin moving in real-time */}
                  <div 
                    className="absolute left-1/2 -translate-x-1/2 h-8 w-8 bg-cyan-500 border border-white rounded-full flex flex-col items-center justify-center font-mono text-[7px] font-bold text-white shadow-[0_0_8px_rgba(34,211,238,0.8)] cursor-grab active:cursor-grabbing hover:scale-110 transition-transform duration-100 select-none"
                    style={{ bottom: `calc(${sideProgress}% - 16px)` }}
                  >
                    <span className="text-[11px] leading-none">🐧</span>
                    <span className="text-[6px] mt-0.5 leading-none">{currentDistance}m</span>
                  </div>
                </div>

                <div className="text-[8px] font-mono text-cyan-300 font-extrabold select-none leading-none mb-0.5">
                  0m
                </div>
              </div>
            );
          })()}

          {/* PAUSED TRANSPARENT CARD ON THE CANVAS */}
          {isPaused && (
            <div className="absolute inset-0 bg-slate-950/85 backdrop-blur z-30 flex flex-col items-center justify-center p-4 rounded-3xl pointer-events-auto" id="pause_screen">
              <Pause className="h-10 w-10 text-sky-400 stroke-[1.5] mb-2 animate-pulse" />
              <h3 className="text-xl font-bold font-mono text-white tracking-widest uppercase">
                Grip Braked
              </h3>
              <p className="text-[10px] text-slate-400 font-mono mt-1 text-center px-1">
                Press [ ESC ] or tap resume to resume gliding through futuristic resort
              </p>

              <div className="mt-5 flex flex-col gap-2 w-48">
                <button
                  onClick={() => setIsPaused(false)}
                  className="w-full bg-cyan-600 hover:bg-cyan-500 font-bold font-sans py-2 rounded-xl text-white transition text-xs cursor-pointer shadow"
                >
                  Resume Glide
                </button>
                <button
                  onClick={() => {
                    setIsPaused(false);
                    setGameState('menu');
                    gameAudio.stopSkateSound();
                    gameAudio.stopMusic();
                  }}
                  className="w-full bg-slate-900 hover:bg-slate-800 border border-slate-700/40 text-slate-300 font-bold py-1.5 rounded-xl text-[10px] transition"
                >
                  Abort Expedition
                </button>
              </div>
            </div>
          )}

          {/* FLOATING ACTION OVERLAY MENUS */}
          <UIOverlay
            gameState={gameState}
            difficulty={difficulty}
            setDifficulty={setDifficulty}
            saveData={saveData}
            setSaveData={setSaveData}
            currentCoins={currentCoins}
            currentDistance={currentDistance}
            currentScore={currentScore}
            onStartGame={handleStartGame}
            onResetGame={() => {
              const fresh = loadSaveData();
              setSaveData(fresh);
              setGameState('menu');
            }}
            muted={muted}
            onToggleMute={handleToggleMute}
            lastResults={lastResults}
            screenMode={screenMode}
            onToggleScreenMode={() => setScreenMode(prev => prev === 'big' ? 'phone' : 'big')}
            targetDistance={targetDistance}
            setTargetDistance={setTargetDistance}
          />

          {/* DYNAMIC REAL-TIME HUD ACHIEVEMENT TOASTS QUEUE */}
          <div className="absolute top-[115px] right-4 z-[45] flex flex-col gap-2 max-w-[260px] w-full pointer-events-none">
            <AnimatePresence>
              {toasts.map((toast) => (
                <motion.div
                  key={toast.id}
                  initial={{ opacity: 0, x: 80, scale: 0.85 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 80, scale: 0.9 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                  className="flex items-center gap-2.5 bg-slate-950/95 border border-cyan-400 rounded-xl p-2.5 shadow-[0_4px_16px_rgba(6,182,212,0.35)] pointer-events-auto select-none overflow-hidden"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-400/50 text-base">
                    {toast.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[8px] font-black font-mono tracking-wider text-cyan-300 uppercase leading-none">
                      {toast.title}
                    </p>
                    <p className="text-[10.5px] font-extrabold text-white tracking-wide mt-1 leading-tight truncate">
                      {toast.description}
                    </p>
                    {toast.rewardCoins && (
                      <p className="text-[8px] font-bold font-mono text-amber-300 mt-0.5 leading-none uppercase">
                        BOUNTY: +🪙 {toast.rewardCoins} FISH COINS
                      </p>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* INSTRUCTIONS DRAWER */}
        {gameState === 'menu' && (
          <div className="w-full mt-2 p-2 bg-slate-900/60 border border-sky-450/15 rounded-2xl flex flex-col gap-1 text-slate-400 text-[10px] font-mono pointer-events-auto select-none">
            <div className="flex items-center gap-1">
              <HelpCircle className="h-3 w-3 text-cyan-400" />
              <span className="text-[10px] font-bold text-slate-300">Runway Controls:</span>
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 leading-tight">
              <span className="truncate">⬅️ ➡️ / A D: Switch lane</span>
              <span className="truncate">⬆️ / S / W: Jump / Slide</span>
              <span className="truncate">F / Enter: Fire blast</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
