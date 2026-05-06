(function initGameSettings(global) {
    const defaults = {
        VERSION: '1.1.0',
        LAST_UPDATED: '2026-05-06',

        DEBUG: {
            INVINCIBLE_MODE: false,
            ONE_HIT_KILL: false,
            SPAWN_MULTIPLIER: 1.0,
            SHOW_HITBOXES: false,
            SHOW_FPS: true,
            LOG_DAMAGE: false,
        },

        BALANCE: {
            TIME_INFLATION: 1.15,
            DIFFICULTY_CURVE: {
                0: 1.0,
                1: 1.0,
                2: 1.1,
                3: 1.2,
                4: 1.3,
                5: 1.5,
            },
        },

        PLAYER: {
            BASE_SPEED: 200,
            BASE_MAX_HP: 100,
            BASE_HP_REGEN: 0,
            PICKUP_RADIUS: 50,
            INVINCIBLE_TIME: 0.5,
            INVINCIBLE_FLASH_SPEED: 10,
            LOW_HP_THRESHOLD: 0.3,
            HIT_KNOCKBACK: {
                RADIUS: 80,
                FORCE: 30,
            },
        },

        WEAPONS: {
            SABER: {
                BASE_DAMAGE: 18,
                BASE_COOLDOWN: 1.5,
                BASE_RADIUS: 80,
                BASE_ANGLE_DEGREES: 120,
                COMBO: {
                    INTERVAL: 0.15,
                    LVL5_MAX: 2,
                    LVL6_MAX: 4,
                },
                EXECUTE: {
                    LVL5_THRESHOLD: 0.2,
                    LVL6_THRESHOLD: 0.3,
                    HITSTOP: 0.05,
                },
            },
            SPEAR: {
                BASE_DAMAGE: 25,
                BASE_COOLDOWN: 1.5,
                BASE_LENGTH: 120,
                BASE_WIDTH: 25,
                DASH: {
                    DISTANCE: 100,
                    INVINCIBLE_TIME: 0.2,
                },
            },
            CROSSBOW: {
                BASE_DAMAGE: 8,
                BASE_COOLDOWN: 0.6,
                PROJECTILE_SPEED: 550,
                BURST_INTERVAL: 0.3,
            },
            QINGGANG: {
                BASE_DAMAGE: 20,
                BASE_COOLDOWN: 0.08,
                BASE_ORBIT_RADIUS: 60,
                BASE_COUNT: 1,
            },
            SHIELD: {
                BASE_DAMAGE: 45,
                BASE_COOLDOWN: 2.5,
                MAX_RADIUS: 144,
                BASE_KNOCKBACK: 60,
                CHARGE_DURATION: 0.5,
                EXPLODE_DURATION: 0.15,
            },
            TAIPING: {
                BASE_DAMAGE_PER_SECOND: 20,
                BASE_COOLDOWN: 4.0,
                BASE_RADIUS: 70,
                BASE_LIFETIME: 5.0,
                BASE_TICK_INTERVAL: 0.3,
            },
        },

        ENEMIES: {
            NORMAL: {
                BASE_HP: 10,
                BASE_SPEED: 80,
                BASE_DAMAGE: 10,
                SIZE: 20,
                KNOCKBACK_RESIST: 0,
            },
            ARCHER: {
                BASE_HP_MULTIPLIER: 0.6,
                SPEED_MODIFIER: 0.5,
                SIZE: 18,
                SHOOT_INTERVAL: 2.5,
                PROJECTILE_SPEED: 300,
            },
            WOODEN_OX: {
                HP_MULTIPLIER: 20,
                SPEED_MODIFIER: 0.5,
                SIZE: 24,
                ESCAPE_TIME: 15,
                RESONANCE_DROP: 5,
            },
            ELITE: {
                SPAWN_CHANCE: 0.05,
                HP_MULTIPLIER: 3.0,
                SIZE_MULTIPLIER: 1.5,
                SPEED_MULTIPLIER: 0.9,
                CONTACT_DAMAGE_MULTIPLIER: 1.3,
                KNOCKBACK_RESIST: 0.5,
                EXPLOSION_RADIUS: 60,
                EXPLOSION_DAMAGE: 15,
            },
            SPAWNING: {
                ARCHER_CHANCE: 0.10,
                ELITE_CHANCE: 0.05,
                WOODEN_OX_CHANCE: 0.02,
                MAX_SPAWN_COUNT: 4,
            },
        },

        BOSS_AFFIXES: {
            INITIAL_DELAY_MIN: 3,
            INITIAL_DELAY_RANGE: 2,
            FEARLESS_COOLDOWN: 5,
            STRONGBOW_COOLDOWN: 6,
            SCORCHED_COOLDOWN: 7,
            CALL_TO_ARMS_COOLDOWN: 8,
            CHARGE_SPEED: 360,
            CHARGE_DURATION: 0.45,
            ARROW_COUNT: 8,
            ARROW_DAMAGE: 12,
            ARROW_SPEED: 220,
            SCORCHED_OFFSET_RANGE: 200,
            SCORCHED_RADIUS: 80,
            SCORCHED_DAMAGE_PER_SECOND: 10,
            SCORCHED_LIFETIME: 8,
            SCORCHED_SLOW_MULTIPLIER: 0.75,
            CALL_TO_ARMS_COUNT: 8,
            CALL_TO_ARMS_DISTANCE: 150,
            LABELS: {
                FEARLESS: '【无畏】',
                STRONGBOW: '【强弓】',
                SCORCHED: '【焦土】',
                CALL_TO_ARMS: '【号令】',
            },
        },

        PASSIVES: {
            DAMAGE_PER_LEVEL: 0.10,
            SPEED_PER_LEVEL: 0.06,
            COOLDOWN_PER_LEVEL: 0.08,
            MAGNET_PER_LEVEL: 0.20,
            AREA_PER_LEVEL: 0.08,
            REGEN_PER_LEVEL: 0.4,
            EXP_PER_LEVEL: 0.10,
            RESONANCE_PER_LEVEL: 0.10,
            ARMOR_PER_LEVEL: 0.06,
        },

        PERKS: {
            DAMAGE_PER_LEVEL: 0.005,
            SPEED_PER_LEVEL: 0.003,
            COOLDOWN_PER_LEVEL: 0.004,
            MAGNET_PER_LEVEL: 0.01,
            MAX_HP_PER_LEVEL: 1,
            AREA_PER_LEVEL: 0.004,
            REGEN_PER_LEVEL: 0.02,
            EXP_PER_LEVEL: 0.005,
            RESONANCE_PER_LEVEL: 0.005,
            ARMOR_PER_LEVEL: 0.003,
            RESONANCE_BONUS_PER_LEVEL: 0.1,
        },

        DROPS: {
            BASE_CHANCE: {
                EXP: 0.8,
                RESONANCE: 0.1,
                NONE: 0.1,
            },
            FOOD: {
                BUN_HEAL_RATIO: 0.1,
                CHICKEN_HEAL_RATIO: 0.5,
            },
            PROP_DROP_CHANCE: {
                RESONANCE: 0.70,
                BUN: 0.20,
                CHICKEN: 0.07,
                MAGNET: 0.03,
            },
        },

        HUD: {
            WEAPON_COOLDOWN: {
                BASE_RADIUS: 28,
                RING_SPACING: 5,
                LINE_WIDTH: 3,
                COLOR_READY: '#7cff6b',
                COLORS: ['#00ff99', '#4da3ff', '#ffd34d', '#ff6b6b', '#c77dff', '#ff9f43'],
            },
        },

        FEEL: {
            HITSTOP: {
                NORMAL_HIT: 0.01,
                CRIT_HIT: 0.03,
                EXECUTE: 0.05,
                SHIELD_BURST: 0.08,
                BOSS_DEATH: 0.2,
            },
            SCREENSHAKE: {
                PLAYER_HIT: 0.3,
                ELITE_EXPLOSION: 0.2,
            },
            LOW_HP_WARNING: {
                FULLSCREEN_TINT_MIN: 0.05,
                FULLSCREEN_TINT_MAX: 0.10,
                BORDER_ALPHA_MIN: 0.2,
                BORDER_ALPHA_MAX: 0.5,
                PULSE_SPEED: 0.08,
            },
        },

        PROPS: {
            DESTRUCTIBLE: {
                HP: 30,
                SIZE: 32,
                INITIAL_COUNT: 2,
                MINUTE_COUNT: 1,
                MAX_COUNT: 3,
                SPAWN_CHANCE_PER_FRAME: 0.001,
                SPAWN_MARGIN: 50,
            },
        },

        MAP: {
            WIDTH: 6000,
            HEIGHT: 6000,
            CAMERA_SMOOTHNESS: 0.12,
            BACKGROUND_TILE_SIZE: 160,
            BACKGROUND_MINOR_GRID: 40,
        },

        PERFORMANCE: {
            SPATIAL_GRID: {
                CELL_SIZE: 100,
                ENABLED: true,
            },
            MAX_ENEMIES: 2000,
            MAX_PROJECTILES: 300,
            OFFSCREEN: {
                SKIP_RENDER: true,
                SKIP_UPDATE: false,
            },
        },

        AUDIO: {
            MASTER_VOLUME: 0.7,
            SFX_VOLUME: 0.5,
            MUSIC_VOLUME: 0.3,
            SFX: {
                PLAYER_HIT: 'audio/hit.wav',
                WEAPON_SLASH: 'audio/slash.wav',
                WEAPON_SHOOT: 'audio/shoot.wav',
                LEVEL_UP: 'audio/levelup.wav',
                BOSS_APPEAR: 'audio/boss.wav',
                VICTORY: 'audio/victory.wav',
                GAME_OVER: 'audio/gameover.wav',
                HEARTBEAT: 'audio/heartbeat.wav',
            },
        },

        SCENES: {
            CUTSCENE_DURATION: 5.0,
            PAUSE_FADE_TIME: 0.3,
            LEVEL_UP_ANIMATION: 0.5,
            VICTORY_DELAY: 2.0,
        },
    };

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function mergeInto(target, source) {
        if (!source || typeof source !== 'object') return target;
        for (const key of Object.keys(source)) {
            const value = source[key];
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                target[key] = mergeInto(target[key] || {}, value);
            } else {
                target[key] = value;
            }
        }
        return target;
    }

    function getByPath(source, path, fallback) {
        let cursor = source;
        for (const key of String(path).split('.')) {
            if (cursor == null || typeof cursor !== 'object' || !(key in cursor)) return fallback;
            cursor = cursor[key];
        }
        return cursor;
    }

    function setByPath(target, path, value) {
        const keys = String(path).split('.');
        let cursor = target;
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
            cursor = cursor[key];
        }
        cursor[keys[keys.length - 1]] = value;
        return target;
    }

    global.DEFAULT_GAME_SETTINGS = clone(defaults);
    global.GAME_SETTINGS = global.GAME_SETTINGS || clone(defaults);
    global.getGameSetting = function getGameSetting(path, fallback) {
        return getByPath(global.GAME_SETTINGS, path, fallback);
    };
    global.setGameSetting = function setGameSetting(path, value) {
        return setByPath(global.GAME_SETTINGS, path, value);
    };
    global.reloadGameSettings = function reloadGameSettings(nextSettings) {
        global.GAME_SETTINGS = nextSettings ? mergeInto(clone(defaults), nextSettings) : clone(defaults);
        return global.GAME_SETTINGS;
    };
})(window);
