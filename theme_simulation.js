/**
 * theme_simulation.js - Login-Exclusive Theme & Showtime Studio
 * Features:
 *  - Exclusively available on the Login Page (strictly disappears upon portal entry)
 *  - Daytime Shows: Bulk Avian Murmuration Wave, Pet Show, Rainbow Arc, Rain Shower
 *  - Nighttime Shows: Spacewalking Astronaut, Meteor Shower, Aurora Borealis, Fireflies
 *  - Clean Plain Sun & Moon with zero blurry white haze
 *  - Procedural Web Audio Engine (Bird chorus, puppy bark, gentle rain, cosmic ambience)
 */

(function () {
  'use strict';

  // =========================================================================
  // 1. PROCEDURAL AUDIO SYNTHESIZER ENGINE
  // =========================================================================
  class ShowtimeAudioEngine {
    constructor() {
      this.ctx = null;
      this.masterGain = null;
      this.volume = 0.35;
      this.isSoundEnabled = (function () {
        try {
          return localStorage.getItem('bvc_bird_sound') !== 'off';
        } catch (e) {
          return true;
        }
      })();
      this.rainNode = null;
      this.rainGain = null;
      this.unlocked = false;
    }

    ensureContext() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return false;
        try {
          this.ctx = new AudioCtx();
          this.masterGain = this.ctx.createGain();
          this.masterGain.gain.setValueAtTime(this.isSoundEnabled ? this.volume : 0, this.ctx.currentTime);
          this.masterGain.connect(this.ctx.destination);
        } catch (e) {
          console.warn('[ShowtimeAudio] AudioContext creation error:', e);
          return false;
        }
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return true;
    }

    unlock() {
      if (this.unlocked) return;
      if (this.ensureContext()) {
        this.unlocked = true;
      }
    }

    setVolume(val) {
      this.volume = Math.max(0, Math.min(1, val));
      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setValueAtTime(this.isSoundEnabled ? this.volume : 0, this.ctx.currentTime);
      }
    }

    toggleMute(forcedState) {
      this.unlock();
      this.isSoundEnabled = (typeof forcedState === 'boolean') ? forcedState : !this.isSoundEnabled;
      try {
        localStorage.setItem('bvc_bird_sound', this.isSoundEnabled ? 'on' : 'off');
      } catch (e) {}

      if (this.masterGain && this.ctx) {
        this.masterGain.gain.setValueAtTime(this.isSoundEnabled ? this.volume : 0, this.ctx.currentTime);
      }
      if (!this.isSoundEnabled) {
        this.stopRainSound();
      }
      return this.isSoundEnabled;
    }

    // 1. Natural Bird Flock Chirp Chorus
    playFlockChirps() {
      if (!this.isSoundEnabled || !this.ensureContext()) return;
      const ctx = this.ctx;
      let t = ctx.currentTime + 0.02;

      const pitches = [2400, 3100, 2600, 3400, 2800, 3200, 2500, 3300];
      pitches.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.18, t + 0.03);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.88, t + 0.07);

        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.22, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(t);
        osc.stop(t + 0.08);
        t += 0.08 + (idx % 2 === 0 ? 0.04 : 0.09);
      });
    }

    // 2. Playful Puppy Bark
    playPuppyBark() {
      if (!this.isSoundEnabled || !this.ensureContext()) return;
      const ctx = this.ctx;
      const t = ctx.currentTime + 0.02;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const bpf = ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(480, t);
      osc.frequency.exponentialRampToValueAtTime(820, t + 0.04);
      osc.frequency.exponentialRampToValueAtTime(320, t + 0.16);

      bpf.type = 'bandpass';
      bpf.frequency.setValueAtTime(650, t);
      bpf.Q.setValueAtTime(3.2, t);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);

      osc.connect(bpf);
      bpf.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + 0.19);
    }

    // 3. Gentle Calming Rain Soundscape
    startRainSound() {
      if (!this.isSoundEnabled || !this.ensureContext() || this.rainNode) return;
      const ctx = this.ctx;
      const bufferSize = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1; // White noise
      }

      this.rainNode = ctx.createBufferSource();
      this.rainNode.buffer = buffer;
      this.rainNode.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(750, ctx.currentTime);

      this.rainGain = ctx.createGain();
      this.rainGain.gain.setValueAtTime(0.0001, ctx.currentTime);
      this.rainGain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.8);

      this.rainNode.connect(filter);
      filter.connect(this.rainGain);
      this.rainGain.connect(this.masterGain);
      this.rainNode.start();
    }

    stopRainSound() {
      if (this.rainNode && this.ctx) {
        try {
          this.rainGain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.4);
          setTimeout(() => {
            if (this.rainNode) {
              this.rainNode.stop();
              this.rainNode.disconnect();
              this.rainNode = null;
            }
          }, 450);
        } catch (e) {
          this.rainNode = null;
        }
      }
    }

    // 4. Cosmic Deep Hum (Astronaut Spacewalk)
    playCosmicHum() {
      if (!this.isSoundEnabled || !this.ensureContext()) return;
      const ctx = this.ctx;
      const t = ctx.currentTime + 0.02;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(95, t);
      osc.frequency.linearRampToValueAtTime(120, t + 2.5);
      osc.frequency.linearRampToValueAtTime(80, t + 5.0);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.24, t + 0.8);
      gain.gain.linearRampToValueAtTime(0.18, t + 4.0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 6.0);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 6.2);
    }
  }

  const showAudio = new ShowtimeAudioEngine();

  // =========================================================================
  // 2. THEME & SHOWTIME STUDIO CONTROLLER (LOGIN PAGE ONLY)
  // =========================================================================
  const ThemeSimulationStudio = {
    audio: showAudio,
    activeShow: null,
    rainGenerated: false,
    firefliesGenerated: false,

    init() {
      // Gesture unlock
      const unlock = () => {
        showAudio.unlock();
        window.removeEventListener('click', unlock);
        window.removeEventListener('keydown', unlock);
        window.removeEventListener('touchstart', unlock);
      };
      window.addEventListener('click', unlock, { passive: true });
      window.addEventListener('keydown', unlock, { passive: true });
      window.addEventListener('touchstart', unlock, { passive: true });

      this.initStudioDOM();
      this.wireEvents();
      this.observeLoginState();

      // Ambient bird flap periodic sound on day theme
      setInterval(() => {
        if (this.isLoginActive() && this.isDayTime() && showAudio.isSoundEnabled && !this.activeShow) {
          showAudio.playFlockChirps();
        }
      }, 22000);
    },

    isLoginActive() {
      const login = document.getElementById('login-screen');
      return document.body.classList.contains('login-active') && login && !login.classList.contains('hidden');
    },

    isDayTime() {
      const b = document.body;
      return (b.classList.contains('theme-light') || b.classList.contains('faculty-light-theme')) && !b.classList.contains('orbit-to-night');
    },

    observeLoginState() {
      // If user logs in or dashboard shows, immediately kill any studio dock & shows
      const observer = new MutationObserver(() => {
        if (!this.isLoginActive()) {
          this.closeStudio();
          this.clearAllShows();
        }
        if (this.isDayTime()) {
          if (window.clearCelestialStars) window.clearCelestialStars();
        } else {
          if (window.generateCelestialStars) window.generateCelestialStars();
        }
      });
      observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

      const loginScreen = document.getElementById('login-screen');
      if (loginScreen) {
        observer.observe(loginScreen, { attributes: true, attributeFilter: ['class', 'style'] });
      }
    },

    // --- DAYTIME SHOWS ---

    // 1. Bulk Avian Wave Show ("Bird Show")
    triggerBirdShow() {
      this.clearAllShows();
      this.activeShow = 'birds';

      const overlay = document.getElementById('murmuration-overlay');
      if (!overlay) return;

      overlay.innerHTML = '';
      const wave = document.createElement('div');
      wave.className = 'murmuration-wave';

      // Spawn 18 small black birds traveling together bulkily in wave formation
      for (let i = 0; i < 18; i++) {
        const bird = document.createElement('div');
        bird.className = 'small-black-bird';
        bird.style.top = `${(i * 14 + (i * 7) % 23) % 130}px`;
        bird.style.left = `${-(i * 22) - 10}px`;
        bird.style.animationDelay = `${-(i * 0.12)}s`;
        bird.innerHTML = `
          <svg class="pro-small-bird-svg" viewBox="0 0 54 36">
            <path class="bird-w-far" d="M 28,18 C 24,10 20,4 12,1 C 18,6 22,12 24,18 Z" fill="#000000"/>
            <path class="bird-body" d="M 44,18 C 48,17.5 52,18 53,18.5 C 49,19.5 45,20 41,19 C 33,18 25,18 16,21 C 8,24 2,27 0,28 C 3,25 9,22 13,21 C 21,19 32,18 44,18 Z" fill="#000000"/>
            <path class="bird-w-near" d="M 30,19 C 26,11 22,5 14,2 C 20,7 24,13 26,19 Z" fill="#000000"/>
          </svg>
        `;
        wave.appendChild(bird);
      }

      overlay.appendChild(wave);
      overlay.classList.add('active');
      showAudio.playFlockChirps();

      if (typeof showToast === 'function') {
        showToast('🕊️ Avian Murmuration Wave Show Flying Across Sky!');
      }

      setTimeout(() => {
        if (this.activeShow === 'birds') {
          overlay.classList.remove('active');
          this.activeShow = null;
          this.updateStudioUI();
        }
      }, 14500);

      this.updateStudioUI();
    },

    // 2. Pet Show (Playful Running Puppy)
    triggerPetShow() {
      this.clearAllShows();
      this.activeShow = 'pet';

      const pet = document.getElementById('pet-show-container');
      if (!pet) return;

      pet.classList.remove('active');
      void pet.offsetWidth; // reflow
      pet.classList.add('active');

      showAudio.playPuppyBark();
      setTimeout(() => showAudio.playPuppyBark(), 4500);
      setTimeout(() => showAudio.playPuppyBark(), 9000);

      if (typeof showToast === 'function') {
        showToast('🐶 Playful Pet Show Running Across Campus!');
      }

      setTimeout(() => {
        if (this.activeShow === 'pet') {
          pet.classList.remove('active');
          this.activeShow = null;
          this.updateStudioUI();
        }
      }, 12500);

      this.updateStudioUI();
    },

    // 3. Rainbow Show
    triggerRainbowShow() {
      this.clearAllShows();
      this.activeShow = 'rainbow';

      const rb = document.getElementById('rainbow-show-layer');
      if (!rb) return;

      rb.classList.add('active');
      if (typeof showToast === 'function') {
        showToast('🌈 Radiant Rainbow Arc Shining Over Daylight Sky!');
      }
      this.updateStudioUI();
    },

    // 4. Rainy Show
    triggerRainShow() {
      this.clearAllShows();
      this.activeShow = 'rain';

      const rainLayer = document.getElementById('rain-show-layer');
      if (!rainLayer) return;

      if (!this.rainGenerated) {
        const frag = document.createDocumentFragment();
        for (let i = 0; i < 70; i++) {
          const drop = document.createElement('div');
          drop.className = 'rain-drop';
          drop.style.left = `${(i * 1.45) % 100}%`;
          drop.style.animationDelay = `${(Math.random() * 0.9).toFixed(2)}s`;
          drop.style.animationDuration = `${(0.65 + Math.random() * 0.35).toFixed(2)}s`;
          frag.appendChild(drop);
        }
        rainLayer.appendChild(frag);
        this.rainGenerated = true;
      }

      rainLayer.classList.add('active');
      showAudio.startRainSound();

      if (typeof showToast === 'function') {
        showToast('🌧️ Calming Rainy Show Falling Over Campus Sky!');
      }
      this.updateStudioUI();
    },

    // --- NIGHTTIME SHOWS ---

    // 1. Spacewalking Astronaut Show
    triggerAstronautShow() {
      this.clearAllShows();
      this.activeShow = 'astronaut';

      const astroLayer = document.getElementById('astronaut-show-layer');
      if (!astroLayer) return;

      const holder = astroLayer.querySelector('.astronaut-holder');
      if (holder) {
        holder.style.animation = 'none';
        void holder.offsetWidth;
        holder.style.animation = '';
      }

      astroLayer.classList.add('active');
      showAudio.playCosmicHum();

      if (typeof showToast === 'function') {
        showToast('👨‍🚀 Zero-G Spacewalking Astronaut Floating Across Cosmos!');
      }

      setTimeout(() => {
        if (this.activeShow === 'astronaut') {
          astroLayer.classList.remove('active');
          this.activeShow = null;
          this.updateStudioUI();
        }
      }, 37000);

      this.updateStudioUI();
    },

    // 2. Meteor Shower Show
    triggerMeteorShower() {
      this.clearAllShows();
      this.activeShow = 'meteor';

      const shower = document.getElementById('pro-meteor-shower');
      if (!shower) return;

      for (let i = 0; i < 7; i++) {
        setTimeout(() => {
          const star = document.createElement('div');
          star.className = 'pro-shooting-star active';
          star.style.top = `${10 + Math.random() * 45}%`;
          star.style.left = `${25 + Math.random() * 70}%`;
          shower.appendChild(star);
          setTimeout(() => star.remove(), 1500);
        }, i * 360);
      }

      if (typeof showToast === 'function') {
        showToast('💫 Meteor Shower Launched Across Night Starfield!');
      }
      this.updateStudioUI();
    },

    // 3. Aurora Borealis Show
    triggerAuroraShow() {
      this.clearAllShows();
      this.activeShow = 'aurora';

      const aurora = document.getElementById('pro-aurora-ribbon');
      if (aurora) aurora.classList.add('active');

      if (typeof showToast === 'function') {
        showToast('🌌 Emerald & Violet Aurora Borealis Ribbon Shimmering!');
      }
      this.updateStudioUI();
    },

    // 4. Bioluminescent Fireflies Show
    triggerFirefliesShow() {
      this.clearAllShows();
      this.activeShow = 'fireflies';

      const ffLayer = document.getElementById('fireflies-show-layer');
      if (!ffLayer) return;

      if (!this.firefliesGenerated) {
        const frag = document.createDocumentFragment();
        for (let i = 0; i < 28; i++) {
          const f = document.createElement('div');
          f.className = 'firefly-sparkle';
          f.style.top = `${(i * 11 + 7) % 90}%`;
          f.style.left = `${(i * 17 + 13) % 94}%`;
          f.style.animationDelay = `${(i * 0.25).toFixed(2)}s, ${(i * 0.15).toFixed(2)}s`;
          frag.appendChild(f);
        }
        ffLayer.appendChild(frag);
        this.firefliesGenerated = true;
      }

      ffLayer.classList.add('active');
      if (typeof showToast === 'function') {
        showToast('✨ Golden Bioluminescent Fireflies Swirling in Night Sky!');
      }
      this.updateStudioUI();
    },

    // --- CLEAR / STOP ALL SHOWS ---
    clearAllShows() {
      this.activeShow = null;

      // Day show layers
      const murmuration = document.getElementById('murmuration-overlay');
      if (murmuration) {
        murmuration.classList.remove('active');
        murmuration.innerHTML = '';
      }

      const pet = document.getElementById('pet-show-container');
      if (pet) pet.classList.remove('active');

      const rainbow = document.getElementById('rainbow-show-layer');
      if (rainbow) rainbow.classList.remove('active');

      const rain = document.getElementById('rain-show-layer');
      if (rain) rain.classList.remove('active');
      showAudio.stopRainSound();

      // Night show layers
      const astronaut = document.getElementById('astronaut-show-layer');
      if (astronaut) astronaut.classList.remove('active');

      const aurora = document.getElementById('pro-aurora-ribbon');
      if (aurora) aurora.classList.remove('active');

      const fireflies = document.getElementById('fireflies-show-layer');
      if (fireflies) fireflies.classList.remove('active');

      this.updateStudioUI();
    },

    // --- STUDIO DOM CREATION & CONTROLS ---
    initStudioDOM() {
      if (document.getElementById('theme-simulation-studio')) return;

      const dock = document.createElement('div');
      dock.id = 'theme-simulation-studio';
      dock.className = 'sim-studio-dock hidden';
      dock.setAttribute('role', 'dialog');
      dock.setAttribute('aria-label', 'Theme & Atmosphere Simulation Studio');

      dock.innerHTML = `
        <div class="sim-header">
          <div class="sim-header-title">
            <i class="fas fa-sparkles" style="color: #c084fc;"></i>
            <span>Simulation Studio</span>
            <span class="sim-badge-pro">LOGIN ONLY</span>
          </div>
          <button class="sim-close-btn" onclick="window.ThemeSimulationStudio.toggleStudio(false)" title="Close Studio">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <!-- Section 1: Sky Theme Switcher -->
        <div class="sim-section">
          <div class="sim-section-label">
            <span>Atmosphere Theme</span>
            <span class="sim-val-pill" id="sim-current-mode-tag">Day Sky</span>
          </div>
          <div class="sim-theme-switch-row">
            <button class="sim-theme-btn" id="btn-theme-day" onclick="window.ThemeSimulationStudio.switchTheme('light')">
              <span>☀️</span> <span>Day Sky (Sun)</span>
            </button>
            <button class="sim-theme-btn" id="btn-theme-night" onclick="window.ThemeSimulationStudio.switchTheme('dark')">
              <span>🌙</span> <span>Night Sky (Moon)</span>
            </button>
          </div>
        </div>

        <!-- Section 2: Contextual Showtime Shows -->
        <div class="sim-section">
          <div class="sim-section-label">
            <span id="sim-shows-section-title">Daytime Shows</span>
            <span class="sim-val-pill" id="sim-active-show-tag">Pristine</span>
          </div>

          <!-- Day Shows Grid -->
          <div class="sim-shows-grid" id="sim-day-shows-grid">
            <div class="sim-show-card" data-show="birds" onclick="window.ThemeSimulationStudio.triggerBirdShow()">
              <span class="sim-show-icon">🕊️</span>
              <div class="sim-show-info">
                <strong>Bird Show</strong>
                <small>Bulk wave flock</small>
              </div>
            </div>
            <div class="sim-show-card" data-show="pet" onclick="window.ThemeSimulationStudio.triggerPetShow()">
              <span class="sim-show-icon">🐶</span>
              <div class="sim-show-info">
                <strong>Pet Show</strong>
                <small>Playful puppy run</small>
              </div>
            </div>
            <div class="sim-show-card" data-show="rainbow" onclick="window.ThemeSimulationStudio.triggerRainbowShow()">
              <span class="sim-show-icon">🌈</span>
              <div class="sim-show-info">
                <strong>Rainbow Show</strong>
                <small>7-color glowing arc</small>
              </div>
            </div>
            <div class="sim-show-card" data-show="rain" onclick="window.ThemeSimulationStudio.triggerRainShow()">
              <span class="sim-show-icon">🌧️</span>
              <div class="sim-show-info">
                <strong>Rainy Show</strong>
                <small>Calming rain drops</small>
              </div>
            </div>
          </div>

          <!-- Night Shows Grid -->
          <div class="sim-shows-grid hidden" id="sim-night-shows-grid">
            <div class="sim-show-card" data-show="astronaut" onclick="window.ThemeSimulationStudio.triggerAstronautShow()">
              <span class="sim-show-icon">👨‍🚀</span>
              <div class="sim-show-info">
                <strong>Astronaut Show</strong>
                <small>Zero-G spacewalk</small>
              </div>
            </div>
            <div class="sim-show-card" data-show="meteor" onclick="window.ThemeSimulationStudio.triggerMeteorShower()">
              <span class="sim-show-icon">💫</span>
              <div class="sim-show-info">
                <strong>Meteor Shower</strong>
                <small>Shooting fireballs</small>
              </div>
            </div>
            <div class="sim-show-card" data-show="aurora" onclick="window.ThemeSimulationStudio.triggerAuroraShow()">
              <span class="sim-show-icon">🌌</span>
              <div class="sim-show-info">
                <strong>Aurora Show</strong>
                <small>Northern lights</small>
              </div>
            </div>
            <div class="sim-show-card" data-show="fireflies" onclick="window.ThemeSimulationStudio.triggerFirefliesShow()">
              <span class="sim-show-icon">✨</span>
              <div class="sim-show-info">
                <strong>Fireflies Show</strong>
                <small>Golden stardust</small>
              </div>
            </div>
          </div>

          <!-- Clear Shows Button -->
          <button class="sim-clear-btn" onclick="window.ThemeSimulationStudio.clearAllShows()">
            <i class="fas fa-undo"></i> <span>Reset to Clean Plain Sky</span>
          </button>
        </div>

        <!-- Section 3: Audio Engine Controls -->
        <div class="sim-section">
          <div class="sim-section-label">
            <span>Nature Audio</span>
            <span class="sim-val-pill" id="sim-audio-tag">Active</span>
          </div>
          <div class="sim-audio-row">
            <span style="font-size: 11.5px; color: #e2e8f0;"><i class="fas fa-volume-up"></i> Nature Sound Effects</span>
            <label class="sim-switch">
              <input type="checkbox" id="sim-audio-switch" checked>
              <span class="sim-slider-switch"></span>
            </label>
          </div>
          <div style="margin-top: 8px;">
            <div style="display:flex; justify-content:space-between; font-size:10px; color:#94a3b8; margin-bottom:2px;">
              <span>Volume</span>
              <span id="sim-vol-txt">35%</span>
            </div>
            <input type="range" class="sim-range" id="sim-volume-slider" min="0" max="1" step="0.05" value="0.35">
          </div>
        </div>

        <div class="sim-footer">
          <div><span class="status-dot"></span> Pristine Clean Sun & Moon</div>
          <div>BVC Smart Portal</div>
        </div>
      `;

      document.body.appendChild(dock);
    },

    wireEvents() {
      // Audio toggle
      const aSwitch = document.getElementById('sim-audio-switch');
      if (aSwitch) {
        aSwitch.addEventListener('change', (e) => {
          showAudio.toggleMute(e.target.checked);
          this.updateStudioUI();
        });
      }

      // Volume slider
      const vSlider = document.getElementById('sim-volume-slider');
      if (vSlider) {
        vSlider.addEventListener('input', (e) => {
          showAudio.setVolume(parseFloat(e.target.value));
          const t = document.getElementById('sim-vol-txt');
          if (t) t.textContent = `${Math.round(e.target.value * 100)}%`;
        });
      }
    },

    switchTheme(target) {
      if (window.applyPortalTheme) {
        window.applyPortalTheme(target);
      }
      this.clearAllShows();
      this.updateStudioUI();
    },

    toggleStudio(forceOpen) {
      // Strictly disallowed after login
      if (!this.isLoginActive()) {
        this.closeStudio();
        return;
      }

      const dock = document.getElementById('theme-simulation-studio');
      if (!dock) return;
      const isHidden = dock.classList.contains('hidden');
      const shouldOpen = (typeof forceOpen === 'boolean') ? forceOpen : isHidden;

      if (shouldOpen) {
        dock.classList.remove('hidden');
        showAudio.unlock();
        this.updateStudioUI();
      } else {
        dock.classList.add('hidden');
      }
    },

    closeStudio() {
      const dock = document.getElementById('theme-simulation-studio');
      if (dock) dock.classList.add('hidden');
    },

    updateStudioUI() {
      const isDay = this.isDayTime();

      // Mode Tag
      const modeTag = document.getElementById('sim-current-mode-tag');
      if (modeTag) {
        modeTag.textContent = isDay ? 'Day Sky (Sun)' : 'Night Sky (Moon)';
        modeTag.style.color = isDay ? '#f59e0b' : '#38bdf8';
      }

      // Theme Buttons
      const btnDay = document.getElementById('btn-theme-day');
      const btnNight = document.getElementById('btn-theme-night');
      if (btnDay && btnNight) {
        btnDay.classList.toggle('active', isDay);
        btnNight.classList.toggle('active', !isDay);
      }

      // Section Title
      const titleTag = document.getElementById('sim-shows-section-title');
      if (titleTag) {
        titleTag.textContent = isDay ? 'Daytime Shows' : 'Nighttime Shows';
      }

      // Show Grids (Toggle Day vs Night)
      const dayGrid = document.getElementById('sim-day-shows-grid');
      const nightGrid = document.getElementById('sim-night-shows-grid');
      if (dayGrid && nightGrid) {
        dayGrid.classList.toggle('hidden', !isDay);
        nightGrid.classList.toggle('hidden', isDay);
      }

      // Active Show Tag
      const showTag = document.getElementById('sim-active-show-tag');
      if (showTag) {
        showTag.textContent = this.activeShow ? this.activeShow.toUpperCase() : 'PRISTINE';
        showTag.style.color = this.activeShow ? '#c084fc' : '#38bdf8';
      }

      // Highlight active card
      document.querySelectorAll('.sim-show-card').forEach((card) => {
        card.classList.toggle('active', card.getAttribute('data-show') === this.activeShow);
      });

      // Audio state
      const aSwitch = document.getElementById('sim-audio-switch');
      if (aSwitch) aSwitch.checked = showAudio.isSoundEnabled;

      const aTag = document.getElementById('sim-audio-tag');
      if (aTag) {
        aTag.textContent = showAudio.isSoundEnabled ? 'Active' : 'Muted';
        aTag.style.color = showAudio.isSoundEnabled ? '#38bdf8' : '#94a3b8';
      }
    },
  };

  window.ThemeSimulationStudio = ThemeSimulationStudio;

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ThemeSimulationStudio.init());
  } else {
    ThemeSimulationStudio.init();
  }
})();
