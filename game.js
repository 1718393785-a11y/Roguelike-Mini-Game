/**
 * 时空骇客：过五关 - 肉鸽弹幕生存
 * 严格 OOP 架构
 * 遵循 roguelike-game-design.md 设计文档
 * Vampire Survivors 游戏模式
 */

// ==================== 阶段0：基线保护基础设施 ====================

const FEATURE_FLAGS = {
    ENABLE_JSON_CONFIG: false,
    ENABLE_SYSTEM_SPLIT: false,
    ENABLE_GENERIC_WEAPON: false,
    ENABLE_PIXI_RENDERER: false,
    ENABLE_HOT_RELOAD: false,
};

const FEATURE_FLAG_PARAMS = new URLSearchParams(window.location.search);
for (const flagName of Object.keys(FEATURE_FLAGS)) {
    if (FEATURE_FLAG_PARAMS.has(flagName)) {
        const value = FEATURE_FLAG_PARAMS.get(flagName);
        FEATURE_FLAGS[flagName] = value === '1' || value === 'true' || value === 'on';
    }
}

const GameRuntime = (() => {
    const params = new URLSearchParams(window.location.search);
    const seedText = params.get('seed') || '0';
    const fixedDelta = 1 / 60;
    const recordEnabled = params.get('record') === '1';
    const snapshotEnabled = params.get('snapshot') === '1' || params.has('baselineSeconds');
    const frameLimit = params.has('baselineSeconds') ? Math.max(1, Math.round(Number(params.get('baselineSeconds')) * 60) + 1) : 0;
    const autoplayPath = params.get('autoplay');

    function hashString(value) {
        let h = 2166136261 >>> 0;
        for (let i = 0; i < value.length; i++) {
            h ^= value.charCodeAt(i);
            h = Math.imul(h, 16777619) >>> 0;
        }
        return h >>> 0;
    }

    function createRng(seed) {
        let state = seed >>> 0;
        return () => {
            state = (state + 0x6D2B79F5) >>> 0;
            let t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function hashNumbers(values) {
        let h = 2166136261 >>> 0;
        for (const value of values) {
            const n = Math.floor(value * 1000000000) >>> 0;
            h ^= n;
            h = Math.imul(h, 16777619) >>> 0;
        }
        return h.toString(16).padStart(8, '0');
    }

    const seed = hashString(seedText);
    const rng = createRng(seed);
    const probeCount = Number(params.get('rngProbe') || 0);
    if (probeCount > 0) {
        const probeRng = createRng(seed);
        const values = Array.from({ length: probeCount }, () => probeRng());
        window.__BASELINE_RNG_PROBE__ = {
            seed: seedText,
            count: probeCount,
            hash: hashNumbers(values),
            first10: values.slice(0, 10),
        };
    }

    const session = {
        frame: 0,
        recording: [],
        playback: [],
        playbackIndex: 0,
        playbackLoaded: !autoplayPath,
        configLoaded: !FEATURE_FLAGS.ENABLE_JSON_CONFIG,
        snapshots: [],
        killCount: 0,
        previousEnemyHp: 0,
        damageTotal: 0,
        done: false,
        error: null,
    };

    if (autoplayPath) {
        fetch(autoplayPath)
            .then(response => {
                if (!response.ok) throw new Error(`Unable to load autoplay file: ${autoplayPath}`);
                return response.json();
            })
            .then(data => {
                session.playback = Array.isArray(data) ? data : (data.events || []);
                session.playbackLoaded = true;
                window.__BASELINE_PLAYBACK__ = { path: autoplayPath, events: session.playback.length };
            })
            .catch(error => {
                session.error = error.message;
                session.playbackLoaded = true;
                window.__BASELINE_ERROR__ = error.message;
            });
    }

    function round(value) {
        return Math.round((Number(value) || 0) * 1000) / 1000;
    }

    function recordEvent(event) {
        if (!recordEnabled) return;
        session.recording.push({ frame: session.frame, ...event });
        window.__BASELINE_RECORDING__ = { seed: seedText, events: session.recording };
    }

    function applyPlayback(game) {
        while (session.playbackIndex < session.playback.length && session.playback[session.playbackIndex].frame <= session.frame) {
            const event = session.playback[session.playbackIndex++];
            if (event.type === 'keydown') {
                game.keys[event.key] = true;
            } else if (event.type === 'keyup') {
                game.keys[event.key] = false;
            } else if (event.type === 'mousemove') {
                game.mouseX = event.x;
                game.mouseY = event.y;
            } else if (event.type === 'click') {
                game.mouseX = event.x;
                game.mouseY = event.y;
                const rect = game.canvas.getBoundingClientRect();
                game.handleClick({ clientX: rect.left + event.x, clientY: rect.top + event.y });
            }
        }
    }

    function captureSnapshot(game) {
        if (!snapshotEnabled) return;
        const enemies = game.enemies || [];
        const totalEnemyHp = enemies.reduce((sum, enemy) => sum + Math.max(0, enemy.hp || 0), 0);
        if (session.previousEnemyHp > totalEnemyHp) {
            session.damageTotal += session.previousEnemyHp - totalEnemyHp;
        }
        session.previousEnemyHp = totalEnemyHp;

        const player = game.player ? {
            x: round(game.player.x),
            y: round(game.player.y),
            hp: round(game.player.hp),
            level: game.player.level || 0,
            exp: round(game.player.exp || 0),
        } : null;

        session.snapshots.push({
            frame: session.frame,
            gameState: game.gameState,
            gameTime: round(game.gameTime || 0),
            player,
            enemies: {
                count: enemies.length,
                totalHp: round(totalEnemyHp),
            },
            projectiles: { count: (game.projectiles || []).length },
            pickups: { count: (game.pickups || []).length },
            bossSpawned: enemies.some(enemy => enemy.isBoss || enemy.isMiniBoss || enemy.isLevelBoss || enemy.isFinalBoss),
            killCount: session.killCount,
            dps: round(session.damageTotal / Math.max(1, game.gameTime || 0)),
        });
        window.__BASELINE_SNAPSHOTS__ = session.snapshots;
    }

    return {
        params,
        flags: FEATURE_FLAGS,
        random: () => rng(),
        useFixedDelta: () => Boolean(autoplayPath || snapshotEnabled || frameLimit),
        fixedDelta: () => fixedDelta,
        ready: () => session.playbackLoaded && session.configLoaded,
        markConfigLoaded(error) {
            if (error) {
                session.error = error.message || String(error);
                window.__BASELINE_ERROR__ = session.error;
            }
            session.configLoaded = true;
        },
        beginFrame(game) {
            session.frame += 1;
            if (autoplayPath) applyPlayback(game);
        },
        endFrame(game) {
            captureSnapshot(game);
            if (frameLimit && session.frame >= frameLimit) {
                session.done = true;
                window.__BASELINE_DONE__ = {
                    frame: session.frame,
                    snapshots: session.snapshots,
                    recording: session.recording,
                    error: session.error,
                };
            }
        },
        shouldStop: () => session.done,
        recordEvent,
        recordKill(enemy) {
            if (!enemy || enemy.isProp) return;
            session.killCount += 1;
        },
        resetRunStats() {
            session.killCount = 0;
            session.previousEnemyHp = 0;
            session.damageTotal = 0;
        },
        get frame() {
            return session.frame;
        },
    };
})();

window.FEATURE_FLAGS = FEATURE_FLAGS;
window.GameRuntime = GameRuntime;

// ==================== 常量定义 ====================

// 游戏状态
const GAME_STATE = {
    MENU: 0,         // 主菜单
    PLAYING: 1,      // 游戏中（正常更新）
    PAUSED: 2,       // 暂停（冻结逻辑）
    LEVEL_UP: 3,     // 升级选择
    GAME_OVER: 4,    // 游戏结束（等待重开）
    VICTORY: 5,      // 通关
    PERK_UPGRADE: 6, // 局外升级
    CUTSCENE: 7      // 新增：过场动画
};

// 掉落物类型
const PICKUP_TYPES = {
    EXP: { value: 'exp', color: '#4169e1', label: '经验宝珠' },      // 蓝色 - 经验
    RESONANCE: { value: 'resonance', color: '#ff8c00', label: '历史残响' },  // 橙色 - 局外升级材料
    BOSS_EXP: { value: 'boss_exp', color: '#ff0000', label: '将星之血' },      // 红色 - Boss击杀大经验
    BUN: { value: 'bun', color: '#f5f5dc', label: '白馒头' },             // 小麦色 - 恢复10%生命
    CHICKEN: { value: 'chicken', color: '#ff8c00', label: '烤鸡腿' },       // 橙色 - 恢复50%生命
    MAGNET: { value: 'magnet', color: '#dc143c', label: '吸铁石' }           // 红色 - 全屏吸物
};

// 关卡定义（按设计文档）
// ==================== 常量定义 ====================
const STAGES = [
    {
        name: '东岭关', boss: '孔秀', description: '法则异变：随机词缀强化',
        minSpawnCount: 5, maxSpawnCount: 10, spawnInterval: 1.0,
        bossHp: 800, bossSpeed: 90, bossAbility: 'randomAffix' // 2分：800 (极脆，爽快开局)
    },
    {
        name: '洛阳城', boss: '韩福', description: '因果律暗箭：必定命中',
        minSpawnCount: 8, maxSpawnCount: 15, spawnInterval: 0.8,
        bossHp: 1800, bossSpeed: 70, bossAbility: 'trackingArrow' // 4分：1800
    },
    {
        name: '汜水关', boss: '卞喜', description: '时空死士：源源不断涌出',
        minSpawnCount: 12, maxSpawnCount: 20, spawnInterval: 0.6,
        bossHp: 3000, bossSpeed: 60, bossAbility: 'summonMinions' // 6分：3000
    },
    {
        name: '荥阳', boss: '王植', description: '业火焚城：火焰随时间蔓延',
        minSpawnCount: 15, maxSpawnCount: 25, spawnInterval: 0.5,
        bossHp: 4500, bossSpeed: 50, bossAbility: 'fireArea' // 8分：4500 (核心锚点)
    },
    {
        name: '黄河渡口', boss: '秦琪', description: '历史投影：召唤前四关守将幻影',
        minSpawnCount: 20, maxSpawnCount: 30, spawnInterval: 0.4,
        bossHp: 6500, bossSpeed: 80, bossAbility: 'summonPhantoms' // 10分：6500 (终极考验)
    }];

// 局外升级选项
// 双轨制整合：十个被动技能分别支持局外升级，id 对应 metaSkills key，getEffect 返回等级值（存入 metaSkills 存等级）
// 规律：局外每升一级 = 局内 0.01 级 → 局外 100级满级 = 局内 1.0 级 = 局内满级Lv5 一半
const PERK_UPGRADES = [
    {
        id: 'damage',
        name: '基因重塑·陷阵',
        description: '永久增加陷阵杀气等级 +1 → 全伤害 +0.5%',
        baseCost: 2,
        getEffect: level => level // 返回等级，存入 metaSkills.DAMAGE
    },
    {
        id: 'speed',
        name: '基因重塑·绝影',
        description: '永久增加绝影无痕等级 +1 → 移速 +0.3%',
        baseCost: 2,
        getEffect: level => level // 返回等级，存入 metaSkills.SPEED
    },
    {
        id: 'cooldown',
        name: '基因重塑·迅雷',
        description: '永久增加迅雷风烈等级 +1 → 武器CD -0.4%',
        baseCost: 3,
        getEffect: level => level // 返回等级，存入 metaSkills.COOLDOWN
    },
    {
        id: 'magnet',
        name: '基因重塑·摸金',
        description: '永久增加摸金秘术等级 +1 → 拾取范围 +1%',
        baseCost: 3,
        getEffect: level => level // 返回等级，存入 metaSkills.MAGNET
    },
    {
        id: 'maxHp',
        name: '基因重塑·虎卫',
        description: '永久增加虎卫霸体等级 +1 → 最大生命 +1',
        baseCost: 1,
        getEffect: level => level // 返回等级，存入 metaSkills.MAXHP
    },
    {
        id: 'area',
        name: '基因重塑·气吞',
        description: '永久增加气吞山河等级 +1 → 攻击范围 +0.4%',
        baseCost: 3,
        getEffect: level => level // 返回等级，存入 metaSkills.AREA
    },
    {
        id: 'regen',
        name: '基因重塑·青囊',
        description: '永久增加青囊秘卷等级 +1 → 每秒回血 +0.02/s',
        baseCost: 3,
        getEffect: level => level // 返回等级，存入 metaSkills.REGEN
    },
    {
        id: 'exp',
        name: '基因重塑·天命',
        description: '永久增加天命所归等级 +1 → 经验获取 +0.5%',
        baseCost: 2,
        getEffect: level => level // 返回等级，存入 metaSkills.EXP
    },
    {
        id: 'resonance',
        name: '基因重塑·共鸣',
        description: '永久增加历史共鸣等级 +1 → 残响掉落 +0.5%',
        baseCost: 2,
        getEffect: level => level // 返回等级，存入 metaSkills.RESONANCE
    },
    {
        id: 'armor',
        name: '基因重塑·不动',
        description: '永久增加不动如山等级 +1 → 受到伤害 -0.3%',
        baseCost: 3,
        getEffect: level => level // 返回等级，存入 metaSkills.ARMOR
    },
    {
        id: 'resonanceBonus',
        name: '历史共鸣',
        description: '每局额外增加历史残响掉落 +10%',
        baseCost: 5,
        getEffect: level => 1 + level * 0.1
    }
];

// ==================== 核心类定义 ====================

// ==================== 武器系统 ====================

// 武器基类
class Weapon {
    constructor(baseDamage, attackInterval) {
        this.baseDamage = baseDamage;
        this.baseAttackInterval = attackInterval;
        this.timer = 0;
        this.type = 'base';
        this.level = 1; // 默认初始等级 1，每升一级 +1
    }

    // 属性更新后刷新冷却缩减 - 已废弃：CD现在开火时即时计算
    onStatsUpdated(modifiers) {
        // 留空方法保持兼容性，不再更新CD
    }

    update(deltaTime, player, enemies, projectiles, specialAreas) {
        // 倒计时逻辑：递减计时器
        this.timer -= deltaTime;
        if (this.timer <= 0) {
            // 开火
            this.attack(player, enemies, projectiles, specialAreas);
            // 开火后瞬间重置CD：即时计算当前总减免
            const globalCDR = player.modifiers.cooldownMulti || 0;
            const actualCD = Math.max(0.1, this.baseAttackInterval * (1 - globalCDR));
            this.timer += actualCD;
        }
    }

    attack(player, enemies, projectiles, specialAreas) {
        // 子类实现
    }

    render(ctx, player) {
        // 可选渲染（环绕剑需要）
    }
}

// ==================== 武器升级配置表 ====================
const WEAPON_UPGRADES = {
    saber: {
        type: 'weapon',
        name: '百炼环首刀',
        baseDamage: 18,
        1: { name: '百炼环首刀', desc: '身前扇形挥砍。', action: (w) => {} },
        2: { name: '刃长', desc: '攻击距离增加 30%。', action: (w) => { w.radius *= 1.3; } },
        3: { name: '断钢', desc: '基础伤害提升 40%。', action: (w) => { w.baseDamage *= 1.4; } },
        4: { name: '满月', desc: '挥砍角度扩大至身前 180 度。', action: (w) => { w.halfAngle = Math.PI / 2; } },
        5: { name: '双斩', desc: '追加反向挥砍。解锁【处决】：秒杀 20% 血量以下小怪（精英/Boss受双倍伤害）。', action: (w) => { w.comboMax = 2; w.comboInterval = 0.3; } },
        6: { name: '武帝·八荒斩', desc: '四段大范围交替狂斩。【处决】秒杀/双倍阈值提升至 30%。', action: (w) => { w.comboMax = 4; w.radius *= 1.4; w.baseDamage *= 1.15; w.baseAttackInterval *= 0.8; } }
    },
    spear: {
        type: 'weapon',
        name: '透阵龙胆枪',
        baseDamage: 25,
        1: { name: '透阵龙胆枪', desc: '向最近敌人刺出贯穿直线气劲。', action: (w) => {} },
        2: { name: '枪芒', desc: '攻击范围（长+宽）增加 30%。', action: (w) => { w.length *= 1.3; w.width *= 1.3; } },
        3: { name: '破军', desc: '基础伤害 +40%，击退距离 +50%。', action: (w) => { w.baseDamage *= 1.4; w.knockbackDist *= 1.5; } },
        4: { name: '无影', desc: '攻击间隔减少 30%。', action: (w) => { w.baseAttackInterval *= 0.7; } },
        5: { name: '龙胆', desc: '出枪跟随冲刺，无敌0.2秒。解锁【破甲】：附加目标最大生命 3% 真伤（对Boss无效）。', action: (w) => { w.hasDash = true; } },
        6: { name: '神威·绝尘裂地', desc: '前方扇形刺出五道枪影随同冲刺。【破甲】真实伤害提升至 5%。', action: (w) => { w.spreadCount = 5; w.isUltimate = true; } }
    },
    crossbow: {
        type: 'weapon',
        name: '霹雳惊弦弓',
        baseDamage: 8, // 单体极快，靠穿透
        1: { name: '霹雳惊弦弓', desc: '自动锁定最近敌人，发射高速实体箭矢。', action: (w) => {} },
        2: { name: '连弩', desc: '每次攻击连续射出两箭，间隔0.3秒，射完重新冷却。', action: (w) => { w.burstCount = 2; } },
        3: { name: '透甲', desc: '箭矢获得 +1 次穿透能力，可命中后方目标。', action: (w) => { w.basePierceCount = 1; } },
        4: { name: '满弦', desc: '攻击间隔减少 30%，箭矢飞行速度提升 50%。', action: (w) => { w.baseAttackInterval *= 0.7; w.projectileSpeed *= 1.5; } },
        5: { name: '奔雷', desc: '箭矢命中在目标位置触发雷电AOE爆炸。', action: (w) => { w.hasLightningAOE = true; } },
        6: { name: '九霄天劫', desc: '穿透耗尽/命中Boss时触发毁灭雷柱，范围扩大+300%伤害并眩晕1秒。', action: (w) => { w.hasLightningColumn = true; } }
    },
    qinggang: {
        type: 'weapon',
        name: '青釭游龙剑',
        baseDamage: 20, // 环绕绞肉，保证初始擦到就秒
        1: { name: '青釭游龙剑', desc: '飞剑环绕周身，自动绞杀。', action: (w) => {} },
        2: { name: '分影', desc: '飞剑数量 +1。', action: (w) => { w.count += 1; } },
        3: { name: '极速', desc: '公转速度增加 50%。', action: (w) => { w.rotationSpeed *= 1.5; } },
        4: { name: '剑阵', desc: '飞剑数量 +2，范围扩大。', action: (w) => { w.count += 2; w.orbitRadius *= 1.2; } },
        5: { name: '饮血', desc: '飞剑击杀敌人恢复 1 点生命。', action: (w) => { w.lifesteal = 1; } },
        6: { name: '魏武·十面埋伏', desc: '8把飞剑双轨环绕，动态收缩防御。', action: (w) => { w.count = 8; w.dualOrbit = true; } }
    },
    shield: {
        type: 'weapon',
        name: '八门金锁盾',
        baseDamage: 45, // 极长CD换来一击清屏
        1: { name: '八门金锁盾', desc: '以玩家为中心周期性爆发力场脉冲，先滞留蓄力再骤然向外爆发，伤害击退。', action: (w) => {} },
        2: { name: '阵扩', desc: '脉冲最大扩张半径增加 30%。', action: (w) => { w.maxRadius *= 1.3; } },
        3: { name: '连绵', desc: '爆发触发间隔减少 30%。', action: (w) => { w.baseAttackInterval *= 0.7; } },
        4: { name: '反震', desc: '脉冲基础伤害提升 100%，击退距离提升 50%。', action: (w) => { w.baseDamage *= 2; w.baseKnockback *= 1.5; } },
        5: { name: '绝对壁垒', desc: '脉冲扩张期间摧毁触碰到的所有敌方投射物。', action: (w) => { w.canDestroyProjectiles = true; } },
        6: { name: '玄武·铜雀天牢', desc: '脉冲达到最大半径后留下持续 3 秒环形火墙，关门打狗灼烧弹回敌人。', action: (w) => { w.spawnFireRing = true; } }
    },
    taiping: {
        type: 'weapon',
        name: '太平要术·风火',
        baseDamage: 20, // 区域持续DPS
        1: { name: '太平要术·风火', desc: '在玩家脚下召唤一团停留火焰龙卷风，持续伤害范围内敌人。', action: (w) => {} },
        2: { name: '风火增幅', desc: '龙卷风半径增加 30%，持续时间延长 30%。', action: (w) => { w.baseRadius *= 1.3; w.baseLifetime *= 1.3; } },
        3: { name: '火势凶猛', desc: '伤害 Tick 频率加快 50%。', action: (w) => { w.baseTickInterval *= 0.5; } },
        4: { name: '燎原', desc: '同时存在龙卷风数量上限 +1（总计 2 个）。', action: (w) => { w.maxTornados = 2; } },
        5: { name: '灵动', desc: '龙卷风自动缓慢向距离最近敌人移动索敌。', action: (w) => { w.autoSeek = true; } },
        6: { name: '黄天·焚世烈火', desc: '同时存在上限 +2（总计 4 个），额外召唤一个向玩家移动的聚变龙卷风，触碰后引爆巨型风暴。', action: (w) => { w.maxTornados = 4; w.hasProximityStorm = true; } }
    }
};

let LEGACY_JSON_WEAPON_CONFIG = null;

function getWeaponJsonParam(weaponId, key, fallback) {
    if (!FEATURE_FLAGS.ENABLE_JSON_CONFIG || !LEGACY_JSON_WEAPON_CONFIG) return fallback;
    const params = LEGACY_JSON_WEAPON_CONFIG[weaponId]?.params;
    const value = params ? params[key] : undefined;
    return typeof value === 'number' || typeof value === 'boolean' ? value : fallback;
}

function getWeaponJsonAttackInterval(weaponId, fallback) {
    if (!FEATURE_FLAGS.ENABLE_JSON_CONFIG || !LEGACY_JSON_WEAPON_CONFIG) return fallback;
    const value = LEGACY_JSON_WEAPON_CONFIG[weaponId]?.attackInterval;
    return typeof value === 'number' ? value : fallback;
}

function applyWeaponJsonConfig(weaponSpec) {
    LEGACY_JSON_WEAPON_CONFIG = weaponSpec || {};
    for (const [weaponId, config] of Object.entries(weaponSpec || {})) {
        const legacyConfig = WEAPON_UPGRADES[weaponId];
        if (!legacyConfig) continue;
        if (typeof config.damage === 'number') {
            legacyConfig.baseDamage = config.damage;
        }
        // Stage 2 only mirrors data into the legacy table. Behavior and action functions stay legacy-owned.
    }
}

function resolveWeaponSpecNumber(config, level, key, fallback) {
    if (!config) return fallback;
    let value = typeof config.params?.[key] === 'number' ? config.params[key] : fallback;
    const levels = (config.levels || [])
        .filter(item => item.level <= level)
        .sort((a, b) => a.level - b.level);
    for (const levelConfig of levels) {
        const patches = levelConfig.numericPatches || {};
        if (typeof patches[key] === 'number') value = patches[key];
        if (typeof patches[`${key}Add`] === 'number') value += patches[`${key}Add`];
        if (typeof patches[`${key}Multiplier`] === 'number') value *= patches[`${key}Multiplier`];
    }
    return value;
}

function resolveWeaponSpecNumberWithAliases(config, level, key, fallback, aliases = {}) {
    if (!config) return fallback;
    let value = typeof config.params?.[key] === 'number' ? config.params[key] : fallback;
    const levels = (config.levels || [])
        .filter(item => item.level <= level)
        .sort((a, b) => a.level - b.level);
    for (const levelConfig of levels) {
        const patches = levelConfig.numericPatches || {};
        const directKey = aliases.direct || key;
        const addKey = aliases.add || `${key}Add`;
        const multiplierKey = aliases.multiplier || `${key}Multiplier`;
        if (typeof patches[directKey] === 'number') value = patches[directKey];
        if (typeof patches[addKey] === 'number') value += patches[addKey];
        if (typeof patches[multiplierKey] === 'number') value *= patches[multiplierKey];
    }
    return value;
}

const GENERIC_WEAPON_MIGRATION_IDS = new Set(['saber', 'spear']);

function isGenericWeaponMigrated(weaponType) {
    return FEATURE_FLAGS.ENABLE_GENERIC_WEAPON && GENERIC_WEAPON_MIGRATION_IDS.has(weaponType);
}

function applyGenericWeaponScalarMigration(weapon) {
    if (!isGenericWeaponMigrated(weapon.type) || !LEGACY_JSON_WEAPON_CONFIG) return;
    const spec = LEGACY_JSON_WEAPON_CONFIG[weapon.type];
    if (!spec) return;
    const level = weapon.level || 1;

    if (weapon.type === 'saber') {
        weapon.baseDamage = resolveWeaponSpecNumber(spec, level, 'damage', spec.damage);
        weapon.baseAttackInterval = resolveWeaponSpecNumber(spec, level, 'attackInterval', spec.attackInterval);
        weapon.radius = resolveWeaponSpecNumber(spec, level, 'radius', weapon.radius);
        weapon.halfAngle = resolveWeaponSpecNumber(spec, level, 'halfAngleRadians', weapon.halfAngle);
        weapon.comboMax = resolveWeaponSpecNumber(spec, level, 'comboMax', weapon.comboMax);
        weapon.comboInterval = resolveWeaponSpecNumber(spec, level, 'comboInterval', weapon.comboInterval);
    } else if (weapon.type === 'spear') {
        weapon.baseDamage = resolveWeaponSpecNumber(spec, level, 'damage', spec.damage);
        weapon.baseAttackInterval = resolveWeaponSpecNumber(spec, level, 'attackInterval', spec.attackInterval);
        weapon.length = resolveWeaponSpecNumber(spec, level, 'length', weapon.length);
        weapon.width = resolveWeaponSpecNumber(spec, level, 'width', weapon.width);
        weapon.knockbackDist = resolveWeaponSpecNumberWithAliases(spec, level, 'knockbackDist', weapon.knockbackDist, {
            multiplier: 'knockbackMultiplier'
        });
        weapon.spreadCount = resolveWeaponSpecNumber(spec, level, 'spreadCount', weapon.spreadCount);
        weapon.hasDash = level >= 5;
        weapon.isUltimate = level >= 6;
    }
}

class GenericWeaponShadowMonitor {
    constructor() {
        this.samples = 0;
        this.maxDpsDiffRatio = 0;
        this.maxDamageDiffRatio = 0;
        this.maxIntervalDiffRatio = 0;
        this.lastSamples = [];
        window.__GENERIC_WEAPON_SHADOW__ = this.getReport();
    }

    update(game) {
        if (!FEATURE_FLAGS.ENABLE_GENERIC_WEAPON || !LEGACY_JSON_WEAPON_CONFIG || !game.player) return;
        const samples = [];
        for (const weapon of game.activeWeapons || []) {
            const spec = LEGACY_JSON_WEAPON_CONFIG[weapon.type];
            if (!spec) continue;
            const level = weapon.level || 1;
            const legacyDamage = weapon.type === 'taiping' ? weapon.baseDamagePerSecond : weapon.baseDamage;
            const legacyInterval = weapon.baseAttackInterval;
            const genericDamage = resolveWeaponSpecNumber(spec, level, 'damage', spec.damage);
            const genericInterval = resolveWeaponSpecNumber(spec, level, 'attackInterval', spec.attackInterval);
            const legacyDps = legacyInterval > 0 ? legacyDamage / legacyInterval : 0;
            const genericDps = genericInterval > 0 ? genericDamage / genericInterval : 0;
            const sample = {
                type: weapon.type,
                level,
                migrated: isGenericWeaponMigrated(weapon.type),
                legacyDamage,
                genericDamage,
                legacyInterval,
                genericInterval,
                legacyDps,
                genericDps,
                damageDiffRatio: this.diffRatio(legacyDamage, genericDamage),
                intervalDiffRatio: this.diffRatio(legacyInterval, genericInterval),
                dpsDiffRatio: this.diffRatio(legacyDps, genericDps)
            };
            this.maxDamageDiffRatio = Math.max(this.maxDamageDiffRatio, sample.damageDiffRatio);
            this.maxIntervalDiffRatio = Math.max(this.maxIntervalDiffRatio, sample.intervalDiffRatio);
            this.maxDpsDiffRatio = Math.max(this.maxDpsDiffRatio, sample.dpsDiffRatio);
            samples.push(sample);
            this.samples++;
        }
        if (samples.length > 0) {
            this.lastSamples = samples;
            window.__GENERIC_WEAPON_SHADOW__ = this.getReport();
        }
    }

    diffRatio(left, right) {
        const denominator = Math.max(Math.abs(left), Math.abs(right), 1e-9);
        return Math.abs(left - right) / denominator;
    }

    getReport() {
        return {
            samples: this.samples,
            maxDpsDiffRatio: this.maxDpsDiffRatio,
            maxDamageDiffRatio: this.maxDamageDiffRatio,
            maxIntervalDiffRatio: this.maxIntervalDiffRatio,
            lastSamples: this.lastSamples
        };
    }
}

if (FEATURE_FLAGS.ENABLE_JSON_CONFIG) {
    fetch('src/spec/weapons.json')
        .then(response => {
            if (!response.ok) throw new Error('Failed to load src/spec/weapons.json');
            return response.json();
        })
        .then(config => {
            applyWeaponJsonConfig(config);
            window.__JSON_CONFIG_LOADED__ = { weapons: Object.keys(config).length };
            GameRuntime.markConfigLoaded();
        })
        .catch(error => {
            console.error(error);
            GameRuntime.markConfigLoaded(error);
        });
}

// ==================== 被动技能升级配置表 ====================
const PASSIVE_UPGRADES = {
    DAMAGE: {
        type: 'passive',
        name: '陷阵杀气',
        1: { level: 1, name: '陷阵杀气Lv1', desc: '全伤害 +10%', baseValue: 0.10 },
        2: { level: 2, name: '陷阵杀气Lv2', desc: '全伤害 +20%', baseValue: 0.10 },
        3: { level: 3, name: '陷阵杀气Lv3', desc: '全伤害 +30%', baseValue: 0.10 },
        4: { level: 4, name: '陷阵杀气Lv4', desc: '全伤害 +40%', baseValue: 0.10 },
        5: { level: 5, name: '陷阵杀气Lv5', desc: '全伤害 +50%', baseValue: 0.10 }
    },
    SPEED: {
        type: 'passive',
        name: '绝影无痕',
        1: { level: 1, name: '绝影无痕Lv1', desc: '移速 +6%', baseValue: 0.06 },
        2: { level: 2, name: '绝影无痕Lv2', desc: '移速 +12%', baseValue: 0.06 },
        3: { level: 3, name: '绝影无痕Lv3', desc: '移速 +18%', baseValue: 0.06 },
        4: { level: 4, name: '绝影无痕Lv4', desc: '移速 +24%', baseValue: 0.06 },
        5: { level: 5, name: '绝影无痕Lv5', desc: '移速 +30%', baseValue: 0.06 }
    },
    COOLDOWN: {
        type: 'passive',
        name: '迅雷风烈',
        1: { level: 1, name: '迅雷风烈Lv1', desc: '武器CD -8%', baseValue: -0.08 },
        2: { level: 2, name: '迅雷风烈Lv2', desc: '武器CD -16%', baseValue: -0.08 },
        3: { level: 3, name: '迅雷风烈Lv3', desc: '武器CD -24%', baseValue: -0.08 },
        4: { level: 4, name: '迅雷风烈Lv4', desc: '武器CD -32%', baseValue: -0.08 },
        5: { level: 5, name: '迅雷风烈Lv5', desc: '武器CD -40%', baseValue: -0.08 }
    },
    MAGNET: {
        type: 'passive',
        name: '摸金秘术',
        1: { level: 1, name: '摸金秘术Lv1', desc: '拾取范围 +20%', baseValue: 0.20 },
        2: { level: 2, name: '摸金秘术Lv2', desc: '拾取范围 +40%', baseValue: 0.20 },
        3: { level: 3, name: '摸金秘术Lv3', desc: '拾取范围 +60%', baseValue: 0.20 },
        4: { level: 4, name: '摸金秘术Lv4', desc: '拾取范围 +80%', baseValue: 0.20 },
        5: { level: 5, name: '摸金秘术Lv5', desc: '拾取范围 +100%', baseValue: 0.20 }
    },
    MAXHP: {
        type: 'passive',
        name: '虎卫霸体',
        1: { level: 1, name: '虎卫霸体Lv1', desc: '最大生命 +20', baseValue: 20 },
        2: { level: 2, name: '虎卫霸体Lv2', desc: '最大生命 +40', baseValue: 20 },
        3: { level: 3, name: '虎卫霸体Lv3', desc: '最大生命 +60', baseValue: 20 },
        4: { level: 4, name: '虎卫霸体Lv4', desc: '最大生命 +80', baseValue: 20 },
        5: { level: 5, name: '虎卫霸体Lv5', desc: '最大生命 +100', baseValue: 20 }
    },
    AREA: {
        type: 'passive',
        name: '气吞山河',
        1: { level: 1, name: '气吞山河Lv1', desc: '攻击范围 +8%', baseValue: 0.08 },
        2: { level: 2, name: '气吞山河Lv2', desc: '攻击范围 +16%', baseValue: 0.08 },
        3: { level: 3, name: '气吞山河Lv3', desc: '攻击范围 +24%', baseValue: 0.08 },
        4: { level: 4, name: '气吞山河Lv4', desc: '攻击范围 +32%', baseValue: 0.08 },
        5: { level: 5, name: '气吞山河Lv5', desc: '攻击范围 +40%', baseValue: 0.08 }
    },
    REGEN: {
        type: 'passive',
        name: '青囊秘卷',
        1: { level: 1, name: '青囊秘卷Lv1', desc: '每秒回血 +0.4/s', baseValue: 0.4 },
        2: { level: 2, name: '青囊秘卷Lv2', desc: '每秒回血 +0.8/s', baseValue: 0.4 },
        3: { level: 3, name: '青囊秘卷Lv3', desc: '每秒回血 +1.2/s', baseValue: 0.4 },
        4: { level: 4, name: '青囊秘卷Lv4', desc: '每秒回血 +1.6/s', baseValue: 0.4 },
        5: { level: 5, name: '青囊秘卷Lv5', desc: '每秒回血 +2.0/s', baseValue: 0.4 }
    },
    EXP: {
        type: 'passive',
        name: '天命所归',
        1: { level: 1, name: '天命所归Lv1', desc: '经验获取 +10%', baseValue: 0.10 },
        2: { level: 2, name: '天命所归Lv2', desc: '经验获取 +20%', baseValue: 0.10 },
        3: { level: 3, name: '天命所归Lv3', desc: '经验获取 +30%', baseValue: 0.10 },
        4: { level: 4, name: '天命所归Lv4', desc: '经验获取 +40%', baseValue: 0.10 },
        5: { level: 5, name: '天命所归Lv5', desc: '经验获取 +50%', baseValue: 0.10 }
    },
    RESONANCE: {
        type: 'passive',
        name: '历史共鸣',
        1: { level: 1, name: '历史共鸣Lv1', desc: '残响掉落 +10%', baseValue: 0.10 },
        2: { level: 2, name: '历史共鸣Lv2', desc: '残响掉落 +20%', baseValue: 0.10 },
        3: { level: 3, name: '历史共鸣Lv3', desc: '残响掉落 +30%', baseValue: 0.10 },
        4: { level: 4, name: '历史共鸣Lv4', desc: '残响掉落 +40%', baseValue: 0.10 },
        5: { level: 5, name: '历史共鸣Lv5', desc: '残响掉落 +50%', baseValue: 0.10 }
    },
    ARMOR: {
        type: 'passive',
        name: '不动如山',
        1: { level: 1, name: '不动如山Lv1', desc: '受到伤害 -6%', baseValue: 0.06 },
        2: { level: 2, name: '不动如山Lv2', desc: '受到伤害 -12%', baseValue: 0.06 },
        3: { level: 3, name: '不动如山Lv3', desc: '受到伤害 -18%', baseValue: 0.06 },
        4: { level: 4, name: '不动如山Lv4', desc: '受到伤害 -24%', baseValue: 0.06 },
        5: { level: 5, name: '不动如山Lv5', desc: '受到伤害 -30%', baseValue: 0.06 }
    }
};

// 百炼环首刀升级字典（保留兼容旧代码，新代码使用上方统一配置表）
const DAO_UPGRADES = {
    1: { level: 1, name: '百炼环首刀', desc: '基础形态：身前扇形挥砍。' },
    2: { level: 2, name: '刃长', desc: '攻击距离增加 30%。', action: (w) => { w.radius *= 1.3; } },
    3: { level: 3, name: '断钢', desc: '基础伤害提升 40%。', action: (w) => { w.baseDamage *= 1.4; } },
    4: { level: 4, name: '满月', desc: '挥砍角度扩大至 180 度。', action: (w) => { w.halfAngle = Math.PI / 2; } },
    5: { level: 5, name: '双斩', desc: '触发时追加一次向后的反向挥砍。', action: (w) => { w.comboMax = 2; } },
    6: { level: 6, name: '武帝·八荒斩', desc: '终极形态：攻击化为前后交替的四段大范围狂斩。', action: (w) => { w.comboMax = 4; w.radius *= 1.4; w.baseDamage *= 1.15; w.actualAttackInterval *= 0.8; } }
};

// 1. 刀 - 百炼环首刀 - 扇形劈砍可升级连击
class Saber extends Weapon {
    constructor(baseDamage) {
        super(baseDamage, getWeaponJsonAttackInterval('saber', 1.5)); // 每1.5秒触发一次完整连击
        this.type = 'saber';
        this.aimAngle = 0;        // 基础瞄准方向角度（朝向最近敌人）
        this.baseTargetAngle = 0; // 保存基础目标方向
        this.hitRecords = new Set(); // 记录本次连击已经击中过的敌人，防止重复伤害
        this.radius = getWeaponJsonParam('saber', 'radius', 80);        // 扇形半径（初始60 × ~1.33倍）
        this.currentRadius = this.radius; // 当前半径，必须初始化避免undefined
        this.halfAngle = getWeaponJsonParam('saber', 'halfAngleRadians', Math.PI / 3); // 半角60度，总共120度

        // 连击系统
        this.comboMax = getWeaponJsonParam('saber', 'comboMax', 1);         // 单次触发的最大连击段数
        this.comboRemaining = 0;  // 当前剩余待释放段数
        this.comboTimer = 0;      // 连击间隔计时器
        this.comboInterval = getWeaponJsonParam('saber', 'comboInterval', 0.15); // 连击段数之间的间隔（秒），快速前后交替
        this.active = false;      // 是否正在连击进行中（控制渲染显示）
        this.renderTimer = 0;     // 特效渲染停留计时器
    }

    attack(player, enemies, specialAreas) {
        // 使用玩家当前面向方向作为攻击方向（刀不启用半自动瞄准，严格跟随面向）
        this.baseTargetAngle = Math.atan2(player.facingDirY, player.facingDirX);

        // 开始连击
        this.comboRemaining = this.comboMax;
        this.comboTimer = 0;
        this.active = true;
        this.hitRecords.clear();
    }

    update(deltaTime, player, enemies, projectiles, specialAreas) {
        // 调用父类更新攻击冷却计时器
        super.update(deltaTime, player, enemies, projectiles, specialAreas);

        // 连击进行中：安排下一段挥砍，设置角度（必须先做！确保碰撞检测前角度半径已更新）
        if (this.comboRemaining > 0) {
            this.comboTimer -= deltaTime;
            if (this.comboTimer <= 0 && this.comboRemaining > 0) {
                this.prepareSwing(player);
                this.comboRemaining--;

                // 每次挥出刀，刷新残影停留时间，并确保渲染开启
                this.active = true;
                this.renderTimer = 0.15; // 画面停留 0.15 秒

                if (this.comboRemaining > 0) {
                    this.comboTimer = this.comboInterval; // 重置间隔，等待下一段
                }
            }
        }

        // 独立控制特效残影的显示时间 + 碰撞检测（顺序在后确保角度半径已经是最新）
        if (this.active) {
            this.renderTimer -= deltaTime;
            // 只有当残影时间结束，且所有连击段数都打完了，才关闭渲染
            if (this.renderTimer <= 0 && this.comboRemaining <= 0) {
                this.active = false;
            }

            // ********** 关键修复：只要扇形显示着，每帧都重新做碰撞检测 **********
            // 因为玩家在移动，扇形位置每帧都变，随时有新敌人走进来
            // 连击处理放前面了，所以这里检测用的角度半径肯定是本次挥砍最新正确的值
            this.doCollisionDetection(player, enemies, projectiles);
        }
    }

    // 准备这一拍挥砍：设置好瞄准角度
    prepareSwing(player) {
        // 每一段挥砍清空命中记录 → 前后两段可以独立命中
        this.hitRecords.clear();
        // 奇数段打正面，偶数段打反面（前后交替）
        const swingIndex = this.comboMax - this.comboRemaining;
        const isBackSwing = swingIndex % 2 === 1;
        const actualAngle = isBackSwing ? this.baseTargetAngle + Math.PI : this.baseTargetAngle;
        this.aimAngle = actualAngle;
        // apply area multiplier from passive skill
        const areaMul = 1 + (player.modifiers.areaMulti || 0);
        // 终极形态特殊规则：第 3、4 斩（index 2、3）半径 +30%
        if (this.comboMax >= 4 && swingIndex >= 2) {
            this.currentRadius = this.radius * 1.3 * areaMul;
        } else {
            this.currentRadius = this.radius * areaMul;
        }
    }

    // 每帧都执行：基于当前玩家坐标，重新检测哪些敌人在扇形内
    doCollisionDetection(player, enemies, projectiles) {
        // 强制实时锚定：用玩家**当前帧最新坐标**做原点
        const currentX = player.x;
        const currentY = player.y;

        // 空间网格优化：只查询扇形半径范围内附近格子的敌人
        const gm = window.gameManager;
        const nearbyEnemies = gm.queryEnemiesInRange(currentX, currentY, this.currentRadius);

        // 遍历附近敌人做扇形碰撞检测
        for (let i = nearbyEnemies.length - 1; i >= 0; i--) {
            const enemy = nearbyEnemies[i];

            // 本次连击已经击中过，跳过避免重复伤害
            if (this.hitRecords.has(enemy)) continue;

            // 距离检测
            const dx = enemy.x - currentX;
            const dy = enemy.y - currentY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > this.currentRadius) continue;

            // 角度检测
            const enemyAngle = Math.atan2(dy, dx);
            let angleDiff = Math.abs(enemyAngle - this.aimAngle);
            angleDiff = Math.min(angleDiff, 2 * Math.PI - angleDiff);
            if (angleDiff <= this.halfAngle) {
                // 计算总伤害加成 - 使用统一跨源乘算
                const effectiveDamage = this.baseDamage * player.getDamageMultiplier();
                this.hitRecords.add(enemy);

                // ============ 【处决】机制 - Lv5解锁 ============
                // Lv5: 20%血量以下秒杀小怪 / 对精英Boss双倍伤害
                // Lv6: 阈值提升到 30%
                const executeThreshold = this.level >= 5 ? (this.level >= 6 ? 0.3 : 0.2) : 0;
                if (executeThreshold > 0 && enemy.hp <= enemy.maxHp * executeThreshold) {
                    const isEliteOrBoss = enemy.isElite || enemy.isBoss || enemy.isMiniBoss || enemy.isLevelBoss;
                    if (!isEliteOrBoss) {
                        // 小怪直接秒杀
                        enemy.hp = 0;
                    } else {
                        // 精英/Boss受到双倍伤害
                        enemy.hp -= effectiveDamage;
                    }
                    // 处决触发顿帧，打击感飙升
                    gm.hitstopTimer = 0.05; // 秒杀比暴击顿帧稍长，更有分量感
                }

                // 命中造成基础伤害
                enemy.hp -= effectiveDamage;

                // ============ 新增：刀的击退与硬直（随等级成长） ============
                const knockbackBase = 15 + this.level * 5; // 基础15，满级45
                const stunDuration = 0.1 + this.level * 0.02; // 0.12s ~ 0.22s
                // Boss/木牛完全免疫硬直和击退
                if (enemy.knockbackResist < 1.0) {
                    enemy.stunTimer = Math.max(enemy.stunTimer, stunDuration);
                    // 破韧击退：只有不在硬直中才会被推开，避免高频击退无限推远
                    if (enemy.stunTimer <= stunDuration && enemy.stunTimer <= 0) {
                        const actualKnockback = knockbackBase * (1 - enemy.knockbackResist);
                        enemy.x += Math.cos(enemyAngle) * actualKnockback;
                        enemy.y += Math.sin(enemyAngle) * actualKnockback;
                    }
                }

                // 检查死亡
                if (enemy.hp <= 0) {
                    const originalIdx = gm.enemies.indexOf(enemy);
                    gm.handleEnemyDeath(enemy, originalIdx);
                    this.hitRecords.delete(enemy);
                }
            }
        }

        // 额外遍历清除敌方投射物在扇形范围内
        for (let i = projectiles.length - 1; i >= 0; i--) {
            const proj = projectiles[i];
            if (!proj.isEnemyProjectile) continue;

            const dx = proj.x - currentX;
            const dy = proj.y - currentY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > this.currentRadius) continue;

            const projAngle = Math.atan2(dy, dx);
            let angleDiff = Math.abs(projAngle - this.aimAngle);
            angleDiff = Math.min(angleDiff, 2 * Math.PI - angleDiff);
            if (angleDiff <= this.halfAngle) {
                projectiles.splice(i, 1);
            }
        }
    }

    render(ctx, player) {
        if (!this.active) return;

        // 强制实时锚定：每一帧都用玩家当前坐标渲染，保证碰撞坐标 = 渲染坐标
        const currentX = player.x;
        const currentY = player.y;

        // 暗金色扇形残影，幽蓝色数据撕裂边缘
        ctx.save();
        ctx.translate(currentX, currentY);
        ctx.rotate(this.aimAngle);

        const radius = this.currentRadius;
        const startAngle = -this.halfAngle;
        const endAngle = this.halfAngle;

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, startAngle, endAngle);
        ctx.closePath();

        // 暗金色半透明填充
        ctx.fillStyle = 'rgba(80, 60, 0, 0.4)';
        ctx.fill();

        // 金色边缘
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.8)';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.restore();
    }

    onStatsUpdated(modifiers) {
        // attack range modifier updates the current radius based on base radius
        // actual area application: when calculating collision, use (this.radius * (1 + modifiers.areaMulti))
        // We don't need to store it since modifiers are always available when attacking
    }
}

