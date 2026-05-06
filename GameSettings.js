(function initGameSettings(global) {
    const defaults = {
        VERSION: '1.0.0',
        PLAYER: {
            INVINCIBLE_TIME: 0.5,
            LOW_HP_THRESHOLD: 0.3,
        },
        ENEMIES: {
            ELITE: {
                SIZE_MULTIPLIER: 1.5,
                SPEED_MULTIPLIER: 0.9,
                CONTACT_DAMAGE_MULTIPLIER: 1.3,
                EXPLOSION_RADIUS: 60,
                EXPLOSION_DAMAGE: 15,
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
        },
        HUD: {
            WEAPON_COOLDOWN: {
                BASE_RADIUS: 28,
                RING_SPACING: 5,
                LINE_WIDTH: 3,
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

    global.DEFAULT_GAME_SETTINGS = defaults;
    global.GAME_SETTINGS = global.GAME_SETTINGS || clone(defaults);
    global.reloadGameSettings = function reloadGameSettings(nextSettings) {
        global.GAME_SETTINGS = nextSettings ? mergeInto(clone(defaults), nextSettings) : clone(defaults);
        return global.GAME_SETTINGS;
    };
})(window);
