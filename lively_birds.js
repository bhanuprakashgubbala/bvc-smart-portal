/**
 * lively_birds.js - Authentic Avian Visuals & Web Audio Synthesis Engine
 * Provides realistic animated flying birds (Eagle, Indian Roller, Doves, Wallcreeper, Scarlet Macaw)
 * with authentic procedural Web Audio bird calls, ambient nature soundscapes, and interactive controls.
 */

(function () {
  'use strict';

  // --- 1. AVIAN AUDIO ENGINE (Web Audio API Procedural Synthesis) ---
  class AvianAudioEngine {
    constructor() {
      this.ctx = null;
      this.masterGain = null;
      this.isSoundEnabled = (function () {
        try {
          return localStorage.getItem('bvc_bird_sound') !== 'off';
        } catch (e) {
          return true;
        }
      })();
      this.ambientTimer = null;
      this.ambientRunning = false;
      this.unlocked = false;
    }

    init() {
      // Setup unlock triggers on user gestures
      const unlockHandler = () => {
        this.unlockContext();
        window.removeEventListener('click', unlockHandler);
        window.removeEventListener('keydown', unlockHandler);
        window.removeEventListener('touchstart', unlockHandler);
      };
      window.addEventListener('click', unlockHandler, { passive: true });
      window.addEventListener('keydown', unlockHandler, { passive: true });
      window.addEventListener('touchstart', unlockHandler, { passive: true });

      // Observe day/night mode transitions
      this.observeThemeChanges();

      // Start ambient sound loop if currently in day mode
      if (this.isDayMode()) {
        this.startAmbient();
      }

      this.updateUI();
    }

    ensureContext() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return false;
        try {
          this.ctx = new AudioCtx();
          this.masterGain = this.ctx.createGain();
          this.masterGain.gain.setValueAtTime(0.32, this.ctx.currentTime);
          this.masterGain.connect(this.ctx.destination);
        } catch (e) {
          console.warn('[AvianAudio] AudioContext creation failed:', e);
          return false;
        }
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return true;
    }

    unlockContext() {
      if (this.unlocked) return;
      if (this.ensureContext()) {
        this.unlocked = true;
        if (this.isSoundEnabled && this.isDayMode() && !this.ambientRunning) {
          this.startAmbient();
        }
      }
    }

    isDayMode() {
      const b = document.body;
      return (
        b.classList.contains('theme-light') ||
        b.classList.contains('faculty-light-theme')
      ) && !b.classList.contains('orbit-to-night');
    }

    observeThemeChanges() {
      const observer = new MutationObserver(() => {
        if (this.isDayMode()) {
          if (this.isSoundEnabled && !this.ambientRunning) {
            this.startAmbient();
          }
        } else {
          this.stopAmbient();
        }
      });
      observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }

    // Toggle mute/unmute
    toggleSound(e) {
      if (e) e.stopPropagation();
      this.unlockContext();
      this.isSoundEnabled = !this.isSoundEnabled;
      try {
        localStorage.setItem('bvc_bird_sound', this.isSoundEnabled ? 'on' : 'off');
      } catch (err) {}

      if (this.isSoundEnabled && this.isDayMode()) {
        this.startAmbient();
        this.playAmbientChirp(); // quick pleasant chime to confirm activation
      } else {
        this.stopAmbient();
      }
      this.updateUI();

      if (typeof showToast === 'function') {
        showToast(
          this.isSoundEnabled
            ? '🌿 Lively Bird Sounds & Nature Calls: ACTIVATED'
            : '🔇 Bird Sounds Muted'
        );
      }
    }

    updateUI() {
      const btns = document.querySelectorAll('.bird-sound-toggle-btn');
      btns.forEach((btn) => {
        btn.classList.toggle('active', this.isSoundEnabled);
        btn.classList.toggle('muted', !this.isSoundEnabled);
        btn.setAttribute('aria-pressed', String(this.isSoundEnabled));
        btn.title = this.isSoundEnabled
          ? 'Lively Bird Sounds: ACTIVE (Click to Mute)'
          : 'Lively Bird Sounds: MUTED (Click to Enable)';

        const icon = btn.querySelector('.sound-icon');
        if (icon) {
          icon.className = `sound-icon fas ${this.isSoundEnabled ? 'fa-volume-up' : 'fa-volume-mute'}`;
        }
      });
    }

    // --- PROCEDURAL CALLS FOR EACH DISTINCT SPECIES ---

    // 1. Eagle: High, soaring, piercing raptor screech ("Kreeee-arrr!")
    playEagleCall() {
      if (!this.isSoundEnabled || !this.ensureContext()) return;
      const ctx = this.ctx;
      const t = ctx.currentTime + 0.02;

      // Carrier Oscillator (Main screech)
      const carrier = ctx.createOscillator();
      const carrierGain = ctx.createGain();
      carrier.type = 'sawtooth';

      // Frequency envelope: rapid rise then majestic descending slide
      carrier.frequency.setValueAtTime(2300, t);
      carrier.frequency.exponentialRampToValueAtTime(2900, t + 0.09);
      carrier.frequency.exponentialRampToValueAtTime(1400, t + 0.72);

      // Vocal cord modulation (Avian flutter / rasp)
      const mod = ctx.createOscillator();
      const modGain = ctx.createGain();
      mod.type = 'sine';
      mod.frequency.setValueAtTime(28, t);
      mod.frequency.linearRampToValueAtTime(18, t + 0.7);
      modGain.gain.setValueAtTime(180, t);
      mod.connect(carrier.frequency);

      // Resonant raptor bill filter
      const bpf = ctx.createBiquadFilter();
      bpf.type = 'bandpass';
      bpf.frequency.setValueAtTime(2150, t);
      bpf.frequency.linearRampToValueAtTime(1600, t + 0.72);
      bpf.Q.setValueAtTime(3.6, t);

      // Gain envelope
      carrierGain.gain.setValueAtTime(0.0001, t);
      carrierGain.gain.exponentialRampToValueAtTime(0.35, t + 0.08);
      carrierGain.gain.setValueAtTime(0.3, t + 0.45);
      carrierGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.74);

      // Sub-harmonic overtone (gives depth to the raptor scream)
      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = 'triangle';
      sub.frequency.setValueAtTime(1150, t);
      sub.frequency.exponentialRampToValueAtTime(700, t + 0.72);
      subGain.gain.setValueAtTime(0.0001, t);
      subGain.gain.exponentialRampToValueAtTime(0.18, t + 0.1);
      subGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);

      carrier.connect(bpf);
      bpf.connect(carrierGain);
      carrierGain.connect(this.masterGain);

      sub.connect(subGain);
      subGain.connect(this.masterGain);

      carrier.start(t);
      mod.start(t);
      sub.start(t);
      carrier.stop(t + 0.76);
      mod.stop(t + 0.76);
      sub.stop(t + 0.76);
    }

    // 2. Indian Roller: Energetic rolling azure chatter & melodic trill ("Chrr-kee-weet!")
    playRollerCall() {
      if (!this.isSoundEnabled || !this.ensureContext()) return;
      const ctx = this.ctx;
      let t = ctx.currentTime + 0.02;

      const pitches = [2150, 2750, 2300, 3100, 2450, 2800];
      pitches.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const bpf = ctx.createBiquadFilter();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.15, t + 0.035);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.9, t + 0.065);

        bpf.type = 'bandpass';
        bpf.frequency.setValueAtTime(freq, t);
        bpf.Q.setValueAtTime(4.2, t);

        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.26, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);

        osc.connect(bpf);
        bpf.connect(gain);
        gain.connect(this.masterGain);

        osc.start(t);
        osc.stop(t + 0.075);
        t += 0.075 + (idx % 2 === 0 ? 0.025 : 0.045);
      });
    }

    // 3. Flock of Doves: Gentle double coo ("Coo-ooo... coo-roooo") with wing flutter
    playDoveCall() {
      if (!this.isSoundEnabled || !this.ensureContext()) return;
      const ctx = this.ctx;
      let t = ctx.currentTime + 0.02;

      // Syllable 1: Soft warm coo (490Hz -> 420Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(490, t);
      osc1.frequency.exponentialRampToValueAtTime(420, t + 0.26);

      gain1.gain.setValueAtTime(0.0001, t);
      gain1.gain.exponentialRampToValueAtTime(0.24, t + 0.04);
      gain1.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);

      osc1.connect(gain1);
      gain1.connect(this.masterGain);
      osc1.start(t);
      osc1.stop(t + 0.3);

      t += 0.36; // pause

      // Syllable 2: Longer resonant coo-rooo (540Hz -> 430Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(530, t);
      osc2.frequency.linearRampToValueAtTime(555, t + 0.1);
      osc2.frequency.exponentialRampToValueAtTime(410, t + 0.42);

      gain2.gain.setValueAtTime(0.0001, t);
      gain2.gain.exponentialRampToValueAtTime(0.28, t + 0.06);
      gain2.gain.setValueAtTime(0.22, t + 0.25);
      gain2.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);

      osc2.connect(gain2);
      gain2.connect(this.masterGain);
      osc2.start(t);
      osc2.stop(t + 0.46);

      // Wing flutter noise burst
      try {
        const bufferSize = ctx.sampleRate * 0.35;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.12));
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const nFilter = ctx.createBiquadFilter();
        nFilter.type = 'bandpass';
        nFilter.frequency.setValueAtTime(580, ctx.currentTime);
        nFilter.Q.setValueAtTime(2.2, ctx.currentTime);

        const nGain = ctx.createGain();
        nGain.gain.setValueAtTime(0.07, ctx.currentTime);
        nGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

        noise.connect(nFilter);
        nFilter.connect(nGain);
        nGain.connect(this.masterGain);
        noise.start(ctx.currentTime + 0.02);
      } catch (e) {}
    }

    // 4. Wallcreeper: High sweet crystalline mountain whistle ("Tsi-tsi-tsee-weee!")
    playWallcreeperCall() {
      if (!this.isSoundEnabled || !this.ensureContext()) return;
      const ctx = this.ctx;
      let t = ctx.currentTime + 0.02;

      // 2 quick introductory staccato pips
      for (let i = 0; i < 2; i++) {
        const pOsc = ctx.createOscillator();
        const pGain = ctx.createGain();
        pOsc.type = 'sine';
        pOsc.frequency.setValueAtTime(3200 + i * 150, t);

        pGain.gain.setValueAtTime(0.0001, t);
        pGain.gain.exponentialRampToValueAtTime(0.22, t + 0.015);
        pGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);

        pOsc.connect(pGain);
        pGain.connect(this.masterGain);
        pOsc.start(t);
        pOsc.stop(t + 0.055);
        t += 0.075;
      }

      // Sustained rising and warbling whistle
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(2600, t);
      osc.frequency.exponentialRampToValueAtTime(3600, t + 0.28);
      osc.frequency.linearRampToValueAtTime(3200, t + 0.42);
      osc.frequency.linearRampToValueAtTime(3450, t + 0.52);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.05);
      gain.gain.setValueAtTime(0.2, t + 0.35);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.56);
    }

    // 5. Scarlet Macaw: Resonant tropical canopy squawk ("Kraaa-wwkk!")
    playMacawCall() {
      if (!this.isSoundEnabled || !this.ensureContext()) return;
      const ctx = this.ctx;
      const t = ctx.currentTime + 0.02;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';

      // Descending guttural squawk frequency
      osc.frequency.setValueAtTime(860, t);
      osc.frequency.linearRampToValueAtTime(920, t + 0.08);
      osc.frequency.exponentialRampToValueAtTime(560, t + 0.6);

      // Tremolo / throat flutter
      const trem = ctx.createOscillator();
      const tremGain = ctx.createGain();
      trem.type = 'sine';
      trem.frequency.setValueAtTime(38, t);
      tremGain.gain.setValueAtTime(140, t);
      trem.connect(osc.frequency);

      // Formant filter (curved beak acoustic resonance)
      const f1 = ctx.createBiquadFilter();
      f1.type = 'bandpass';
      f1.frequency.setValueAtTime(1750, t);
      f1.frequency.linearRampToValueAtTime(1300, t + 0.6);
      f1.Q.setValueAtTime(4.2, t);

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.32, t + 0.06);
      gain.gain.setValueAtTime(0.26, t + 0.35);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);

      osc.connect(f1);
      f1.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      trem.start(t);
      osc.stop(t + 0.65);
      trem.stop(t + 0.65);
    }

    // Play call by species identifier
    playSpeciesCall(species) {
      switch (species) {
        case 'eagle':
          this.playEagleCall();
          break;
        case 'roller':
          this.playRollerCall();
          break;
        case 'doves':
          this.playDoveCall();
          break;
        case 'wallcreeper':
          this.playWallcreeperCall();
          break;
        case 'macaw':
          this.playMacawCall();
          break;
        default:
          this.playAmbientChirp();
      }
    }

    // Ambient melodic birdsong / random distant call
    playAmbientChirp() {
      if (!this.isSoundEnabled || !this.isDayMode()) return;
      const pick = Math.floor(Math.random() * 5);
      if (pick === 0) this.playRollerCall();
      else if (pick === 1) this.playWallcreeperCall();
      else if (pick === 2) this.playDoveCall();
      else if (pick === 3 && Math.random() < 0.4) this.playEagleCall();
      else if (pick === 4 && Math.random() < 0.4) this.playMacawCall();
      else {
        // Soft distant morning warble
        if (!this.ensureContext()) return;
        const ctx = this.ctx;
        let t = ctx.currentTime + 0.02;
        const notes = [1900, 2400, 2100, 2650];
        notes.forEach((f) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(f, t);
          o.frequency.exponentialRampToValueAtTime(f * 1.08, t + 0.04);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
          o.connect(g);
          g.connect(this.masterGain);
          o.start(t);
          o.stop(t + 0.1);
          t += 0.09;
        });
      }
    }

    // Ambient background loop (plays every 15 - 28s randomly during daytime)
    startAmbient() {
      if (this.ambientRunning) return;
      this.ambientRunning = true;
      const scheduleNext = () => {
        if (!this.ambientRunning || !this.isDayMode() || !this.isSoundEnabled) {
          this.ambientRunning = false;
          return;
        }
        const delay = 16000 + Math.random() * 14000; // 16s - 30s
        this.ambientTimer = setTimeout(() => {
          this.playAmbientChirp();
          scheduleNext();
        }, delay);
      };
      scheduleNext();
    }

    stopAmbient() {
      this.ambientRunning = false;
      if (this.ambientTimer) {
        clearTimeout(this.ambientTimer);
        this.ambientTimer = null;
      }
    }
  }

  // Instantiate global singleton
  const avianAudio = new AvianAudioEngine();
  window.avianAudioEngine = avianAudio;
  window.toggleBirdSounds = function (e) {
    avianAudio.toggleSound(e);
  };

  // --- 2. BIRD HOVER & CLICK INTERACTION WIRING ---
  function initInteractiveBirds() {
    const birds = document.querySelectorAll('.pro-bird');
    if (!birds.length) return;

    const speciesNames = {
      eagle: '🦅 Majestic Bald Eagle (Raptor Soar)',
      roller: '🪶 Vibrant Indian Roller (Azure & Cyan)',
      doves: '🕊️ Peace Doves & Slate Pigeon (Flock)',
      wallcreeper: '🦋 Crimson Wallcreeper (Butterfly Wing)',
      macaw: '🦜 Tropical Scarlet Macaw (Grand Plumage)',
    };

    // Shared floating species tooltip
    let tooltip = document.getElementById('bird-species-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'bird-species-tooltip';
      tooltip.className = 'bird-tooltip hidden';
      document.body.appendChild(tooltip);
    }

    birds.forEach((bird) => {
      const species = bird.getAttribute('data-species') || 'roller';
      bird.setAttribute('tabindex', '0');
      bird.setAttribute('role', 'button');
      bird.setAttribute(
        'aria-label',
        `${speciesNames[species] || 'Lively Flying Bird'} - Click to hear authentic call`
      );

      // On Hover: Show Species Badge
      bird.addEventListener('mouseenter', (e) => {
        tooltip.innerHTML = `<span class="bird-tip-icon">🎵</span> ${speciesNames[species] || 'Flying Bird'} <small style="display:block; opacity:0.8; font-size:10px;">Click to trigger bird call</small>`;
        tooltip.classList.remove('hidden');
        tooltip.classList.add('visible');
        updateTooltipPos(e);
      });

      bird.addEventListener('mousemove', (e) => {
        updateTooltipPos(e);
      });

      bird.addEventListener('mouseleave', () => {
        tooltip.classList.remove('visible');
        tooltip.classList.add('hidden');
      });

      // On Click: Trigger Bird Flap Flourish + Authentic Sound
      bird.addEventListener('click', (e) => {
        e.stopPropagation();
        avianAudio.unlockContext();

        // Perform acrobatic aerial flourish
        bird.classList.remove('avian-flourish');
        void bird.offsetWidth; // trigger reflow
        bird.classList.add('avian-flourish');
        setTimeout(() => {
          bird.classList.remove('avian-flourish');
        }, 1000);

        // Play authentic species sound
        avianAudio.playSpeciesCall(species);

        // Spawn buoyant musical note / chirp effect at bird position
        spawnChirpRipples(bird);

        if (typeof showToast === 'function') {
          showToast(`${speciesNames[species]} emitted authentic bird call!`);
        }
      });

      // Keyboard accessibility (Enter / Space)
      bird.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          bird.click();
        }
      });
    });

    function updateTooltipPos(e) {
      if (!tooltip) return;
      const x = Math.min(window.innerWidth - 220, Math.max(10, e.clientX + 14));
      const y = Math.min(window.innerHeight - 60, Math.max(10, e.clientY + 14));
      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
    }

    function spawnChirpRipples(bird) {
      const rect = bird.getBoundingClientRect();
      const ripple = document.createElement('div');
      ripple.className = 'avian-chirp-bubble';
      ripple.innerHTML = `<i class="fas fa-music"></i> <span>Chirp!</span>`;
      ripple.style.left = `${rect.left + rect.width / 2}px`;
      ripple.style.top = `${rect.top - 10}px`;
      document.body.appendChild(ripple);
      setTimeout(() => {
        ripple.remove();
      }, 1200);
    }
  }

  // --- 3. LIFECYCLE INITIALIZATION ---
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      avianAudio.init();
      initInteractiveBirds();
    });
  } else {
    avianAudio.init();
    initInteractiveBirds();
  }
})();