// 2. 枪 - 动能折叠长枪 - 直线穿透矩形伤害，带击退
class Spear extends Weapon {
    constructor(baseDamage) {
        super(baseDamage, getWeaponJsonAttackInterval('spear', 1.5)); // 基础攻击间隔1.5秒
        this.type = 'spear';
        this.level = 1;
        // 基础属性：Lv1
        this.length = getWeaponJsonParam('spear', 'length', 130);
        this.width = getWeaponJsonParam('spear', 'width', 20);
        this.baseDamage = baseDamage;
        this.knockbackDist = getWeaponJsonParam('spear', 'knockbackDist', 30);
        // 进阶属性：由升级解锁
        this.hasDash = false;
        this.spreadCount = getWeaponJsonParam('spear', 'spreadCount', 1);
        this.isUltimate = false;
        // 当前活跃的枪影列表
        this.activeStabs = [];
        // 冲刺状态
        this.dashing = false;
        this.dashTimer = 0;
        this.dashDirX = 0;
        this.dashDirY = 0;
    }

    attack(player, enemies, projectiles, specialAreas) {
        // Called from Weapon.update() when cooldown ready
        // We stored canvas dimensions in this.update() before super.update was called, so use them
        if (this._currentCanvasWidth && this._currentCanvasHeight) {
            this.doAttack(player, enemies, this._currentCanvasWidth, this._currentCanvasHeight);
        }
    }

    doAttack(player, enemies, canvasWidth, canvasHeight) {
        // 半自动辅助瞄准：在玩家面朝方向 ±45度（90度扇形）范围内找最近敌人
        const playerAngle = Math.atan2(player.facingDirY, player.facingDirX);
        let closestInAngle = null;
        let minDistSq = Infinity;
        const maxAngleDiff = Math.PI / 4; // ±45度 = 总共90度扇形

        for (const enemy of enemies) {
            const dx = enemy.x - player.x;
            const dy = enemy.y - player.y;
            const enemyAngle = Math.atan2(dy, dx);
            let angleDiff = Math.abs(enemyAngle - playerAngle);
            angleDiff = Math.min(angleDiff, 2 * Math.PI - angleDiff);

            if (angleDiff <= maxAngleDiff) {
                const distSq = dx * dx + dy * dy;
                if (distSq < minDistSq) {
                    minDistSq = distSq;
                    closestInAngle = enemy;
                }
            }
        }

        let mainDirX, mainDirY;
        if (closestInAngle) {
            // 前方扇形范围内有敌人，瞄准最近的那个
            const dx = closestInAngle.x - player.x;
            const dy = closestInAngle.y - player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            mainDirX = dx / dist;
            mainDirY = dy / dist;
        } else {
            // 前方没有敌人，严格使用玩家面向方向
            mainDirX = player.facingDirX;
            mainDirY = player.facingDirY;
        }

        // 生成枪影列表：Lv6终极是扇形多根，否则只有一根
        this.activeStabs = [];
        if (this.spreadCount > 1) {
            // 60度扇形分布 spreadCount 根枪
            const totalAngle = Math.PI / 3; // 60度
            const angleStep = totalAngle / (this.spreadCount - 1);
            const startAngle = -totalAngle / 2;

            for (let i = 0; i < this.spreadCount; i++) {
                const angle = startAngle + i * angleStep;
                // 旋转方向
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                const rotatedDirX = mainDirX * cos - mainDirY * sin;
                const rotatedDirY = mainDirX * sin + mainDirY * cos;
                this.activeStabs.push({
                    dirX: rotatedDirX,
                    dirY: rotatedDirY,
                    lifeTimer: 0.25,
                    isMain: i === Math.floor(this.spreadCount / 2), // 中间那根是主枪影，用于冲刺
                    hitRecords: new Set()
                });
            }

            // 终极技能：玩家跟随中心主枪影冲刺
            if (this.isUltimate && this.hasDash) {
                const mainStab = this.activeStabs.find(s => s.isMain);
                this.startDash(player, mainStab.dirX, mainStab.dirY, canvasWidth, canvasHeight);
            }
        } else {
            // 单枪刺
            this.activeStabs.push({
                dirX: mainDirX,
                dirY: mainDirY,
                lifeTimer: 0.25,
                isMain: true,
                hitRecords: new Set()
            });
            // Lv5+：单刺也带冲刺
            if (this.hasDash) {
                this.startDash(player, mainDirX, mainDirY, canvasWidth, canvasHeight);
            }
        }
    }

    startDash(player, dirX, dirY, canvasWidth, canvasHeight) {
        // 开始冲刺
        this.dashing = true;
        this.dashTimer = 0.2; // 冲刺持续0.2秒
        this.dashDirX = dirX;
        this.dashDirY = dirY;
        player.isInvincible = true; // 开启无敌
    }

    doStabCollision(stab, playerX, playerY, player, enemies) {
        const dirX = stab.dirX;
        const dirY = stab.dirY;

        // 使用当前玩家实时坐标进行碰撞检测
        const perpX = -dirY * this.width / 2;
        const perpY = dirX * this.width / 2;

        // 计算总伤害加成 - 使用统一跨源乘算
        const effectiveDamage = this.baseDamage * player.getDamageMultiplier();

        // apply area multiplier from passive skill
        const effectiveLength = this.length * (1 + (player.modifiers.areaMulti || 0));

        // AABB碰撞检查：检查每个敌人是否在矩形内（无限穿透）
        for (let i = enemies.length - 1; i >= 0; i--) {
            const enemy = enemies[i];
            // 如果这根枪已经戳过这个敌人，跳过，防每帧触发
            if (stab.hitRecords.has(enemy)) continue;
            // 将敌人坐标转换到长枪局部坐标系，使用当前玩家坐标
            const dxEn = enemy.x - playerX;
            const dyEn = enemy.y - playerY;
            const projLength = dxEn * dirX + dyEn * dirY;
            const projWidth = dxEn * (-dirY) + dyEn * dirX;

            if (projLength >= 0 && projLength <= effectiveLength && Math.abs(projWidth) <= this.width / 2 + enemy.size / 2) {
                enemy.hp -= effectiveDamage;
                stab.hitRecords.add(enemy);

                // ============ 【破甲】机制 - Lv5解锁 ============
                // Lv5: 附加目标最大生命 3% 真伤，对Boss无效
                // Lv6: 真实伤害提升至 5%
                const armorPenPercent = this.level >= 5 ? (this.level >= 6 ? 0.05 : 0.03) : 0;
                if (armorPenPercent > 0) {
                    const isBoss = enemy.isBoss || enemy.isMiniBoss || enemy.isLevelBoss;
                    if (!isBoss) {
                        // 对非Boss附加真伤
                        const trueDamage = enemy.maxHp * armorPenPercent;
                        enemy.hp -= trueDamage;
                    }
                }

                // ============ 新增：枪的强力穿透硬直 ============
                const stunDuration = 0.15 + this.level * 0.03; // 基础0.18s，满级0.33s
                // Boss/木牛完全免疫硬直和击退
                if (enemy.knockbackResist < 1.0) {
                    enemy.stunTimer = Math.max(enemy.stunTimer, stunDuration);
                    // 破韧击退：只有不在硬直中才会被推开，避免高频击退无限推远
                    if (enemy.stunTimer <= stunDuration && enemy.stunTimer <= 0) {
                        // 击退效果：沿枪方向推开，计算抗性
                        const actualKnockback = this.knockbackDist * (1 - enemy.knockbackResist);
                        enemy.x += dirX * actualKnockback;
                        enemy.y += dirY * actualKnockback;
                    }
                }

                // 边界裁剪：防止被击退出地图，留出半身边距
                const halfSize = enemy.size / 2 + 5;
                const cw = gameManager.canvas.width;
                const ch = gameManager.canvas.height;
                enemy.x = Math.max(halfSize, Math.min(cw - halfSize, enemy.x));
                enemy.y = Math.max(halfSize, Math.min(ch - halfSize, enemy.y));
                // 检查死亡
                if (enemy.hp <= 0) {
                    gameManager.handleEnemyDeath(enemy, i);
                }
            }
        }
    }

    update(deltaTime, player, enemies, projectiles, specialAreas, canvasWidth, canvasHeight) {
        // Save canvas dimensions before calling super so attack() can use them
        this._currentCanvasWidth = canvasWidth;
        this._currentCanvasHeight = canvasHeight;
        // 调用父类更新攻击计时器，attack()会在冷却好时调用
        super.update(deltaTime, player, enemies, projectiles, specialAreas);

        // 更新所有活跃枪影的生命周期，每帧做碰撞检测
        for (let i = this.activeStabs.length - 1; i >= 0; i--) {
            const stab = this.activeStabs[i];
            stab.lifeTimer -= deltaTime;
            // 每帧使用玩家当前坐标重新碰撞检测，保证碰撞位置和渲染位置一致
            this.doStabCollision(stab, player.x, player.y, player, enemies);
            // 生命周期结束移除
            if (stab.lifeTimer <= 0) {
                this.activeStabs.splice(i, 1);
            }
        }

        // 更新冲刺
        if (this.dashing) {
            this.dashTimer -= deltaTime;
            // 冲刺过程中每帧持续位移，使移动平滑
            const dashSpeed = 600; // 冲刺速度
            const dx = this.dashDirX * dashSpeed * deltaTime;
            const dy = this.dashDirY * dashSpeed * deltaTime;
            player.x += dx;
            player.y += dy;

            // 边界检查，防止冲出画布
            const halfSize = player.size / 2;
            player.x = Math.max(halfSize, Math.min(canvasWidth - halfSize, player.x));
            player.y = Math.max(halfSize, Math.min(canvasHeight - halfSize, player.y));

            // 冲刺结束
            if (this.dashTimer <= 0) {
                this.dashing = false;
                player.isInvincible = false; // 关闭无敌
            }
        }
    }

    render(ctx, player) {
        if (this.activeStabs.length === 0) return;

        // 遍历渲染每根枪影
        for (const stab of this.activeStabs) {
            const x = player.x; // 每帧使用玩家当前坐标渲染，保证渲染位置实时更新
            const y = player.y;
            const dirX = stab.dirX;
            const dirY = stab.dirY;

            // 透明度衰减
            const alpha = stab.lifeTimer / 0.25 * 0.9;

            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(Math.atan2(dirY, dirX));

            // 枪身：梯形 - 根部宽 → 尖部窄
            ctx.fillStyle = `rgba(184, 134, 11, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(0, -this.width / 2);
            ctx.lineTo(this.length - 25, -this.width / 5);
            ctx.lineTo(this.length - 25, this.width / 5);
            ctx.lineTo(0, this.width / 2);
            ctx.closePath();
            ctx.fill();

            // 枪尖：紫红色三角形箭头
            ctx.fillStyle = `rgba(255, 0, 255, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(this.length - 25, -8);
            ctx.lineTo(this.length, 0);
            ctx.lineTo(this.length - 25, 8);
            ctx.closePath();
            ctx.fill();

            // 主枪影更亮描边
            if (stab.isMain) {
                ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.6})`;
                ctx.lineWidth = 2;
                ctx.stroke();
            }

            ctx.restore();
        }

        // 冲刺时玩家周围有闪光特效
        if (this.dashing) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(player.x, player.y, player.size * 0.8, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.fill();
            ctx.restore();
        }
    }
}

// 3. 弓 - 全息连弩 - 高频脱手追踪弹（默认武器）
class Crossbow extends Weapon {
    constructor(baseDamage) {
        super(baseDamage, getWeaponJsonAttackInterval('crossbow', 0.8)); // 基础每0.8秒发射一次
        this.type = 'crossbow';
        this.tags = ['ranged'];
        this.level = 1;
        // 连发配置：Lv2+ 连发
        this.burstCount = getWeaponJsonParam('crossbow', 'burstCount', 1);        // 总共连发几箭
        this.burstRemaining = 0;     // 剩余待发几箭
        this.burstTimer = 0;         // 连发间隔计时器
        this.burstInterval = getWeaponJsonParam('crossbow', 'burstInterval', 0.3);   // 默认连发间隔0.3秒
        // 穿透配置：Lv3+ 穿透次数
        this.basePierceCount = getWeaponJsonParam('crossbow', 'basePierceCount', 0);   // 基础额外穿透次数
        // 速度：箭矢飞行速度
        this.projectileSpeed = getWeaponJsonParam('crossbow', 'projectileSpeed', 550); // 默认
        // 闪电特效：Lv5+ 小AOE，Lv6+ 雷柱
        this.hasLightningAOE = false;
        this.hasLightningColumn = false;
    }

    update(deltaTime, player, enemies, projectiles, specialAreas, canvasWidth, canvasHeight) {
        // 父类处理主冷却，就绪后调用attack()
        super.update(deltaTime, player, enemies, projectiles, specialAreas, canvasWidth, canvasHeight);

        // 处理连发间隔：如果还有剩余箭矢，倒计时
        if (this.burstRemaining > 0) {
            this.burstTimer -= deltaTime;
            if (this.burstTimer <= 0) {
                // 发射下一箭
                this.fireNextArrow(player, enemies, projectiles);
                this.burstRemaining--;
                if (this.burstRemaining > 0) {
                    this.burstTimer = this.burstInterval;
                }
            }
        }
    }

    attack(player, enemies, projectiles) {
        // 连发开始：启动连发序列
        if (enemies.length === 0) return;
        // 第一箭立即发射
        this.fireNextArrow(player, enemies, projectiles);
        // 如果还有连发，设置计时器
        this.burstRemaining = this.burstCount - 1;
        if (this.burstRemaining > 0) {
            this.burstTimer = this.burstInterval;
        }
    }

    fireNextArrow(player, enemies, projectiles) {
        // 半自动辅助瞄准：在玩家面朝方向 ±45度（90度扇形）范围内找最近敌人
        const playerAngle = Math.atan2(player.facingDirY, player.facingDirX);
        let closestInAngle = null;
        let minDistSq = Infinity;
        const maxAngleDiff = Math.PI / 4; // ±45度 = 总共90度扇形

        for (const enemy of enemies) {
            const dx = enemy.x - player.x;
            const dy = enemy.y - player.y;
            const enemyAngle = Math.atan2(dy, dx);
            let angleDiff = Math.abs(enemyAngle - playerAngle);
            angleDiff = Math.min(angleDiff, 2 * Math.PI - angleDiff);

            if (angleDiff <= maxAngleDiff) {
                const distSq = dx * dx + dy * dy;
                if (distSq < minDistSq) {
                    minDistSq = distSq;
                    closestInAngle = enemy;
                }
            }
        }

        let angle;
        if (closestInAngle) {
            // 前方扇形范围内有敌人，瞄准最近的那个
            const dx = closestInAngle.x - player.x;
            const dy = closestInAngle.y - player.y;
            angle = Math.atan2(dy, dx);
        } else {
            // 前方没有敌人，严格使用玩家面向方向
            angle = playerAngle;
        }

        const totalDamage = this.baseDamage * player.getDamageMultiplier();
        // 创建可穿透箭矢，不追踪，方向固定
        projectiles.push(new CrossbowArrow(
            player.x, player.y, angle,
            totalDamage,
            this.basePierceCount,
            this.projectileSpeed,
            this.hasLightningAOE,
            this.hasLightningColumn,
            this.level
        ));
    }
}

// 连弩专用追踪子弹
class HomingProjectile {
    constructor(x, y, dirX, dirY, damage) {
        this.x = x;
        this.y = y;
        this.dirX = dirX;
        this.dirY = dirY;
        this.speed = 400;
        this.damage = damage;
        this.size = 8;
        this.maxLifetime = 3; // 最多存活3秒
        this.lifetime = 0;
    }

    update(deltaTime, canvasWidth, canvasHeight) {
        this.lifetime += deltaTime;

        // 超时销毁
        if (this.lifetime >= this.maxLifetime) {
            return false;
        }

        // 固定方向：射出后方向不再改变
        this.x += this.dirX * this.speed * deltaTime;
        this.y += this.dirY * this.speed * deltaTime;

        // 飞出屏幕销毁
        if (this.x < -50 || this.x > canvasWidth + 50 || this.y < -50 || this.y > canvasHeight + 50) {
            return false;
        }

        // 碰撞检测在主循环处理
        return true;
    }

    render(ctx) {
        // 暗金色 ">_" 形状
        ctx.fillStyle = '#b8860b';
        // > 形箭头
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x - this.size, this.y - this.size/2);
        ctx.lineTo(this.x - this.size, this.y - this.size/4);
        ctx.lineTo(this.x - this.size/2, this.y - this.size/4);
        ctx.lineTo(this.x - this.size/2, this.y + this.size/4);
        ctx.lineTo(this.x - this.size, this.y + this.size/4);
        ctx.lineTo(this.x - this.size, this.y + this.size/2);
        ctx.closePath();
        ctx.fill();
    }
}

// 霹雳惊弦弓 - 可穿透箭矢投射物（新版支持穿透和闪电特效）
class CrossbowArrow {
    constructor(x, y, angle, damage, extraPierce, projectileSpeed, hasLightningAOE, hasLightningColumn, weaponLevel = 1) {
        this.x = x + Math.cos(angle) * 10; // 从玩家身前射出
        this.y = y + Math.sin(angle) * 10;
        this.vx = Math.cos(angle) * projectileSpeed; // 配置化速度
        this.vy = Math.sin(angle) * projectileSpeed;
        this.damage = damage;
        this.size = 8; // 碰撞判定尺寸
        this.maxLifetime = 3; // 最多存活3秒
        this.lifetime = 0;
        this.length = 18; // 箭矢显示长度
        this.width = 3;  // 箭矢宽度
        // 穿透：初始可命中数量 = 基础穿透 + 1
        this.remainingPierce = extraPierce + 1;
        // 命中记录：同一个箭头不能重复伤害同一个敌人
        this.hitRecords = new Set();
        // 闪电特效标记
        this.hasLightningAOE = hasLightningAOE;
        this.hasLightningColumn = hasLightningColumn;
        this.weaponLevel = weaponLevel; // 保存武器等级用于击退硬直
    }

    update(deltaTime, canvasWidth, canvasHeight) {
        this.lifetime += deltaTime;

        // 超时销毁
        if (this.lifetime >= this.maxLifetime) {
            return false;
        }

        // 更新位置：固定方向，射出后不改变方向（用户要求：射出后矢量方向一致，没有追踪）
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;

        // 飞出屏幕销毁
        if (this.x < -50 || this.x > canvasWidth + 50 || this.y < -50 || this.y > canvasHeight + 50) {
            return false;
        }

        return true;
    }

    // 命中敌人时调用，返回是否应该销毁箭矢
    onHit(enemy, gameManager) {
        if (this.hitRecords.has(enemy)) {
            // 已经打过了，不重复伤害
            return this.remainingPierce <= 0;
        }

        // 记录命中
        this.hitRecords.add(enemy);

        // ============ 新增：暴击判定 ============
        // 基础10%暴击率，每级+5%，满级40%
        const critChance = 0.1 + (this.weaponLevel - 1) * 0.05;
        const isCrit = GameRuntime.random() < critChance;
        let damage = this.damage;
        let knockbackBase = 5 + this.weaponLevel * 1.5; // 满级推14
        let stunDuration = 0.05 + this.weaponLevel * 0.01; // 极短硬直打断施法

        if (isCrit) {
            // 暴击伤害翻倍
            damage *= 2;
            // 暴击击退硬直都 *1.5 倍
            knockbackBase *= 1.5;
            stunDuration *= 1.5;
            // 触发 30ms 微顿帧，打击感飙升
            gameManager.hitstopTimer = 0.03;
            // 红色暴击跳字
            gameManager.floatingTexts.push(new FloatingText(
                enemy.x, enemy.y - enemy.size/2 - 10,
                'CRIT!',
                'rgb(255, 0, 0)',
                24
            ));
        }

        // 造成伤害
        enemy.hp -= damage;

        // ============ 弓箭击退与硬直（暴击强化） ============
        // Boss/木牛完全免疫硬直和击退
        if (enemy.knockbackResist < 1.0) {
            enemy.stunTimer = Math.max(enemy.stunTimer, stunDuration);
            // 破韧击退：只有不在硬直中才会被推开，避免高频击退无限推远
            if (enemy.stunTimer <= stunDuration && enemy.stunTimer <= 0) {
                const actualKnockback = knockbackBase * (1 - enemy.knockbackResist);
                const flyAngle = Math.atan2(this.vy, this.vx);
                enemy.x += Math.cos(flyAngle) * actualKnockback;
                enemy.y += Math.sin(flyAngle) * actualKnockback;
            }
        }

        // 判断命中类型
        const isLastHit = this.remainingPierce <= 1 || enemy.isBoss;
        // 获取玩家范围加成
        const areaMul = 1 + (gameManager.player.modifiers.areaMulti || 0);

        // 触发闪电特效
        if (this.hasLightningColumn && isLastHit) {
            // Lv6 终极：毁灭雷柱
            const effectiveRadius = 120 * areaMul;
            gameManager.lightningEffects.push(new LightningColumnEffect(enemy.x, enemy.y, effectiveRadius, 3.0));
            // 全屏眩晕所有敌人在半径内
            gameManager.stunEnemiesInRadius(enemy.x, enemy.y, effectiveRadius, 1.0);
        } else if (this.hasLightningAOE) {
            // Lv5 普通：小范围AOE 50%伤害
            const effectiveRadius = 60 * areaMul;
            gameManager.lightningEffects.push(new LightningAOEEffect(enemy.x, enemy.y, effectiveRadius, 0.5));
            gameManager.damageEnemiesInRadius(enemy.x, enemy.y, effectiveRadius, this.damage * 0.5, this.hitRecords);
        }

        // 减少剩余穿透
        this.remainingPierce--;

        // 检查敌人死亡
        if (enemy.hp <= 0) {
            const index = gameManager.enemies.indexOf(enemy);
            gameManager.handleEnemyDeath(enemy, index);
        }

        // 如果还有穿透，箭矢继续飞行；否则销毁
        return this.remainingPierce <= 0;
    }

    render(ctx) {
        // 计算箭矢终点
        const angle = Math.atan2(this.vy, this.vx);
        const endX = this.x + Math.cos(angle) * this.length;
        const endY = this.y + Math.sin(angle) * this.length;

        // 根据等级改变颜色：有雷电则带蓝色调
        let strokeColor = '#e8e8e8';
        if (this.hasLightningColumn) {
            strokeColor = '#87cefa';
        } else if (this.hasLightningAOE) {
            strokeColor = '#add8e6';
        }

        // 绘制锐利的箭矢短线
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = this.width;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // 箭头尖端小三角
        let fillColor = '#d4a046';
        if (this.hasLightningColumn) {
            fillColor = '#4169e1';
        }
        ctx.fillStyle = fillColor;
        ctx.beginPath();
        const arrowSize = 5;
        ctx.moveTo(endX, endY);
        ctx.lineTo(
            endX - Math.cos(angle - 0.5) * arrowSize,
            endY - Math.sin(angle - 0.5) * arrowSize
        );
        ctx.lineTo(
            endX - Math.cos(angle + 0.5) * arrowSize,
            endY - Math.sin(angle + 0.5) * arrowSize
        );
        ctx.closePath();
        ctx.fill();
    }
}

// 闪电AOE效果 - 纯视觉，不处理碰撞
class LightningAOEEffect {
    constructor(x, y, radius, damageMulti) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.damageMulti = damageMulti;
        this.lifetime = 0.15; // 快速闪一下消失
    }

    update(deltaTime) {
        this.lifetime -= deltaTime;
        return this.lifetime > 0;
    }

    render(ctx) {
        // 闪烁半透明浅蓝色圆
        const alpha = this.lifetime / 0.15 * 0.6;
        ctx.save();
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(100, 149, 237, ${alpha})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(135, 206, 250, ${alpha})`;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
    }
}

// 终极雷柱效果 - 贯穿屏幕竖直雷柱，视觉震撼
class LightningColumnEffect {
    constructor(x, y, radius, damageMulti) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.damageMulti = damageMulti;
        this.lifetime = 0.15; // 快速闪消失
    }

