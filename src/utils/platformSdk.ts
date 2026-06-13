/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type GamePlatform = 'offline' | 'poki' | 'crazygames';

// Helper to extend window with SDK declarations
declare global {
  interface Window {
    PokiSDK?: {
      init: () => Promise<any>;
      gameplayStart: () => void;
      gameplayStop: () => void;
      commercialBreak: () => Promise<any>;
      rewardedBreak: () => Promise<boolean>;
    };
    CrazyGames?: {
      SDK?: {
        environment?: string;
        game: {
          gameplayStart: () => void;
          gameplayStop: () => void;
        };
        adManager: {
          requestAd: (
            type: 'midgame' | 'rewarded',
            callbacks?: {
              adStarted?: () => void;
              adFinished?: () => void;
              adError?: (error: string) => void;
            }
          ) => void;
        };
        leaderboard: {
          submitScore: (options: {
            leaderboardRequestSelector?: string;
            score: number;
          }) => void;
        };
      };
    };
  }
}

class PlatformSDK {
  private activePlatform: GamePlatform = 'offline';
  private initialized = false;
  private adRunning = false;

  constructor() {
    this.detectPlatform();
  }

  private isCrazyGamesSupported(): boolean {
    if (typeof window === 'undefined') return false;
    if (!this.isCrazyGamesDomain()) return false;
    const sdk = window.CrazyGames?.SDK;
    if (!sdk) return false;
    return sdk.environment !== 'disabled';
  }

  private isCrazyGamesDomain(): boolean {
    if (typeof window === 'undefined') return false;
    const host = window.location.hostname.toLowerCase();
    return host.includes('crazygames') || host.includes('crazy.') || host.includes('crazyg.am');
  }

  private isPokiDomain(): boolean {
    if (typeof window === 'undefined') return false;
    const host = window.location.hostname.toLowerCase();
    return host.includes('poki') || host.includes('poki-gdn');
  }

  /**
   * Detect current execution context based on domain or search parameters
   */
  private detectPlatform() {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const sdkParam = params.get('sdk') || params.get('platform');

    // Force simulation via URL query params
    if (sdkParam === 'poki') {
      this.activePlatform = 'poki';
    } else if (sdkParam === 'crazygames' || sdkParam === 'crazy') {
      this.activePlatform = 'crazygames';
    } else if (window.PokiSDK) {
      this.activePlatform = 'poki';
    } else if (window.CrazyGames) {
      this.activePlatform = 'crazygames';
    } else {
      // Hostname-based detection
      const host = window.location.hostname.toLowerCase();
      if (host.includes('poki')) {
        this.activePlatform = 'poki';
      } else if (host.includes('crazygames') || host.includes('crazy.')) {
        this.activePlatform = 'crazygames';
      } else {
        // Fallback to active saved preference if stored
        try {
          const pref = localStorage.getItem('penguin_rush_sdk_preference');
          if (pref === 'poki' || pref === 'crazygames' || pref === 'offline') {
            this.activePlatform = pref;
          }
        } catch (_) {}
      }
    }

    // Safety fallback: if we are not on an approved platform domain,
    // force activePlatform to 'offline' to prevent any unwanted side effects or console warnings.
    if (this.activePlatform === 'crazygames' && !this.isCrazyGamesDomain()) {
      console.log('[PlatformSDK] Forcing offline mode due to non-CrazyGames domain context.');
      this.activePlatform = 'offline';
    } else if (this.activePlatform === 'poki' && !this.isPokiDomain()) {
      console.log('[PlatformSDK] Forcing offline mode due to non-Poki domain context.');
      this.activePlatform = 'offline';
    }

    console.log(`[PlatformSDK] Running in mode: ${this.activePlatform.toUpperCase()}`);
  }

  /**
   * Set platform preference manually (allows testing directly in the preview UI!)
   */
  public setPlatformPreference(platform: GamePlatform) {
    this.activePlatform = platform;
    try {
      localStorage.setItem('penguin_rush_sdk_preference', platform);
    } catch (_) {}
    this.lazyLoadSdk();
  }

  public getPlatform(): GamePlatform {
    return this.activePlatform;
  }

  /**
   * Initializes the selected SDK
   */
  public async init(): Promise<boolean> {
    if (this.initialized) return true;
    this.initialized = true;
    return this.lazyLoadSdk();
  }

  private async lazyLoadSdk(): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    if (this.activePlatform === 'poki') {
      if (!this.isPokiDomain()) {
        console.log('[PlatformSDK] Skipping Poki SDK injection (non-Poki domain)');
        return true;
      }
      if (!window.PokiSDK) {
        console.log('[PlatformSDK] Injecting Poki SDK script...');
        await this.injectScript('https://game-cdn.poki.com/scripts/v2/poki-sdk.js');
      }
      try {
        if (window.PokiSDK) {
          await window.PokiSDK.init();
          console.log('[PlatformSDK] Poki SDK Initialized successfully.');
        }
      } catch (err) {
        console.warn('[PlatformSDK] Poki SDK init failed/adblock:', err);
      }
    } else if (this.activePlatform === 'crazygames') {
      if (!this.isCrazyGamesDomain()) {
        console.log('[PlatformSDK] Skipping CrazyGames SDK injection (non-CrazyGames domain)');
        return true;
      }
      if (!window.CrazyGames) {
        console.log('[PlatformSDK] Injecting CrazyGames SDK script...');
        await this.injectScript('https://sdk.crazygames.com/crazygames-sdk-v2.js');
      }
      console.log('[PlatformSDK] CrazyGames SDK initialized.');
    }

