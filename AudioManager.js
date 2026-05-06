(function initAudioManager(global) {
    class AudioManager {
        constructor() {
            this.enabled = false;
            this.masterVolume = 0.7;
            this.sfxVolume = 0.5;
            this.musicVolume = 0.3;
            this.sounds = {
                playerHit: null,
                weaponSlash: null,
                weaponShoot: null,
                levelUp: null,
                bossAppear: null,
                victory: null,
                gameOver: null,
                heartbeat: null,
            };
        }

        configure(options = {}) {
            if (typeof options.enabled === 'boolean') this.enabled = options.enabled;
            if (Number.isFinite(options.masterVolume)) this.masterVolume = options.masterVolume;
            if (Number.isFinite(options.sfxVolume)) this.sfxVolume = options.sfxVolume;
            if (Number.isFinite(options.musicVolume)) this.musicVolume = options.musicVolume;
        }

        register(name, audioElement) {
            this.sounds[name] = audioElement || null;
        }

        play(name, volume = 1) {
            if (!this.enabled) return false;
            const sound = this.sounds[name];
            if (!sound || typeof sound.play !== 'function') return false;
            sound.currentTime = 0;
            sound.volume = Math.max(0, Math.min(1, volume * this.sfxVolume * this.masterVolume));
            const result = sound.play();
            if (result && typeof result.catch === 'function') {
                result.catch(() => {});
            }
            return true;
        }
    }

    global.AudioManager = AudioManager;
    global.audioManager = global.audioManager || new AudioManager();
})(window);