    update(deltaTime) {
        this.lifetime -= deltaTime;
        return this.lifetime > 0;
    }

    render(ctx) {
        const alpha = this.lifetime / 0.15 * 0.8;
        // 亮蓝色竖直矩形贯穿屏幕
        ctx.save();
        ctx.fillStyle = `rgba(135, 206, 250, ${alpha})`;
        ctx.fillRect(this.x - this.radius/2, 0, this.radius, ctx.canvas.height);
        // 白色轮廓
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x - this.radius/2, 0, this.radius, ctx.canvas.height);
        ctx.restore();
    }
}

// 升级爆发的金色冲击波特效
class LevelUpNovaEffect {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.maxRadius = 250; // 和伤害范围一致，250px
        this.currentRadius = 0;
        this.maxLifetime = 1.0;
        this.lifetime = this.maxLifetime;
    }

    update(deltaTime) {
        this.lifetime -= deltaTime;
        const progress = 1 - (this.lifetime / this.maxLifetime);
        // 三次方缓动，起步极快，末端平滑
        const easeOut = 1 - Math.pow(1 - progress, 3);
        this.currentRadius = this.maxRadius * easeOut;
        return this.lifetime > 0;
    }

    render(ctx) {
        const alpha = this.lifetime / this.maxLifetime;
        ctx.save();
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.currentRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 215, 0, ${alpha * 0.25})`; // 半透明金色
        ctx.fill();
        ctx.lineWidth = 8 * alpha;
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`; // 白色耀眼边缘
        ctx.stroke();
        ctx.restore();
    }
}

// 浮动文字特效 - 用于暴击跳字等
class FloatingText {
    constructor(x, y, text, color, size = 20) {
        // 增加随机偏移散布，防止大量跳字叠在一起
        this.x = x + (GameRuntime.random() - 0.5) * 40;
        this.y = y + (GameRuntime.random() - 0.5) * 40;
        this.text = text;
        this.color = color;
        this.size = size;
        this.maxLifetime = 0.8;
        this.lifetime = this.maxLifetime;
        this.vy = -50; // 向上漂浮
    }

    update(deltaTime) {
        this.lifetime -= deltaTime;
        this.y += this.vy * deltaTime;
        this.vy *= 0.95; // 缓慢减速
        return this.lifetime > 0;
    }

    render(ctx) {
        const alpha = this.lifetime / this.maxLifetime;
        ctx.save();
        ctx.fillStyle = this.color.replace(')', `, ${alpha})`).replace('rgb', 'rgba');
        ctx.font = `bold ${this.size}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
    }
}

// 4. 剑 - 青釭·子程序 - 恒定环绕AOE，绕玩家公转
class QinggangSword extends Weapon {
    constructor(baseDamage) {
        super(baseDamage, getWeaponJsonAttackInterval('qinggang', 0));
        this.type = 'qinggang';
        this.count = getWeaponJsonParam('qinggang', 'count', 1);              // 飞剑数量
        this.baseOrbitRadius = getWeaponJsonParam('qinggang', 'baseOrbitRadius', 80);   // 基础轨道半径
        this.minRadius = getWeaponJsonParam('qinggang', 'minRadius', 60);         // 移动时最小半径
        this.maxRadius = getWeaponJsonParam('qinggang', 'maxRadius', 150);        // 静止时最大半径
        this.currentRadius = this.baseOrbitRadius;     // 当前平滑后的半径
        this.rotationSpeed = getWeaponJsonParam('qinggang', 'rotationSpeedRadians', Math.PI * 0.8);
        this.baseAngle = 0;          // 基础起始角度
        this.dualOrbit = false;      // Lv6双轨道
        this.lifesteal = getWeaponJsonParam('qinggang', 'lifesteal', 0);          // Lv5吸血量
        this.healCooldown = 0;       // 新增：吸血内置CD
        // 尺寸
        this.swordLength = getWeaponJsonParam('qinggang', 'swordLength', 40);
        this.swordHalfWidth = getWeaponJsonParam('qinggang', 'swordHalfWidth', 6);
        // 每个敌人独立冷却记录
        this.hitRecords = new Map();
        // 记录上一帧玩家位置用于检测移动
        this.lastPlayerX = 0;
        this.lastPlayerY = 0;
        this.smoothSpeed = getWeaponJsonParam('qinggang', 'smoothSpeed', 2);        // 半径平滑变化速度
    }

    update(deltaTime, player, enemies, projectiles, specialAreas) {
        // 检测玩家是否在移动
        const isMoving = player.moveUp || player.moveDown || player.moveLeft || player.moveRight;

        if (this.healCooldown > 0) this.healCooldown -= deltaTime; // 新增：更新吸血CD

        // 根据移动状态平滑调整半径，apply area multiplier from passive skill
        const baseTarget = isMoving ? this.minRadius : (this.dualOrbit ? this.maxRadius : this.baseOrbitRadius);
        const areaMul = 1 + (player.modifiers.areaMulti || 0);
        const targetRadius = baseTarget * areaMul;
        const radiusDiff = targetRadius - this.currentRadius;
        this.currentRadius += radiusDiff * Math.min(1, this.smoothSpeed * deltaTime);

        // 获取冷却缩减
        const cdr = player.modifiers.cooldownMulti || 0;

        // 减CD直接作用于公转速度（CD减半 = 转速翻倍）
        const actualRotationSpeed = this.rotationSpeed / Math.max(0.1, 1 - cdr);

        // 更新基础角度
        this.baseAngle += actualRotationSpeed * deltaTime;

        const now = Date.now();
        const collisionRadius = 20 * areaMul;

        // 处理飞剑轨道：单轨道或双轨道
        let orbitConfigs = [];
        if (this.dualOrbit) {
            // Lv6双轨道：内圈顺时针，外圈逆时针，不同半径
            orbitConfigs.push({
                count: Math.ceil(this.count / 2),
                baseAngle: this.baseAngle,
                direction: -1,
                radius: this.currentRadius * 0.6
            });
            orbitConfigs.push({
                count: Math.floor(this.count / 2),
                baseAngle: this.baseAngle + Math.PI / this.count,
                direction: 1,
                radius: this.currentRadius * 1.0
            });
        } else {
            // 单轨道：统一方向
            orbitConfigs.push({
                count: this.count,
                baseAngle: this.baseAngle,
                direction: 1,
                radius: this.currentRadius
            });
        }

        // 遍历所有轨道
        for (const orbit of orbitConfigs) {
            // 遍历每一把飞剑，动态等分角度
            for (let i = 0; i < orbit.count; i++) {
                const currentAngle = orbit.baseAngle + (Math.PI * 2 / orbit.count) * i;
                const actualAngle = currentAngle * orbit.direction;
                const actualX = player.x + Math.cos(actualAngle) * orbit.radius;
                const actualY = player.y + Math.sin(actualAngle) * orbit.radius;

                // 空间网格优化：只查询飞剑附近格子的敌人
                const gm = window.gameManager;
                const nearbyEnemies = gm.queryEnemiesInRange(actualX, actualY, collisionRadius + 40);

                // 碰撞检测 - 只遍历附近敌人
                for (let j = nearbyEnemies.length - 1; j >= 0; j--) {
                    const enemy = nearbyEnemies[j];
                    const dist = Math.hypot(enemy.x - actualX, enemy.y - actualY);
                    if (dist < collisionRadius + enemy.size / 2) {
                        const lastHitTime = this.hitRecords.get(enemy) || 0;
                        // 内部伤害 Tick 同步吃减 CD，确保转得快也能高频触发伤害
                        const tickInterval = 500 * Math.max(0.1, 1 - cdr);
                        if (now - lastHitTime > tickInterval) {
                            // 计算总伤害加成 - 使用统一跨源乘算
                            const effectiveDamage = this.baseDamage * player.getDamageMultiplier();
                            enemy.hp -= effectiveDamage;
                            this.hitRecords.set(enemy, now);

                            // ============ 新增：剑的纯硬直效果（无击退，随等级成长） ============
                            const stunDuration = 0.1 + this.level * 0.02; // 纯控制，最高 0.22s
                            // Boss/木牛完全免疫硬直和击退
                            if (enemy.knockbackResist < 1.0) {
                                enemy.stunTimer = Math.max(enemy.stunTimer, stunDuration);
                            }

                            // 检查死亡，处理吸血
                            if (enemy.hp <= 0) {
                                const originalIdx = gm.enemies.indexOf(enemy);
                                gm.trySpawnPickup(enemy);
                                if (originalIdx >= 0) {
                                    gm.enemies.splice(originalIdx, 1);
                                }
                                this.hitRecords.delete(enemy);

                                // 修改：增加内置CD判定
                                if (this.lifesteal > 0 && this.healCooldown <= 0) {
                                    player.hp = Math.min(player.maxHp, player.hp + this.lifesteal);
                                    this.healCooldown = 0.25; // 触发后锁定 0.25 秒，限制最高 4HP/s
                                }
                            }
                        }
                    }
                }
            }
        }

        // 额外遍历清除敌方投射物在飞剑碰撞半径内
        for (let i = projectiles.length - 1; i >= 0; i--) {
            const proj = projectiles[i];
            if (!proj.isEnemyProjectile) continue;

            // 检查所有飞剑轨道，只要有一把飞剑靠近就销毁
            let shouldDestroy = false;
            for (const orbit of orbitConfigs) {
                for (let i = 0; i < orbit.count; i++) {
                    const currentAngle = orbit.baseAngle + (Math.PI * 2 / orbit.count) * i;
                    const actualAngle = currentAngle * orbit.direction;
                    const actualX = player.x + Math.cos(actualAngle) * orbit.radius;
                    const actualY = player.y + Math.sin(actualAngle) * orbit.radius;
                    const dist = Math.hypot(proj.x - actualX, proj.y - actualY);
                    if (dist < collisionRadius + proj.size / 2) {
                        shouldDestroy = true;
                        break;
                    }
                }
                if (shouldDestroy) break;
            }
            if (shouldDestroy) {
                projectiles.splice(i, 1);
            }
        }

        // 保存当前位置供下一帧移动检测
        this.lastPlayerX = player.x;
        this.lastPlayerY = player.y;
    }

    // 属性更新后刷新 - 不需要缓存，留空保持接口兼容
    onStatsUpdated(modifiers) {
        // 伤害计算每次都实时读取 player.getDamageMultiplier()，不需要缓存
    }

    render(ctx, player) {
        let orbitConfigs = [];
        if (this.dualOrbit) {
            orbitConfigs.push({
                count: Math.ceil(this.count / 2),
                baseAngle: this.baseAngle,
                direction: -1,
                radius: this.currentRadius * 0.6
            });
            orbitConfigs.push({
                count: Math.floor(this.count / 2),
                baseAngle: this.baseAngle + Math.PI / this.count,
                direction: 1,
                radius: this.currentRadius * 1.0
            });
        } else {
            orbitConfigs.push({
                count: this.count,
                baseAngle: this.baseAngle,
                direction: 1,
                radius: this.currentRadius
            });
        }

        // 渲染每一把飞剑
        const areaMul = 1 + (player.modifiers.areaMulti || 0);
        const effectiveLength = this.swordLength * areaMul;
        const effectiveHalfWidth = this.swordHalfWidth * areaMul;

        for (const orbit of orbitConfigs) {
            for (let i = 0; i < orbit.count; i++) {
                const currentAngle = orbit.baseAngle + (Math.PI * 2 / orbit.count) * i;
                const actualAngle = currentAngle * orbit.direction;
                const actualX = player.x + Math.cos(actualAngle) * orbit.radius;
                const actualY = player.y + Math.sin(actualAngle) * orbit.radius;

                ctx.save();
                ctx.translate(actualX, actualY);
                ctx.rotate(actualAngle + Math.PI / 2);

                // 光剑本体 - 应用范围加成
                ctx.fillStyle = '#ff00ff';
                ctx.fillRect(-effectiveHalfWidth, -effectiveLength / 2, effectiveHalfWidth * 2, effectiveLength);

                // 残影尾迹 - 应用范围加成
                ctx.fillStyle = 'rgba(255, 0, 255, 0.3)';
                ctx.fillRect(-effectiveHalfWidth, effectiveLength / 2, effectiveHalfWidth * 2, effectiveLength / 2);

                ctx.restore();
            }
        }
    }
}

// 5. 盾 - 壁垒脉冲盾 - 脉冲扩散强击退保命已经定义在后面
// 6. 书 - 太平要术·风火残页 - 持续区域伤害陷阱
class FireTornado {
    constructor(x, y, baseRadius, baseLifetime, baseTickInterval, baseDamage, mode, book) {
        this.x = x;
        this.y = y;
        this.mode = mode; // 'seek_enemy' | 'seek_player' | 'massive_storm'
        this.book = book; // 引用武器配置获取属性

        // 基础属性，从武器配置读取
        this.baseRadius = baseRadius;
        this.currentRadius = baseRadius;
        this.baseLifetime = baseLifetime;
        this.lifetime = baseLifetime;
        this.baseTickInterval = baseTickInterval;
        this.currentTickInterval = baseTickInterval;
        this.baseDamage = baseDamage;
        this.currentDamage = baseDamage;

        this.moveSpeed = 20; // 缓慢移动速度
        this.tickTimer = 0;

        // 聚变风暴特殊参数
        this.originalParams = null; // 保存爆炸前参数
    }

    findNearestTarget(enemies, player) {
        if (this.mode === 'seek_player') {
            return { x: player.x, y: player.y };
        }
        if (enemies.length === 0) return null;

        let nearestDist = Infinity;
        let nearest = null;
        for (const enemy of enemies) {
            const dx = enemy.x - this.x;
            const dy = enemy.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearest = enemy;
            }
        }
        return nearest;
    }

    update(deltaTime, enemies, player) {
        this.lifetime -= deltaTime;
        this.tickTimer += deltaTime;

        // 移动逻辑：只在seek模式下移动
        if (this.mode === 'seek_enemy' && this.book.autoSeek) {
            const target = this.findNearestTarget(enemies, player);
            if (target) {
                const dx = target.x - this.x;
                const dy = target.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 5) {
                    const angle = Math.atan2(dy, dx);
                    this.x += Math.cos(angle) * this.moveSpeed * deltaTime;
                    this.y += Math.sin(angle) * this.moveSpeed * deltaTime;
                }
            }
        } else if (this.mode === 'seek_player') {
            // 向玩家缓慢移动
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            // 检测玩家触碰，触发聚变风暴
            if (dist < this.currentRadius + player.size / 2) {
                this.triggerMassiveStorm();
            } else if (dist > 5) {
                const angle = Math.atan2(dy, dx);
                this.x += Math.cos(angle) * this.moveSpeed * deltaTime;
                this.y += Math.sin(angle) * this.moveSpeed * deltaTime;
            }
        }

        // 伤害判定
        if (this.tickTimer >= this.currentTickInterval) {
            this.tickTimer -= this.currentTickInterval;

            const gm = window.gameManager;
            const nearbyEnemies = gm.queryEnemiesInRange(this.x, this.y, this.currentRadius + 80);
            for (let i = nearbyEnemies.length - 1; i >= 0; i--) {
                const enemy = nearbyEnemies[i];
                const dx = enemy.x - this.x;
                const dy = enemy.y - this.y;
                const distSq = dx * dx + dy * dy;
                if (distSq <= (this.currentRadius + enemy.size / 2) * (this.currentRadius + enemy.size / 2)) {
                    enemy.hp -= this.currentDamage * this.currentTickInterval;
                    // 检查死亡
                    if (enemy.hp <= 0) {
                        const originalIdx = gameManager.enemies.indexOf(enemy);
                        if (originalIdx >= 0) {
                            gameManager.handleEnemyDeath(enemy, originalIdx);
                        }
                    }
                }
            }
        }

        return this.lifetime > 0;
    }

    triggerMassiveStorm() {
        // 保存原有参数
        this.originalParams = {
            radius: this.currentRadius,
            lifetime: this.lifetime,
            tickInterval: this.currentTickInterval,
            damage: this.currentDamage
        };
        // 切换形态：巨型风暴
        this.mode = 'massive_storm';
        this.currentRadius *= 5;
        this.currentTickInterval *= 0.3; // 频率提升 ~3.3x 更高伤害
        this.currentDamage *= 2; // 伤害翻倍
        // 随机 3-5 秒持续时间
        this.lifetime = 3 + GameRuntime.random() * 2;
        this.moveSpeed = 0; // 停止移动
    }

    render(ctx) {
        let strokeColor, fillColor, shadowColor;
        let lineWidth = 3;

        if (this.mode === 'massive_storm') {
            // 巨型聚变风暴：红橙色烈焰
            strokeColor = '#ff2200';
            fillColor = `rgba(255, 60, 0, ${0.3 + 0.2 * GameRuntime.random()})`;
            shadowColor = '#ff3300';
            lineWidth = 8;
        } else if (this.mode === 'seek_player') {
            // 向玩家移动的聚变龙卷风：偏亮橙色
            strokeColor = '#ff6600';
            fillColor = `rgba(255, 100, 0, ${0.25 + 0.15 * GameRuntime.random()})`;
            shadowColor = '#ff6600';
            lineWidth = 4;
        } else {
            // 普通索敌：原有配色 暗金+紫红
            strokeColor = '#b8860b';
            fillColor = `rgba(255, 0, 255, ${0.3 + 0.2 * GameRuntime.random()})`;
            shadowColor = '#b8860b';
        }

        const pulse = 0.9 + 0.1 * Math.sin(Date.now() / 40);
        const renderRadius = this.currentRadius * pulse;

        ctx.save();
        ctx.shadowBlur = 15;
        ctx.shadowColor = shadowColor;

        ctx.beginPath();
        ctx.arc(this.x, this.y, renderRadius, 0, Math.PI * 2);
        ctx.fillStyle = fillColor;
        ctx.fill();

        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = strokeColor;
        ctx.stroke();

        // 内层点缀：小圈闪烁
        if (this.mode !== 'massive_storm') {
            ctx.beginPath();
            ctx.arc(this.x, this.y, renderRadius * 0.6, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 0, 255, ${0.3 + 0.2 * GameRuntime.random()})`;
            ctx.fill();
        }

        ctx.restore();
    }
}

class TaipingBook extends Weapon {
    constructor(baseDamage) {
        super(baseDamage, getWeaponJsonAttackInterval('taiping', 5)); // 每5秒触发一次
        this.type = 'taiping';
        // 默认基础参数
        this.baseRadius = getWeaponJsonParam('taiping', 'baseRadius', 60);
        this.baseLifetime = getWeaponJsonParam('taiping', 'baseLifetime', 3);
        this.baseTickInterval = getWeaponJsonParam('taiping', 'baseTickInterval', 0.2);
        this.baseDamagePerSecond = baseDamage;
        this.maxTornados = getWeaponJsonParam('taiping', 'maxTornados', 1);
        this.autoSeek = false;
        this.hasProximityStorm = false;
        this.spawnQueue = []; // 延迟生成队列：由update驱动逐帧生成
    }

    update(deltaTime, player, enemies, projectiles, specialAreas, canvasWidth, canvasHeight) {
        super.update(deltaTime, player, enemies, projectiles, specialAreas, canvasWidth, canvasHeight);

        // 处理延迟生成队列：每一帧减去deltaTime，到点就生成
        for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
            const task = this.spawnQueue[i];
            task.delay -= deltaTime;
            if (task.delay <= 0) {
                task.action();
                this.spawnQueue.splice(i, 1);
            }
        }
    }

    attack(player, enemies, projectiles, specialAreas) {
        // 计算总伤害加成 - 使用统一跨源乘算
        const damagePerSecond = this.baseDamagePerSecond * player.getDamageMultiplier();
        const fireTornados = gameManager.fireTornados;

        // Lv6：需要生成一个向玩家移动的聚变龙卷风，先生成这个保证名额
        let needProximity = this.hasProximityStorm && fireTornados.filter(t => t.mode === 'seek_player').length === 0;

        // 计算剩余名额
        let remainingSlots = this.maxTornados - fireTornados.length;
        if (needProximity) remainingSlots--;

        // 生成常规龙卷风：推入延迟队列代替setTimeout，每一帧递减倒计时
        for (let i = 0; i < remainingSlots; i++) {
            this.spawnQueue.push({
                delay: i * 0.3,
                action: () => {
                    // 全部随机在玩家 80 像素范围内
                    const angle = GameRuntime.random() * Math.PI * 2;
                    const dist = GameRuntime.random() * 80;
                    const spawnX = player.x + Math.cos(angle) * dist;
                    const spawnY = player.y + Math.sin(angle) * dist;
                    // Lv5+ 自动索敌，否则静止
                    const mode = this.level >= 5 ? 'seek_enemy' : 'stationary';
                    // apply area multiplier from passive skill
                    const effectiveRadius = this.baseRadius * (1 + (player.modifiers.areaMulti || 0));
                    const tornado = new FireTornado(
                        spawnX, spawnY,
                        effectiveRadius,
                        this.baseLifetime,
                        this.baseTickInterval,
                        damagePerSecond,
                        mode,
                        this
                    );
                    fireTornados.push(tornado);
                }
            });
        }

        // Lv6：生成聚变龙卷风，推入延迟队列
        if (needProximity) {
            this.spawnQueue.push({
                delay: remainingSlots * 0.3,
                action: () => {
                    // 终极技能：随机地图安全区域生成（margin=150避开屏幕边缘），与玩家当前位置无关
                    const gm = window.gameManager;
                    const margin = 150;
                    const spawnX = margin + GameRuntime.random() * (gm.canvas.width - margin * 2);
                    const spawnY = margin + GameRuntime.random() * (gm.canvas.height - margin * 2);
                    const tornado = new FireTornado(
                        spawnX, spawnY,
                        this.baseRadius,
                        this.baseLifetime,
                        this.baseTickInterval,
                        damagePerSecond,
                        'seek_player',
                        this
                    );
                    fireTornados.push(tornado);
                }
            });
        }
    }

    // 属性更新后刷新 - 不需要缓存，留空保持接口兼容
    onStatsUpdated(modifiers) {
        // 新生成的龙卷风自动使用最新伤害，不需要更新已存在的
    }
}

// Lv6 八门金锁盾终极：环形火墙从外向内持续收缩，持续 3 秒，关门打狗
class FireRing {
    constructor(x, y, radius, damagePerSecond) {
        this.x = x;
        this.y = y;
        this.maxRadius = radius;      // 初始最大半径
        this.damagePerSecond = damagePerSecond;
        this.totalLifetime = 3;       // 总持续时间
        this.lifetime = this.totalLifetime; // 剩余生命
        this.tickTimer = 0;
        this.tolerance = 15; // 边缘容差，敌人在这个范围内受伤害
        this.burnTick = 0.5; // 每 0.5 秒灼烧一次
    }

    getCurrentRadius() {
        // 从外向内收缩：剩余比例越大，半径越大
        const progress = this.lifetime / this.totalLifetime;
        return this.maxRadius * progress;
    }

    update(deltaTime, enemies) {
        this.lifetime -= deltaTime;
        this.tickTimer += deltaTime;
        const currentRadius = this.getCurrentRadius();

        // 定时造成伤害和弹回
        if (this.tickTimer >= this.burnTick) {
            this.tickTimer -= this.burnTick;

            for (let i = enemies.length - 1; i >= 0; i--) {
                const enemy = enemies[i];
                const dx = enemy.x - this.x;
                const dy = enemy.y - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                // 判断是否在当前收缩火墙边缘容差范围内
                if (Math.abs(dist - currentRadius) <= this.tolerance + enemy.size / 2) {
                    // 灼烧伤害
                    enemy.hp -= this.damagePerSecond * this.burnTick;

                    // 强制向内弹回 10 像素，跟随火墙收缩向内压 - 增加抗性计算
                    if (dist > 0) {
                        const angle = Math.atan2(dy, dx);
                        const pull = 10 * (1 - enemy.knockbackResist);
                        enemy.x -= Math.cos(angle) * pull;
                        enemy.y -= Math.sin(angle) * pull;
                    }

                    // 检查死亡
                    if (enemy.hp <= 0) {
                        gameManager.handleEnemyDeath(enemy, i);
                    }
                }
            }
        }

        return this.lifetime > 0;
    }

