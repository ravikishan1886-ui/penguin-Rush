# Penguin Rush: Frozen City

Welcome to **Penguin Rush: Frozen City**, a high-quality, action-packed 2.5D winter skateboarding endless runner built from the ground up with React, TypeScript, and Tailwind CSS. Join our cybernetic skater penguin as they glide down high-tech neon ice lanes, dodge obstacles, gather diamonds, and battle epic boss threats under deep atmospheric beats!

---

## 🎮 Key Features

- **Smooth 2.5D Rendering**: High-performance HTML5 Canvas engine rendering multiple parallax layers of high-tech background structures, icy track grids, and deep glowing warning alerts.
- **Atmospheric interactive Synth-Pop Soundscape**: Powered by an interactive, real-time procedural Web Audio synthesizer. No flat MP3 loops—each beat, melody, and sound effect is synthesized dynamically by your soundcard!
- **Penguin Boombox (Jukebox)**: Complete interactive audio controller inside the menu. Mix and match moods by skipping tracks or selecting premium audio programs:
  - 🏂 **Alpine Glow** (125 BPM): Bright and cheerful chiptune arcade energy with triangle waves.
  - 🌌 **Neon Glider** (110 BPM): Moody, cyber-cool retro rhythm powered by vintage sawtooth resonance.
  - ☕ **Chill Slopes** (92 BPM): Lofi warm tones with delicate sine wave melodies for cozy skating.
  - ⚡ **Glacier Fury** (138 BPM): Heavy electro-bass, pulsing kick-drums, and high-voltage lead synthesizer sweeps.
  - 👹 **Polar Storm** (148 BPM): Intense, fast-paced battle theme playing exclusively during Epic Boss Battles.
- **Dynamic Epic Boss Fight**: Survive the ultimate test against the *Giant Robotic Polar Bear*! Dodge targeting reticles, jump over energy shockwaves, and return fire with collected missiles.
- **Gear Store & Custom Outfits**: Enhance your run of the runway by leveling up with collected coins:
  - **Skins**: Outfits like Arctic Classic, Cyber Punk Penguin, Golden Crown King, or Retro Aviator.
  - **Skateboards**: Special decks like Snow Drifter, Laser Carver, Magma Glide, and Quantum Hover, each boasting custom multipliers for speed, jump height, score, or coin gain!
- **Interactive Touch & Key Controllers**: Seamless responsive buttons designed dynamically for both desktop mouse-clicks and touch/pointer-pad gestures on tablet or mobile device screens.

---

## 🛠️ Technical Implementation details

### 🔊 Procedural Jukebox Engine (`src/components/AudioSystem.ts`)
The entire soundtracks framework leverages low-level browser APIs:
- **Oscillator Nodes**: Generates standard shapes (sine, triangle, sawtooth, square) dynamically mapped on musical scale progressions.
- **White Noise Buffer Synthesis**: Real-time evaluation arrays creating rich analog hi-hat bursts and heavy snare textures without external file dependencies.
- **Feedback Delay Networks**: Stereo delay effects applied on lead melodies using native browser Delay and Gain nodes for that immersive studio eco-space depth.

### 🕹️ Controls Layout
- **Arrow Left / A**: Shift lane left.
- **Arrow Right / D**: Shift lane right.
- **Arrow Down / S**: Slide under high metal barriers.
- **Space / Arrow Up / W**: Jump above sharp ice spikes and low obstacles.
- **F / Enter**: Fire missiles back during boss sequences (Requires collected missiles!).
- **Mobile Gamepad**: Toggleable pointer overlay buttons at the bottom edge for easy accessibility on hand-held form-factors.

---

## 🚀 Development & Local Execution

This project is built using modern **Vite** and **React**.

### Build and Test
1. **To run the developer server locally**:
   ```bash
   npm run dev
   ```
2. **To compile for production**:
   ```bash
   npm run build
   ```
3. **To lint for code quality standards**:
   ```bash
   npm run lint
   ```
