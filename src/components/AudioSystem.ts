/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface MusicTrack {
  id: string;
  name: string;
  genre: string;
  emoji: string;
  bpm: number;
  bassScale: number[];
  leadScale: number[];
  type: 'square' | 'sawtooth' | 'triangle' | 'sine';
  description: string;
}

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private skateSoundNode: AudioWorkletNode | ScriptProcessorNode | null = null;
  private skateGain: GainNode | null = null;
  private bgMusicNode: any = null; // intervals/timeouts for tracking sequencers
  private currentBeats: any[] = [];
  private speedFactor: number = 1.0;
  private currentTrackIndex: number = 0;
  private inBossSpecialMusic: boolean = false;

  public readonly tracks: MusicTrack[] = [
    {
      id: 'alpine-glow',
      name: 'Alpine Glow',
      genre: 'Chiptune Synth',
      emoji: '🏂',
      bpm: 125,
      bassScale: [130.81, 130.81, 146.83, 146.83, 98.0, 98.0, 110.0, 110.0], // C3, D3, G2, A2
      leadScale: [
        523.25, 0, 587.33, 659.25, 0, 783.99, 880.0, 0,
        523.25, 659.25, 0, 783.99, 880.0, 0, 1046.50, 0
      ],
      type: 'triangle',
      description: 'Bright and cheerful arcade energy.'
    },
    {
      id: 'neon-glider',
      name: 'Neon Glider',
      genre: 'Synthwave',
      emoji: '🌌',
      bpm: 110,
      bassScale: [110.0, 110.0, 130.81, 130.81, 146.83, 146.83, 98.0, 82.41], // A2, C3, D3, G2, E2
      leadScale: [
        440.0, 523.25, 0, 587.33, 659.25, 0, 783.99, 0,
        880.0, 0, 783.99, 659.25, 587.33, 0, 523.25, 440.0
      ],
      type: 'sawtooth',
      description: 'Moody, cyber-cool retro rhythm.'
    },
    {
      id: 'chill-slopes',
      name: 'Chill Slopes',
      genre: 'Cozy Ambient Lofi',
      emoji: '☕',
      bpm: 92,
      bassScale: [82.41, 82.41, 98.0, 98.0, 110.0, 110.0, 65.41, 65.41], // E2, G2, A2, C2
      leadScale: [
        329.63, 392.0, 440.0, 523.25, 0, 440.0, 392.0, 0,
        329.63, 0, 392.0, 0, 440.0, 493.88, 523.25, 0
      ],
      type: 'sine',
      description: 'Lofi warm tones for cozy skating.'
    },
    {
      id: 'glacier-fury',
      name: 'Glacier Fury',
      genre: 'Epic Electro-Bass',
      emoji: '⚡',
      bpm: 138,
      bassScale: [146.83, 146.83, 110.0, 110.0, 123.47, 123.47, 82.41, 82.41], // D3, A2, B2, E2
      leadScale: [
        587.33, 659.25, 783.99, 0, 880.0, 987.77, 1174.66, 0,
        880.0, 783.99, 0, 659.25, 587.33, 0, 1174.66, 1318.51
      ],
      type: 'sawtooth',
      description: 'Pumping drums and high voltage lead.'
    },
    {
      id: 'boss-fight',
      name: 'Polar Storm',
      genre: 'Boss Beat',
      emoji: '👹',
      bpm: 148,
      bassScale: [110.0, 98.0, 110.0, 130.81, 146.83, 130.81, 110.0, 82.41],
      leadScale: [
        880.0, 880.0, 1046.50, 880.0, 1174.66, 880.0, 1318.51, 880.0,
        1567.98, 1318.51, 1174.66, 1046.50, 987.77, 1046.50, 880.0, 0
      ],
      type: 'square',
      description: 'Heavy boss fight battle theme.'
    }
  ];

  constructor() {
    this.isMuted = localStorage.getItem('penguin_rush_muted') === 'true';
    const savedTrack = localStorage.getItem('penguin_rush_track_index');
    if (savedTrack !== null) {
      this.currentTrackIndex = parseInt(savedTrack, 10);
      if (isNaN(this.currentTrackIndex) || this.currentTrackIndex < 0 || this.currentTrackIndex >= this.tracks.length - 1) {
        this.currentTrackIndex = 0;
      }
    }
  }

  private initCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setMute(muted: boolean) {
    this.isMuted = muted;
    localStorage.setItem('penguin_rush_muted', String(muted));
    if (muted) {
      this.stopSkateSound();
      this.stopMusic();
    } else {
      this.initCtx();
    }
  }

  getMuted() {
    return this.isMuted;
  }

  playCoin() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now); // A5
    osc1.frequency.setValueAtTime(1318.51, now + 0.08); // E6

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1760, now + 0.08); // A6

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start(now);
    osc2.start(now + 0.08);
    osc1.stop(now + 0.4);
    osc2.stop(now + 0.4);
  }

  playDiamond() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1046.50, now); // C6
    osc1.frequency.setValueAtTime(1318.51, now + 0.06); // E6
    osc1.frequency.setValueAtTime(1567.98, now + 0.12); // G6
    osc1.frequency.setValueAtTime(2093.00, now + 0.18); // C7

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    osc1.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.65);
  }

  playJump() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(650, now + 0.18);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.005, now + 0.22);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.25);
  }

  playSlide() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.25);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.005, now + 0.3);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.35);
  }

  playPowerUp() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.4);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(600, now);
    osc2.frequency.exponentialRampToValueAtTime(2400, now + 0.4);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    // Filter to sweeten
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1500, now);

    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc2.start(now);
    osc.stop(now + 0.5);
    osc2.stop(now + 0.5);
  }

  playCrash() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.4, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseBuffer.length; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, now);
    filter.frequency.exponentialRampToValueAtTime(40, now + 0.35);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    whiteNoise.start(now);
  }

  playShieldShatter() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1000 + Math.random() * 2000, now + i * 0.03);
      osc.frequency.exponentialRampToValueAtTime(200, now + i * 0.03 + 0.15);

      gain.gain.setValueAtTime(0.08, now + i * 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.03 + 0.15);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.03);
      osc.stop(now + i * 0.03 + 0.18);
    }
  }

  playBossRoar() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const oscSub = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.linearRampToValueAtTime(60, now + 0.8);

    // Tremolo/modulator
    const mod = this.ctx.createOscillator();
    mod.type = 'sawtooth';
    mod.frequency.setValueAtTime(18, now); // heavy growl rumble
    const modGain = this.ctx.createGain();
    modGain.gain.setValueAtTime(50, now);

    oscSub.type = 'sine';
    oscSub.frequency.setValueAtTime(55, now);
    oscSub.frequency.linearRampToValueAtTime(40, now + 0.8);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 1.0);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, now);

    mod.connect(modGain);
    modGain.connect(osc.frequency);

    osc.connect(filter);
    oscSub.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    oscSub.start(now);
    mod.start(now);

    osc.stop(now + 1.1);
    oscSub.stop(now + 1.1);
    mod.stop(now + 1.1);
  }

  playVictory() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const chords = [
      [261.63, 329.63, 392.00, 523.25], // C Major
      [293.66, 349.23, 440.00, 587.33], // D minor
      [329.63, 392.00, 493.88, 659.25], // E minor
      [349.23, 440.00, 523.25, 698.46], // F Major
      [392.00, 493.88, 587.33, 783.99], // G Major
      [523.25, 659.25, 783.99, 1046.50] // High C Major
    ];

    chords.forEach((chord, step) => {
      const stepTime = now + step * 0.18;
      chord.forEach((freq) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();

        osc.type = (step === chords.length - 1) ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, stepTime);
        gain.gain.setValueAtTime(0.06, stepTime);
        gain.gain.exponentialRampToValueAtTime(0.001, stepTime + 0.4);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(stepTime);
        osc.stop(stepTime + 0.45);
      });
    });
  }

  playAchievementComplete() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);

      gain.gain.setValueAtTime(0.08, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.4);
    });
  }

  startSkateSound() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;
    if (this.skateSoundNode) return;

    try {
      // Create simple White Noise generator buffer node
      const bufferSize = 2 * this.ctx.sampleRate;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(220, this.ctx.currentTime);
      filter.Q.setValueAtTime(1.5, this.ctx.currentTime);

      this.skateGain = this.ctx.createGain();
      this.skateGain.gain.setValueAtTime(0.015, this.ctx.currentTime); // very subtle base

      whiteNoise.connect(filter);
      filter.connect(this.skateGain);
      this.skateGain.connect(this.ctx.destination);

      whiteNoise.start();
      this.skateSoundNode = whiteNoise as any;
    } catch (e) {
      console.warn('Could not launch skating audio background node:', e);
    }
  }

  updateSkateSound(speedRatio: number, inAirOrSlide: 'air' | 'slide' | 'floor') {
    if (this.isMuted || !this.skateGain || !this.ctx) return;
    const targetGain = inAirOrSlide === 'air' ? 0.0 : inAirOrSlide === 'slide' ? 0.05 : 0.02 * speedRatio;
    this.skateGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.1);
  }

  stopSkateSound() {
    if (this.skateSoundNode) {
      try {
        (this.skateSoundNode as any).stop();
      } catch (e) {}
      this.skateSoundNode = null;
    }
    this.skateGain = null;
  }

  setSpeedFactor(factor: number) {
    this.speedFactor = factor;
  }

  getTracks() {
    return this.tracks;
  }

  getCurrentTrackIndex() {
    return this.currentTrackIndex;
  }

  isBossMusicPlaying() {
    return this.inBossSpecialMusic;
  }

  selectTrack(index: number) {
    if (index >= 0 && index < this.tracks.length - 1) { // exclude boss fight from standard selector
      this.currentTrackIndex = index;
      localStorage.setItem('penguin_rush_track_index', String(index));
      if (!this.isMuted && this.ctx) {
        this.startMusic();
      }
    }
  }

  nextTrack() {
    const activeLength = this.tracks.length - 1; // exclude boss fight
    const nextIndex = (this.currentTrackIndex + 1) % activeLength;
    this.selectTrack(nextIndex);
    return this.tracks[nextIndex];
  }

  startBossMusic() {
    this.inBossSpecialMusic = true;
    if (!this.isMuted && this.ctx) {
      this.startMusic();
    }
  }

  stopBossMusic() {
    this.inBossSpecialMusic = false;
    if (!this.isMuted && this.ctx) {
      this.startMusic();
    }
  }

  // A light interactive retro cyberpunk bass & melody sequencer loop playing on program launch
  startMusic() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;
    this.stopMusic();

    let step = 0;
    
    // Choose active track definition
    const activeTrack = this.inBossSpecialMusic 
      ? this.tracks[4] // Polar Storm boss theme
      : this.tracks[this.currentTrackIndex];

    const bpm = activeTrack.bpm;
    const stepDuration = (60 / bpm) / 4; // sixteenth note step length

    const intervalFunc = () => {
      if (this.isMuted || !this.ctx) return;
      const now = this.ctx.currentTime;
      const adjustedStepDuration = stepDuration / this.speedFactor;

      // 1. Kick Drum (Sine frequency sweep)
      const isKickStep = (step % 4 === 0) || (activeTrack.id === 'glacier-fury' && step === 10) || (activeTrack.id === 'boss-fight' && (step === 6 || step === 10 || step === 14));
      if (isKickStep) {
        const bd = this.ctx.createOscillator();
        const bdGain = this.ctx.createGain();
        bd.type = 'sine';
        bd.frequency.setValueAtTime(activeTrack.id === 'boss-fight' ? 180 : 150, now);
        bd.frequency.exponentialRampToValueAtTime(38, now + 0.12);
        bdGain.gain.setValueAtTime(activeTrack.id === 'boss-fight' ? 0.22 : 0.18, now);
        bdGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

        bd.connect(bdGain);
        bdGain.connect(this.ctx.destination);
        bd.start(now);
        bd.stop(now + 0.18);
      }

      // 2. Snare / Hat White Noise burst
      const isSnareStep = (step === 4 || step === 12);
      const isHatStep = (step % 2 === 1) || (activeTrack.id === 'boss-fight' && step % 4 === 2);

      if (isSnareStep && activeTrack.id !== 'chill-slopes') {
        const snareNoise = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.08, this.ctx.sampleRate);
        const data = snareNoise.getChannelData(0);
        for (let i = 0; i < snareNoise.length; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        const snareSource = this.ctx.createBufferSource();
        snareSource.buffer = snareNoise;

        const snareFilter = this.ctx.createBiquadFilter();
        snareFilter.type = 'bandpass';
        snareFilter.frequency.setValueAtTime(1000, now);

        const snareGain = this.ctx.createGain();
        snareGain.gain.setValueAtTime(0.05, now);
        snareGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

        snareSource.connect(snareFilter);
        snareFilter.connect(snareGain);
        snareGain.connect(this.ctx.destination);
        snareSource.start(now);
      } else if (isHatStep) {
        const hatLength = activeTrack.id === 'chill-slopes' ? 0.03 : 0.04;
        const noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * hatLength, this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseBuffer.length; i++) {
          output[i] = Math.random() * 2 - 1;
        }
        const hat = this.ctx.createBufferSource();
        hat.buffer = noiseBuffer;
        const hatFilter = this.ctx.createBiquadFilter();
        hatFilter.type = 'highpass';
        hatFilter.frequency.setValueAtTime(activeTrack.id === 'chill-slopes' ? 8000 : 6000, now);

        const hatGain = this.ctx.createGain();
        hatGain.gain.setValueAtTime(activeTrack.id === 'chill-slopes' ? 0.012 : 0.016, now);
        hatGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);

        hat.connect(hatFilter);
        hatFilter.connect(hatGain);
        hatGain.connect(this.ctx.destination);
        hat.start(now);
      }

      // --- SYNTH BASS LINE ---
      const bassFreq = activeTrack.bassScale[step % activeTrack.bassScale.length];
      if (bassFreq > 0) {
        const bassOsc = this.ctx.createOscillator();
        const bassGain = this.ctx.createGain();
        bassOsc.type = activeTrack.type === 'sawtooth' ? 'sawtooth' : 'triangle';
        bassOsc.frequency.setValueAtTime(bassFreq, now);

        const bassLowpass = this.ctx.createBiquadFilter();
        bassLowpass.type = 'lowpass';
        bassLowpass.frequency.setValueAtTime(activeTrack.id === 'chill-slopes' ? 180 : 320, now);

        const bassVolume = activeTrack.id === 'chill-slopes' ? 0.05 : 0.038;
        bassGain.gain.setValueAtTime(bassVolume, now);
        bassGain.gain.exponentialRampToValueAtTime(0.001, now + adjustedStepDuration * 0.9);

        bassOsc.connect(bassLowpass);
        bassLowpass.connect(bassGain);
        bassGain.connect(this.ctx.destination);

        bassOsc.start(now);
        bassOsc.stop(now + adjustedStepDuration);
      }

      // --- MELODIC LEAD LINE ---
      const leadFreq = activeTrack.leadScale[step % activeTrack.leadScale.length];
      if (leadFreq > 0) {
        const leadOsc = this.ctx.createOscillator();
        const leadGain = this.ctx.createGain();
        
        leadOsc.type = activeTrack.type;
        leadOsc.frequency.setValueAtTime(leadFreq, now);

        leadGain.gain.setValueAtTime(0.01, now);
        leadGain.gain.linearRampToValueAtTime(activeTrack.id === 'chill-slopes' ? 0.018 : 0.024, now + 0.02);
        leadGain.gain.exponentialRampToValueAtTime(0.001, now + adjustedStepDuration * 1.4);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(activeTrack.id === 'alpine-glow' ? 1200 : 2000, now);

        const delay = this.ctx.createDelay();
        delay.delayTime.setValueAtTime(adjustedStepDuration * 0.75, now);
        const delayFeedback = this.ctx.createGain();
        delayFeedback.gain.setValueAtTime(0.35, now);

        leadOsc.connect(filter);
        filter.connect(leadGain);
        
        leadGain.connect(this.ctx.destination);

        leadGain.connect(delay);
        delay.connect(delayFeedback);
        delayFeedback.connect(delay);
        delayFeedback.connect(this.ctx.destination);

        leadOsc.start(now);
        leadOsc.stop(now + adjustedStepDuration * 1.5);
      }

      step = (step + 1) % 16;
      this.bgMusicNode = setTimeout(intervalFunc, adjustedStepDuration * 1000);
    };

    this.bgMusicNode = setTimeout(intervalFunc, 100);
  }

  stopMusic() {
    if (this.bgMusicNode) {
      clearTimeout(this.bgMusicNode);
      this.bgMusicNode = null;
    }
  }
}

export const gameAudio = new AudioSystem();