    render(ctx) {
        const currentRadius = this.getCurrentRadius();
        // 火焰红橙色环形火墙，透明度随剩余生命衰减
        const alpha = 0.6 * (this.lifetime / this.totalLifetime) + 0.2;
        const pulse = 0.9 + 0.1 * Math.sin(Date.now() / 30);
        const renderRadius = currentRadius * pulse;

        ctx.save();
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ff4500';

        // 绘制环形边缘（跟随收缩）
        ctx.beginPath();
        ctx.arc(this.x, this.y, renderRadius, 0, Math.PI * 2);
        ctx.lineWidth = 8;
        ctx.strokeStyle = `rgba(255, 69, 0, ${alpha})`;
        ctx.stroke();

        // 内半透明填充（填充到当前半径）
        ctx.beginPath();
        ctx.arc(this.x, this.y, renderRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 69, 0, ${alpha * 0.2})`;
        ctx.fill();

        ctx.restore();
    }
}

// 6. 盾 - 八门金锁盾 - 先滞留蓄力再骤然爆发，延缓扩张
class Shield extends Weapon {
    constructor(baseDamage) {
        super(baseDamage, getWeaponJsonAttackInterval('shield', 3.5)); // 每3.5秒触发一次脉冲爆发
        this.type = 'shield';
        this.active = false;
        this.phase = 'none'; // none / charge / explode
        this.chargeTimer = 0;
        this.explodeTimer = 0;
        this.currentRadius = 0;
        this.maxRadius = getWeaponJsonParam('shield', 'maxRadius', 144); // 基础范围 ×1.2
        this.baseKnockback = getWeaponJsonParam('shield', 'baseKnockback', 60); // 基础击退距离
        this.hitRecords = new Set();
        this.x = 0;
        this.y = 0;
        // 高级特性：Lv5摧毁投射物，Lv6生成火墙
        this.canDestroyProjectiles = false;
        this.spawnFireRing = false;
        // 阶段时间配置
        this.chargeDuration = getWeaponJsonParam('shield', 'chargeDuration', 0.5);
        this.explodeDuration = getWeaponJsonParam('shield', 'explodeDuration', 0.15);
        this.chargeStartRadius = getWeaponJsonParam('shield', 'chargeStartRadius', 20);
        this.chargeEndRadius = getWeaponJsonParam('shield', 'chargeEndRadius', 40);
    }

    attack(player, enemies, projectiles, specialAreas) {
        // 触发新的脉冲爆发：进入蓄力阶段
        this.active = true;
        this.phase = 'charge';
        this.chargeTimer = 0;
        this.explodeTimer = 0;
        this.currentRadius = this.chargeStartRadius;
        this.hitRecords.clear();
        // 锚定到玩家当前位置
        this.x = player.x;
        this.y = player.y;
    }

    update(deltaTime, player, enemies, projectiles, specialAreas) {
        // 父类处理攻击计时器，计时结束后调用 attack()
        super.update(deltaTime, player, enemies, projectiles, specialAreas);

        if (!this.active) return;

        // 强制实时锚定：每一帧都更新到玩家当前坐标
        this.x = player.x;
        this.y = player.y;

        if (this.phase === 'charge') {
            // Charge 阶段：0.5秒线性从 20 → 40
            this.chargeTimer += deltaTime;
            const chargeProgress = Math.min(1, this.chargeTimer / this.chargeDuration);
            this.currentRadius = this.chargeStartRadius + (this.chargeEndRadius - this.chargeStartRadius) * chargeProgress;

            // 极小幅度排斥：让敌人稍微离开，不造成主伤害
            const knockbackScale = 0.15; // 15% 力度
            this.checkAndHitEnemies(knockbackScale, player, enemies);

            // 脉冲范围内清除敌方投射物
            this.destroyProjectilesInRadius(projectiles);

            // 阶段结束进入 explode
            if (this.chargeTimer >= this.chargeDuration) {
                this.phase = 'explode';
                this.explodeTimer = 0;
            }
        } else if (this.phase === 'explode') {
            // Explode 阶段：0.15秒从 40 → maxRadius，ease-out 二次方缓动
            this.explodeTimer += deltaTime;
            const explodeProgress = Math.min(1, this.explodeTimer / this.explodeDuration);
            // ease-out: 速度从快到慢，f(x) = 1 - (1 - x)^2
            const easedProgress = 1 - Math.pow(1 - explodeProgress, 2);
            // apply area multiplier from passive skill
            const effectiveMaxRadius = this.maxRadius * (1 + (player.modifiers.areaMulti || 0));
            this.currentRadius = this.chargeEndRadius + (effectiveMaxRadius - this.chargeEndRadius) * easedProgress;

            // 全额伤害 + 全额击退
            const knockbackScale = 1.0;
            this.checkAndHitEnemies(knockbackScale, player, enemies);

            // 脉冲范围内清除敌方投射物
            this.destroyProjectilesInRadius(projectiles);

            // 达到最大半径，脉冲结束
            if (this.explodeTimer >= this.explodeDuration) {
                // Lv6：生成火墙
                if (this.spawnFireRing && specialAreas !== undefined) {
                    // 计算总伤害加成后的灼烧伤害 - 使用统一跨源乘算
                    const burnDps = this.baseDamage * 2 * player.getDamageMultiplier();
                    specialAreas.push(new FireRing(this.x, this.y, effectiveMaxRadius, burnDps));
                }
                this.active = false;
                this.phase = 'none';
                this.hitRecords.clear();
            }
        }
    }

    checkAndHitEnemies(knockbackScale, player, enemies) {
        // 空间网格优化：只查询脉冲半径范围内附近格子的敌人
        const gm = window.gameManager;
        const nearbyEnemies = gm.queryEnemiesInRange(this.x, this.y, this.currentRadius + 40);

        for (let i = nearbyEnemies.length - 1; i >= 0; i--) {
            const enemy = nearbyEnemies[i];

            // 本次脉冲已经击中过（已经造成伤害），跳过
            if (this.hitRecords.has(enemy)) continue;

            const dx = enemy.x - this.x;
            const dy = enemy.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist <= this.currentRadius + enemy.size / 2) {
                // 计算总伤害加成
                // 计算总伤害加成 - 使用统一跨源乘算
                const effectiveDamage = this.baseDamage * player.getDamageMultiplier();

                // 放射性击退按比例（蓄力阶段也有击退）
                const angle = Math.atan2(dy, dx);
                const actualKnockback = this.baseKnockback * knockbackScale;
                enemy.x += Math.cos(angle) * actualKnockback;
                enemy.y += Math.sin(angle) * actualKnockback;

                // 只有 full scale 才造成全额伤害，并标记已击中防止重复伤害
                let killed = false;
                if (knockbackScale >= 0.9) {
                    enemy.hp -= effectiveDamage;
                    // 标记已击中（只有全额伤害才标记，蓄力阶段不标记）
                    this.hitRecords.add(enemy);

                    // 检查死亡
                    if (enemy.hp <= 0) {
                        const originalIdx = gm.enemies.indexOf(enemy);
                        gm.handleEnemyDeath(enemy, originalIdx);
                        this.hitRecords.delete(enemy);
                        killed = true;
                    }
                }

                if (killed) continue;
            }
        }
    }

    destroyProjectilesInRadius(projectiles) {
        // 遍历所有飞行物，摧毁敌方投射物在当前半径内
        for (let i = projectiles.length - 1; i >= 0; i--) {
            const proj = projectiles[i];
            // 只摧毁敌方投射物（玩家子弹不受影响）
            if (!proj.isEnemyProjectile) continue;

            const dx = proj.x - this.x;
            const dy = proj.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= this.currentRadius + proj.size / 2) {
                projectiles.splice(i, 1);
            }
        }
    }

    render(ctx, player) {
        if (!this.active || this.currentRadius <= 0) return;

        // 强制锚定玩家当前位置渲染
        this.x = player.x;
        this.y = player.y;

        // 计算视觉参数：alpha基于阶段，蓄力偏亮，爆发偏亮，末端淡出
        const normalizedRadius = this.currentRadius / this.maxRadius;
        const alpha = 0.8 * (1 - normalizedRadius * 0.6) + 0.2;

        // 阶段颜色：蓄力偏蓝，爆发偏亮青
        let colorHex = '#00FFFF';
        if (this.phase === 'charge') {
            colorHex = '#4169E1'; // 蓄力深蓝色
        } else {
            colorHex = '#00FFFF'; // 爆发亮青色
        }

        // 开启辉光效果
        ctx.save();
        ctx.shadowBlur = 20;
        ctx.shadowColor = colorHex;

        // 绘制圆圈路径
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.currentRadius, 0, Math.PI * 2);

        // 力场内填充
        ctx.fillStyle = colorHex.replace(')', `, ${alpha * 0.25})`).replace('#', 'rgba(');
        // 转换一下：#00FFFF → rgba(0, 255, 255, a)
        const r = parseInt(colorHex.slice(1, 3), 16);
        const g = parseInt(colorHex.slice(3, 5), 16);
        const b = parseInt(colorHex.slice(5, 7), 16);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.25})`;
        ctx.fill();

        // 发光边缘描边：蓄力细，爆发粗
        const lineWidth = this.phase === 'charge' ? 6 : 10;
        ctx.lineWidth = lineWidth * alpha;
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.stroke();

        // 重置阴影
        ctx.restore();
    }

    // 属性更新后刷新 - 不需要缓存，留空保持接口兼容
    onStatsUpdated(modifiers) {
        // 伤害计算每次都实时读取 player.getDamageMultiplier()，不需要缓存
    }
}

// ==================== 玩家定义 ====================

class Player {
    constructor(canvasWidth, canvasHeight, perks, perkLevels) {
        this.size = 30;
        this.x = canvasWidth / 2;
        this.y = canvasHeight / 2;
        this.isInvincible = false; // 无敌帧标记，用于龙胆枪冲刺

        // 保存初始局外升级配置
        this.initialPerks = perks;

        // 基础属性定值
        this.baseSpeed = 200;
        this.baseMaxHp = 100;
        this.baseDamage = 10;
        this.baseFireRate = 0.5;

        this.color = '#b8860b'; // 暗金色

        // 记录玩家当前面向方向（供方向化武器使用）
        // 默认初始面向：向右
        this.facingDirX = 1;
        this.facingDirY = 0;

        // 经验等级系统 - 升级公式: 分段梯度
        this.level = 1;
        this.exp = 0; // 初始等级1，零经验开局
        this.expToNextLevel = this.getExpRequirement(this.level);

        // 被动增益列表（旧系统保留）
        this.passives = [];
        // 属性乘区 modifiers - 从零开始，由被动技能累加
        this.modifiers = {
            speedMulti: 0,
            damageMulti: 0,
            cooldownMulti: 0,
            magnetRadiusMulti: 0,
            areaMulti: 0,
            regen: 0,
            expMulti: 0,
            resonanceMulti: 0,
            damageReduction: 0
        };
        // 双轨制技能等级：局内升级技能
        this.inGameSkills = {
            SPEED: 0,
            DAMAGE: 0,
            COOLDOWN: 0,
            MAGNET: 0,
            MAXHP: 0,
            AREA: 0,
            REGEN: 0,
            EXP: 0,
            RESONANCE: 0,
            ARMOR: 0
        };
        // 双轨制技能等级：局外商城技能（永久保存），初始从持久化读取**等级数**
        // 对应 PERK_UPGRADES 中的十个被动技能，id 对应 meta key
        // 清空存档后默认所有技能初始 lv.0 起步
        this.metaSkills = {
            SPEED: (perkLevels && perkLevels.speed !== undefined) ? perkLevels.speed : 0,
            DAMAGE: (perkLevels && perkLevels.damage !== undefined) ? perkLevels.damage : 0,
            COOLDOWN: (perkLevels && perkLevels.cooldown !== undefined) ? perkLevels.cooldown : 0,
            MAGNET: (perkLevels && perkLevels.magnet !== undefined) ? perkLevels.magnet : 0,
            MAXHP: (perkLevels && perkLevels.maxHp !== undefined) ? perkLevels.maxHp : 0,
            AREA: (perkLevels && perkLevels.area !== undefined) ? perkLevels.area : 0,
            REGEN: (perkLevels && perkLevels.regen !== undefined) ? perkLevels.regen : 0,
            EXP: (perkLevels && perkLevels.exp !== undefined) ? perkLevels.exp : 0,
            RESONANCE: (perkLevels && perkLevels.resonance !== undefined) ? perkLevels.resonance : 0,
            ARMOR: (perkLevels && perkLevels.armor !== undefined) ? perkLevels.armor : 0
        };
        // 吸附半径 - 经验宝珠/残响自动吸附范围
        this.magnetRadius = 75;
        // 武器列表 - 默认初始武器
        this.weapons = [];
        // 每局初始刷新次数：开局自带3次
        this.rerolls = 3;

        // 根据双轨技能等级重新计算所有乘区（一次性计算，避免重复加成）
        this.updateModifiers();
        // 血量初始化：满血量开局
        this.hp = this.maxHp;

        // 随机选择一把初始武器 Lv.1
        const weaponChoices = [
            { type: 'saber', cls: Saber },
            { type: 'spear', cls: Spear },
            { type: 'crossbow', cls: Crossbow },
            { type: 'qinggang', cls: QinggangSword },
            { type: 'shield', cls: Shield },
            { type: 'taiping', cls: TaipingBook }
        ];
        const forcedWeaponType = new URLSearchParams(window.location.search).get('debugInitialWeapon');
        const forcedWeapon = weaponChoices.find(choice => choice.type === forcedWeaponType);
        const picked = forcedWeapon || weaponChoices[Math.floor(GameRuntime.random() * weaponChoices.length)];
        const config = WEAPON_UPGRADES[picked.type];

        // 直接使用纯净的基础伤害，所有乘区计算交给攻击判定瞬间
        const weapon = new picked.cls(config.baseDamage);

        for (let lvl = 1; lvl <= 1; lvl++) {
            if (config[lvl].action) {
                config[lvl].action(weapon);
            }
        }
        weapon.level = 1;
        const forcedWeaponLevel = Number(new URLSearchParams(window.location.search).get('debugInitialWeaponLevel') || 1);
        if (forcedWeapon && Number.isInteger(forcedWeaponLevel) && forcedWeaponLevel > 1) {
            const targetLevel = Math.min(forcedWeaponLevel, 6);
            for (let lvl = 2; lvl <= targetLevel; lvl++) {
                if (config[lvl]?.action) {
                    config[lvl].action(weapon);
                }
            }
            weapon.level = targetLevel;
            weapon.onStatsUpdated(this.modifiers);
        }
        applyGenericWeaponScalarMigration(weapon);
        this.weapons.push(weapon);
        this.refreshWeapons();
        console.log('Player Init Stats:', this.modifiers, 'MaxHP:', this.maxHp, `Initial Weapon: ${config.name} Lv1, BaseDmg: ${config.baseDamage}`);

    }

    // 根据双轨技能等级重新计算所有属性乘区
    updateModifiers() {
        // PASSIVE_SKILLS 定义
        const PASSIVE_SKILLS = {
            SPEED: { name: '绝影无痕', desc: '移速提升', stat: 'speedMulti', baseValue: 0.06 },
            DAMAGE: { name: '陷阵杀气', desc: '全伤害提升', stat: 'damageMulti', baseValue: 0.10 },
            COOLDOWN: { name: '迅雷风烈', desc: '武器触发间隔缩短', stat: 'cooldownMulti', baseValue: -0.08 },
            MAGNET: { name: '摸金秘术', desc: '拾取范围扩大', stat: 'magnetRadiusMulti', baseValue: 0.20 },
            MAXHP: { name: '虎卫霸体', desc: '基础生命上限提升', stat: 'baseMaxHp', baseValue: 20 },
            AREA: { name: '气吞山河', desc: '攻击范围扩大', stat: 'areaMulti', baseValue: 0.08 },
            REGEN: { name: '青囊秘卷', desc: '自动生命回复', stat: 'regen', baseValue: 0.4 },
            EXP: { name: '天命所归', desc: '经验获取提升', stat: 'expMulti', baseValue: 0.10 },
            RESONANCE: { name: '历史共鸣', desc: '残响掉落提升', stat: 'resonanceMulti', baseValue: 0.10 },
            ARMOR: { name: '不动如山', desc: '伤害减免', stat: 'damageReduction', baseValue: 0.06 }
        };

        // 分开存储：局内 modifiers 和 局外 modifiers
        this.inGameModifiers = {
            speedMulti: 0,
            damageMulti: 0,
            cooldownMulti: 0,
            magnetRadiusMulti: 0,
            areaMulti: 0,
            regen: 0,
            expMulti: 0,
            resonanceMulti: 0,
            damageReduction: 0
        };
        this.metaModifiers = {
            speedMulti: 0,
            damageMulti: 0,
            cooldownMulti: 0,
            magnetRadiusMulti: 0,
            areaMulti: 0,
            regen: 0,
            expMulti: 0,
            resonanceMulti: 0,
            damageReduction: 0
        };
        this.modifiers = {
            speedMulti: 0,
            damageMulti: 0,
            cooldownMulti: 0,
            magnetRadiusMulti: 0,
            areaMulti: 0,
            regen: 0,
            expMulti: 0,
            resonanceMulti: 0,
            damageReduction: 0
        };

        // 逐个单独计算，不依赖遍历顺序
        let extraMaxHp = 0;

        // SPEED - 移速：纯线性加算 → 1 + inGame + meta
        const speedSkill = PASSIVE_SKILLS.SPEED;
        this.inGameModifiers[speedSkill.stat] = this.inGameSkills.SPEED * speedSkill.baseValue;
        this.metaModifiers[speedSkill.stat] = this.metaSkills.SPEED * 0.05 * speedSkill.baseValue;
        this.modifiers[speedSkill.stat] = this.inGameModifiers[speedSkill.stat] + this.metaModifiers[speedSkill.stat];

        // DAMAGE - 伤害：跨源乘算 → (1 + inGame) * (1 + meta)
        const damageSkill = PASSIVE_SKILLS.DAMAGE;
        this.inGameModifiers[damageSkill.stat] = this.inGameSkills.DAMAGE * damageSkill.baseValue;
        this.metaModifiers[damageSkill.stat] = this.metaSkills.DAMAGE * 0.05 * damageSkill.baseValue;
        // modifiers.damageMulti 保存总和保持兼容，但新公式在 getDamageMultiplier() 中使用分离的乘算
        this.modifiers[damageSkill.stat] = this.inGameModifiers[damageSkill.stat] + this.metaModifiers[damageSkill.stat];

        // COOLDOWN - 冷却缩减：非线性叠乘 → totalCdr = 1 - (1 - |inGame|) * (1 - |meta|)
        const cooldownSkill = PASSIVE_SKILLS.COOLDOWN;
        const inGameCdrAbs = Math.abs(this.inGameSkills.COOLDOWN * cooldownSkill.baseValue);
        const metaCdrAbs = Math.abs(this.metaSkills.COOLDOWN * 0.05 * cooldownSkill.baseValue);
        this.modifiers.cooldownMulti = 1 - (1 - inGameCdrAbs) * (1 - metaCdrAbs);
        // 结果已经是正数，表示减免百分比（0-1）

        // MAGNET - 拾取范围：纯线性加算 → 1 + inGame + meta
        const magnetSkill = PASSIVE_SKILLS.MAGNET;
        this.inGameModifiers[magnetSkill.stat] = this.inGameSkills.MAGNET * magnetSkill.baseValue;
        this.metaModifiers[magnetSkill.stat] = this.metaSkills.MAGNET * 0.05 * magnetSkill.baseValue;
        this.modifiers[magnetSkill.stat] = this.inGameModifiers[magnetSkill.stat] + this.metaModifiers[magnetSkill.stat];

        // MAXHP - 最大生命：保持固定数值加算不变
        const maxhpSkill = PASSIVE_SKILLS.MAXHP;
        const maxhpTotalLevel = this.inGameSkills.MAXHP + this.metaSkills.MAXHP * 0.05;
        extraMaxHp = maxhpTotalLevel * maxhpSkill.baseValue;

        // AREA - 攻击范围：纯线性加算 → 1 + inGame + meta
        const areaSkill = PASSIVE_SKILLS.AREA;
        this.inGameModifiers[areaSkill.stat] = this.inGameSkills.AREA * areaSkill.baseValue;
        this.metaModifiers[areaSkill.stat] = this.metaSkills.AREA * 0.05 * areaSkill.baseValue;
        this.modifiers[areaSkill.stat] = this.inGameModifiers[areaSkill.stat] + this.metaModifiers[areaSkill.stat];

        // REGEN - 回血：纯线性加算 → inGame + meta
        const regenSkill = PASSIVE_SKILLS.REGEN;
        this.inGameModifiers[regenSkill.stat] = this.inGameSkills.REGEN * regenSkill.baseValue;
        this.metaModifiers[regenSkill.stat] = this.metaSkills.REGEN * 0.05 * regenSkill.baseValue;
        this.modifiers[regenSkill.stat] = this.inGameModifiers[regenSkill.stat] + this.metaModifiers[regenSkill.stat];

        // EXP - 经验获取：纯线性加算 → 1 + inGame + meta
        const expSkill = PASSIVE_SKILLS.EXP;
        this.inGameModifiers[expSkill.stat] = this.inGameSkills.EXP * expSkill.baseValue;
        this.metaModifiers[expSkill.stat] = this.metaSkills.EXP * 0.05 * expSkill.baseValue;
        this.modifiers[expSkill.stat] = this.inGameModifiers[expSkill.stat] + this.metaModifiers[expSkill.stat];

        // RESONANCE - 残响掉落：纯线性加算 → 1 + inGame + meta
        const resonanceSkill = PASSIVE_SKILLS.RESONANCE;
        this.inGameModifiers[resonanceSkill.stat] = this.inGameSkills.RESONANCE * resonanceSkill.baseValue;
        this.metaModifiers[resonanceSkill.stat] = this.metaSkills.RESONANCE * 0.05 * resonanceSkill.baseValue;
        this.modifiers[resonanceSkill.stat] = this.inGameModifiers[resonanceSkill.stat] + this.metaModifiers[resonanceSkill.stat];

        // ARMOR - 伤害减免：非线性叠乘 → totalReduction = 1 - (1 - inGame) * (1 - meta)
        const armorSkill = PASSIVE_SKILLS.ARMOR;
        const inGameArmor = this.inGameSkills.ARMOR * armorSkill.baseValue;
        const metaArmor = this.metaSkills.ARMOR * 0.05 * armorSkill.baseValue;
        this.modifiers.damageReduction = 1 - (1 - inGameArmor) * (1 - metaArmor);
        // 结果已经是正数，表示减免百分比（0-1）

        // 应用计算结果：重新计算最终属性
        // 移速：纯加算 → baseSpeed * (1 + (inGame + meta))
        this.speed = this.baseSpeed * (1 + (this.modifiers.speedMulti || 0));

        // 最大血量 = 基础100 + 双轨技能加成（保持不变）
        this.baseMaxHp = 100 + extraMaxHp;
        this.maxHp = this.baseMaxHp;

        // 基础伤害定值
        this.baseDamage = 10;

        // 触发武器刷新，让所有武器更新冷却缩减
        this.refreshWeapons();
    }

    // 获取最终伤害乘数：维持跨源乘算
    // 伤害 = 基础 × (1 + 局内加成) × (1 + 局外加成)
    getDamageMultiplier() {
        return (1 + (this.inGameModifiers.damageMulti || 0)) * (1 + (this.metaModifiers.damageMulti || 0));
    }

    move(dx, dy, deltaTime, canvasWidth, canvasHeight) {
        const moveDist = this.speed * deltaTime;
        let newX = this.x + dx * moveDist;
        let newY = this.y + dy * moveDist;

        // 如果有移动，更新玩家面向方向
        if (dx !== 0 || dy !== 0) {
            const dist = Math.sqrt(dx * dx + dy * dy);
            this.facingDirX = dx / dist;
            this.facingDirY = dy / dist;
        }

        // 边界检测
        const half = this.size / 2;
        newX = Math.max(half, Math.min(canvasWidth - half, newX));
        newY = Math.max(half, Math.min(canvasHeight - half, newY));

        this.x = newX;
        this.y = newY;
    }

    getExpRequirement(level) {
        if (level < 5) {
            // 1-4级：70, 105, 140, 175 (1级需杀14只怪，保留压迫感)
            return level * 35 + 35;
        }
        if (level < 20) {
            // 5-19级：250, 325, 400... 1300 (乘区起步，平滑接轨)
            return 175 + (level - 4) * 75;
        }
        if (level < 40) {
            // 20-39级：1600, 1900, 2200... 7300 (双乘区爆发，拉大阈值防溢出)
            return 1300 + (level - 19) * 300;
        }
        // 40级以上：8100, 8900... (大后期兜底软上限)
        return 7300 + (level - 39) * 800;
    }

    addExp(amount) {
        // apply exp multiplier from passive skill
        const finalAmount = amount * (1 + (this.modifiers.expMulti || 0));
        this.exp += finalAmount;
        let leveledUp = false;
        while (this.exp >= this.expToNextLevel) {
            this.exp -= this.expToNextLevel;
            this.level += 1;
            this.expToNextLevel = this.getExpRequirement(this.level);
            leveledUp = true;
            gameManager.onPlayerLevelUp();
        }
        return leveledUp;
    }

    // 升级一个被动技能，重新计算对应乘区
    upgradePassive(skillKey) {
        // PASSIVE_SKILLS 定义（完整10个，和updateModifiers保持一致）
        const PASSIVE_SKILLS = {
            SPEED: { name: '绝影无痕', desc: '移速提升', stat: 'speedMulti', baseValue: 0.06 },
            DAMAGE: { name: '陷阵杀气', desc: '全伤害提升', stat: 'damageMulti', baseValue: 0.10 },
            COOLDOWN: { name: '迅雷风烈', desc: '武器触发间隔缩短', stat: 'cooldownMulti', baseValue: -0.08 },
            MAGNET: { name: '摸金秘术', desc: '拾取范围扩大', stat: 'magnetRadiusMulti', baseValue: 0.20 },
            MAXHP: { name: '虎卫霸体', desc: '基础生命上限提升', stat: 'baseMaxHp', baseValue: 20 },
            AREA: { name: '气吞山河', desc: '攻击范围扩大', stat: 'areaMulti', baseValue: 0.08 },
            REGEN: { name: '青囊秘卷', desc: '自动生命回复', stat: 'regen', baseValue: 0.4 },
            EXP: { name: '天命所归', desc: '经验获取提升', stat: 'expMulti', baseValue: 0.10 },
            RESONANCE: { name: '历史共鸣', desc: '残响掉落提升', stat: 'resonanceMulti', baseValue: 0.10 },
            ARMOR: { name: '不动如山', desc: '伤害减免', stat: 'damageReduction', baseValue: 0.06 }
        };

        this.inGameSkills[skillKey] += 1;

        // MAXHP升级即时回血：等额增加当前血量
        if (skillKey === 'MAXHP') {
            this.hp += PASSIVE_SKILLS.MAXHP.baseValue;
        }

        // 统一重新计算所有属性面板，避免冗余维护
        this.updateModifiers();
        this.refreshWeapons();
    }

    // 通知所有武器属性已更新，让武器刷新缓存
    refreshWeapons() {
        for (let weapon of this.weapons) {
            if (typeof weapon.onStatsUpdated === 'function') {
                weapon.onStatsUpdated(this.modifiers);
            }
        }
    }

    render(ctx) {
        ctx.fillStyle = this.color;
        ctx.fillRect(
            this.x - this.size / 2,
            this.y - this.size / 2,
            this.size,
            this.size
        );
    }
}

// 全局唯一id计数器，每个怪物获得唯一id用于微小分离偏移
let enemyNextId = 0;

class Enemy {
    constructor(x, y, baseHealth = 10, speedMod = 1, type = 'normal') {
        this.id = enemyNextId++; // 每个怪物获得唯一id

        // 微小静态偏移：每个怪物天生错开一点，防止完全重叠穿模
        // 基于唯一id生成固定偏移，永远不会改变，自然挤开不重叠
        const angle = (this.id * 137.5) % (Math.PI * 2); // 黄金角度分散
        const offset = 4; // 最大偏移4px
        this.offsetX = Math.cos(angle) * offset;
        this.offsetY = Math.sin(angle) * offset;

        this.size = 20;
        this.x = x + this.offsetX;
        this.y = y + this.offsetY;
        this.type = type;
        this.speed = 80 * speedMod;
        this.hp = baseHealth;
        this.maxHp = baseHealth;
        this.color = '#4682b4';
        this.expValue = Math.ceil(baseHealth / 2);
        this.isElite = false;
        this.isBoss = false;
        this.resonanceDrop = 1;
        this.stunTimer = 0;
        this.knockbackResist = 0;

        // Boss/精英首领完全免疫击退和硬直
        if (this.isBoss || this.isLevelBoss || this.isMiniBoss) {
            this.knockbackResist = 1.0; // 100% 抗性 = 完全不受影响
        }

        // 潮汐兵特殊配色 & 初始矢量锁定
        if (this.type === 'spearman' || this.type === 'cavalry') {
            this.color = this.type === 'spearman' ? '#8b0000' : '#daa520';

            // 生成时立刻锁定朝向玩家的单位向量
            const dx = gameManager.player.x - this.x;
            const dy = gameManager.player.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0) {
                this.dirX = dx / dist;
                this.dirY = dy / dist;
            } else {
                this.dirX = 1;
                this.dirY = 0;
            }
        }
    }

    // 需传入 canvas 尺寸用于销毁判定
    update(deltaTime, canvasWidth, canvasHeight) {
        if (this.stunTimer > 0) {
            this.stunTimer -= deltaTime;
            return true; // 返回存活状态
        }

        const gm = window.gameManager;

        if (this.dirX !== undefined && this.dirY !== undefined) {
            // 潮汐冲锋怪：沿固定矢量直线冲锋
            this.x += this.dirX * this.speed * deltaTime;
            this.y += this.dirY * this.speed * deltaTime;

            // 预判内存泄漏：飞出屏幕外较远距离自动无掉落销毁
            const margin = 800;
            if (canvasWidth && (this.x < -margin || this.x > canvasWidth + margin || this.y < -margin || this.y > canvasHeight + margin)) {
                // ============ 成熟肉鸽做法：回收再利用 ============
                if (!this.isBoss && !this.isProp) {
                    // 传送到玩家视野外的一侧（随机角度围绕玩家）
                    const spawnDist = Math.max(canvasWidth, canvasHeight) / 2 + 100;
                    // 找一个随机角度重生
                    const angle = GameRuntime.random() * Math.PI * 2;
                    this.x = gm.player.x + Math.cos(angle) * spawnDist;
                    this.y = gm.player.y + Math.sin(angle) * spawnDist;
                    return true; // 强制续命，继续参与围剿
                }
                return false;
            }
        } else {
            // 普通追踪怪：每帧重新索敌 + 果冻式防重叠分离
            const px = gm.player.x;
            const py = gm.player.y;
            const dx = px - this.x;
            const dy = py - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // ================= 核心修改：动态果冻分离力 =================
            let separateX = 0;
            let separateY = 0;
            let neighborCount = 0;

            // 空间网格优化：只查询自己附近格子内的怪物，大幅提升性能
            const nearbyEnemies = gm.queryEnemiesInRange(this.x, this.y, this.size);

            for (const other of nearbyEnemies) {
                if (other !== this && !other.isBoss) {
                    const odx = this.x - other.x;
                    const ody = this.y - other.y;
                    const odistSq = odx * odx + ody * ody;
                    const minSeparation = this.size; // 最小重叠距离

                    // 如果两个怪物靠得太近，产生斥力
                    if (odistSq > 0 && odistSq < minSeparation * minSeparation) {
                        const odist = Math.sqrt(odistSq);
                        // 距离越近，斥力越大
                        const force = (minSeparation - odist) / minSeparation;
                        separateX += (odx / odist) * force;
                        separateY += (ody / odist) * force;
                        neighborCount++;
                    }
                }
            }

            // 如果有重叠，计算平均斥力
            if (neighborCount > 0) {
                separateX /= neighborCount;
                separateY /= neighborCount;
            }

            // 合并向玩家的拉力与怪物间的斥力
            if (dist > 0) {
                // 主移动向量 (向玩家)
                const moveX = (dx / dist) * this.speed;
                const moveY = (dy / dist) * this.speed;

                // 斥力向量 (互相推开)，斥力系数设定为 speed 的一半，保证它仍会往前走
                const repulsionForce = this.speed * 0.8;

                this.x += (moveX + separateX * repulsionForce) * deltaTime;
                this.y += (moveY + separateY * repulsionForce) * deltaTime;
            }
            // ============================================================
        }
        return true;
    }

    render(ctx) {
        if (this.type === 'spearman') {
            const half = this.size / 2;
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x - half, this.y - half, this.size, this.size);
            ctx.fillStyle = '#696969';
            ctx.fillRect(this.x - 1, this.y - half - 8, 2, 10);
        } else if (this.type === 'cavalry') {
            const w = this.size;
            const h = this.size * 0.6;
            const halfW = w / 2;
            const halfH = h / 2;

            // 修改：使用锁定的固定矢量方向，避免它侧滑/倒退(moonwalk)
            const dirX = this.dirX;
            const dirY = this.dirY;

            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(Math.atan2(dirY, dirX));

            ctx.fillStyle = this.color;
            ctx.fillRect(-halfW, -halfH, w, h);
            ctx.fillStyle = 'rgba(210, 180, 140, 0.3)';
            ctx.fillRect(-halfW - w * 0.6, -halfH * 0.8, w * 0.5, h * 0.8);
            ctx.fillStyle = 'rgba(210, 180, 140, 0.15)';
            ctx.fillRect(-halfW - w * 1.2, -halfH * 0.6, w * 0.5, h * 0.6);
            ctx.restore();
        } else if (this.type === 'archer') {
            // 弓手：深色绿色小圆 + 一根细线朝向玩家代表弓
            const px = gameManager.player.x;
            const py = gameManager.player.y;
            const dx = px - this.x;
            const dy = py - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const dirX = dx / dist;
            const dirY = dy / dist;

            // 身体：小圆
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
            ctx.fill();

            // 弓：一根细线从弓手身体延伸，朝向玩家
            ctx.strokeStyle = '#2d5032'; // 更深绿色
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            // 弓长就是弓手size的1.5倍，方向指向玩家
            ctx.lineTo(this.x + dirX * this.size * 1.5, this.y + dirY * this.size * 1.5);
            ctx.stroke();
        } else {
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
        }

        if (this.hp < this.maxHp) {
            const barW = this.size;
            const barH = 6;
            const barX = this.x - barW / 2;
            const barY = this.y - this.size / 2 - barH - 2;
            ctx.fillStyle = '#aa0000';
            ctx.fillRect(barX, barY, barW, barH);
            const hpPercent = this.hp / this.maxHp;
            ctx.fillStyle = '#00aa00';
            ctx.fillRect(barX + 1, barY + 1, (barW - 2) * hpPercent, barH - 2);
        }
    }
}

class EliteEnemy extends Enemy {
    constructor(x, y, baseHealth = 10, speedMod = 1) {
        super(x, y, baseHealth * 3, speedMod * 1.1);
        this.size = 28; // 体积更大
        this.color = '#ffa500'; // 橙色精英
        this.isElite = true;
        this.expValue = Math.ceil(baseHealth * 3 / 2);
        this.resonanceDrop = 3; // 掉落3倍残响
        this.knockbackResist = 0.5; // 精英减免50%击退
    }
}

// 虎卫 - 迷你Boss的贴身护卫，铁壁缩圈阵法
class TigerGuardEnemy extends Enemy {
    constructor(spawnX, spawnY, boss, angle, orbitRadius, baseHealth, centerX, centerY) {
        super(spawnX, spawnY, baseHealth * 4 * 1.3, boss.speed);

        this.type = 'tiger_guard';
        this.boss = boss;
        this.isTigerGuard = true;
        this.orbitRadius = orbitRadius;
        this.angle = angle;
        this.orbitSpeed = 0.35;
        this.isClosingIn = true; // 进场收网状态

        // 核心修改：记住它们出生时的目标圆心坐标
        this.orbitCenterX = centerX;
        this.orbitCenterY = centerY;

        this.size = 35; // 扩大体积形成铁墙
        this.shieldSize = 40; // 巨盾覆盖全身
        this.color = '#4f4f4f';
        this.shieldColor = '#5c4033'; // 巨盾颜色
        this.knockbackResist = 1.0;
        this.expValue = 35;
        this.resonanceDrop = 2;
    }

