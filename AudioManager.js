(function initAudioManager(global) {
    const DEFAULT_SOUNDS = {
        playerHit: { bus: 'sfx', type: 'hit', volume: 0.72, duration: 0.16, frequency: 120, maxInstances: 3, cooldown: 70, priority: 80 },
        weaponSlash: { bus: 'sfx', type: 'slash', volume: 0.36, duration: 0.10, frequency: 460, maxInstances: 4, cooldown: 45, priority: 35 },
        weaponShoot: { bus: 'sfx', type: 'shoot', volume: 0.32, duration: 0.10, frequency: 640, maxInstances: 4, cooldown: 45, priority: 35 },
        enemyDeath: { bus: 'sfx', type: 'enemyDeath', volume: 0.28, duration: 0.14, frequency: 180, maxInstances: 4, cooldown: 55, priority: 30 },
        bossDefeat: { bus: 'alert', type: 'bossDefeat', volume: 0.82, duration: 0.95, frequency: 180, maxInstances: 1, cooldown: 900, priority: 100 },
        pickup: { bus: 'sfx', type: 'pickup', volume: 0.24, duration: 0.09, frequency: 760, maxInstances: 3, cooldown: 38, priority: 25 },
        pickupRare: { bus: 'sfx', type: 'pickupRare', volume: 0.45, duration: 0.22, frequency: 920, maxInstances: 2, cooldown: 120, priority: 45 },
        levelUp: { bus: 'ui', type: 'levelUp', volume: 0.82, duration: 0.55, frequency: 520, maxInstances: 1, cooldown: 260, priority: 90 },
        bossAppear: { bus: 'alert', type: 'boss', volume: 0.88, duration: 0.95, frequency: 88, maxInstances: 1, cooldown: 800, priority: 100 },
        victory: { bus: 'ui', type: 'victory', volume: 0.88, duration: 1.1, frequency: 440, maxInstances: 1, cooldown: 1000, priority: 100 },
        gameOver: { bus: 'ui', type: 'gameOver', volume: 0.78, duration: 0.85, frequency: 220, maxInstances: 1, cooldown: 1000, priority: 95 },
        heartbeat: { bus: 'sfx', type: 'heartbeat', volume: 0.34, duration: 0.22, frequency: 72, maxInstances: 1, cooldown: 500, priority: 60 },
    };

    class AudioManager {
        constructor() {
            this.enabled = false;
            this.masterVolume = 0.7;
            this.sfxVolume = 0.55;
            this.musicVolume = 0.32;
            this.uiVolume = 0.72;
            this.alertVolume = 0.78;
            this.muted = false;
            this.maxGlobalInstances = 18;
            this.context = null;
            this.masterGain = null;
            this.busGains = new Map();
            this.sounds = new Map(Object.entries(DEFAULT_SOUNDS));
            this.registeredElements = new Map();
            this.active = [];
            this.lastPlayedAt = new Map();
            this.unlocked = false;
            this.platformResolver = null;
            this.loadSettings();
            this.bindUnlockEvents();
            this.publishStatus();
        }

        configure(options = {}) {
            if (typeof options.enabled === 'boolean') this.enabled = options.enabled;
            if (typeof options.muted === 'boolean') this.muted = options.muted;
            if (Number.isFinite(options.masterVolume)) this.masterVolume = options.masterVolume;
            if (Number.isFinite(options.sfxVolume)) this.sfxVolume = options.sfxVolume;
            if (Number.isFinite(options.musicVolume)) this.musicVolume = options.musicVolume;
            if (Number.isFinite(options.uiVolume)) this.uiVolume = options.uiVolume;
            if (Number.isFinite(options.alertVolume)) this.alertVolume = options.alertVolume;
            if (Number.isFinite(options.maxGlobalInstances)) this.maxGlobalInstances = options.maxGlobalInstances;
            if (typeof options.platformResolver === 'function') this.platformResolver = options.platformResolver;
            if (options.sounds && typeof options.sounds === 'object') {
                for (const [name, config] of Object.entries(options.sounds)) {
                    this.sounds.set(name, { ...(this.sounds.get(name) || {}), ...config });
                }
            }
            this.updateBusVolumes();
            this.publishStatus();
        }

        loadSettings() {
            try {
                const raw = localStorage.getItem('qlzdq_audio_settings');
                if (!raw) return;
                const saved = JSON.parse(raw);
                if (typeof saved.muted === 'boolean') this.muted = saved.muted;
                if (Number.isFinite(saved.masterVolume)) this.masterVolume = this.clamp(saved.masterVolume);
                if (Number.isFinite(saved.sfxVolume)) this.sfxVolume = this.clamp(saved.sfxVolume);
                if (Number.isFinite(saved.musicVolume)) this.musicVolume = this.clamp(saved.musicVolume);
                if (Number.isFinite(saved.uiVolume)) this.uiVolume = this.clamp(saved.uiVolume);
                if (Number.isFinite(saved.alertVolume)) this.alertVolume = this.clamp(saved.alertVolume);
            } catch {}
        }

        saveSettings() {
            try {
                localStorage.setItem('qlzdq_audio_settings', JSON.stringify(this.getSettings()));
            } catch {}
        }

        getSettings() {
            return {
                muted: this.muted,
                masterVolume: this.masterVolume,
                sfxVolume: this.sfxVolume,
                musicVolume: this.musicVolume,
                uiVolume: this.uiVolume,
                alertVolume: this.alertVolume,
            };
        }

        setVolume(name, value) {
            const normalized = this.clamp(Number(value));
            const key = `${name}Volume`;
            if (!['masterVolume', 'sfxVolume', 'musicVolume', 'uiVolume', 'alertVolume'].includes(key)) return false;
            this[key] = normalized;
            this.updateBusVolumes();
            this.saveSettings();
            this.publishStatus();
            return true;
        }

        setMuted(muted) {
            this.muted = Boolean(muted);
            if (this.muted) this.stopAll();
            this.updateBusVolumes();
            this.saveSettings();
            this.publishStatus();
        }

        toggleMuted() {
            this.setMuted(!this.muted);
            return this.muted;
        }

        register(name, audioElementOrConfig) {
            if (!name) return;
            if (audioElementOrConfig && typeof audioElementOrConfig.play === 'function') {
                this.registeredElements.set(name, audioElementOrConfig);
                return;
            }
            if (audioElementOrConfig && typeof audioElementOrConfig === 'object') {
                this.sounds.set(name, { ...(this.sounds.get(name) || {}), ...audioElementOrConfig });
            }
        }

        async preload(names = Array.from(this.sounds.keys())) {
            const results = [];
            for (const name of names) {
                const sound = this.sounds.get(name);
                if (!sound?.src) {
                    results.push({ name, ok: true, mode: 'synthetic' });
                    continue;
                }
                try {
                    const element = new Audio(sound.src);
                    element.preload = 'auto';
                    this.registeredElements.set(name, element);
                    results.push({ name, ok: true, mode: 'file' });
                } catch (error) {
                    results.push({ name, ok: false, error: String(error?.message || error) });
                }
            }
            this.publishStatus();
            return results;
        }

        play(name, volume = 1, options = {}) {
            if (!this.enabled || this.muted) return false;
            const sound = { ...(this.sounds.get(name) || {}), ...options };
            const now = performance.now();
            const cooldown = Number.isFinite(sound.cooldown) ? sound.cooldown : 0;
            if (now - (this.lastPlayedAt.get(name) || 0) < cooldown) return false;
            this.lastPlayedAt.set(name, now);
            this.cleanupActive();
            this.enforceLimits(name, sound);

            const filePlayed = this.playRegisteredElement(name, volume, sound);
            if (filePlayed) {
                this.publishStatus();
                return true;
            }

            const synthPlayed = this.playSynthetic(name, volume, sound);
            this.publishStatus();
            return synthPlayed;
        }

        stopAll() {
            for (const active of this.active) {
                try {
                    active.stop?.();
                    active.element?.pause?.();
                } catch {}
            }
            this.active = [];
            this.publishStatus();
        }

        bindUnlockEvents() {
            const unlock = () => {
                this.unlocked = true;
                this.ensureContext()?.resume?.().catch(() => {});
            };
            window.addEventListener('pointerdown', unlock, { passive: true });
            window.addEventListener('keydown', unlock, { passive: true });
            window.addEventListener('touchstart', unlock, { passive: true });
        }

        ensureContext() {
            if (this.context) return this.context;
            const AudioContextClass = global.AudioContext || global.webkitAudioContext;
            if (!AudioContextClass) return null;
            this.context = new AudioContextClass();
            this.masterGain = this.context.createGain();
            this.masterGain.connect(this.context.destination);
            for (const bus of ['sfx', 'music', 'ui', 'alert']) {
                const gain = this.context.createGain();
                gain.connect(this.masterGain);
                this.busGains.set(bus, gain);
            }
            this.updateBusVolumes();
            return this.context;
        }

        updateBusVolumes() {
            if (this.masterGain) this.masterGain.gain.value = this.muted ? 0 : this.masterVolume;
            const values = {
                sfx: this.sfxVolume,
                music: this.musicVolume,
                ui: this.uiVolume,
                alert: this.alertVolume,
            };
            for (const [bus, gain] of this.busGains.entries()) {
                gain.gain.value = values[bus] ?? this.sfxVolume;
            }
        }

        playRegisteredElement(name, volume, sound) {
            const source = this.registeredElements.get(name);
            if (!source || typeof source.play !== 'function') return false;
            const element = source.cloneNode ? source.cloneNode(true) : source;
            element.currentTime = 0;
            element.volume = this.clamp(volume * (sound.volume ?? 1) * this.sfxVolume * this.masterVolume);
            const result = element.play();
            if (result && typeof result.catch === 'function') result.catch(() => {});
            const active = { name, startedAt: performance.now(), element, priority: sound.priority || 0 };
            this.active.push(active);
            element.onended = () => {
                this.active = this.active.filter(item => item !== active);
                this.publishStatus();
            };
            return true;
        }

        playSynthetic(name, volume, sound) {
            const context = this.ensureContext();
            if (!context) return false;
            if (context.state === 'suspended' && this.unlocked) context.resume().catch(() => {});
            const bus = this.busGains.get(sound.bus || 'sfx') || this.masterGain;
            const gain = context.createGain();
            const finalVolume = this.clamp(volume * (sound.volume ?? 0.5));
            const start = context.currentTime;
            const duration = Math.max(0.05, sound.duration || 0.2);
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, finalVolume), start + 0.012);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
            gain.connect(bus);

            const stopNodes = this.createSynthNodes(context, gain, sound, start, duration);
            const active = {
                name,
                startedAt: performance.now(),
                priority: sound.priority || 0,
                stop: () => stopNodes.forEach(node => {
                    try { node.stop?.(); } catch {}
                    try { node.disconnect?.(); } catch {}
                }),
            };
            this.active.push(active);
            window.setTimeout(() => {
                active.stop();
                try { gain.disconnect(); } catch {}
                this.active = this.active.filter(item => item !== active);
                this.publishStatus();
            }, duration * 1000 + 80);
            return true;
        }

        createSynthNodes(context, gain, sound, start, duration) {
            const nodes = [];
            const base = sound.frequency || 440;
            const addOsc = (type, freq, gainScale = 1, delay = 0, length = duration) => {
                const osc = context.createOscillator();
                const localGain = context.createGain();
                osc.type = type;
                osc.frequency.setValueAtTime(freq, start + delay);
                localGain.gain.value = gainScale;
                osc.connect(localGain);
                localGain.connect(gain);
                osc.start(start + delay);
                osc.stop(start + delay + length);
                nodes.push(osc, localGain);
                return osc;
            };

            switch (sound.type) {
                case 'levelUp':
                    addOsc('triangle', base, 0.55, 0, 0.18);
                    addOsc('triangle', base * 1.5, 0.45, 0.12, 0.18);
                    addOsc('sine', base * 2, 0.35, 0.24, 0.28);
                    break;
                case 'boss':
                    addOsc('sawtooth', base, 0.55);
                    addOsc('triangle', base * 0.5, 0.45);
                    break;
                case 'victory':
                    addOsc('triangle', base, 0.36, 0, duration);
                    addOsc('triangle', base * 1.25, 0.30, 0.05, duration - 0.05);
                    addOsc('triangle', base * 1.5, 0.26, 0.10, duration - 0.10);
                    break;
                case 'gameOver': {
                    const osc = addOsc('sawtooth', base, 0.45);
                    osc.frequency.exponentialRampToValueAtTime(Math.max(40, base * 0.35), start + duration);
                    break;
                }
                case 'hit':
                    addOsc('square', base, 0.38, 0, duration);
                    addOsc('sawtooth', base * 0.5, 0.22, 0, duration * 0.7);
                    break;
                case 'enemyDeath': {
                    const osc = addOsc('triangle', base, 0.22, 0, duration);
                    osc.frequency.exponentialRampToValueAtTime(Math.max(55, base * 0.45), start + duration);
                    break;
                }
                case 'bossDefeat':
                    addOsc('sawtooth', base, 0.34, 0, duration * 0.8);
                    addOsc('triangle', base * 0.5, 0.26, 0.08, duration * 0.78);
                    addOsc('sine', base * 1.5, 0.18, 0.28, duration * 0.5);
                    break;
                case 'pickup': {
                    const osc = addOsc('sine', base, 0.18, 0, duration);
                    osc.frequency.exponentialRampToValueAtTime(base * 1.7, start + duration);
                    break;
                }
                case 'pickupRare':
                    addOsc('triangle', base, 0.20, 0, duration * 0.45);
                    addOsc('sine', base * 1.5, 0.16, duration * 0.28, duration * 0.55);
                    break;
                case 'shoot': {
                    const osc = addOsc('square', base, 0.22, 0, duration);
                    osc.frequency.exponentialRampToValueAtTime(base * 1.7, start + duration);
                    break;
                }
                case 'slash': {
                    const osc = addOsc('sawtooth', base, 0.20, 0, duration);
                    osc.frequency.exponentialRampToValueAtTime(base * 0.45, start + duration);
                    break;
                }
                case 'heartbeat':
                    addOsc('sine', base, 0.50, 0, duration * 0.45);
                    addOsc('sine', base * 0.82, 0.38, duration * 0.48, duration * 0.45);
                    break;
                default:
                    addOsc('sine', base, 0.25);
                    break;
            }
            return nodes;
        }

        enforceLimits(name, sound) {
            const maxInstances = Number.isFinite(sound.maxInstances) ? sound.maxInstances : 4;
            const same = this.active.filter(item => item.name === name);
            while (same.length >= maxInstances) {
                const victim = same.shift();
                this.stopActive(victim);
            }
            while (this.active.length >= this.maxGlobalInstances) {
                const victim = [...this.active].sort((a, b) => (a.priority || 0) - (b.priority || 0) || a.startedAt - b.startedAt)[0];
                this.stopActive(victim);
            }
        }

        stopActive(active) {
            if (!active) return;
            try {
                active.stop?.();
                active.element?.pause?.();
            } catch {}
            this.active = this.active.filter(item => item !== active);
        }

        cleanupActive() {
            const now = performance.now();
            this.active = this.active.filter(item => !item.startedAt || now - item.startedAt < 8000);
        }

        clamp(value) {
            return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
        }

        publishStatus() {
            global.__AUDIO_STATUS__ = {
                enabled: this.enabled,
                muted: this.muted,
                unlocked: this.unlocked,
                active: this.active.length,
                sounds: this.sounds.size,
                registeredFiles: this.registeredElements.size,
                mode: this.registeredElements.size > 0 ? 'file-or-synthetic' : 'synthetic',
            };
        }
    }

    global.AudioManager = AudioManager;
    global.audioManager = global.audioManager || new AudioManager();
})(window);