    return true;
  }

  private injectScript(src: string): Promise<void> {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        console.error(`[PlatformSDK] Failed to load script: ${src}`);
        resolve(); // resolve to let game continue offline
      };
      document.head.appendChild(script);
    });
  }

  /**
   * Notify platform that gameplay is starting (ads paused, tracking active)
   */
  public gameplayStart() {
    this.init(); // lazy safety init
    console.log('[PlatformSDK] Gameplay started.');
    if (this.activePlatform === 'poki' && window.PokiSDK) {
      window.PokiSDK.gameplayStart();
    } else if (this.isCrazyGamesSupported() && window.CrazyGames?.SDK) {
      window.CrazyGames.SDK.game.gameplayStart();
    }
  }

  /**
   * Notify platform that gameplay stopped (intermission screen, menus)
   */
  public gameplayStop() {
    console.log('[PlatformSDK] Gameplay stopped.');
    if (this.activePlatform === 'poki' && window.PokiSDK) {
      window.PokiSDK.gameplayStop();
    } else if (this.isCrazyGamesSupported() && window.CrazyGames?.SDK) {
      window.CrazyGames.SDK.game.gameplayStop();
    }
  }

  /**
   * Request a midroll commercial break (non-disruptive ad between rounds)
   */
  public showMidrollAd(onStarted: () => void, onFinished: () => void) {
    console.log('[PlatformSDK] Requesting midroll ad...');
    this.adRunning = true;
    onStarted();

    if (this.activePlatform === 'poki' && window.PokiSDK) {
      window.PokiSDK.commercialBreak()
        .then(() => {
          this.adRunning = false;
          onFinished();
        })
        .catch((err) => {
          console.warn('[PlatformSDK] Poki midroll blocked/skipped', err);
          this.adRunning = false;
          onFinished();
        });
    } else if (this.isCrazyGamesSupported() && window.CrazyGames?.SDK) {
      window.CrazyGames.SDK.adManager.requestAd('midgame', {
        adStarted: () => {
          this.adRunning = true;
        },
        adFinished: () => {
          this.adRunning = false;
          onFinished();
        },
        adError: (err) => {
          console.warn('[PlatformSDK] CrazyGames midroll failed:', err);
          this.adRunning = false;
          onFinished();
        },
      });
    } else {
      // Simulate standard offline ad display
      setTimeout(() => {
        this.adRunning = false;
        onFinished();
      }, 1500);
    }
  }

  /**
   * Request a rewarded video ad (gives coins, unlocks premium assets, etc.)
   */
  public showRewardedAd(
    onStarted: () => void,
    onCompleted: () => void,
    onCancelled: () => void
  ) {
    console.log('[PlatformSDK] Requesting rewarded ad...');
    this.adRunning = true;
    onStarted();

    if (this.activePlatform === 'poki' && window.PokiSDK) {
      window.PokiSDK.rewardedBreak()
        .then((success) => {
          this.adRunning = false;
          if (success) {
            onCompleted();
          } else {
            onCancelled();
          }
        })
        .catch((err) => {
          console.warn('[PlatformSDK] Poki rewarded break failed', err);
          this.adRunning = false;
          onCancelled();
        });
    } else if (this.isCrazyGamesSupported() && window.CrazyGames?.SDK) {
      window.CrazyGames.SDK.adManager.requestAd('rewarded', {
        adStarted: () => {
          this.adRunning = true;
        },
        adFinished: () => {
          this.adRunning = false;
          onCompleted();
        },
        adError: (err) => {
          console.warn('[PlatformSDK] CrazyGames rewarded ad failed:', err);
          this.adRunning = false;
          onCancelled();
        },
      });
    } else {
      // Simulate high quality rewarded prompt with offline fallback
      setTimeout(() => {
        this.adRunning = false;
        onCompleted();
      }, 2000);
    }
  }

  /**
   * Submit high scores to CrazyGames Global Leaderboards or log on Poki
   */
  public submitScore(score: number) {
    console.log(`[PlatformSDK] Submitting high score of ${score}`);
    if (this.isCrazyGamesSupported() && window.CrazyGames?.SDK) {
      window.CrazyGames.SDK.leaderboard.submitScore({
        score: score,
      });
    }
  }

  /**
   * Status of whether an active advertisement is currently hijacking focus
   */
  public isAdActive(): boolean {
    return this.adRunning;
  }
}

export const platformSdk = new PlatformSDK();