    update(deltaTime) {
        if (!this.boss || this.boss.hp <= 0) {
            // Boss 死了，散兵游勇冲向玩家
            const dx = gameManager.player.x - this.x;
            const dy = gameManager.player.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0) {
                this.x += (dx / dist) * 40 * deltaTime;
                this.y += (dy / dist) * 40 * deltaTime;
            }
            return this.hp > 0;
        }

        if (this.isClosingIn) {
            // 阶段一：绝对死亡收网！
            // 瞄准出生时的静态圆心的对应轨道点，形成完美向内挤压的圈
            const targetX = this.orbitCenterX + Math.cos(this.angle) * this.orbitRadius;
            const targetY = this.orbitCenterY + Math.sin(this.angle) * this.orbitRadius;

            const dx = targetX - this.x;
            const dy = targetY - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 5) {
                this.isClosingIn = false; // 到达阵眼，咔哒一声锁死
                this.x = targetX;
                this.y = targetY;
            } else {
                // 极具压迫感的速度向内缩圈
                this.x += (dx / dist) * 60 * deltaTime;
                this.y += (dy / dist) * 60 * deltaTime;
            }
        } else {
            // 阶段二：锁阵后，变为随 Boss 移动的跟屁虫
            this.angle += this.orbitSpeed * deltaTime;
            this.x = this.boss.x + Math.cos(this.angle) * this.orbitRadius;
            this.y = this.boss.y + Math.sin(this.angle) * this.orbitRadius;
        }

        return this.hp > 0;
    }

    render(ctx) {
        let rotation;
        if (this.isClosingIn && this.boss && this.boss.hp > 0) {
            // 收网时盾牌死死朝向圆心（像推土机一样往里推）
            rotation = Math.atan2(this.orbitCenterY - this.y, this.orbitCenterX - this.x);
        } else if (!this.boss || this.boss.hp <= 0) {
            // 阵型破碎朝玩家
            rotation = Math.atan2(gameManager.player.y - this.y, gameManager.player.x - this.x);
        } else {
            // 锁阵后巨盾朝外
            rotation = this.angle;
        }

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(rotation);

        const half = this.size / 2;
        ctx.fillStyle = this.color;
        ctx.fillRect(-half, -half, this.size, this.size);

        // 正面木纹巨盾+包边
        ctx.fillStyle = this.shieldColor;
        ctx.fillRect(half - 8, -this.shieldSize / 2, 14, this.shieldSize);
        ctx.fillStyle = '#808080';
        ctx.fillRect(half - 9, -this.shieldSize / 2 + 2, 16, 6);
        ctx.fillRect(half - 9, this.shieldSize / 2 - 8, 16, 6);

        ctx.restore();

        // 血条
        if (this.hp < this.maxHp) {
            const barW = this.size;
            const barH = 6;
            const barX = this.x - barW / 2;
            const barY = this.y - half - barH - 2;
            ctx.fillStyle = '#aa0000';
            ctx.fillRect(barX, barY, barW, barH);
            ctx.fillStyle = '#00aa00';
            ctx.fillRect(barX + 1, barY + 1, (barW - 2) * (this.hp / this.maxHp), barH - 2);
        }
    }
}

// 贪婪的机关木牛（盗宝精怪）

class WoodenOxEnemy extends Enemy {
    constructor(x, y, baseHealth) {
        super(x, y, baseHealth * 5, 2.2); // 极厚血量，极快移速
        this.type = 'wooden_ox';
        this.size = 25;
        this.color = '#daa520'; // 金色
        this.knockbackResist = 1.0; // Boss级：完全免疫击退和硬直，除了盾反不受任何影响
        this.escapeTimer = 15; // 15秒存活时间，超时自动消失
        this.isMiniBoss = true; // 稀有怪，享受特殊掉落

        // 随机游走：随机初始方向，每1.5-2秒微调一次方向
        this.dirAngle = GameRuntime.random() * Math.PI * 2;
        this.directionChangeTimer = 1.5 + GameRuntime.random() * 1;
    }

    update(deltaTime, canvasWidth, canvasHeight) {
        if (this.stunTimer > 0) {
            this.stunTimer -= deltaTime;
            return true;
        }

        // 倒计时结束 → 离场阶段：快速向上飞出屏幕
        if (this.escapeTimer <= 0) {
            this.y -= this.speed * 2 * deltaTime;
            if (this.y < -100) {
                // 完全飞出屏幕后消失
                return false;
            }
            return true;
        }

        // 倒计时内 → 随机游走阶段
        this.escapeTimer -= deltaTime;

        // 随机方向微调
        this.directionChangeTimer -= deltaTime;
        if (this.directionChangeTimer <= 0) {
            // 随机抖动方向 ±30度
            this.dirAngle += (GameRuntime.random() - 0.5) * Math.PI / 3;
            this.directionChangeTimer = 1.5 + GameRuntime.random() * 1;
        }

        // 按当前方向移动
        const dx = Math.cos(this.dirAngle);
        const dy = Math.sin(this.dirAngle);
        this.x += dx * this.speed * deltaTime;
        this.y += dy * this.speed * deltaTime;

        // 碰到边界反弹（反转对应方向分量）
        if (this.x < 30 || this.x > canvasWidth - 30) {
            this.dirAngle = Math.PI - this.dirAngle; // X方向反弹
            this.x = Math.max(30, Math.min(canvasWidth - 30, this.x));
        }
        if (this.y < 30 || this.y > canvasHeight - 30) {
            this.dirAngle = -this.dirAngle; // Y方向反弹
            this.y = Math.max(30, Math.min(canvasHeight - 30, this.y));
        }

        return true;
    }
}


// 魏军弓弩手 - 远程射击小怪
class ArcherEnemy extends Enemy {
    constructor(x, y, baseHealth) {
        // 移速 40px/s → 归一化：Enemy.speed = 80 * speedMod → 40/80 = 0.5
        super(x, y, baseHealth * 0.6, 0.5);
        this.type = 'archer';
        this.size = 18;
        this.color = '#4a7c59'; // 深绿色
        this.knockbackResist = 0.3;

        // 射程改为 400
        this.preferredRange = 400;
        this.shootTimer = 0;
        this.shootInterval = 3; // 每3秒射一箭
    }

    update(deltaTime, canvasWidth, canvasHeight) {
        if (this.stunTimer > 0) {
            this.stunTimer -= deltaTime;
            return true;
        }

        const gm = window.gameManager;
        const px = gm.player.x;
        const py = gm.player.y;
        const dx = px - this.x;
        const dy = py - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // 核心修改：彻底砍掉“远离玩家”的恶心逻辑
        if (dist > this.preferredRange) {
            // 在射程外 → 乖乖向玩家走近
            if (dist > 0) {
                this.x += (dx / dist) * this.speed * deltaTime;
                this.y += (dy / dist) * this.speed * deltaTime;
            }
        } else {
            // 进入射程内 → 站桩开火（玩家哪怕骑脸，它也不会再逃跑了）
            this.shootTimer += deltaTime;
            if (this.shootTimer >= this.shootInterval) {
                this.shootTimer = 0;
                this.shoot();
            }
        }

        // 保持在画布边界内
        this.x = Math.max(30, Math.min(canvasWidth - 30, this.x));
        this.y = Math.max(30, Math.min(canvasHeight - 30, this.y));

        return true;
    }

    shoot() {
        const gm = window.gameManager;
        const px = gm.player.x;
        const py = gm.player.y;
        const dx = px - this.x;
        const dy = py - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const dirX = dx / dist;
        const dirY = dy / dist;
        // 直线飞行，方向不变，不追踪玩家，使用基础 Projectile 类
        const projectile = new Projectile(this.x, this.y, dirX, dirY, 2);
        projectile.size = 10;
        projectile.color = '#8b0000'; // 深红色弓箭
        // 标记：这是敌人射向玩家的箭，只会伤害玩家
        projectile.isEnemyProjectile = true;
        gm.projectiles.push(projectile);
    }
}


// ==================== 可破坏物：木箱 ====================
// 继承 Enemy 基类，复用全部碰撞检测伤害逻辑
class DestructibleProp extends Enemy {
    constructor(x, y) {
        super(x, y, 30, 0); // 固定血量30，移速倍数0 → 移速锁定为0
        this.type = 'prop';
        this.size = 32;
        this.color = '#8b4513'; // 棕色木箱
        this.knockbackResist = 1.0; // 完全免疫击退，无法被推动
        this.isProp = true; // 标记为可破坏物，用于掉落拦截
    }

    // 专属掉落概率生成
    generateDrop(pickupsArray) {
        const roll = GameRuntime.random();
        // 概率分布：
        // 70% → 1个历史残响
        // 20% → 白馒头 (恢复固定20点血量)
        //  7% → 烤鸡腿 (恢复固定50点血量)
        //  3% → 吸铁石 (全屏吸附掉落物)
        if (roll < 0.70) {
            // 70% → 1个残响
            pickupsArray.push(new Pickup(this.x, this.y, PICKUP_TYPES.RESONANCE));
        } else if (roll < 0.90) {
            // 20% → 白馒头
            pickupsArray.push(new Pickup(this.x, this.y, PICKUP_TYPES.BUN));
        } else if (roll < 0.97) {
            // 7% → 烤鸡腿
            pickupsArray.push(new Pickup(this.x, this.y, PICKUP_TYPES.CHICKEN));
        } else {
            // 3% → 吸铁石
            pickupsArray.push(new Pickup(this.x, this.y, PICKUP_TYPES.MAGNET));
        }
    }
}


// 5分钟最终Boss
class Boss extends Enemy {
    constructor(stageData) {
        const margin = 20;
        const canvas = gameManager.canvas;
        // Boss从屏幕边缘随机生成
        let x, y;
        if (GameRuntime.random() < 0.5) {
            x = GameRuntime.random() < 0.5 ? -margin : canvas.width + margin;
            y = GameRuntime.random() * canvas.height;
        } else {
            x = GameRuntime.random() * canvas.width;
            y = GameRuntime.random() < 0.5 ? -margin : canvas.height + margin;
        }
        super(x, y, stageData.bossHp, stageData.bossSpeed / 80);
        this.size = stageData.name === '黄河渡口' ? 80 : 60;
        this.color = '#ff4500'; // 大 Boss 改为橘红色
        this.stageData = stageData;
        this.ability = stageData.bossAbility;
        this.isBoss = true;
        this.abilityTimer = 0;
        this.abilityCooldown = 3;
        this.halfHealthTriggered = false;
        this.invulnerableOnce = false;
        this.knockbackResist = 1.0; // Boss完全免疫击退
    }

    update(deltaTime) {
        super.update(deltaTime);

        // Boss特殊能力
        this.abilityTimer += deltaTime;
        if (this.abilityTimer >= this.abilityCooldown) {
            this.abilityTimer -= this.abilityCooldown;
            this.useAbility();
        }

        // 检测秦琪的半血召唤
        if (this.ability === 'summonPhantoms' && !this.halfHealthTriggered && this.hp < this.maxHp / 2) {
            this.halfHealthTriggered = true;
            this.summonPhantoms();
        }
    }

    useAbility() {
        const gm = gameManager;
        // 动态技能缩放：玩家每升1级，技能强度增加 10%
        const skillScale = 1 + (gm.player.level * 0.1);
        switch (this.ability) {
            case 'randomAffix':
                // 孔秀：随机词缀，已经在生成时应用了，这里概率加速
                if (GameRuntime.random() < 0.3) {
                    this.speed *= 1.5;
                    setTimeout(() => {
                        this.speed /= 1.5;
                    }, 2000);
                }
                // 概率免疫致命伤（在扣血时处理）
                break;

            case 'trackingArrow':
                // 韩福：发射一颗追踪暗箭
                this.shootTrackingArrow();
                break;

            case 'summonMinions':
                // 卞喜：召唤两个小怪 - 修复：读取当前同级小怪的标准动态血量
                const wave = Math.floor(gm.gameTime / 60);
                const hpMultiplier = Math.pow(1.10, wave) * (1 + gm.player.level * 0.15);
                const baseHp = Math.floor((10 + wave * 5 + gm.currentStage * 5) * hpMultiplier);

                for (let i = 0; i < 2; i++) {
                    const angle = (Math.PI * 2 * i) / 2;
                    const dist = 40;
                    const x = this.x + Math.cos(angle) * dist;
                    const y = this.y + Math.sin(angle) * dist;
                    // 召唤精英级别的血量防秒杀
                    const minion = new Enemy(x, y, baseHp * 2, 1.3);
                    minion.color = '#ff0000';
                    gm.enemies.push(minion);
                }
                break;

            case 'fireArea':
                // 王植：在脚下留下火焰区域
                gm.fireAreas.push({
                    x: this.x,
                    y: this.y,
                    radius: 60,
                    damagePerSecond: 15 * skillScale, // 动态火圈伤害
                    lifetime: 30 // 延长持续时间从 8s → 30s，地图会逐渐铺满火焰
                });
                break;

            case 'summonPhantoms':
                // 秦琪：半血召唤，已经在update处理了
                break;
        }
    }

    shootTrackingArrow() {
        const gm = window.gameManager;
        const dx = gm.player.x - this.x;
        const dy = gm.player.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const dirX = dx / dist;
        const dirY = dy / dist;

        const skillScale = 1 + (gm.player.level * 0.1);
        const arrowDamage = 15 * skillScale; // 动态暗箭伤害

        gm.projectiles.push(new BossProjectile(this.x, this.y, dirX, dirY, arrowDamage));
    }

    summonPhantoms() {
        // 召唤前四关Boss幻影（削弱版）
        const gm = gameManager;
        const hpMultiplier = 1 + (gm.player.level * 0.15);
        for (let i = 0; i < 4; i++) {
            const angle = (Math.PI * 2 * i) / 4;
            const dist = 80;
            const x = this.x + Math.cos(angle) * dist;
            const y = this.y + Math.sin(angle) * dist;
            const phantom = new Boss(STAGES[i]);
            const dynamicHp = Math.floor((STAGES[i].bossHp / 3) * hpMultiplier);
            phantom.hp = dynamicHp;
            phantom.maxHp = dynamicHp;
            phantom.size = 30;
            gm.enemies.push(phantom);
        }
    }

    takeDamage(damage) {
        this.hp -= damage;
        // 东岭关特殊：概率免疫一次致命伤
        if (this.ability === 'randomAffix' && this.hp <= 0 && !this.invulnerableOnce) {
            if (GameRuntime.random() < 0.5) {
                this.hp = this.maxHp * 0.2;
                this.invulnerableOnce = true;
            }
        }
        return this.hp <= 0;
    }

    render(ctx) {
        // 大 Boss 渲染为巨型方块
        ctx.fillStyle = this.color;
        ctx.fillRect(
            this.x - this.size / 2,
            this.y - this.size / 2,
            this.size,
            this.size
        );

        // 浮动血条：只有受伤了才显示，满血隐藏
        if (this.hp < this.maxHp) {
            const barW = this.size;
            const barH = 6;
            const barX = this.x - barW / 2;
            const barY = this.y - this.size / 2 - barH - 2;

            ctx.fillStyle = '#aa0000';
            ctx.fillRect(barX, barY, barW, barH);
            const hpPercent = this.hp / this.maxHp;
            ctx.fillStyle = '#00aa00';
            ctx.fillRect(barX + 1, barY + 1, (barW - 2) * hpPercent, barH - 2);
        }
    }
}

class Projectile {
    constructor(startX, startY, dirX, dirY, damage) {
        this.x = startX;
        this.y = startY;
        this.dx = dirX;
        this.dy = dirY;
        this.speed = 400; // 像素/秒
        this.damage = damage;
        this.size = 8;
        this.color = '#e94560'; // 红色子弹
    }

    update(deltaTime, canvasWidth, canvasHeight) {
        this.x += this.dx * this.speed * deltaTime;
        this.y += this.dy * this.speed * deltaTime;

        // 飞出屏幕销毁
        const margin = 20;
        if (this.x < -margin || this.x > canvasWidth + margin ||
            this.y < -margin || this.y > canvasHeight + margin) {
            return false;
        }
        return true;
    }

    render(ctx) {
        ctx.fillStyle = this.color;
        ctx.fillRect(
            this.x - this.size / 2,
            this.y - this.size / 2,
            this.size,
            this.size
        );
    }
}

// Boss特殊子弹（韩福的暗箭）
class BossProjectile extends Projectile {
    constructor(startX, startY, dirX, dirY, damage) {
        super(startX, startY, dirX, dirY, damage);
        this.size = 10;
        this.color = '#000000'; // 黑色暗箭
        this.speed = 300;
    }

    update(deltaTime, canvasWidth, canvasHeight) {
        // 持续追踪玩家
        const dx = gameManager.player.x - this.x;
        const dy = gameManager.player.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const newDirX = dx / dist;
        const newDirY = dy / dist;
        // 平滑转向
        this.dx = this.dx * 0.9 + newDirX * 0.1;
        this.dy = this.dy * 0.9 + newDirY * 0.1;
        const len = Math.sqrt(this.dx * this.dx + this.dy * this.dy);
        this.dx /= len;
        this.dy /= len;
        return super.update(deltaTime, canvasWidth, canvasHeight);
    }
}

class Pickup {
    constructor(x, y, type, expValue = 1) {
        this.x = x;
        this.y = y;
        this.type = type;
        // 经验珠的数据容器：expValue 存储容纳的经验值数量
        this.expValue = expValue;
        // 不同类型不同大小
        if (type === PICKUP_TYPES.MAGNET) {
            this.size = 24; // 吸铁石更大更醒目
        } else if (type === PICKUP_TYPES.CHICKEN) {
            this.size = 18; // 烤鸡腿比馒头稍大
        } else {
            this.size = 15; // 默认大小
        }
        this.color = type.color;
        this.basePickupRadius = 50;
        this.speed = 0; // 当前吸附速度，会逐渐加速
        this.isMagnetized = false; // 是否被吸铁石强制吸附
        // 惯性吸附速度向量（用于吸铁石强制吸附的动态加速）
        this.vx = 0;
        this.vy = 0;
    }

    // 吸附逻辑更新
    update(deltaTime, player) {
        // 最高优先级：如果被吸铁石标记，强制高速吸附（带惯性的指数加速）
        if (this.isMagnetized) {
            const dx = player.x - this.x;
            const dy = player.y - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 1) {
                const dirX = dx / dist;
                const dirY = dy / dist;
                // 逐渐增大的引力：越靠近越快，由慢到快黑洞捕获效果
                const acceleration = 150 + dist * 8; // 距离越远引力越强，加速更快
                this.vx += dirX * acceleration * deltaTime;
                this.vy += dirY * acceleration * deltaTime;
                // 轻微摩擦力，防止速度无限增加
                this.vx *= 0.95;
                this.vy *= 0.95;
                // 限速，最大不超过 1200px/s
                const maxSpeed = 1200;
                const currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                if (currentSpeed > maxSpeed) {
                    const scale = maxSpeed / currentSpeed;
                    this.vx *= scale;
                    this.vy *= scale;
                }
                // 应用速度
                this.x += this.vx * deltaTime;
                this.y += this.vy * deltaTime;
            } else {
                // 足够接近就停止
                this.vx = 0;
                this.vy = 0;
            }
            return;
        }

        // 普通吸附逻辑
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // 计算有效吸附半径：应用magnetRadiusMulti modifier
        // 纯线性加算：最终倍率 = 1 + totalModifier
        const effectiveMagnetRadius = player.magnetRadius * (1 + (player.modifiers.magnetRadiusMulti || 0));

        // 如果在吸附半径内，开始向玩家移动并加速
        if (dist < effectiveMagnetRadius) {
            // 方向归一化
            const dirX = dx / dist;
            const dirY = dy / dist;
            // 加速度：从0开始加速，最大速度300像素/秒
            const maxSpeed = 300;
            const accel = 200; // 加速度
            this.speed = Math.min(this.speed + accel * deltaTime, maxSpeed);
            // 移动
            this.x += dirX * this.speed * deltaTime;
            this.y += dirY * this.speed * deltaTime;
        } else {
            // 超出范围，停止加速
            this.speed = 0;
        }
    }

    checkPickup(player) {
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const distSq = dx * dx + dy * dy;
        return distSq <= this.basePickupRadius * this.basePickupRadius;
    }

    onPickup(gameManager) {
        if (this.type === PICKUP_TYPES.EXP) {
            // 数据化经验珠：一次性给予所有存储的经验 × 5
            gameManager.player.addExp(this.expValue * 5);
        } else if (this.type === PICKUP_TYPES.BOSS_EXP) {
            // 将星之血：给予当前升到下一级所需的全部经验值
            const requiredExp = gameManager.player.expToNextLevel;
            gameManager.player.addExp(requiredExp);
        } else if (this.type === PICKUP_TYPES.RESONANCE) {
            const bonus = gameManager.perks.resonanceBonus || 1;
            const resonanceMulti = 1 + (gameManager.player.modifiers.resonanceMulti || 0);

            // 1. 计算精确浮点收益（解决三重叠乘的精度丢失）
            const exactGain = 1 * bonus * resonanceMulti;

            // 2. 局外货币处理：整数部分保底，小数部分转化为概率暴击（如 1.8 有 80% 概率给 2 个）
            const baseGained = Math.floor(exactGain);
            const fraction = exactGain - baseGained;
            const finalCurrency = baseGained + (GameRuntime.random() < fraction ? 1 : 0);

            gameManager.currentResonance += finalCurrency;

            // 3. 局内经验处理：彻底解绑 Math.floor，全额享受浮点数放大，再喂给 addExp 触发经验乘区
            gameManager.player.addExp(exactGain * 10);
        } else if (this.type === PICKUP_TYPES.BUN) {
            // 白馒头：恢复固定 20 点血量
            const heal = 20;
            gameManager.player.hp = Math.min(gameManager.player.maxHp, gameManager.player.hp + heal);
        } else if (this.type === PICKUP_TYPES.CHICKEN) {
            // 烤鸡腿：恢复固定 50 点血量
            const heal = 50;
            gameManager.player.hp = Math.min(gameManager.player.maxHp, gameManager.player.hp + heal);
        } else if (this.type === PICKUP_TYPES.MAGNET) {
            // 吸铁石：立即将所有现存掉落物强制吸附向玩家
            for (const pickup of gameManager.pickups) {
                if (pickup.type === PICKUP_TYPES.EXP || pickup.type === PICKUP_TYPES.RESONANCE) {
                    pickup.isMagnetized = true;
                }
            }
        }
    }

    render(ctx) {
        // 经验珠动态颜色：根据存储的经验容量，大小随等级变
        let displayColor = this.type.color;
        let displaySize = this.size;
        if (this.type === PICKUP_TYPES.EXP) {
            if (this.expValue > 1 && this.expValue <= 10) {
                // 1 < 容量 ≤ 10 → 橙色，15px
                displayColor = '#ff8c00';
                displaySize = 15;
            } else if (this.expValue > 10) {
                // 容量 > 10 → 红色，20px
                displayColor = '#ff0000';
                displaySize = 20;
            } else {
                // expValue = 1 → 保持原蓝色，15px
                displaySize = 15;
            }
        }

        ctx.fillStyle = displayColor;
        if (this.type === PICKUP_TYPES.EXP || this.type === PICKUP_TYPES.BOSS_EXP) {
            // 经验宝珠/BOSS经验宝珠渲染为菱形
            const half = displaySize / 2;
            ctx.beginPath();
            ctx.moveTo(this.x, this.y - half);        // 上
            ctx.lineTo(this.x + half, this.y);       // 右
            ctx.lineTo(this.x, this.y + half);       // 下
            ctx.lineTo(this.x - half, this.y);       // 左
            ctx.closePath();
            ctx.fill();

            // 描边
            ctx.strokeStyle = '#ffffff';
            let lineWidth = 1;
            if (this.type === PICKUP_TYPES.BOSS_EXP) {
                lineWidth = 2;
            }
            ctx.lineWidth = lineWidth;
            ctx.stroke();

            // BOSS_EXP 专属：内部追加半透明白色菱形高光
            if (this.type === PICKUP_TYPES.BOSS_EXP) {
                const innerHalf = half * 0.6;
                ctx.beginPath();
                ctx.moveTo(this.x, this.y - innerHalf);
                ctx.lineTo(this.x + innerHalf, this.y);
                ctx.lineTo(this.x, this.y + innerHalf);
                ctx.lineTo(this.x - innerHalf, this.y);
                ctx.closePath();
                ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.fill();
            }
        } else if (this.type === PICKUP_TYPES.RESONANCE) {
            // 历史残响保持圆形
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.stroke();
        } else {
            // 补给品（白馒头/烤鸡腿/吸铁石）：方形渲染，更大尺寸更明显
            const half = this.type === PICKUP_TYPES.MAGNET ? 12 : this.size / 2;
            const x = this.x - half;
            const y = this.y - half;
            ctx.fillRect(x, y, half * 2, half * 2);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, half * 2, half * 2);
        }
    }
}

// ==================== 主管理器 ====================

class LegacyInputSystem {
    constructor() {
        this.name = 'InputSystem';
    }

    update(game, deltaTime) {
        game.handleInput(deltaTime);
    }
}

class LegacyNoopSystem {
    constructor(name) {
        this.name = name;
    }

    update(_game, _deltaTime) {}
}

class LegacySpawnSystem {
    constructor() {
        this.name = 'SpawnSystem';
    }

    update(game, deltaTime) {
        game.updateSpawnSystem(deltaTime);
    }
}

class LegacyMovementSystem {
    constructor() {
        this.name = 'MovementSystem';
    }

    update(game, deltaTime) {
        game.updateMovementSystem(deltaTime);
    }
}

class LegacyDamageSystem {
    constructor() {
        this.name = 'DamageSystem';
    }

    update(game, deltaTime) {
        game.updateDamageSystem(deltaTime);
        return game.updateProjectileSystem(deltaTime);
    }
}

class LegacyAnimationSystem {
    constructor() {
        this.name = 'AnimationSystem';
    }

    update(game, deltaTime) {
        game.updateAnimationSystem(deltaTime);
    }
}

class LegacyCollisionSystem {
    constructor() {
        this.name = 'CollisionSystem';
    }

    update(game, deltaTime) {
        const shouldContinue = game.updateCollisionSystem(deltaTime);
        if (shouldContinue === false) return false;
        game.updatePlayerRecoverySystem(deltaTime);
        return shouldContinue;
    }
}

class LegacyPickupSystem {
    constructor() {
        this.name = 'PickupSystem';
    }

    update(game, deltaTime) {
        game.updatePickupSystem(deltaTime);
    }
}

class LegacyWeaponSystem {
    constructor() {
        this.name = 'WeaponSystem';
    }

    update(game, deltaTime) {
        game.updateWeaponSystem(deltaTime);
        game.updateLevelProgressionSystem();
        game.genericWeaponShadow?.update(game);
    }
}

class LegacyCanvasRenderSystem {
    constructor() {
        this.name = 'LegacyCanvasRenderSystem';
    }

    update(game, deltaTime) {
        game.render(deltaTime);
    }
}

const LEGACY_SYSTEM_EXECUTION_ORDER = [
    'InputSystem',
    'SpawnSystem',
    'MovementSystem',
    'DamageSystem',
    'AnimationSystem',
    'CollisionSystem',
    'PickupSystem',
    'WeaponSystem',
    'LegacyCanvasRenderSystem'
];

class LegacySystemPipeline {
    constructor() {
        const systems = [
            new LegacyInputSystem(),
            new LegacySpawnSystem(),
            new LegacyMovementSystem(),
            new LegacyDamageSystem(),
            new LegacyAnimationSystem(),
            new LegacyCollisionSystem(),
            new LegacyPickupSystem(),
            new LegacyWeaponSystem(),
            new LegacyCanvasRenderSystem()
        ];
        this.systems = systems.sort((a, b) => {
            return LEGACY_SYSTEM_EXECUTION_ORDER.indexOf(a.name) - LEGACY_SYSTEM_EXECUTION_ORDER.indexOf(b.name);
        });
    }

    update(game, deltaTime) {
        let haltLogic = false;
        for (const system of this.systems) {
            if (haltLogic && system.name !== 'LegacyCanvasRenderSystem') continue;
            const shouldContinue = system.update(game, deltaTime);
            if (shouldContinue === false) {
                haltLogic = true;
            }
        }
    }
}

class GameManager {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.legacySystemPipeline = FEATURE_FLAGS.ENABLE_SYSTEM_SPLIT ? new LegacySystemPipeline() : null;
        this.genericWeaponShadow = FEATURE_FLAGS.ENABLE_GENERIC_WEAPON ? new GenericWeaponShadowMonitor() : null;

        // 加载局外升级（从localStorage）
        this.loadPersistentData();

        // ==================== 空间网格性能优化 ====================
        // 将地图划分为 100x100px 网格，碰撞检测只检测当前格+相邻8格
        this.gridCellSize = 100;
        this.spatialGrid = [];
        this.spatialGridOverflow = [];
        this.gridCols = 0;
        this.gridRows = 0;

        // 占满窗口
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // 按键状态
        this.keys = {};
        this.bindEvents();

        // 游戏状态 - 正常启动：显示主菜单
        this.gameState = GAME_STATE.MENU;
        this.lastTime = 0;
        this.gameTime = 0;
        this.currentResonance = 0;
        this.spawnedMinutes = new Set(); // 记录已触发特殊刷新的分钟节点
        this.swarmedMinutes = new Set(); // 记录已触发潮汐波的分钟节点
        this.isVictory = false;
        this.hitstopTimer = 0; // 顿帧定时器：打击感卡肉效果

        // 启动主循环
        this.gameLoop = this.gameLoop.bind(this);
        requestAnimationFrame(this.gameLoop);

        // 暴露全局
        window.gameManager = this;
    }

    loadPersistentData() {
        // 加载局外升级和累计残响
        try {
            const saved = localStorage.getItem('chronosHackerData');
            if (saved) {
                const data = JSON.parse(saved);
                this.totalResonance = data.totalResonance || 0;
                this.perkLevels = data.perkLevels || {};
            } else {
                this.totalResonance = 0;
                this.perkLevels = {};
            }
        } catch (e) {
            this.totalResonance = 0;
            this.perkLevels = {};
        }

        // 计算当前 perk 效果
        this.perks = {};
        for (const perk of PERK_UPGRADES) {
            const level = this.perkLevels[perk.id] || 0;
            if (level > 0) {
                this.perks[perk.id] = perk.getEffect(level);
            }
        }
    }

    savePersistentData() {
        localStorage.setItem('chronosHackerData', JSON.stringify({
            totalResonance: this.totalResonance,
            perkLevels: this.perkLevels
        }));
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        // 重新计算空间网格尺寸
        this.gridCols = Math.ceil(this.canvas.width / this.gridCellSize);
        this.gridRows = Math.ceil(this.canvas.height / this.gridCellSize);
    }

    // ==================== 空间网格API ====================
    // 每帧开始时重建空间网格：将所有敌人按坐标放入对应格子
    rebuildSpatialGrid() {
        // 清空网格
        this.spatialGrid = [];
        this.spatialGridOverflow = [];
        for (let c = 0; c < this.gridCols; c++) {
            this.spatialGrid[c] = [];
            for (let r = 0; r < this.gridRows; r++) {
                this.spatialGrid[c][r] = [];
            }
        }

        // 将所有敌人放入对应格子
        for (const enemy of this.enemies) {
            const col = Math.floor(enemy.x / this.gridCellSize);
            const row = Math.floor(enemy.y / this.gridCellSize);
            // 边界检查（防止坐标出界）
            if (col >= 0 && col < this.gridCols && row >= 0 && row < this.gridRows) {
                this.spatialGrid[col][row].push(enemy);
            } else {
                this.spatialGridOverflow.push(enemy);
            }
        }
    }

    // 查询给定坐标 + 半径范围内的所有敌人：只检查所在格 + 相邻8格
    queryEnemiesInRange(x, y, radius, outputArray) {
        // 计算查询范围覆盖哪些格子
        const minCol = Math.max(0, Math.floor((x - radius) / this.gridCellSize));
        const maxCol = Math.min(this.gridCols - 1, Math.floor((x + radius) / this.gridCellSize));
        const minRow = Math.max(0, Math.floor((y - radius) / this.gridCellSize));
        const maxRow = this.gridRows > 0 ? Math.min(this.gridRows - 1, Math.floor((y + radius) / this.gridCellSize)) : 0;

        // 收集范围内所有敌人
        const result = outputArray || [];
        result.length = 0;
        for (let c = minCol; c <= maxCol; c++) {
            for (let r = minRow; r <= maxRow; r++) {
                result.push(...this.spatialGrid[c][r]);
            }
        }
        if (this.spatialGridOverflow.length > 0) {
            result.push(...this.spatialGridOverflow);
        }
        return result;
    }

    bindEvents() {
        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            this.keys[key] = true;
            GameRuntime.recordEvent({ type: 'keydown', key });
        });
        window.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            this.keys[key] = false;
            GameRuntime.recordEvent({ type: 'keyup', key });
        });

        // 跟踪鼠标位置用于悬停高亮
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouseX = e.clientX - rect.left;
            this.mouseY = e.clientY - rect.top;
            GameRuntime.recordEvent({ type: 'mousemove', x: this.mouseX, y: this.mouseY });
        });

        // 鼠标点击处理菜单选择
        this.canvas.addEventListener('click', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            GameRuntime.recordEvent({ type: 'click', x: e.clientX - rect.left, y: e.clientY - rect.top });
            this.handleClick(e);
        });

        // 初始化鼠标位置
        this.mouseX = 0;
        this.mouseY = 0;
    }

    handleClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (this.gameState === GAME_STATE.MENU) {
            this.handleMenuClick(x, y);
        } else if (this.gameState === GAME_STATE.PERK_UPGRADE) {
            this.handlePerkClick(x, y);
        } else if (this.gameState === GAME_STATE.PLAYING || this.gameState === GAME_STATE.PAUSED) {
            this.handlePlayingClick(x, y);
        } else if (this.gameState === GAME_STATE.GAME_OVER || this.gameState === GAME_STATE.VICTORY) {
            // 游戏结束/胜利页面 按钮点击处理
            this.handleGameOverClick(x, y);
        } else if (this.gameState === GAME_STATE.LEVEL_UP) {
            // 升级菜单 点击选项处理
            this.handleLevelUpClick(x, y);
        }
    }

    handleMenuClick(x, y) {
        // 三个按钮：开始游戏 / 局外升级 / 退出
        const centerX = this.canvas.width / 2;
        if (y > 400 && y < 470) {
            // 开始新游戏
            this.startNewGame();
        } else if (y > 490 && y < 560) {
            // 进入局外升级
            this.gameState = GAME_STATE.PERK_UPGRADE;
        } else if (y > 580 && y < 650) {
            // 退出（刷新）
            location.reload();
        }
    }

    // 检测右上角功能按钮点击
    handlePlayingClick(x, y) {
        const buttonW = 80;
        const buttonH = 30;
        const padding = 10;

        // 暂停/继续按钮
        const pauseX = this.canvas.width - buttonW - padding;
        const pauseY = padding;
        if (x >= pauseX && x <= pauseX + buttonW && y >= pauseY && y <= pauseY + buttonH) {
            if (this.gameState === GAME_STATE.PLAYING) {
                this.gameState = GAME_STATE.PAUSED;
            } else if (this.gameState === GAME_STATE.PAUSED) {
                this.gameState = GAME_STATE.PLAYING;
            }
            return;
        }

        // 返回到主页按钮
        const restartX = this.canvas.width - 2 * buttonW - 2 * padding;
        const restartY = padding;
        if (x >= restartX && x <= restartX + buttonW && y >= restartY && y <= restartY + buttonH) {
            this.gameState = GAME_STATE.MENU;
            return;
        }
    }

    // 处理游戏结束/胜利界面按钮点击
    handleGameOverClick(x, y) {
        if (this.gameState === GAME_STATE.VICTORY && this.victoryButton) {
            // 胜利页面：断开链接返回枢纽
            const b = this.victoryButton;
            if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
                this.returnToMenu();
                return;
            }
        } else if (this.gameState === GAME_STATE.GAME_OVER) {
            // 游戏结束页面：单个重启按钮居中
            const restartX = this.canvas.width / 2 - 150;
            const buttonY = 510;
            const buttonW = 300;
            const buttonH = 70;
            // 重启
            if (x >= restartX && x <= restartX + buttonW && y >= buttonY && y <= buttonY + buttonH) {
                this.restartGame();
                return;
            }
        } else {
            // 游戏结束页面：旧布局兼容
            const buttonX = this.canvas.width / 2 - 150;
            const buttonY = 510;
            const buttonW = 300;
            const buttonH = 70;
            if (x >= buttonX && x <= buttonX + buttonW && y >= buttonY && y <= buttonY + buttonH) {
                this.restartGame();
                return;
            }
        }
    }

    // 处理升级菜单点击选择
    handleLevelUpClick(x, y) {
        // 检测刷新按钮点击
        if (this.rerollButtonRect &&
            x >= this.rerollButtonRect.x && x <= this.rerollButtonRect.x + this.rerollButtonRect.width &&
            y >= this.rerollButtonRect.y && y <= this.rerollButtonRect.y + this.rerollButtonRect.height) {
            // 点击了刷新按钮
            if (this.player.rerolls > 0) {
                this.player.rerolls--;
                this.levelUpOptions = this.generateLevelUpOptions();
            }
            return; // 不关闭界面，保持升级菜单
        }

        const boxWidth = 200;
        const boxHeight = 300;
        const spacing = 50;
        const totalWidth = 3 * boxWidth + 2 * spacing;
        const startX = (this.canvas.width - totalWidth) / 2;
        const startY = (this.canvas.height - boxHeight) / 2;

        for (let i = 0; i < 3; i++) {
            const boxX = startX + i * (boxWidth + spacing);
            const boxY = startY;
            if (x >= boxX && x <= boxX + boxWidth && y >= boxY && y <= boxY + boxHeight) {
                this.selectLevelUpOption(i);
                return;
            }
        }
    }

    handlePerkClick(x, y) {
        // 检测返回菜单按钮
        const btnX = this.canvas.width / 2 - 100;
        const btnY = this.canvas.height - 130;
        const btnW = 200;
        const btnH = 60;
        if (x >= btnX && x <= btnX + btnW && y >= btnY && y <= btnY + btnH) {
            this.returnToMenu();
            return;
        }
        // 点击升级选项 - 双列布局点击检测
        const startY = 150;
        const itemHeight = 80;
        const halfWidth = this.canvas.width / 2;
        // 必须在卡片行范围内：每列只有 5 张卡片
        if (y < startY) return;
        const row = Math.floor((y - startY) / itemHeight);
        if (row < 0 || row >= 5) return;
        const col = x < halfWidth ? 0 : 1;
        const index = col * 5 + row;
        if (index >= 0 && index < PERK_UPGRADES.length) {
            this.buyPerk(index);
        }
    }

    startNewGame() {
        this.gameState = GAME_STATE.PLAYING;
        GameRuntime.resetRunStats();
        this.player = new Player(this.canvas.width, this.canvas.height, this.perks, this.perkLevels);
        this.activeWeapons = this.player.weapons; // 全局武器管理数组，引用同步player武器
        this.enemies = [];
        this.projectiles = [];
        this.pickups = [];
        this.fireAreas = []; // 王植的火焰区域
        this.fireTornados = []; // 太平要术风火龙卷风陷阱
        this.lightningEffects = []; // 闪电视觉特效
        this.specialAreas = []; // 特殊区域：八门金锁盾Lv6火墙等
        this.floatingTexts = []; // 浮动文字（暴击跳字等）

        this.currentStage = 0; // 从第一关开始
        this.spawnTimer = 0;
        this.gameTime = 0;
        this.currentResonance = 0;
        this.finalBossSpawned = false; // 5分钟最终Boss
        this.spawnedMinutes = new Set(); // 重置时间轴触发记录
        this.swarmedMinutes = new Set(); // 重置潮汐波触发记录
        this.isVictory = false;

        this.shootTimer = 0;
        this.shootInterval = this.player.fireRate;

        // 屏幕震动和红屏受伤闪烁计时器
        this.shakeTimer = 0;
        this.damageFlashTimer = 0;
        // 受伤弹开怪物冷却
        this.pushbackCooldown = 0;
    }

    // AABB碰撞检测
    checkRectCollision(ax, ay, aw, ah, bx, by, bw, bh) {
        return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    }

    checkCircleCollision(cx, cy, cr, px, py, ps) {
        // 圆形 vs 矩形中心点距离检查
        const dx = cx - px;
        const dy = cy - py;
        const distSq = dx * dx + dy * dy;
        return distSq <= (cr + ps / 2) * (cr + ps / 2);
    }

    // 范围伤害：对圆心半径内所有敌人造成伤害，跳过已经被当前箭矢命中的敌人
    damageEnemiesInRadius(cx, cy, radius, damage, excludeHitSet) {
        const nearbyEnemies = this.queryEnemiesInRange(cx, cy, radius);
        for (let i = nearbyEnemies.length - 1; i >= 0; i--) {
            const enemy = nearbyEnemies[i];
            if (excludeHitSet.has(enemy)) continue; // 已经被本次箭矢命中，跳过避免重复伤害

            const dx = enemy.x - cx;
            const dy = enemy.y - cy;
            const distSq = dx * dx + dy * dy;
            if (distSq <= radius * radius) {
                enemy.hp -= damage;
                if (enemy.hp <= 0) {
                    const originalIdx = this.enemies.indexOf(enemy);
                    if (originalIdx >= 0) {
                        this.handleEnemyDeath(enemy, originalIdx);
                    }
                }
            }
        }
    }

    // 范围眩晕：对圆心半径内所有敌人施加眩晕
    stunEnemiesInRadius(cx, cy, radius, stunDuration) {
        const nearbyEnemies = this.queryEnemiesInRange(cx, cy, radius);
        for (const enemy of nearbyEnemies) {
            const dx = enemy.x - cx;
            const dy = enemy.y - cy;
            const distSq = dx * dx + dy * dy;
            if (distSq <= radius * radius) {
                enemy.stunTimer = stunDuration;
            }
        }
    }

    spawnEnemy() {
        // 在屏幕外围边缘随机生成敌人
        let x, y;
        const margin = 20;

        if (GameRuntime.random() < 0.5) {
            x = GameRuntime.random() < 0.5 ? -margin : this.canvas.width + margin;
            y = GameRuntime.random() * this.canvas.height;
        } else {
            x = GameRuntime.random() * this.canvas.width;
            y = GameRuntime.random() < 0.5 ? -margin : this.canvas.height + margin;
        }

        // 动态难度: 每过 60 秒，血量 +10%，频率 +20%
        const wave = Math.floor(this.gameTime / 60);
        const healthMultiplier = Math.pow(1.10, wave);
        const baseHealth = Math.floor((10 + 5 * (this.gameTime / 60) + this.currentStage * 5) * healthMultiplier);

        // 10% 概率生成魏军弓手，5% 概率生成精英怪，2% 概率生成机关木牛盗宝怪
        const isArcher = GameRuntime.random() < 0.10; // 10% 概率刷出远程弓手
        const isElite = !isArcher && GameRuntime.random() < 0.05;
        const isOx = !isArcher && GameRuntime.random() < 0.02; // 2% 概率刷出盗宝贼

        let enemy;
        if (isArcher) {
            // 一次生成3个弓箭手，从屏幕外围边缘生成（和普通小怪一样），往玩家方向移动保持距离
            const spread = 60;
            for (let i = 0; i < 3; i++) {
                // 在原出生点周围分散，保持屏幕外出生特性
                const sx = x + (GameRuntime.random() - 0.5) * spread;
                const sy = y + (GameRuntime.random() - 0.5) * spread;
                const archer = new ArcherEnemy(sx, sy, baseHealth);
                this.enemies.push(archer);
            }
            return; // 已经添加完，不需要再push一次
        } else if (isOx) {
            // 限制：屏幕同时最多只有一个木牛存活
            const hasExistingOx = this.enemies.some(e => e instanceof WoodenOxEnemy);
            if (hasExistingOx) {
                // 已有存活木牛，跳过本次生成，回退到普通怪
                enemy = new Enemy(x, y, baseHealth);
            } else {
                // 木牛特殊生成：在屏幕内 100px 边缘生成，保证它需要跑一段才能出去，给玩家时间击杀
                const innerMargin = 100;
                if (GameRuntime.random() < 0.5) {
                    x = GameRuntime.random() < 0.5 ? innerMargin : this.canvas.width - innerMargin;
                    y = GameRuntime.random() * (this.canvas.height - innerMargin * 2) + innerMargin;
                } else {
                    y = GameRuntime.random() < 0.5 ? innerMargin : this.canvas.height - innerMargin;
                    x = GameRuntime.random() * (this.canvas.width - innerMargin * 2) + innerMargin;
                }
                enemy = new WoodenOxEnemy(x, y, baseHealth);
                enemy.resonanceDrop = 5; // 击杀掉 5 个残响
            }
        } else if (isElite) {
            enemy = new EliteEnemy(x, y, baseHealth);
        } else {
            enemy = new Enemy(x, y, baseHealth);
        }
        this.enemies.push(enemy);
    }

    // 奇数分钟：生成小 Boss（大型精英怪）
    spawnMiniBoss(minute) {
        // 新公式：完美穿插大Boss血量曲线，平滑加速
        const baseHp = 400 + minute * 200 + Math.pow(minute, 2) * 40;

        // 动态等级补正（保持不变）
        const hpMultiplier = 1 + (this.player.level * 0.15);
        const hp = Math.floor(baseHp * hpMultiplier);

        const miniBoss = new EliteEnemy(
            this.canvas.width / 2 + (GameRuntime.random() > 0.5 ? 200 : -200),
            this.canvas.height / 2 + (GameRuntime.random() > 0.5 ? 200 : -200),
            hp,
            1.2
        );
        miniBoss.size = 50; // 调整为 50，体型更接近大 Boss
        // 修改：小 Boss 改为紫色
        miniBoss.color = '#800080';
        miniBoss.isMiniBoss = true;
        miniBoss.resonanceDrop = 10;

        // 修改：直接劫持该实例的渲染方法，改为画正圆形
        miniBoss.render = function(ctx) {
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
            ctx.fill();

            // 浮动血条
            if (this.hp < this.maxHp) {
                const barW = this.size;
                const barH = 6;
                const barX = this.x - barW / 2;
                const barY = this.y - this.size / 2 - barH - 2;

                ctx.fillStyle = '#aa0000';
                ctx.fillRect(barX, barY, barW, barH);
                const hpPercent = this.hp / this.maxHp;
                ctx.fillStyle = '#00aa00';
                ctx.fillRect(barX + 1, barY + 1, (barW - 2) * hpPercent, barH - 2);
            }
        };

        this.enemies.push(miniBoss);
        // 3分钟及以后添加虎卫护卫，10分钟不添加
        this.spawnTigerGuards(miniBoss, minute);
        console.log(`[Timeline] ${minute} min: Mini Boss Spawned! HP: ${hp}`);
    }

    // 虎卫·重装盾兵 - Boss专属护卫生成器
    // 规则：minute >= 3 才生成，minute >= 10 不生成
    // 虎卫·重装盾兵 - 死亡结界收网生成器
    // 虎卫·重装盾兵 - 死亡结界收网生成器
    spawnTigerGuards(boss, minute) {
        // 仅在第 3、6、9 分钟触发死亡缩圈！
        if (minute !== 3 && minute !== 6 && minute !== 9) return;

        // 1. 设定锁阵后的角斗场半径
        const orbitRadius = 180 + (minute - 3) * 15;

        // 2. 按圆的周长计算怪物数量，保证肩并肩排成铁壁！(每个怪占位38像素)
        const circumference = 2 * Math.PI * orbitRadius;
        const count = Math.floor(circumference / 38);

        // 3. 适当下调单体血量防止绝对死锁
        const hpMultiplier = 1 + (this.player.level * 0.15);
        const guardBaseHp = Math.floor((5 + minute * 2 + this.currentStage * 2) * hpMultiplier);

        const angleStep = (Math.PI * 2) / count;

        // 4. 计算远超屏幕外围的撒网半径
        const spawnRadius = Math.max(this.canvas.width, this.canvas.height) + 200;

        // 5. 核心修改：锁定当前的绝对位置为收网圆心（以玩家此刻的位置为圆心）
        const centerX = this.player.x;
        const centerY = this.player.y;

        for (let i = 0; i < count; i++) {
            const angle = i * angleStep;

            // 计算屏幕外极其遥远的出生点
            const spawnX = centerX + Math.cos(angle) * spawnRadius;
            const spawnY = centerY + Math.sin(angle) * spawnRadius;

            // 必须把 centerX, centerY 传进去
            const guard = new TigerGuardEnemy(spawnX, spawnY, boss, angle, orbitRadius, guardBaseHp, centerX, centerY);
            this.enemies.push(guard);
        }

        console.log(`[TigerGuard] ${minute}min 触发结界收网！生成 ${count} 只重装盾卫！`);
    }

    // 偶数分钟：生成守将大 Boss
    spawnTimelineBoss(bossIndex) {
        const stageData = STAGES[bossIndex];

        const boss = new Boss(stageData);

        // 新增：动态等级缩放，玩家每升1级，Boss总血量额外增加 15%
        const hpMultiplier = 1 + (this.player.level * 0.15);
        const dynamicHp = Math.floor(stageData.bossHp * hpMultiplier);

        boss.x = this.canvas.width / 2;
        boss.y = this.canvas.height / 2;
        boss.maxHp = dynamicHp; // 强行覆盖基础配置
        boss.hp = dynamicHp;    // 强行覆盖基础配置

        // 如果是第 10 分钟（索引 4，黄河渡口），打上最终 Boss 标记，并召唤前四个幻影
        if (bossIndex === 4) {
            boss.isFinalBoss = true;
            // 扫清杂兵腾出舞台 - 只有最终Boss才清场
            for (let i = this.enemies.length - 1; i >= 0; i--) {
                if (!this.enemies[i].isBoss && !this.enemies[i].isMiniBoss) {
                    this.enemies.splice(i, 1);
                }
            }

            for (let i = 0; i < 4; i++) {
                const phantom = new Boss(STAGES[i]);
                const angle = (Math.PI * 2 * i) / 4;
                const dist = 150;
                phantom.x = boss.x + Math.cos(angle) * dist;
                phantom.y = boss.y + Math.sin(angle) * dist;

                phantom.maxHp = Math.floor(boss.maxHp * 0.4);
                phantom.hp = phantom.maxHp;
                phantom.size = 30;
                phantom.color = 'rgba(128, 0, 128, 0.7)';

                // 降级防跳关
                phantom.isBoss = false;
                phantom.isElite = true;
                this.enemies.push(phantom);
            }
            boss.ability = 'none';
        }

        this.enemies.push(boss);
        console.log(`[Timeline] ${bossIndex * 2 + 2} min: ${stageData.boss} Spawned! (Level scaled HP: ${dynamicHp})`);

        // 第三波(3min)已经由miniBoss处理，第六波(6min)及以后的关卡Boss也召唤虎卫护卫
        const minute = bossIndex * 2 + 2;
        this.spawnTigerGuards(boss, minute);
    }

    // 兼容性别名：旧代码调用保持兼容
    spawnBoss() {
        this.spawnTimelineBoss(this.currentStage);
    }

    // 触发终局过场动画
    triggerFinalCutscene() {
        this.gameState = GAME_STATE.CUTSCENE;
        this.cutsceneTimer = 0;
        this.cutsceneDuration = 5.0; // 动画持续5秒

        // 史实文案设定
        this.cutsceneTitle = '第五关 · 黄河渡口';
        this.cutsceneText = [
            '关公历尽千辛，连斩四关守将，终至黄河之畔。',
            '对岸便是故主，然夏侯惇部将秦琪横刀勒马，阻断去路。',
            '“吾奉夏侯将军将令，守把关隘，你便插翅，也飞不过去！”',
            '此战若胜，便可渡河寻兄；若败，则枯骨埋沙。'
        ];

        // 预判优化：进过场的瞬间，提前清扫杂兵，营造终极对决的肃杀感
        // 保留 Boss、精英怪，只清普通杂兵
        this.enemies = this.enemies.filter(e => e.isBoss || e.isElite || e.isMiniBoss || e.isTigerGuard);
        this.pickups = []; // 顺手清掉满地垃圾，让战场干净
    }

    // 渲染过场动画
    renderCutscene(deltaTime) {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const cx = w / 2;
        const cy = h / 2;

        this.cutsceneTimer += deltaTime;

        // 纯黑背景
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, w, h);

        // 1秒淡入，1秒淡出
        let alpha = 1;
        const fadeTime = 1.0;
        if (this.cutsceneTimer < fadeTime) {
            alpha = this.cutsceneTimer / fadeTime;
        } else if (this.cutsceneTimer > this.cutsceneDuration - fadeTime) {
            alpha = (this.cutsceneDuration - this.cutsceneTimer) / fadeTime;
        }
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

        // 渲染大标题
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 48px "楷体", "STKaiti", serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.cutsceneTitle, cx, cy - 100);

        // 渲染历史正文
        ctx.font = '24px "楷体", "STKaiti", serif';
        ctx.fillStyle = '#cccccc';
        for (let i = 0; i < this.cutsceneText.length; i++) {
            ctx.fillText(this.cutsceneText[i], cx, cy - 10 + i * 45);
        }

        // 渲染跳过提示
        ctx.globalAlpha = 1.0; // 提示字不受淡入淡出影响
        ctx.font = '16px Arial';
        ctx.fillStyle = '#666666';
        ctx.fillText('按 ENTER 跳过', cx, h - 50);

        // 判定动画结束或玩家跳过
        if (this.cutsceneTimer >= this.cutsceneDuration || this.keys['enter']) {
            this.keys['enter'] = false;
            this.gameState = GAME_STATE.PLAYING;
            this.spawnTimelineBoss(4); // 正式召唤最终 Boss 秦琪
        }

        ctx.textAlign = 'left'; // 重置画布状态
    }

    // 魏军·长戈兵 + 虎豹骑·游骑 混合高压潮汐波：交错方阵，死亡冲锋
    // 初始化潮汐波，分批生成
    spawnSpearmanSwarm(wave) {
        const w = this.canvas.width;
        const h = this.canvas.height;

        // 潮汐厚度：最多 6 层
        const layers = Math.min(3 + Math.floor(wave / 2), 6);
        const countPerLayer = 20 + Math.floor(GameRuntime.random() * 10);

        // 保存参数分批生成
        this.pendingSwarm = {
            wave: wave,
            layers: layers,
            countPerLayer: countPerLayer,
            spacingX: 30,
            spacingY: 40,
            edge: Math.floor(GameRuntime.random() * 4),
            isCavalryMain: GameRuntime.random() > 0.5,
            totalWidth: (countPerLayer - 1) * 30,
            currentLayer: 0,
            remainingLayers: layers,
            spearmanCount: 0,
            cavalryCount: 0,
            w: w,
            h: h
        };
    }

    // 每帧生成一层潮汐，分摊卡顿，避免主线程卡住
    spawnNextSwarmLayer() {
        const ps = this.pendingSwarm;
        if (!ps || ps.currentLayer >= ps.layers) return;

        const l = ps.currentLayer;
        // 奇数层交错偏移半个身位，打破死板的网格感
        const staggerOffset = (l % 2 !== 0) ? (ps.spacingX / 2) : 0;

        for (let i = 0; i < ps.countPerLayer; i++) {
            let x, y;

            // 正交偏移：加入交错偏移量
            const orthoOffset = -ps.totalWidth / 2 + i * ps.spacingX + staggerOffset;
            const depthOffset = 50 + l * ps.spacingY;

            if (ps.edge === 0) { // 上
                x = this.player.x + orthoOffset;
                y = -depthOffset;
            } else if (ps.edge === 1) { // 右
                x = ps.w + depthOffset;
                y = this.player.y + orthoOffset;
            } else if (ps.edge === 2) { // 下
                x = this.player.x + orthoOffset;
                y = ps.h + depthOffset;
            } else { // 左
                x = -depthOffset;
                y = this.player.y + orthoOffset;
            }

            x += (GameRuntime.random() * 10 - 5);
            y += (GameRuntime.random() * 10 - 5);

            const isCavalry = GameRuntime.random() < (ps.isCavalryMain ? 0.8 : 0.2);

            let baseHp, speedMod, type;
            if (isCavalry) {
                baseHp = (3 + ps.wave * 1);
                speedMod = 2.5 + GameRuntime.random() * 0.5;
                type = 'cavalry';
                ps.cavalryCount++;
            } else {
                baseHp = (5 + ps.wave * 2);
                speedMod = 2.0 + GameRuntime.random() * 0.2;
                type = 'spearman';
                ps.spearmanCount++;
            }

            const hpMultiplier = 1 + (this.player.level * 0.15);
            const finalHp = Math.floor(baseHp * hpMultiplier);

            const mob = new Enemy(x, y, finalHp, speedMod, type);
            mob.size = 16;
            mob.expValue = isCavalry ? 1 : 2;

            this.enemies.push(mob);
        }

        ps.currentLayer++;
        ps.remainingLayers--;

        if (ps.remainingLayers <= 0) {
            console.log(`[Swarm] ${ps.wave} min: ${ps.layers}层交错方阵, 每层${ps.countPerLayer}只. (${ps.spearmanCount}长戈兵 / ${ps.cavalryCount}虎豹骑) 冲锋!`);
            this.pendingSwarm = null;
        }
    }

    trySpawnPickup(enemy) {
        GameRuntime.recordKill(enemy);
        const x = enemy.x;
        const y = enemy.y;

        // ========== 稀有补给品独立掉落轨道 - 优先级最高 ==========
        // 掉落坐标统一偏移 (x+20, y+20) 避免与基础掉落重叠
        const dropX = x + 20;
        const dropY = y + 20;

        // T0级：机关木牛 (WoodenOxEnemy) 独立高概率摸奖
        if (enemy instanceof WoodenOxEnemy) {
            const roll = GameRuntime.random();
            if (roll < 0.05) {
                // 5% → 吸铁石
                this.pickups.push(new Pickup(dropX, dropY, PICKUP_TYPES.MAGNET));
            } else if (roll < 0.15) {
                // 10% → 烤鸡腿
                this.pickups.push(new Pickup(dropX, dropY, PICKUP_TYPES.CHICKEN));
            } else if (roll < 0.65) {
                // 50% → 白馒头
                this.pickups.push(new Pickup(dropX, dropY, PICKUP_TYPES.BUN));
            }
            // 35% 轮空，不掉落
        }
        // T1级：守将与节点 Boss (isBoss, isMiniBoss, isLevelBoss)
        else if (enemy.isBoss || enemy.isMiniBoss || enemy.isLevelBoss) {
            const triggerRoll = GameRuntime.random();
            if (triggerRoll < 0.30) {
                // 30% 总概率触发稀有掉落
                const itemRoll = GameRuntime.random();
                if (itemRoll < 0.10) {
                    // 10% 权重 → 吸铁石 (整体 3%)
                    this.pickups.push(new Pickup(dropX, dropY, PICKUP_TYPES.MAGNET));
                } else if (itemRoll < 0.40) {
                    // 30% 权重 → 烤鸡腿 (整体 9%)
                    this.pickups.push(new Pickup(dropX, dropY, PICKUP_TYPES.CHICKEN));
                } else {
                    // 60% 权重 → 白馒头 (整体 18%)
                    this.pickups.push(new Pickup(dropX, dropY, PICKUP_TYPES.BUN));
                }
            }
        }
        // T2级：精英怪 (isElite 且非 Boss)
        else if (enemy.isElite && !enemy.isBoss && !enemy.isMiniBoss && !enemy.isLevelBoss) {
            const roll = GameRuntime.random();
            if (roll < 0.01) {
                // 1% → 吸铁石
                this.pickups.push(new Pickup(dropX, dropY, PICKUP_TYPES.MAGNET));
            } else if (roll < 0.05) {
                // 4% → 白馒头 (禁止掉落大鸡腿)
                this.pickups.push(new Pickup(dropX, dropY, PICKUP_TYPES.BUN));
            }
        }

        // ========== Boss/miniBoss/LevelBoss 特殊掉落 ==========
        if (enemy.isBoss || enemy.isMiniBoss || enemy.isLevelBoss) {
            // 木牛只掉残响，不给Boss经验珠
            if (!(enemy instanceof WoodenOxEnemy)) {
                // 生成1个大的BOSS_EXP经验宝珠
                const bossExpPickup = new Pickup(x, y, PICKUP_TYPES.BOSS_EXP);
                bossExpPickup.size = 30;
                this.pickups.push(bossExpPickup);
            }

            // 环形散落大量残响
            const resonanceCount = enemy.resonanceDrop || 15;
            const radius = 40;
            for (let i = 0; i < resonanceCount; i++) {
                const angle = (Math.PI * 2 * i) / resonanceCount;
                const dropX = x + Math.cos(angle) * radius;
                const dropY = y + Math.sin(angle) * radius;
                this.pickups.push(new Pickup(dropX, dropY, PICKUP_TYPES.RESONANCE));
            }

            return; // 跳过普通掉落
        }

        // 敌人死亡掉落：80% 经验，10% 残响，10% 不掉落
        const roll = GameRuntime.random();
        if (roll < 0.8) {
            // ========== 数据化经验珠：硬上限 + 聚合存储 ==========
            const MAX_EXP_PICKUPS = 300; // 同屏硬上限
            const currentExpCount = this.pickups.filter(p => p.type === PICKUP_TYPES.EXP).length;

            if (currentExpCount < MAX_EXP_PICKUPS) {
                // 未达上限：正常生成新经验珠（容量=1）
                this.pickups.push(new Pickup(x, y, PICKUP_TYPES.EXP, 1));
            } else {
                // 已达上限：找到第一个现存经验珠（存活最久的），隔空注能
                const firstExp = this.pickups.find(p => p.type === PICKUP_TYPES.EXP);
                if (firstExp) {
                    firstExp.expValue += 1;
                } else {
                    // 极端情况：找不到就还是生成
                    this.pickups.push(new Pickup(x, y, PICKUP_TYPES.EXP, 1));
                }
            }
        } else if (roll < 0.95) {
            this.pickups.push(new Pickup(x, y, PICKUP_TYPES.RESONANCE));
        }
        // Boss必掉残响
        if (enemy instanceof Boss && !enemy.isFinalBoss) {
            this.pickups.push(new Pickup(x, y, PICKUP_TYPES.RESONANCE));
        }
        // 精英怪额外掉残响
        if (enemy.isElite && !enemy.isMiniBoss) {
            for (let i = 0; i < enemy.resonanceDrop; i++) {
                this.pickups.push(new Pickup(x + (i - 1) * 15, y, PICKUP_TYPES.RESONANCE));
            }
        }
    }

    // ========== 新增：统一的敌人死亡处理逻辑 ==========
    handleEnemyDeath(enemy, index) {
        // 可破坏物（木箱）走专属掉落逻辑
        if (enemy.isProp) {
            enemy.generateDrop(this.pickups);
        } else {
            this.trySpawnPickup(enemy);
        }
        this.enemies.splice(index, 1);

        // 如果是 Boss，触发进度推进
        if (enemy.isBoss) {
            // 只有最终Boss死亡才触发通关，之前阶段Boss击杀只推进进度
            if (enemy.isFinalBoss) {
                this.victory();
            } else if (this.currentStage < STAGES.length - 1) {
                this.currentStage++;
                this.spawnTimer = 0;
            }
        }
    }

    // 生成三个随机升级选项（本局升级）- 基于等级配置表自动生成
    // 生成三个随机升级选项（本局升级）- 严格线性递进，只能升下一级
    generateLevelUpOptions() {
        const availablePool = [];

        // ========== 1. 已拥有武器：只提供下一级升级（严格线性递进） ==========
        // 遍历玩家当前已拥有的每一把武器
        for (const weapon of this.player.weapons) {
            const config = WEAPON_UPGRADES[weapon.type];
            const currentLevel = weapon.level;
            // 满级是6级，未满级才能进池
            if (currentLevel < 6) {
                const nextLevel = currentLevel + 1;
                const nextCfg = config[nextLevel];
                availablePool.push({
                    type: 'weapon_upgrade',
                    weight: 3,
                    weapon: weapon,
                    config: config,
                    title: `${config.name} Lv.${nextLevel}`,
                    desc: `【${nextCfg.name}】${nextCfg.desc.replace(/。$/, '')}`,
                    effect: () => {
                        // 应用这一级的升级动作
                        if (nextCfg.action) {
                            nextCfg.action(weapon);
                        }
                        // 升级等级
                        weapon.level = nextLevel;
                        applyGenericWeaponScalarMigration(weapon);
                        weapon.onStatsUpdated(this.player.modifiers);
                        console.log(`Weapon Upgrade: ${config.name} → lv${nextLevel}`);
                    }
                });
            }
        }

        // ========== 2. 未拥有武器：提供 Lv.1 获取选项 ==========
        // 遍历所有武器类型，玩家没有的进池
        for (const [weaponType, config] of Object.entries(WEAPON_UPGRADES)) {
            const hasWeapon = this.player.weapons.some(w => w.type === weaponType);
            if (!hasWeapon) {
                const firstLevel = 1;
                const firstCfg = config[firstLevel];
                availablePool.push({
                    type: 'weapon_unlock',
                    weight: 1,
                    weaponType: weaponType,
                    config: config,
                    title: `${config.name} Lv.${firstLevel}`,
                    desc: `【${firstCfg.name}】${firstCfg.desc.replace(/。$/, '')}`,
                    effect: () => {
                        // 创建武器实例
                        const weaponCls = {
                            'saber': Saber,
                            'spear': Spear,
                            'crossbow': Crossbow,
                            'qinggang': QinggangSword,
                            'shield': Shield,
                            'taiping': TaipingBook
                        }[weaponType];

                        // 彻底剥离脏乘区，只使用纯净基础伤害，所有计算交给攻击瞬间
                        const weapon = new weaponCls(config.baseDamage);
                        // 应用一级效果
                        if (firstCfg.action) {
                            firstCfg.action(weapon);
                        }
                        weapon.level = firstLevel;
                        applyGenericWeaponScalarMigration(weapon);
                        weapon.onStatsUpdated(this.player.modifiers);
                        this.player.weapons.push(weapon);
                        console.log(`Unlocked New Weapon: ${config.name} lv1, BaseDmg: ${config.baseDamage}`);
                    }
                });
            }
        }

        // ========== 3. 被动技能：未满5级（局内最高5级）提供下一级 ==========
        for (const [skillKey, config] of Object.entries(PASSIVE_UPGRADES)) {
            const currentLevel = this.player.inGameSkills[skillKey];
            // 局内和局外完全隔离：只判断局内等级，局外加成是永久底座不占用局内升级配额
            if (currentLevel < 5) {
                const nextLevel = currentLevel + 1;
                const nextCfg = config[nextLevel];
                availablePool.push({
                    type: 'passive',
                    weight: 2,
                    skillKey: skillKey,
                    config: config,
                    title: `${config.name} Lv.${nextLevel}`,
                    desc: nextCfg.desc.replace(/。$/, ''),
                    effect: () => {
                        this.player.upgradePassive(skillKey);
                        console.log(`Passive Upgrade: ${skillKey} → lv${nextLevel}`);
                    }
                });
            }
        }

        // 加权随机抽取三个不重复选项
        const selected = [];
        while (selected.length < 3 && availablePool.length > 0) {
            const totalWeight = availablePool.reduce((sum, opt) => sum + opt.weight, 0);
            let randomNum = GameRuntime.random() * totalWeight;
            for (let i = 0; i < availablePool.length; i++) {
                randomNum -= availablePool[i].weight;
                if (randomNum <= 0) {
                    selected.push(availablePool[i]);
                    availablePool.splice(i, 1);
                    break;
                }
            }
        }

        // ========== 保底策略：必须至少有一个武器选项（升级 OR 解锁），不允许全被动 ==========
        const hasAnyWeaponInPool = availablePool.some(opt => opt.type === 'weapon_upgrade' || opt.type === 'weapon_unlock') ||
                                  selected.some(opt => opt.type === 'weapon_upgrade' || opt.type === 'weapon_unlock');
        const hasAnyWeaponInSelected = selected.some(opt => opt.type === 'weapon_upgrade' || opt.type === 'weapon_unlock');

        if (hasAnyWeaponInPool && !hasAnyWeaponInSelected) {
            // 从剩余池中收集所有武器相关选项（升级或解锁）
            const weaponOptions = availablePool.filter(opt => opt.type === 'weapon_upgrade' || opt.type === 'weapon_unlock');
            if (weaponOptions.length > 0) {
                // 随机选一个武器选项，替换掉最后一个选项
                const randomIdx = Math.floor(GameRuntime.random() * weaponOptions.length);
                selected.pop(); // 移除最后一个
                selected.push(weaponOptions[randomIdx]);
                // 从availablePool中移除这个选中的保底选项
                const idx = availablePool.findIndex(opt => opt === weaponOptions[randomIdx]);
                if (idx >= 0) {
                    availablePool.splice(idx, 1);
                }
            }
        }

        return selected;
    }

    onPlayerLevelUp() {
        // 每升满3级奖励一次免费刷新
        if (this.player.level % 3 === 0) {
            this.player.rerolls += 1;
        }

        // 新增：触发升级核爆清屏
        this.triggerLevelUpNova();

        this.gameState = GAME_STATE.LEVEL_UP;
        this.levelUpOptions = this.generateLevelUpOptions();
    }

    // 新增：基于怪物最大生命值的范围真伤策略
    triggerLevelUpNova() {
        const px = this.player.x;
        const py = this.player.y;
        const radius = 250; // 只伤害玩家周围250px范围内

        // 压入视觉特效（由于升级会弹窗暂停，玩家选完技能恢复游戏时，刚好能看到冲击波炸开）
        this.lightningEffects.push(new LevelUpNovaEffect(px, py));

        // 增加强烈屏幕震动
        this.shakeTimer = 0.5;

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            const dx = enemy.x - px;
            const dy = enemy.y - py;
            const distSq = dx * dx + dy * dy;

            if (distSq <= radius * radius) {
                let damage = 0;

                // 核心策略：百分比真实伤害
                if (enemy.isLevelBoss || enemy.isBoss || enemy.isFinalBoss) {
                    damage = enemy.maxHp * 0.05; // 大Boss：5%
                } else if (enemy.isMiniBoss) {
                    damage = enemy.maxHp * 0.15; // 小Boss：15%
                } else if (enemy.isElite || enemy.type === 'tiger_guard') {
                    damage = enemy.maxHp * 0.50; // 精英/虎卫军：50%
                } else {
                    damage = enemy.maxHp * 2.0;  // 普通小怪：溢出秒杀
                }

                enemy.hp -= damage;

                // 死亡结算与击退
                if (enemy.hp <= 0) {
                    this.handleEnemyDeath(enemy, i);
                } else if (enemy.knockbackResist < 1.0) {
                    // 没死的高级怪，给予强力物理震退（强制打断合围阵型）
                    const dist = Math.sqrt(distSq);
                    if (dist > 0) {
                        const pushForce = 120 * (1 - enemy.knockbackResist);
                        enemy.x += (dx / dist) * pushForce;
                        enemy.y += (dy / dist) * pushForce;
                    }
                }
            }
        }
    }

    selectLevelUpOption(index) {
        this.levelUpOptions[index].effect();
        // 每次升级恢复 10 点血量，不超过上限
        this.player.hp = Math.min(this.player.hp + 10, this.player.maxHp);
        this.gameState = GAME_STATE.PLAYING;
        this.levelUpOptions = [];
    }

    buyPerk(index) {
        const perk = PERK_UPGRADES[index];
        const level = this.perkLevels[perk.id] || 0;
        const cost = this.getUpgradeCost(level);

        if (this.totalResonance >= cost) {
            this.totalResonance -= cost;
            this.perkLevels[perk.id] = level + 1;
            // 重新计算效果
            this.perks[perk.id] = perk.getEffect(level + 1);
            this.savePersistentData();
        }
    }

    getUpgradeCost(currentLevel) {
        // currentLevel 范围：0 到 99
        if (currentLevel >= 100) return 0; // 满级

        const major = Math.floor(currentLevel / 10); // 大阶 (0-9)
        const minor = currentLevel % 10;             // 小阶 (0-9)

        // 1. 计算当前大阶的底薪 (跨阶跃迁的基础花费，保障绝不跌坡)
        // major=1 时是 300，major=9 时是 17100
        const baseCost = (major * major * 200) + (major * 100);

        // 2. 计算阶内非线性基础值 (2, 6, 12, 20... 110)
        const stepValue = (minor + 1) * (minor + 2);

        // 3. 计算该大阶的放大倍率 (1, 4, 7... 28)
        const multiplier = 1 + (major * 3);

        // 最终花费：底薪 + 阶内成长
        return baseCost + (stepValue * multiplier);
    }

    handleInput(deltaTime) {
        if (this.gameState !== GAME_STATE.PLAYING) return;

        let dx = 0;
        let dy = 0;

        if (this.keys['w'] || this.keys['arrowup']) dy -= 1;
        if (this.keys['s'] || this.keys['arrowdown']) dy += 1;
        if (this.keys['a'] || this.keys['arrowleft']) dx -= 1;
        if (this.keys['d'] || this.keys['arrowright']) dx += 1;

        if (dx !== 0 && dy !== 0) {
            const len = Math.sqrt(dx * dx + dy * dy);
            dx /= len;
            dy /= len;
        }

        if (dx !== 0 || dy !== 0) {
            this.player.move(dx, dy, deltaTime, this.canvas.width, this.canvas.height);
        }
    }

    updateSpawnSystem(deltaTime) {
        this.gameTime += deltaTime;
        const currentMinute = Math.floor(this.gameTime / 60);

        // ========== 核心：10分钟绝对时间轴 ==========
        // 确保每达到完整的 1 分钟，且在 10 分钟以内，只触发一次特殊刷新
        if (currentMinute > 0 && currentMinute <= 10 && !this.spawnedMinutes.has(currentMinute)) {
            this.spawnedMinutes.add(currentMinute);

            // 每整分钟同步刷新1个木箱
            this.spawnDestructibleProps(1);

            if (currentMinute % 2 !== 0) {
                // 1, 3, 5, 7, 9 分钟：刷新精英小 Boss（高压掉落）
                this.spawnMiniBoss(currentMinute);
            } else {
                // 2, 4, 6, 8, 10 分钟：刷新对应关卡大 Boss
                const bossIndex = (currentMinute / 2) - 1;
                this.currentStage = bossIndex; // 同步当前关卡环境

                // ================= 修改：第10分钟终局过场拦截 =================
                if (bossIndex === 4) {
                    this.triggerFinalCutscene();
                } else {
                    this.spawnTimelineBoss(bossIndex);
                }
                // ==========================================================
            }
        }

        // ========== 魏军·长戈兵 高压潮汐波 ==========
        // 每整分钟触发一次，从屏幕边缘四面八方冲锋进来
        if (currentMinute > 0 && currentMinute <= 9 && !this.swarmedMinutes.has(currentMinute)) {
            this.swarmedMinutes.add(currentMinute);
            this.spawnSpearmanSwarm(currentMinute);
        }

        // 继续生成待处理的潮汐波层（分批分摊卡顿）
        if (this.pendingSwarm && this.pendingSwarm.remainingLayers > 0) {
            this.spawnNextSwarmLayer();
        }

        const stageData = STAGES[this.currentStage];

        // 小怪持续生成，直到场上出现最终Boss才停止
        const hasFinalBoss = this.enemies.some(e => e.isFinalBoss);
        if (!hasFinalBoss) {
            // 动态难度: 每过 60 秒，生成间隔减少 20% = 频率提升 25%
            const wave = Math.floor(this.gameTime / 60);
            const currentInterval = stageData.spawnInterval * Math.pow(0.8, wave);
            // 同时刷新数量：每过60秒增加1个，最少1个，最多4个
            const spawnCount = Math.min(1 + wave, 4);

            this.spawnTimer += deltaTime;
            if (this.spawnTimer >= currentInterval) {
                // =========== 核心修复：移除击杀数量限制，直接根据时间轴无限刷怪 ===========
                for (let i = 0; i < spawnCount; i++) {
                    this.spawnEnemy();
                }
                this.spawnTimer -= currentInterval;
            }
        }

        // ========== 可破坏物（木箱）低概率生成 ==========
        // 每帧 0.1% 概率尝试生成，保持场上最多 3 个，不生成在边缘
        const maxProps = 3;
        const propCount = this.enemies.filter(e => e.isProp).length;
        if (!hasFinalBoss && propCount < maxProps && GameRuntime.random() < 0.001) {
            const margin = 50; // 不生成在边缘 50px 内
            const x = margin + GameRuntime.random() * (this.canvas.width - margin * 2);
            const y = margin + GameRuntime.random() * (this.canvas.height - margin * 2);
            this.enemies.push(new DestructibleProp(x, y));
        }
    }

    updateMovementSystem(deltaTime) {
        // 更新所有敌人
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const alive = this.enemies[i].update(deltaTime, this.canvas.width, this.canvas.height);
            // 收到 false（飞出屏幕极远），静默清理掉，不再浪费性能
            if (alive === false) {
                this.enemies.splice(i, 1);
            }
        }

        // 重建空间网格：将所有敌人按坐标分配到网格，用于优化碰撞检测
        this.rebuildSpatialGrid();
    }

    updateDamageSystem(deltaTime) {
        // 更新火焰区域（王植）
        for (let i = this.fireAreas.length - 1; i >= 0; i--) {
            const fire = this.fireAreas[i];
            fire.lifetime -= deltaTime;
            // 玩家在火焰里持续掉血
            const dx = this.player.x - fire.x;
            const dy = this.player.y - fire.y;
            const distSq = dx * dx + dy * dy;
            if (distSq <= fire.radius * fire.radius && !this.player.isInvincible) {
                this.player.hp -= fire.damagePerSecond * deltaTime;
            }
            if (fire.lifetime <= 0) {
                this.fireAreas.splice(i, 1);
            }
        }

        // 更新太平要术火焰龙卷风陷阱
        for (let i = this.fireTornados.length - 1; i >= 0; i--) {
            const tornado = this.fireTornados[i];
            const alive = tornado.update(deltaTime, this.enemies, this.player);
            if (!alive) {
                this.fireTornados.splice(i, 1);
            }
        }

        // 更新特殊区域（比如八门金锁盾Lv6火墙）
        for (let i = this.specialAreas.length - 1; i >= 0; i--) {
            const area = this.specialAreas[i];
            const alive = area.update(deltaTime, this.enemies);
            if (!alive) {
                this.specialAreas.splice(i, 1);
            }
        }
    }

    updateProjectileSystem(deltaTime) {
        // 更新所有子弹
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const projectile = this.projectiles[i];
            const alive = projectile.update(deltaTime, this.canvas.width, this.canvas.height);
            if (!alive) {
                this.projectiles.splice(i, 1);
                continue;
            }

            // 如果是敌人射向玩家的箭，不对敌人造成伤害，只检测玩家碰撞
            if (projectile.isEnemyProjectile) {
                // 检测是否击中玩家
                const collided = this.checkRectCollision(
                    projectile.x - projectile.size/2, projectile.y - projectile.size/2, projectile.size, projectile.size,
                    this.player.x - this.player.size/2, this.player.y - this.player.size/2, this.player.size, this.player.size
                );
                if (collided && !this.player.isInvincible) {
                    this.player.hp -= projectile.damage;
                    this.damageFlashTimer = 0.2; // 红屏闪烁反馈
                    this.projectiles.splice(i, 1);
                }
                continue;
            }

            // 碰撞检测：子弹vs敌人 - 空间网格优化：只查询子弹附近网格的敌人
            const checkRadius = 100; // 搜索半径100px足够覆盖子弹+敌人碰撞box
            const nearbyEnemies = this.queryEnemiesInRange(projectile.x, projectile.y, checkRadius);

            for (let j = nearbyEnemies.length - 1; j >= 0; j--) {
                const enemy = nearbyEnemies[j];
                let collided = false;

                if (enemy.isBoss) {
                    collided = this.checkCircleCollision(
                        enemy.x, enemy.y, enemy.size / 2,
                        projectile.x, projectile.y, projectile.size
                    );
                } else {
                    collided = this.checkRectCollision(
                        projectile.x - projectile.size/2, projectile.y - projectile.size/2, projectile.size, projectile.size,
                        enemy.x - enemy.size/2, enemy.y - enemy.size/2, enemy.size, enemy.size
                    );
                }

                if (collided) {
                    // Check if this is a CrossbowArrow with custom hit handling (piercing + lightning)
                    if (typeof projectile.onHit === 'function') {
                        const shouldDestroy = projectile.onHit(enemy, this);
                        if (shouldDestroy) {
                            this.projectiles.splice(i, 1);
                            break;
                        }
                    } else {
                        // Original behavior for other projectiles
                        let dead = false;
                        if (enemy.isBoss) {
                            dead = enemy.takeDamage(projectile.damage);
                        } else {
                            enemy.hp -= projectile.damage;
                            dead = enemy.hp <= 0;
                        }

                        // 吸血效果
                        for (const passive of this.player.passives) {
                            if (passive.type === 'lifesteal') {
                                this.player.hp += passive.value;
                                this.player.hp = Math.min(this.player.maxHp, this.player.hp);
                            }
                        }

                        if (dead) {
                            // 需要在原数组中找到索引才能删除
                            const originalIdx = this.enemies.indexOf(enemy);
                            // 【拦截】：击杀最终Boss（秦琪），直接游戏胜利
                            if (enemy.isFinalBoss && originalIdx >= 0) {
                                this.trySpawnPickup(enemy);
                                this.enemies.splice(originalIdx, 1);
                                this.victory();
                                return false; // 终止后续更新
                            }
                            // 5分钟最终Boss死亡，直接通关
                            if (enemy.isLevelBoss && originalIdx >= 0) {
                                this.trySpawnPickup(enemy);
                                this.enemies.splice(originalIdx, 1);
                                this.victory();
                                return false;
                            }
                            // 关卡Boss死亡
                            if (enemy.isBoss && originalIdx >= 0) {
                                if (this.currentStage >= STAGES.length - 1) {
                                    // 最终Boss死亡，通关！
                                    this.victory();
                                    return false;
                                } else {
                                    // 下一关
                                    this.currentStage++;
                                    this.stagePhase = 'spawning';
                                    this.targetEnemyCount = Math.floor(
                                        STAGES[this.currentStage].minSpawnCount +
                                        GameRuntime.random() * (STAGES[this.currentStage].maxSpawnCount - STAGES[this.currentStage].minSpawnCount)
                                    );
                                    this.enemiesSpawned = 0;
                                    this.bossSpawned = false;
                                    this.spawnTimer = 0;
                                }
                            }
                            if (dead && originalIdx >= 0) {
                                this.trySpawnPickup(enemy);
                                this.enemies.splice(originalIdx, 1);
                            }
                        }
                        if (collided) {
                            this.projectiles.splice(i, 1);
                            break;
                        }
                    }
                }
            }
        }

        return true;
    }

    updateAnimationSystem(deltaTime) {
        // 更新闪电视觉特效（纯视觉，自动过期消失）
        for (let i = this.lightningEffects.length - 1; i >= 0; i--) {
            const effect = this.lightningEffects[i];
            const alive = effect.update(deltaTime);
            if (!alive) {
                this.lightningEffects.splice(i, 1);
            }
        }

        // 更新浮动文字特效（暴击跳字等）
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const text = this.floatingTexts[i];
            const alive = text.update(deltaTime);
            if (!alive) {
                this.floatingTexts.splice(i, 1);
            }
        }
    }

    updateCollisionSystem(deltaTime) {
        // 递减受伤弹开冷却
        if (this.pushbackCooldown > 0) {
            this.pushbackCooldown -= deltaTime;
        }

        // 碰撞检测：敌人vs玩家。空间网格先缩小候选集合，具体碰撞形状保持原判定。
        const playerCollisionCandidates = this.queryEnemiesInRange(this.player.x, this.player.y, 180);
        for (let i = playerCollisionCandidates.length - 1; i >= 0; i--) {
            const enemy = playerCollisionCandidates[i];
            let collided = false;

            if (enemy.isBoss) {
                collided = this.checkCircleCollision(
                    enemy.x, enemy.y, enemy.size / 2,
                    this.player.x, this.player.y, this.player.size
                );
            } else {
                collided = this.checkRectCollision(
                    enemy.x - enemy.size/2, enemy.y - enemy.size/2, enemy.size, enemy.size,
                    this.player.x - this.player.size/2, this.player.y - this.player.size/2, this.player.size, this.player.size
                );
            }

            if (collided && !this.player.isInvincible) {
                // 特殊处理：木牛、弓箭手、木箱碰撞不造成伤害，只推开
                // 盾甲兵：正常扣血，但弹开方向是玩家面向反方向
                const isNoDamageEnemy =
                    enemy instanceof WoodenOxEnemy ||
                    enemy instanceof ArcherEnemy ||
                    enemy.isProp;

                if (isNoDamageEnemy) {
                    if (enemy.isProp) {
                        // 玩家碰撞木箱：弹开玩家，木箱不动
                        const pushForce = 20;
                        const dx = this.player.x - enemy.x;
                        const dy = this.player.y - enemy.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist > 0) {
                            const udx = dx / dist;
                            const udy = dy / dist;
                            this.player.x += udx * pushForce;
                            this.player.y += udy * pushForce;
                        }
                    } else {
                        // 木牛/弓箭手：弹开怪物本身
                        const pushForce = 40;
                        const dx = enemy.x - this.player.x;
                        const dy = enemy.y - this.player.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist > 0) {
                            const udx = dx / dist;
                            const udy = dy / dist;
                            enemy.x += udx * pushForce;
                            enemy.y += udy * pushForce;
                        }
                    }
                }

                // 盾甲兵特殊弹开逻辑：正常扣血，但弹开玩家向其面向的反方向
                if (enemy.isTigerGuard && this.pushbackCooldown <= 0) {
                    const pushForce = 30;
                    // 玩家面向方向的反方向弹开玩家
                    const dirX = -this.player.facingDirX;
                    const dirY = -this.player.facingDirY;
                    this.player.x += dirX * pushForce;
                    this.player.y += dirY * pushForce;
                }

                if (!isNoDamageEnemy) {
                    // 普通敌人：正常扣血+弹开
                    let damageReduction = this.player.modifiers.damageReduction || 0;
                    // 八门金锁盾：非爆发状态提供额外伤害减免
                    // Lv1: 50%, Lv6: 80% (每级+6%)
                    for (const weapon of this.player.weapons) {
                        if (weapon.type === 'shield' && !weapon.active) {
                            const shieldDR = 0.5 + (weapon.level - 1) * 0.06;
                            // 叠乘计算：原DR × (1 - shieldDR) +  shieldDR
                            damageReduction = damageReduction + shieldDR * (1 - damageReduction);
                        }
                    }
                    const baseDamage = enemy.isBoss ? 20 : 10;
                    const continuousDamage = enemy.isBoss ? 20 : 10;
                    if (this.pushbackCooldown <= 0) {
                        // 弹开就绪：单次爆发固定扣除，普通怪10点 / Boss20点，计算伤害减免
                        this.player.hp -= baseDamage * (1 - damageReduction);
                        // 触发屏幕震动 + 红屏闪烁
                        this.shakeTimer = 0.3;
                        this.damageFlashTimer = 0.2;
                        // 弹开周围敌人
                        const pushRadius = 100; // 弹开范围
                        const pushForce = 60; // 弹开距离
                        const pushCandidates = this.queryEnemiesInRange(this.player.x, this.player.y, pushRadius + 80);
                        for (const pushEnemy of pushCandidates) {
                            const dx = pushEnemy.x - this.player.x;
                            const dy = pushEnemy.y - this.player.y;
                            const dist = Math.sqrt(dx * dx + dy * dy);
                            if (dist < pushRadius && dist > 0) {
                                const udx = dx / dist;
                                const udy = dy / dist;
                                pushEnemy.x += udx * pushForce;
                                pushEnemy.y += udy * pushForce;
                            }
                        }
                        // 进入2秒冷却
                        this.pushbackCooldown = 2.0;
                    } else {
                        // 弹开冷却中：保持持续伤害，普通怪10点/秒 / Boss20点/秒，计算伤害减免
                        this.player.hp -= continuousDamage * deltaTime * (1 - damageReduction);
                    }
                    // 检查死亡
                    if (this.player.hp <= 0) {
                        this.gameOver();
                        return false;
                    }
                }
            }
        }

        return true;
    }

    updatePlayerRecoverySystem(deltaTime) {
        // ========== 自动回血 (青囊秘卷) ==========
        if (this.player.hp > 0 && this.player.hp < this.player.maxHp) {
            const currentRegen = this.player.modifiers.regen || 0;
            if (currentRegen > 0) {
                this.player.hp = Math.min(this.player.maxHp, this.player.hp + currentRegen * deltaTime);
            }
        }
    }

    updatePickupSystem(deltaTime) {
        // 自动吸附 + 自动拾取
        for (let i = this.pickups.length - 1; i >= 0; i--) {
            const pickup = this.pickups[i];
            // 吸附逻辑更新位置
            pickup.update(deltaTime, this.player);
            // 检查是否已经吸到玩家身边
            if (pickup.checkPickup(this.player)) {
                pickup.onPickup(this);
                this.pickups.splice(i, 1);
            }
        }
    }

    updateWeaponSystem(deltaTime) {
        // 自动射击
        this.autoShoot(deltaTime);
    }

    updateLevelProgressionSystem() {
        // 检查玩家升级
        if (this.player.exp >= this.player.expToNextLevel) {
            const leveledUp = this.player.addExp(0);
            if (leveledUp) {
                this.onPlayerLevelUp();
            }
        }
    }

    update(deltaTime) {
        if (this.gameState !== GAME_STATE.PLAYING) return;

        this.updateSpawnSystem(deltaTime);
        this.updateMovementSystem(deltaTime);
        this.updateDamageSystem(deltaTime);
        if (!this.updateProjectileSystem(deltaTime)) return;
        this.updateAnimationSystem(deltaTime);
        if (!this.updateCollisionSystem(deltaTime)) return;
        this.updatePlayerRecoverySystem(deltaTime);
        this.updatePickupSystem(deltaTime);
        this.updateWeaponSystem(deltaTime);
        this.updateLevelProgressionSystem();
        this.genericWeaponShadow?.update(this);
    }

    autoShoot(deltaTime) {
        if (this.enemies.length === 0) return;

        // 更新所有武器，每个武器自己处理攻击计时和逻辑（全局数组管理）
        for (const weapon of this.activeWeapons) {
            weapon.update(deltaTime, this.player, this.enemies, this.projectiles, this.specialAreas, this.canvas.width, this.canvas.height);
        }
    }

    gameOver() {
        // 累计残响
        this.totalResonance += this.currentResonance;
        this.savePersistentData();
        this.gameState = GAME_STATE.GAME_OVER;
    }

    // 干净重开游戏（R键）
    restartGame() {
        this.gameState = GAME_STATE.PLAYING;
        GameRuntime.resetRunStats();
        this.player = new Player(this.canvas.width, this.canvas.height, this.perks, this.perkLevels);
        this.activeWeapons = this.player.weapons; // 全局武器管理数组
        this.enemies = [];
        this.projectiles = [];
        this.pickups = [];
        this.fireAreas = [];
        this.fireTornados = [];
        this.lightningEffects = [];
        this.specialAreas = [];

        this.currentStage = 0;
        this.spawnTimer = 0;
        this.gameTime = 0;
        this.currentResonance = 0;
        this.finalBossSpawned = false;
        this.spawnedMinutes = new Set(); // 重置时间轴触发记录
        this.swarmedMinutes = new Set(); // 重置潮汐波触发记录
        this.isVictory = false;

        this.shootTimer = 0;
        this.shootInterval = this.player.fireRate;

        // 屏幕震动和红屏受伤闪烁计时器
        this.shakeTimer = 0;
        this.damageFlashTimer = 0;
        // 受伤弹开怪物冷却
        this.pushbackCooldown = 0;

        // 开局固定刷新2个木箱
        this.spawnDestructibleProps(2);
    }

    // ========== 生成可破坏物（木箱） ==========
    spawnDestructibleProps(count) {
        const margin = 50;
        for (let i = 0; i < count; i++) {
            const x = margin + GameRuntime.random() * (this.canvas.width - margin * 2);
            const y = margin + GameRuntime.random() * (this.canvas.height - margin * 2);
            this.enemies.push(new DestructibleProp(x, y));
        }
    }

    victory() {
        this.totalResonance += this.currentResonance;
        this.savePersistentData();
        this.gameState = GAME_STATE.VICTORY;
    }

    returnToMenu() {
        this.gameState = GAME_STATE.MENU;
    }

    // ==================== 渲染 ====================

    renderMainMenu() {
        const ctx = this.ctx;
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;

        // 背景
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 标题
        ctx.fillStyle = '#b8860b';
        ctx.font = 'bold 60px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('千里走单骑', centerX, centerY - 180);

        ctx.fillStyle = '#cccccc';
        ctx.font = '20px Arial';
        ctx.fillText('穿越时空只为找到你~', centerX, centerY - 120);

        // 按钮
        this.drawButton(centerX - 150, 400, 300, 70, '#2a4d2a', '#ffffff', '开始新游戏');
        this.drawButton(centerX - 150, 490, 300, 70, '#2a3a4d', '#ffffff', '局外升级');
        this.drawButton(centerX - 150, 580, 300, 70, '#4d2a2a', '#ffffff', '退出');

        ctx.textAlign = 'left';
    }

    drawButton(x, y, w, h, bgColor, textColor, text) {
        const ctx = this.ctx;
        // 检测鼠标悬停，高亮背景
        const isHover = this.mouseX >= x && this.mouseX <= x + w && this.mouseY >= y && this.mouseY <= y + h;
        const finalBgColor = isHover ? this.lightenColor(bgColor, 0.3) : bgColor;
        ctx.fillStyle = finalBgColor;
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = isHover ? 3 : 2;
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = textColor;
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(text, x + w/2, y + h/2 + 8);
    }

    // 颜色变亮用于悬停
    lightenColor(color, amount) {
        // 简单处理：hex 颜色增加亮度
        if (color.startsWith('#')) {
            color = color.slice(1);
        }
        const num = parseInt(color, 16);
        const r = Math.min(255, ((num >> 16) & 0xFF) + Math.round(amount * 255));
        const g = Math.min(255, ((num >> 8) & 0xFF) + Math.round(amount * 255));
        const b = Math.min(255, (num & 0xFF) + Math.round(amount * 255));
        return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
    }

    // 自动换行绘制文本
    fillTextWrapped(ctx, text, x, y, maxWidth, lineHeight, align = 'left') {
        const originalAlign = ctx.textAlign;
        ctx.textAlign = align;
        // 如果文本中已有换行符，先拆分
        const paragraphs = text.split('\n');
        let currentY = y;

        for (const paragraph of paragraphs) {
            if (paragraph === '') {
                currentY += lineHeight;
                continue;
            }

            // 按字符宽度换行，兼容中英文（中文无空格也能换行）
            let line = '';
            for (const char of paragraph) {
                const testLine = line + char;
                const metrics = ctx.measureText(testLine);
                if (metrics.width > maxWidth && line !== '') {
                    ctx.fillText(line, x, currentY);
                    line = char;
                    currentY += lineHeight;
                } else {
                    line = testLine;
                }
            }
            if (line !== '') {
                ctx.fillText(line, x, currentY);
                currentY += lineHeight;
            }
        }
        ctx.textAlign = originalAlign;
        return currentY; // 返回绘制结束后的Y坐标
    }

    renderPerkUpgrade() {
        const ctx = this.ctx;
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 30px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('历史残响 基因重塑', this.canvas.width / 2, 50);
        ctx.font = '18px Arial';
        ctx.fillStyle = '#cccccc';
        ctx.fillText(`当前残响：${this.totalResonance}`, this.canvas.width / 2, 80);
        ctx.fillText('点击购买永久升级，死亡后保留效果', this.canvas.width / 2, 105);

        // 列表 - 双列布局：左列5个，右列5个
        const startY = 150;
        const itemHeight = 80;  // 保持原有卡片高度
        PERK_UPGRADES.forEach((perk, index) => {
            // 第一步：计算双列布局参数
            const col = Math.floor(index / 5); // 0 为左列，1 为右列
            const row = index % 5;             // 0~4 为垂直行位
            // 中间留 50px 空隙，两边各留 50px 边距
            const boxWidth = (this.canvas.width - 150) / 2;
            const baseX = 50 + col * (boxWidth + 50);
            const y = startY + row * itemHeight;
            const level = this.perkLevels[perk.id] || 0;
            const cost = this.getUpgradeCost(level);
            const canAfford = this.totalResonance >= cost;

            // 检测鼠标悬停
            const isHover = (
                this.mouseX >= baseX &&
                this.mouseX <= baseX + boxWidth &&
                this.mouseY >= y &&
                this.mouseY <= y + itemHeight - 10
            );

            // 背景 - 相对于 baseX，悬停时提亮
            if (isHover && canAfford) {
                ctx.fillStyle = '#3a3a4a';
            } else if (isHover) {
                ctx.fillStyle = '#3a3a3a';
            } else {
                ctx.fillStyle = canAfford ? '#2a2a3a' : '#2a2a2a';
            }
            ctx.fillRect(baseX, y, boxWidth, itemHeight - 10);

            // 边框 - 悬停时高亮金色
            if (isHover) {
                ctx.strokeStyle = '#b8860b';
                ctx.lineWidth = 3;
            } else {
                ctx.strokeStyle = canAfford ? '#4169e1' : '#555';
                ctx.lineWidth = 2;
            }
            ctx.strokeRect(baseX, y, boxWidth, itemHeight - 10);

            // ========== 左侧：文字区域 ==========
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(`${perk.name} (Lv.${level})`, baseX + 20, y + 25);

            // ========== 右侧：宽体发光能量轴矩阵 ==========
            const MAX_COLS = 10;       // 总共 10 根大柱子
            const SEGMENTS = 10;       // 每根大柱子分为 10 个能量小格
            const COL_WIDTH = 24;      // 柱子宽度增加接近3倍 (原为10)
            const COL_GAP = 6;         // 大柱子之间的横向缝隙
            const SEG_HEIGHT = 4;      // 单个能量小格高度
            const SPACING = 2;         // 格子之间的纵向微小缝隙
            const totalBarHeight = 10 * (SEG_HEIGHT + SPACING) - SPACING; // 原高度保持 58px
            const totalBarWidth = 10 * (COL_WIDTH + COL_GAP) - COL_GAP;   // 总矩阵宽度 ~294px

            // 核心修复：死死锚定在卡片的右侧减去价格标签的位置，向左移动贴近技能描述
            // 用户要求：等级竖轴全部右移5px
            const axisStartX = baseX + boxWidth - totalBarWidth - 250;
            const axisStartY = y + (itemHeight - 10 - totalBarHeight) / 2;
            // 文字区域也随之收缩，永远不会再越线
            const textMaxWidth = axisStartX - (baseX + 20) - 20; // 文本最多铺到矩阵前20像素
            // ========== 动态解析并分段高亮渲染技能描述 ==========
            const textX = baseX + 20;
            const textY = y + 60;

            // 使用贪婪正则提取描述末尾的强化数值：前半部分文本 + 增量数字 + 单位后缀
            const match = perk.description.match(/^(.*)([+-]\d+(?:\.\d+)?)(.*)$/);

            if (match) {
                // 提取成功：例如 match[1] = "... → 全伤害 ", match[2] = "+0.5", match[3] = "%"
                const baseText = match[1];
                const stepValue = parseFloat(match[2]);
                const unit = match[3];
                // 核心计算：算出升级到下一级后的总预期加成，并解决浮点数精度乱码
                const expectedTotal = parseFloat((stepValue * (level + 1)).toFixed(2));
                const sign = expectedTotal > 0 ? '+' : '';
                const highlightText = `${sign}${expectedTotal}${unit}`;
                // 绘制前半段普通灰色文字
                ctx.fillStyle = '#cccccc';
                ctx.font = '14px Arial';
                ctx.fillText(baseText, textX, textY);
                // 测量前半段占据的宽度，向右顺延画笔位置
                const baseTextWidth = ctx.measureText(baseText).width;
                // 绘制后半段高亮预期数值：亮青绿荧光色，加粗大字号，区别极其明显！
                ctx.fillStyle = '#00ffcc';
                ctx.font = 'bold 16px "Courier New", Consolas, Arial';
                ctx.fillText(highlightText, textX + baseTextWidth, textY);
            } else {
                // 退退回机制：如果没匹配出数字格式，按原来的灰色原样输出
                ctx.fillStyle = '#cccccc';
                ctx.font = '14px Arial';
                this.fillTextWrapped(ctx, perk.description, textX, textY, textMaxWidth, 18);
            }

            ctx.save();
            for (let col = 0; col < MAX_COLS; col++) {
                const currentX = axisStartX + col * (COL_WIDTH + COL_GAP);
                // 画这根柱子的整根外发光轮廓（金色炫光样式）
                ctx.shadowColor = '#ffd700';             // 金色炫光
                ctx.shadowBlur = 8;
                ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)'; // 半透金色线描边
                ctx.lineWidth = 1;
                // 外包装正好包裹一整列个小方格的面积
                ctx.strokeRect(currentX - 2, axisStartY - 2, COL_WIDTH + 4, totalBarHeight + 4);

                // 去掉阴影进入内部小格子的充能绘画
                ctx.shadowBlur = 0;
                for (let seg = 0; seg < SEGMENTS; seg++) {
                    const currentY = axisStartY + (SEGMENTS - 1 - seg) * (SEG_HEIGHT + SPACING);
                    const cellLevel = col * 10 + seg + 1;
                    if (level >= cellLevel) {
                        ctx.fillStyle = '#ffd700'; // 点亮的能量块：高亮金黄色
                        ctx.shadowColor = '#ffd700';
                        ctx.shadowBlur = 6;        // 已拥有产生辉光
                    } else {
                        ctx.fillStyle = 'rgba(42, 42, 42, 0.5)'; // 未点亮：半透幽闭灰
                        ctx.shadowBlur = 0;
                    }
                    ctx.fillRect(currentX, currentY, COL_WIDTH, SEG_HEIGHT);
                    ctx.shadowBlur = 0; // 单格画完清理发光
                }
            }
            ctx.restore();

            // 价格：右上角对齐
            ctx.textAlign = 'right';
            ctx.fillStyle = canAfford ? '#ff8c00' : '#666';
            ctx.font = 'bold 16px Arial';
            ctx.fillText(`价格：${cost} 残响`, baseX + boxWidth - 20, y + 25);
        });

        // 返回按钮
        this.drawButton(this.canvas.width / 2 - 100, this.canvas.height - 130, 200, 60, '#333', '#ffffff', '返回菜单');

        ctx.textAlign = 'left';
    }

    renderPlaying() {
        const ctx = this.ctx;

        // 【强制重置画布状态】防止之前的UI特效（阴影、透明度）污染导致玩家拖影
        ctx.globalAlpha = 1.0;
        ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = 'source-over';

        // 关卡对应的色调映射表（由暗转深血色）
        const STAGE_COLORS = [
            '#1a1a1a', // 东岭关 - 黑灰
            '#1a1515', // 洛阳城 - 微红
            '#151a15', // 汜水关 - 微绿
            '#2a1010', // 荥阳 - 暗红（符合火烧主题）
            '#0a0a1a'  // 黄河渡口 - 深渊蓝
        ];

        // 清空背景，按关卡动态着色
        ctx.fillStyle = STAGE_COLORS[this.currentStage] || '#1a1a1a';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 屏幕震动：保存画布状态，准备随机偏移
        if (this.shakeTimer > 0) {
            ctx.save();
            const shakeX = (GameRuntime.random() * 8 - 4);
            const shakeY = (GameRuntime.random() * 8 - 4);
            ctx.translate(shakeX, shakeY);
        }

        // 渲染火焰区域（半透明橙色）- 王植Boss技能
        for (const fire of this.fireAreas) {
            ctx.fillStyle = 'rgba(255, 100, 0, 0.4)';
            ctx.beginPath();
            ctx.arc(fire.x, fire.y, fire.radius, 0, Math.PI * 2);
            ctx.fill();
        }

        // 渲染太平要术火焰龙卷风
        for (const tornado of this.fireTornados) {
            tornado.render(ctx);
        }

        // 渲染特殊区域（八门金锁盾Lv6火墙等）
        for (const area of this.specialAreas) {
            area.render(ctx);
        }

        // 渲染武器（需要持续绘制的特效：刀、枪、环绕剑等）- 全局数组管理
        for (const weapon of this.activeWeapons) {
            weapon.render(ctx, this.player);
        }

        // 掉落物
        for (const pickup of this.pickups) {
            pickup.render(ctx);
        }

        // 玩家
        this.player.render(ctx);

        // 敌人
        for (const enemy of this.enemies) {
            enemy.render(ctx);
        }

        // 子弹/追踪弹
        for (const projectile of this.projectiles) {
            projectile.render(ctx);
        }

        // 渲染闪电视觉特效
        for (const effect of this.lightningEffects) {
            effect.render(ctx);
        }

        // 渲染浮动文字（暴击跳字等）
        for (const text of this.floatingTexts) {
            text.render(ctx);
        }

        // 屏幕震动：恢复画布，UI不震动
        if (this.shakeTimer > 0) {
            ctx.restore();
            this.shakeTimer -= 1/60; // 逐帧递减
            if (this.shakeTimer < 0) this.shakeTimer = 0;
        }

        // 红屏闪烁：受伤后高亮红色闪屏（覆盖全屏，不震动）
        if (this.damageFlashTimer > 0) {
            ctx.globalAlpha = (this.damageFlashTimer / 0.2) * 0.4;
            ctx.fillStyle = '#ff0000';
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            ctx.globalAlpha = 1.0;
            this.damageFlashTimer -= 1/60; // 逐帧递减
            if (this.damageFlashTimer < 0) this.damageFlashTimer = 0;
        }

        // ========== 玩家血条（左上角） ==========
        const barX = 10;
        const barY = 10;
        const barW = 200;
        const barH = 20;
        const hpPercent = this.player.hp / this.player.maxHp;

        // 深色背景框
        ctx.fillStyle = '#222222';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);

        // 绿色血量填充
        ctx.fillStyle = hpPercent > 0.5 ? '#00aa00' : hpPercent > 0.25 ? '#aaaa00' : '#aa0000';
        ctx.fillRect(barX + 2, barY + 2, (barW - 4) * hpPercent, barH - 4);

        // 文字：当前HP / 最大HP
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.ceil(this.player.hp)}/${Math.ceil(this.player.maxHp)}`, barX + barW/2, barY + barH/2 + 5);

        ctx.textAlign = 'left';

        // ========== 右上角功能按钮 ==========
        const buttonW = 80;
        const buttonH = 30;
        const padding = 10;
        // 暂停按钮
        const pauseX = this.canvas.width - buttonW - padding;
        const pauseY = padding;
        ctx.fillStyle = this.gameState === GAME_STATE.PAUSED ? '#ff8c00' : '#333';
        ctx.fillRect(pauseX, pauseY, buttonW, buttonH);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(pauseX, pauseY, buttonW, buttonH);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.gameState === GAME_STATE.PAUSED ? '继续' : '暂停', pauseX + buttonW/2, pauseY + buttonH/2 + 5);

        // 重启按钮
        const restartX = this.canvas.width - 2 * buttonW - 2 * padding;
        const restartY = padding;
        ctx.fillStyle = '#4a4a4a';
        ctx.fillRect(restartX, restartY, buttonW, buttonH);
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(restartX, restartY, buttonW, buttonH);
        ctx.fillStyle = '#fff';
        ctx.fillText('主页', restartX + buttonW/2, restartY + buttonH/2 + 5);

        // ========== 顶部经验条 ==========
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        const expBarY = 50;
        const expBarHeight = 16;
        const expBarWidth = this.canvas.width * 0.6;
        const expBarX = (this.canvas.width - expBarWidth) / 2;
        const expPercent = Math.min(1, this.player.exp / this.player.expToNextLevel);

        // 等级文字在经验条上方
        ctx.fillText(`等级 ${this.player.level}`, this.canvas.width / 2, expBarY - 8);

        // 背景条
        ctx.fillStyle = '#333';
        ctx.fillRect(expBarX, expBarY, expBarWidth, expBarHeight);

        // 经验进度
        ctx.fillStyle = '#4169e1';
        ctx.fillRect(expBarX, expBarY, expBarWidth * expPercent, expBarHeight);

        // 边框
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(expBarX, expBarY, expBarWidth, expBarHeight);

        // ========== 中上方 全局时间 ==========
        const minutes = Math.floor(this.gameTime / 60);
        const seconds = Math.floor(this.gameTime % 60);
        ctx.fillStyle = '#cccccc';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`生存时间 ${minutes}:${seconds.toString().padStart(2, '0')}`, this.canvas.width / 2, expBarY + expBarHeight + 20);

        // ========== 左侧信息 ==========
        ctx.fillStyle = '#ffffff';
        ctx.font = '16px Arial';
        ctx.textAlign = 'left';
        let y = 95;
        const lineHeight = 22;

        ctx.fillText(`关卡：${STAGES[this.currentStage].name} ${this.currentStage + 1}/${STAGES.length}`, 10, y);
        y += lineHeight;
        // 修复：通过判断场上有没有 Boss 来显示文字，不再依赖旧变量
        const hasBoss = this.enemies.some(e => e.isBoss || e.isLevelBoss);
        ctx.fillText(`Boss：${hasBoss ? STAGES[this.currentStage].boss : '清小怪中'}`, 10, y);
        y += lineHeight;
        ctx.fillText(`HP: ${Math.ceil(this.player.hp)}/${this.player.maxHp}`, 10, y);
        y += lineHeight;
        ctx.fillText(`残响: ${this.currentResonance}`, 10, y);

        // 右侧显示当前波次
        const wave = Math.floor(this.gameTime / 60);
        ctx.textAlign = 'right';
        ctx.fillText(`第 ${wave + 1} 波`, this.canvas.width - 10, 95);

        // ========== 最右侧：已获得武器与被动技能状态栏 ==========
        const statusX = this.canvas.width - 180;
        const statusY = 140;
        const itemHeight = 22;
        const panelWidth = 170;

        // 精确计算背景总高度：顶部留白+标题 + 武器列表 + 间隙+被动标题 + 被动列表 + 底部留白
        const finalBoxHeight = 40 + (this.player.weapons.length * itemHeight) + 8 + itemHeight + (10 * itemHeight) + 15;

        // 半透明背景
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(statusX - 5, statusY - 25, panelWidth, finalBoxHeight);
        ctx.strokeStyle = '#666666';
        ctx.lineWidth = 1;
        ctx.strokeRect(statusX - 5, statusY - 25, panelWidth, finalBoxHeight);

        // 标题：武器
        ctx.fillStyle = '#b8860b';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('◆ 武器', statusX, statusY);
        let currentY = statusY + itemHeight;

        // 列出所有已获得武器
        const weaponNames = {
            'saber': '百炼环首刀',
            'spear': '透阵龙胆枪',
            'crossbow': '霹雳惊弦弓',
            'qinggang': '青釭·游龙剑',
            'shield': '八门金锁盾',
            'fist': '因果律偏转臂铠',
            'taiping': '太平要术·风火残页'
        };
        for (const weapon of this.player.weapons) {
            const name = weaponNames[weapon.type] || weapon.type;
            ctx.fillStyle = '#ffffff';
            ctx.font = '14px Arial';
            ctx.fillText(`${name}  Lv.${weapon.level}`, statusX + 8, currentY);
            currentY += itemHeight;
        }

        // 标题：被动技能
        currentY += 8;
        ctx.fillStyle = '#b8860b';
        ctx.font = 'bold 16px Arial';
        ctx.fillText('◆ 被动技能', statusX, currentY);
        currentY += itemHeight;

        // 列出所有被动技能及其当前等级
        const skillInfos = [
            { key: 'SPEED', name: '绝影无痕' },
            { key: 'DAMAGE', name: '陷阵杀气' },
            { key: 'COOLDOWN', name: '迅雷风烈' },
            { key: 'MAGNET', name: '摸金秘术' },
            { key: 'MAXHP', name: '虎卫霸体' },
            { key: 'AREA', name: '气吞山河' },
            { key: 'REGEN', name: '青囊秘卷' },
            { key: 'EXP', name: '天命所归' },
            { key: 'RESONANCE', name: '历史共鸣' },
            { key: 'ARMOR', name: '不动如山' }
        ];
        for (const info of skillInfos) {
            const level = this.player.inGameSkills[info.key];
            const metaLevel = this.player.metaSkills[info.key] || 0;
            const totalLevel = level + metaLevel * 0.05;
            ctx.fillStyle = level > 0 ? '#ffffff' : '#666666';
            ctx.font = '14px Arial';
            ctx.fillText(`${info.name}  Lv.${totalLevel.toFixed(1)}`, statusX + 8, currentY);
            currentY += itemHeight;
        }

        ctx.textAlign = 'left';

        // ========== 濒死呼吸红框警告特效：HP <= 20 触发 ==========
        if (this.player && this.player.hp <= 20 && this.player.hp > 0) {
            ctx.save();
            // 呼吸闪烁算法：透明度在 0.0 ~ 0.6 之间快速平滑波动
            const alpha = 0.3 + 0.3 * Math.sin(Date.now() / 150);
            const width = this.canvas.width;
            const height = this.canvas.height;

            // 全屏微红底色：增强压迫感
            ctx.fillStyle = `rgba(255, 0, 0, ${alpha * 0.15})`;
            ctx.fillRect(0, 0, width, height);

            // 暗红粗边框：沿屏幕边缘绘制
            ctx.strokeStyle = `rgba(139, 0, 0, ${alpha})`;
            ctx.lineWidth = 50;
            ctx.strokeRect(25, 25, width - 50, height - 50);

            ctx.restore();
        }
    }

    renderLevelUpMenu() {
        const ctx = this.ctx;

        // 先渲染游戏背景，再遮罩
        this.renderPlaying();

        // 全屏半透明黑色遮罩
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 标题
        ctx.fillStyle = '#b8860b';
        ctx.font = 'bold 40px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`升级！ 等级 ${this.player.level}`, this.canvas.width / 2, 100);

        ctx.fillStyle = '#ffffff';
        ctx.font = '20px Arial';
        ctx.fillText('选择一项增益', this.canvas.width / 2, 140);

        // 三个选项：屏幕中央横向排列
        const boxWidth = 200;
        const boxHeight = 300;
        const spacing = 50;
        const totalWidth = 3 * boxWidth + 2 * spacing;
        const startX = (this.canvas.width - totalWidth) / 2;
        const startY = (this.canvas.height - boxHeight) / 2;

        // 被动技能名称到key的映射
        const skillNameToKey = {
            '绝影无痕': 'SPEED',
            '陷阵杀气': 'DAMAGE',
            '迅雷风烈': 'COOLDOWN',
            '摸金秘术': 'MAGNET',
            '虎卫霸体': 'MAXHP',
            '气吞山河': 'AREA',
            '青囊秘卷': 'REGEN',
            '天命所归': 'EXP',
            '历史共鸣': 'RESONANCE',
            '不动如山': 'ARMOR'
        };

        this.levelUpOptions.forEach((option, index) => {
            const x = startX + index * (boxWidth + spacing);
            const y = startY;

            // 检测鼠标悬停，改变背景和边框
            const isHover = this.mouseX >= x && this.mouseX <= x + boxWidth && this.mouseY >= y && this.mouseY <= y + boxHeight;
            // 暗金色边框 + 深灰色底色
            ctx.fillStyle = isHover ? '#3a3a3a' : '#2a2a2a';
            ctx.fillRect(x, y, boxWidth, boxHeight);
            ctx.strokeStyle = isHover ? '#b8860b' : '#b8860b';
            ctx.lineWidth = isHover ? 4 : 2;
            ctx.strokeRect(x, y, boxWidth, boxHeight);

            // 技能名称/标题
            ctx.fillStyle = isHover ? '#b8860b' : '#ffffff';
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(option.title, x + boxWidth / 2, y + 35);

            // 技能描述 - 自动换行
            ctx.fillStyle = '#cccccc';
            ctx.font = '14px Arial';
            // 计算文字起始位置，使用自动换行
            const descX = x + boxWidth / 2;
            const descY = y + 65;
            const maxWidth = boxWidth - 20;
            this.fillTextWrapped(ctx, option.desc, descX, descY, maxWidth, 20, 'center');

            // 如果是被动技能，显示当前局内等级
            let skillKey = null;
            if (option.type === 'passive') {
                skillKey = option.skillKey;
            } else {
                // 从映射表查找
                skillKey = skillNameToKey[option.title.split(' ')[0]];
            }
            if (option.type === 'passive' && skillKey !== undefined) {
                const currentLevel = this.player.inGameSkills[skillKey];
                ctx.fillStyle = '#b8860b';
                ctx.font = 'bold 28px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(`LV: ${currentLevel}`, x + boxWidth / 2, y + boxHeight - 30);
            }
        });

        ctx.textAlign = 'center';
        ctx.fillStyle = '#cccccc';
        ctx.font = '16px Arial';
        ctx.fillText('点击卡片选择', this.canvas.width / 2, startY + boxHeight + 30);

        // ========== 刷新选项按钮 ==========
        const rerollButtonW = 220;
        const rerollButtonH = 40;
        const rerollX = (this.canvas.width - rerollButtonW) / 2;
        const rerollY = startY + boxHeight + 60;
        this.rerollButtonRect = { x: rerollX, y: rerollY, width: rerollButtonW, height: rerollButtonH };

        const hasRerolls = this.player.rerolls > 0;
        // 按钮背景
        ctx.fillStyle = hasRerolls ? (this.rerollHover ? '#3a3a3a' : '#2a2a2a') : '#1a1a1a';
        ctx.fillRect(rerollX, rerollY, rerollButtonW, rerollButtonH);
        // 边框
        ctx.strokeStyle = hasRerolls ? '#b8860b' : '#444444';
        ctx.lineWidth = hasRerolls ? 3 : 2;
        ctx.strokeRect(rerollX, rerollY, rerollButtonW, rerollButtonH);
        // 文字
        ctx.fillStyle = hasRerolls ? '#ffffff' : '#666666';
        ctx.font = 'bold 16px Arial';
        ctx.fillText(`刷新选项 (剩余: ${this.player.rerolls}次)`, this.canvas.width / 2, rerollY + rerollButtonH / 2 + 5);

        ctx.textAlign = 'left';
    }

    renderGameOver() {
        const ctx = this.ctx;
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        ctx.fillStyle = '#ff4444';
        ctx.font = 'bold 50px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', this.canvas.width / 2, 180);

        ctx.fillStyle = '#cccccc';
        ctx.font = '24px Arial';
        ctx.fillText('历史推演失败', this.canvas.width / 2, 240);
        ctx.fillText('回到最初的开始吧~', this.canvas.width / 2, 275);
        ctx.fillText(`存活时间：${Math.floor(this.gameTime / 60)}:${(Math.floor(this.gameTime % 60)).toString().padStart(2, '0')}`, this.canvas.width / 2, 315);
        ctx.fillText(`本局等级：${this.player.level}`, this.canvas.width / 2, 355);
        ctx.fillText(`获得历史残响：${this.currentResonance}`, this.canvas.width / 2, 395);
        ctx.fillText(`累计残响：${this.totalResonance}`, this.canvas.width / 2, 435);

        ctx.fillStyle = '#ffa500';
        ctx.font = '20px Arial';
        ctx.fillText('按 R 键重新跃迁', this.canvas.width / 2, 480);

        ctx.textAlign = 'left';
        // 单个按钮：重启时空，居中显示
        this.drawButton(this.canvas.width / 2 - 150, 510, 300, 70, '#2a3a4d', '#ffffff', '重启时空');
    }

    renderPaused() {
        const ctx = this.ctx;
        // 先渲染游戏背景，然后加遮罩
        this.renderPlaying();

        // 半透明黑色遮罩
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 文字
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 40px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('已暂停', this.canvas.width / 2, this.canvas.height / 2 - 20);
        ctx.font = '18px Arial';
        ctx.fillStyle = '#cccccc';
        ctx.fillText('(PAUSED)', this.canvas.width / 2, this.canvas.height / 2 + 20);
        ctx.fillText('按 ESC 或 P 继续', this.canvas.width / 2, this.canvas.height / 2 + 55);
    }

    renderVictory() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const cx = w / 2;
        const cy = h / 2;

        // 1. 时空隧道的全息暗网背景
        const gradient = ctx.createLinearGradient(0, 0, 0, h);
        gradient.addColorStop(0, '#020810');
        gradient.addColorStop(1, '#001100');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);

        // 2. 混合特效：历史余烬 + 数字乱码
        const time = Date.now() / 1000;
        for (let i = 0; i < 50; i++) {
            const isDigital = i % 2 === 0;
            const px = (Math.sin(time * 0.3 + i * 1.5) * (w / 3) + cx + (i * 83) % w - w / 2) % w;
            const py = h - ((time * (isDigital ? 120 : 60) + i * 37) % h);

            if (isDigital) {
                ctx.fillStyle = `rgba(0, 255, 204, ${0.1 + GameRuntime.random() * 0.3})`;
                ctx.font = '12px "Courier New"';
                ctx.fillText(GameRuntime.random() > 0.5 ? '1' : '0', Math.abs(px), py);
            } else {
                const radius = (Math.sin(time * 2 + i) + 1) * 1.5 + 1;
                ctx.fillStyle = 'rgba(255, 69, 0, 0.5)';
                ctx.beginPath();
                ctx.arc(Math.abs(px), py, radius, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // 3. 紧凑面板布局 (660x460)
        const boxW = 660;
        const boxH = 460;
        const boxX = cx - boxW / 2;
        const boxY = cy - boxH / 2;

        // 面板底色与边框
        ctx.fillStyle = 'rgba(0, 20, 20, 0.85)';
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.strokeStyle = '#00ffcc';
        ctx.lineWidth = 1;
        ctx.strokeRect(boxX, boxY, boxW, boxH);

        // 左侧青色高亮装饰条
        ctx.fillStyle = '#00ffcc';
        ctx.fillRect(boxX, boxY, 4, boxH);

        // 扫描线装饰
        ctx.fillStyle = 'rgba(0, 255, 204, 0.05)';
        ctx.fillRect(boxX, boxY + (Date.now() / 10 % boxH), boxW, 2);

        // 4. 赛博+史诗 主标题 (面板内部顶部居中)
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00ffcc';
        ctx.fillStyle = '#00ffcc';
        ctx.font = 'bold 36px "黑体", Arial';
        ctx.textAlign = 'center';
        ctx.fillText('>> 历史锚点：修复完毕', boxX + boxW / 2, boxY + 60);
        ctx.shadowBlur = 0;

        // 5. 系统日志 (固定左对齐)
        ctx.textAlign = 'left';
        ctx.fillStyle = '#cccccc';
        ctx.font = '16px "Courier New", "楷体"';
        ctx.fillText('[SYS_LOG] STATUS: 目标载具（二位夫人）已接入安全航线', boxX + 50, boxY + 120);
        ctx.fillText('[SYS_LOG] RESULT: 完美复刻历史模块「千里走单骑」，时空坍塌危机解除', boxX + 50, boxY + 150);

        // 6. 加密档案块
        ctx.fillStyle = '#8a6b22';
        ctx.font = 'italic 16px "Courier New", Arial';
        ctx.fillText('<已解密档案 100% | 来源：罗贯中数据库>', boxX + 50, boxY + 200);

        // ================= 核心修改：诗句加粗、放大、高亮纯金 =================
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold italic 22px "楷体", "STKaiti", serif';
        ctx.fillText('“挂印封金辞汉相，寻兄遥望远途还。', boxX + 60, boxY + 235);
        ctx.fillText('马骑赤兔行千里，刀偃青龙出五关。”', boxX + 60 + 22 + 50, boxY + 270);

        // 7. 数据结算对齐（整体居中）
        const statsStartY = boxY + 330;
        const lineH = 30;
        const labelX = boxX + 130;   // 整体居中偏移后的标签列X
        const valueX = boxX + 350;  // 整体居中偏移后的数值列X

        // Label 列
        ctx.fillStyle = '#00ffcc';
        ctx.font = '18px "Courier New", Arial';
        ctx.fillText('[ 跃迁驻留时长 ]', labelX, statsStartY);
        ctx.fillText('[ 义体同步率等级 ]', labelX, statsStartY + lineH);
        ctx.fillText('[ 历史残响提取量 ]', labelX, statsStartY + lineH * 2);
        ctx.fillText('[ 枢纽总储备矩阵 ]', labelX, statsStartY + lineH * 3);

        // Value 列
        // ================= 核心修改：所有数据统一样式、加粗、高亮 =================
        ctx.font = 'bold 20px "Courier New", Arial';
        ctx.fillStyle = '#ffd700';

        const minutes = Math.floor(this.gameTime / 60);
        const seconds = (Math.floor(this.gameTime % 60)).toString().padStart(2, '0');
        ctx.fillText(`${minutes}:${seconds}`, valueX, statsStartY);

        ctx.fillText(`Lv.${this.player.level}`, valueX, statsStartY + lineH);

        ctx.fillText(`+${this.currentResonance}`, valueX, statsStartY + lineH * 2);

        ctx.fillStyle = '#ff8c00'; // 最后一项枢纽总额用偏橙色区分
        ctx.fillText(`${this.totalResonance}`, valueX, statsStartY + lineH * 3);

        // 8. 底部交互按钮
        ctx.textAlign = 'left'; // 还原对齐方式供 drawButton 使用
        // 保存按钮坐标用于点击检测
        this.victoryButton = {
            x: cx - 150,
            y: boxY + boxH + 30,
            w: 300,
            h: 60
        };
        this.drawButton(this.victoryButton.x, this.victoryButton.y, this.victoryButton.w, this.victoryButton.h, '#002222', '#00ffcc', '断开链接 / 返回枢纽');
    }

    render(deltaTime) {
        switch (this.gameState) {
            case GAME_STATE.MENU:
                this.renderMainMenu();
                break;
            case GAME_STATE.PERK_UPGRADE:
                this.renderPerkUpgrade();
                break;
            case GAME_STATE.PLAYING:
                this.renderPlaying();
                break;
            case GAME_STATE.PAUSED:
                this.renderPaused();
                break;
            case GAME_STATE.LEVEL_UP:
                this.renderLevelUpMenu();
                break;
            case GAME_STATE.GAME_OVER:
                this.renderGameOver();
                break;
            case GAME_STATE.VICTORY:
                this.renderVictory();
                break;
            case GAME_STATE.CUTSCENE:
                this.renderCutscene(deltaTime);
                break;
        }
    }

    handleLevelUpKey(key) {
        if (this.gameState !== GAME_STATE.LEVEL_UP) return false;
        const num = parseInt(key);
        if (num >= 1 && num <= 3 && this.levelUpOptions[num - 1]) {
            this.selectLevelUpOption(num - 1);
            return true;
        }
        return false;
    }

    gameLoop(currentTime) {
        if (!GameRuntime.ready()) {
            this.render();
            requestAnimationFrame(this.gameLoop);
            return;
        }

        const deltaTime = GameRuntime.useFixedDelta()
            ? GameRuntime.fixedDelta()
            : (this.lastTime ? (currentTime - this.lastTime) / 1000 : 0);
        this.lastTime = currentTime;
        GameRuntime.beginFrame(this);

        // 如果处于顿帧状态，跳过逻辑更新，只做渲染（制造卡肉感）
        if (this.hitstopTimer > 0) {
            this.hitstopTimer -= deltaTime;
            this.render();
            GameRuntime.endFrame(this);
            if (GameRuntime.shouldStop()) return;
            requestAnimationFrame(this.gameLoop);
            return;
        }

        // 暂停切换：ESC 或 P
        if (this.gameState === GAME_STATE.PLAYING && (this.keys['escape'] || this.keys['p'])) {
            this.gameState = GAME_STATE.PAUSED;
            this.keys['escape'] = false;
            this.keys['p'] = false;
        } else if (this.gameState === GAME_STATE.PAUSED && (this.keys['escape'] || this.keys['p'])) {
            this.gameState = GAME_STATE.PLAYING;
            this.keys['escape'] = false;
            this.keys['p'] = false;
        }

        // 游戏结束按R重开
        if (this.gameState === GAME_STATE.GAME_OVER && this.keys['r']) {
            this.restartGame();
            this.keys['r'] = false;
        }

        // 数字键选择升级，R键刷新选项
        if (this.gameState === GAME_STATE.LEVEL_UP) {
            for (let i = 1; i <= 3; i++) {
                if (this.keys[i.toString()]) {
                    this.handleLevelUpKey(i.toString());
                    this.keys[i.toString()] = false;
                    break;
                }
            }
            // R键触发刷新
            if (this.keys['r']) {
                this.keys['r'] = false;
                if (this.player.rerolls > 0) {
                    this.player.rerolls--;
                    this.levelUpOptions = this.generateLevelUpOptions();
                }
            }
        }

        // 点击返回在菜单点击处理，但游戏结束/胜利也点按钮返回
        if ((this.gameState === GAME_STATE.GAME_OVER || this.gameState === GAME_STATE.VICTORY) && this.keys['enter']) {
            this.returnToMenu();
            this.keys['enter'] = false;
        }

        if (this.legacySystemPipeline && this.gameState === GAME_STATE.PLAYING) {
            this.legacySystemPipeline.update(this, deltaTime);
        } else {
            this.handleInput(deltaTime);
            // 只在 PLAYING 状态执行更新
            if (this.gameState === GAME_STATE.PLAYING) {
                this.update(deltaTime);
            }
            this.render(deltaTime);
        }
        GameRuntime.endFrame(this);

        if (GameRuntime.shouldStop()) return;
        requestAnimationFrame(this.gameLoop);
    }
}

// 初始化游戏
window.addEventListener('load', () => {
    new GameManager();
});
