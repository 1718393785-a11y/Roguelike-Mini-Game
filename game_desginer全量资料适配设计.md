# game_desginer 全量资料适配设计

> 识别目录：`D:\Codex\Codex game design\game_desginer`  
> 目标项目：`D:\Codex\Codex game design\zero_downtime_refactor`  
> 结论：该目录是一套“美术生产资料包”，可以作为资源接入的输入源，但不能原样直接进入运行时代码。需要先规范命名、补齐缺口、建立 manifest/schema，再通过 Feature Flag 分阶段接入。

## 1. 文件识别结果

| 文件 | 类型 | 识别结果 | 适配定位 |
|---|---|---|---|
| `美术资源生成方案.md` | 设计文档 | 武器、敌人、技能、UI、映射、自动化流程的文字方案 | 作为 `assets/style-bible.md` 和提示词设计源 |
| `asset-generation-queue.json` | 提示词队列 | 有效 JSON，包含 67 个待生成资源条目 | 拆分为 `assets/prompts/*.json`，作为批量生成输入 |
| `asset-mapping-template.json` | 资源映射模板 | 有效 JSON，包含武器/敌人/Boss/技能/UI/拾取物映射 | 迁移为 `assets/asset-manifest.json` 的 seed，不建议原样使用 |
| `tools/AssetLoader.ts` | TS 加载器草案 | 有 `AssetMapping`、`AssetLoader`、缓存与 fallback | 作为参考实现，需改造成零停机 AssetRuntime |

结构化统计：

| 类别 | 数量 |
|---|---:|
| 武器图标 | 36 |
| 普通敌人 | 6 |
| Boss | 5 |
| 被动技能 | 10 |
| UI | 5 |
| 拾取物 | 4 |
| 合计 | 67 |

## 2. 当前资料包的可用性判断

### 可直接吸收

| 内容 | 处理方式 |
|---|---|
| 6 把武器 × 6 级图标设计 | 直接转成 `assets/prompts/weapons.prompts.json` |
| 6 种普通敌人设计 | 直接转成 `assets/prompts/enemies.prompts.json`，但需补动画状态 |
| 5 个 Boss 设计 | 直接转成 `assets/prompts/bosses.prompts.json` |
| 10 个被动技能图标 | 直接转成 `assets/prompts/skills.prompts.json` |
| UI 5 类提示词 | 可转成 `assets/prompts/ui.prompts.json`，但实际接入要只取边框/底纹，不要整张固定文字图 |
| mapping 模板的分类结构 | 可作为 manifest 初稿 |

### 不能原样使用

| 问题 | 影响 | 修正 |
|---|---|---|
| `asset-generation-queue.json` 文件名与 mapping 模板不一致 | 生成出的文件无法按模板加载 | 统一为一种命名标准 |
| mapping 里没有 player/effects/tiles/atlas | 美术接入缺主角、特效、地图和 Pixi 贴图基础 | 扩展 manifest schema |
| pickup 只有 4 个 | 游戏实际有 `EXP`、`BOSS_EXP`、`RESONANCE`、`BUN`、`CHICKEN`、`MAGNET` 6 类 | 补 `boss_exp`、`chicken` |
| 敌人只有静态图 | 大量敌人会显得僵硬，Boss 行为也无法表达 | 分档补 idle/move/attack 状态 |
| `AssetLoader.ts` 初始化失败会 throw | 资源缺失会中断游戏，不符合零停机 | 改成失败记录状态，渲染层自动 fallback |
| `AssetLoader.ts` 返回 fallback 图片 | 会把缺图画成问号，破坏现有视觉 | 运行时应返回 `null`，由原 Canvas 绘制兜底 |
| UI 资源是整屏/整面板图 | 文字、分辨率、响应式会被锁死 | UI 只做皮肤切片，文字仍由 Canvas 绘制 |
| 没有资源质量校验 | 可能导入空白图、无透明通道或大图 | 必须新增 `validate-assets.mjs` |

## 3. 命名规范统一

当前存在两套命名：

```text
queue:   asset_weapon_saber_1.png
mapping: weapons/saber_level_1.png
```

建议统一为更可扩展的命名：

```text
assets/weapons/asset_weapon_saber_lv1.png
assets/weapons/asset_weapon_saber_lv6_ultimate.png
assets/enemies/asset_enemy_soldier_idle_01.png
assets/bosses/asset_boss_kongxiu_idle_01.png
assets/skills/asset_skill_DAMAGE.png
assets/pickups/asset_pickup_exp.png
assets/ui/asset_ui_upgrade_panel_frame.png
assets/effects/asset_effect_crossbow_arrow.png
assets/tiles/asset_tile_battlefield_dirt_01.png
```

迁移规则：

| 原字段 | 新字段 |
|---|---|
| `filename: asset_weapon_saber_1.png` | `output: assets/weapons/asset_weapon_saber_lv1.png` |
| `category: boss` | `category: enemy`, `subtype: boss` 或独立 `bosses` 均可，但 manifest 要固定 |
| `size: "512x512"` | `sourceSize: [512, 512]` |
| `weapon_id` | `id` |
| `level` | `level` |
| `is_ultimate` | `tags: ["ultimate"]` |

## 4. Manifest 适配设计

`asset-mapping-template.json` 应升级为 `assets/asset-manifest.json`。

推荐结构：

```json
{
  "version": "1.0.0",
  "basePath": "assets/",
  "fallback": "canvas",
  "weapons": {
    "saber": {
      "levels": {
        "1": {
          "src": "weapons/asset_weapon_saber_lv1.png",
          "sourceSize": [512, 512],
          "usage": ["upgrade_panel", "cooldown_hud"]
        }
      }
    }
  },
  "player": {
    "guanyu": {
      "idle": {
        "frames": ["player/asset_player_guanyu_idle_01.png"],
        "sourceSize": [256, 256],
        "anchor": [0.5, 0.78],
        "worldSize": 30
      }
    }
  },
  "enemies": {},
  "bosses": {},
  "skills": {},
  "pickups": {},
  "effects": {},
  "ui": {},
  "tiles": {},
  "atlases": {}
}
```

必须加 Zod schema：

| 字段 | 规则 |
|---|---|
| `version` | semver 字符串 |
| `basePath` | 相对路径，不能跳出项目 |
| `src` | 只允许 `assets/` 下 PNG/WebP/JSON |
| `sourceSize` | 二元数组，最大建议 4096 |
| `anchor` | `[0..1, 0..1]` |
| `worldSize` | 与游戏实体 size 对齐 |
| `frames` | 至少 1 帧，最多按类别限制 |

## 5. 提示词队列适配设计

`asset-generation-queue.json` 不应直接作为生产队列使用，应拆分并补字段。

目标输出：

```text
assets/prompts/weapons.prompts.json
assets/prompts/enemies.prompts.json
assets/prompts/bosses.prompts.json
assets/prompts/skills.prompts.json
assets/prompts/pickups.prompts.json
assets/prompts/ui.prompts.json
assets/prompts/player.prompts.json
assets/prompts/effects.prompts.json
assets/prompts/tiles.prompts.json
```

统一条目格式：

```json
{
  "id": "saber",
  "category": "weapon",
  "level": 1,
  "output": "assets/weapons/asset_weapon_saber_lv1.png",
  "sourceSize": [512, 512],
  "runtimeSize": [64, 64],
  "prompt": "...",
  "negativePrompt": "...",
  "requiresTransparency": true,
  "styleTags": ["dark-three-kingdoms", "top-down-45", "high-contrast"]
}
```

补充队列：

| 新增类别 | 必要性 | 最小数量 |
|---|---|---:|
| player | 主角当前缺失 | 4-8 |
| effects | 运行时武器特效缺失 | 10-16 |
| tiles | 大地图背景缺失 | 4-8 |
| atlas | Pixi 纹理后端需要 | 1 manifest |
| pickup 补全 | `BOSS_EXP`、`CHICKEN` 缺失 | 2 |
| enemy animation | 敌人状态帧缺失 | 约 12-24 |

## 6. AssetLoader.ts 适配设计

原 `tools/AssetLoader.ts` 的方向是对的，但必须改为项目内两层结构。

### 6.1 TS 架构层

落点：

```text
src/render/AssetManifestSchema.ts
src/render/AssetLoader.ts
```

职责：

| 文件 | 职责 |
|---|---|
| `AssetManifestSchema.ts` | Zod 校验 manifest |
| `AssetLoader.ts` | 纯加载、缓存、状态，不直接决定绘制逻辑 |

关键调整：

1. `initialize()` 不能因为资源缺失中断游戏。
2. `getWeaponSprite()` 等接口返回 `HTMLImageElement | null`。
3. 缺图时由调用方继续走原 Canvas 绘制。
4. 所有加载状态写入 `window.__ASSET_STATUS__`，便于自动化检查。
5. 提供 `preloadGroup(group)`，不要一次性加载所有大图。

### 6.2 game.js 运行时桥接层

当前实际游戏入口仍是 `game.js`，所以还需要一个轻量 JS 桥接：

```text
AssetRuntime.js
```

职责：

| 功能 | 要求 |
|---|---|
| 初始化 | `ENABLE_ART_ASSETS` 开启时才执行 |
| 读取 manifest | 失败不抛出，只记录状态 |
| 绘制辅助 | `drawAssetOrFallback(ctx, key, drawFallback)` |
| 缓存 | `Map<string, HTMLImageElement>` |
| 热更新 | 后续可接 `ENABLE_HOT_RELOAD`，先不做 |

## 7. 游戏侧接入点

| 资源类别 | 当前代码位置 | 接入方式 | 优先级 |
|---|---|---|---|
| 武器图标 | 升级选项、武器冷却 HUD | 图片存在时绘制图标，否则文字/色块 | P1 |
| 技能图标 | 升级选项、局外升级 | 图片存在时绘制图标 | P1 |
| pickup | `Pickup.render(ctx)` | `drawImage` 替换内部主体，保留光圈 | P2 |
| 木箱 | `DestructibleProp.render(ctx)` | 按血量选 intact/cracked | P2 |
| 普通敌人 | `Enemy.render(ctx)` | 精灵替换主体，保留血条/光环 | P3 |
| Boss | `Boss.render(ctx)` | 精灵替换主体，保留 Boss UI | P3 |
| 玩家 | `Player.render(ctx)` | idle/move/hit 图，保留无敌闪烁 | P4 |
| 武器特效 | 各 Weapon/Effect render | 单个武器逐个灰度替换 | P5 |
| UI 皮肤 | `renderMenu/renderLevelUp/renderHUD` | 切片/边框，不用整屏文字图 | P6 |
| 大地图 tile | `renderScrollingBackground` | tile drawImage，保留网格 fallback | P6 |
| Pixi | `LegacyPixiOverlayRenderer` / `src/render` | 初始化纹理 + SpritePool | P7 |

## 8. 分阶段适配步骤

### 阶段 1：资料归档与格式标准化

目标：把 `game_desginer` 作为输入源归档到项目，但不影响游戏。

动作：

1. 新建 `assets/source/game_desginer/`。
2. 复制 4 个源文件到该目录。
3. 新建 `assets/style-bible.md`，提炼原文档风格规则。
4. 新建 `assets/asset-manifest.json` 空壳。
5. 新增美术 Feature Flags，全部默认关闭。

验收：

```text
node --check game.js
npm run typecheck
npm run check:architecture
```

提交：

```text
chore: 归档美术设计资料并建立资源标准
```

### 阶段 2：生成规范化 prompts

目标：把现有 67 条队列拆分并修正命名。

动作：

1. 新增 `tools/normalize-asset-queue.mjs`。
2. 输入 `assets/source/game_desginer/asset-generation-queue.json`。
3. 输出 `assets/prompts/*.prompts.json`。
4. 自动把 `asset_weapon_saber_1.png` 改为 `assets/weapons/asset_weapon_saber_lv1.png`。
5. 生成缺口报告：player/effects/tiles/pickup 缺失项。

验收：

```text
node tools\normalize-asset-queue.mjs
```

提交：

```text
chore: 规范化美术生成提示词队列
```

### 阶段 3：补齐缺口 prompts

目标：美术生产前先补齐所有必须资源。

动作：

1. 新增玩家 prompts。
2. 新增 `BOSS_EXP`、`CHICKEN` pickup prompts。
3. 新增战斗特效 prompts。
4. 新增大地图 tile prompts。
5. 新增敌人动画状态 prompts。

验收：

```text
node tools\validate-asset-prompts.mjs
```

提交：

```text
docs: 补齐玩家特效与地图资源提示词
```

### 阶段 4：Manifest 与资源校验器

目标：资源没生成前也能校验结构；资源生成后能校验文件。

动作：

1. 新增 `src/render/AssetManifestSchema.ts`。
2. 新增 `tools/validate-assets.mjs`。
3. 支持 `--allow-missing`。
4. 检查 PNG 尺寸、透明通道、非空像素、路径安全。

验收：

```text
node tools\validate-assets.mjs --allow-missing
```

提交：

```text
chore: 添加美术资源manifest校验
```

### 阶段 5：只加载不渲染

目标：先证明资源系统不会影响玩法。

动作：

1. 新增 `AssetRuntime.js` 或接入 `src/render/AssetLoader.ts` 构建产物。
2. `ENABLE_ART_ASSETS=false` 默认不加载。
3. `?artAssets=1` 时加载 manifest，但不替换绘制。
4. 输出 `window.__ASSET_STATUS__`。

验收：

```text
node tools\run-baseline.mjs --browser chrome --seed 12345 --record records\smoke.json --seconds 120
node tools\run-baseline.mjs --browser chrome --seed 12345 --record records\smoke.json --seconds 120 --art-assets
```

状态快照必须 100% 一致。

提交：

```text
feat: 接入美术资源加载状态系统
```

### 阶段 6：低风险 UI 图标接入

目标：先替换非战斗实体资源。

动作：

1. 武器图标接升级面板。
2. 技能图标接升级面板/局外升级。
3. 冷却 HUD 可显示武器小图标。
4. 缺图走原文字显示。

验收：

```text
npm run baseline:flags -- --seed 12345 --record records\smoke.json --seconds 120
```

提交：

```text
feat: 接入武器与技能图标资源
```

### 阶段 7：掉落物与木箱接入

目标：替换逻辑简单、数量可控的实体。

动作：

1. `Pickup.render(ctx)` 支持图片主体。
2. `BOSS_EXP`、`EXP`、`RESONANCE`、`BUN`、`CHICKEN`、`MAGNET` 全覆盖。
3. 木箱按血量切换 intact/cracked。
4. 保留原 Canvas 发光和文字反馈。

验收：

```text
npm run validate:entity-stress
node tools\run-baseline.mjs --browser chrome --large-map-camera --scrolling-background --seed 12345 --record records\smoke.json --seconds 120
```

提交：

```text
feat: 接入掉落物与木箱资源
```

### 阶段 8：敌人与 Boss 静态精灵

目标：替换外观，不改 AI、碰撞、血量、大小。

动作：

1. `Enemy.render(ctx)` 使用 `enemy.assetId` 查图。
2. `Boss.render(ctx)` 按 stage/boss id 查图。
3. 保留血条、精英标识、Boss 光环。
4. 继续使用视野裁剪。

验收：

```text
npm run validate:entity-stress
npm run baseline:flags -- --seed 12345 --record records\smoke.json --seconds 120
```

提交：

```text
feat: 接入敌人与Boss静态精灵
```

### 阶段 9：玩家与动画帧

目标：接入主角，但保持碰撞和输入完全不变。

动作：

1. idle/move/hit/dead 最小帧集。
2. 基于移动状态选动画。
3. 面向方向先用翻转/旋转，不急着生成八方向。
4. 受击无敌继续用透明闪烁。

验收：

```text
node tools\run-baseline.mjs --browser chrome --seed 12345 --record records\smoke.json --seconds 120 --art-assets --art-player-sprite
```

提交：

```text
feat: 接入玩家角色精灵
```

### 阶段 10：特效、地图、Pixi 后端

目标：在资源稳定后处理高风险视觉层。

动作：

1. 弩箭/飞剑单 sprite 先接。
2. 刀光/枪芒再接。
3. 盾波/火墙/雷柱逐个灰度。
4. 大地图 tile 接入 `renderScrollingBackground`。
5. Pixi 后端把 manifest 资源烘焙进 `TextureBaker`，运行时只走 `SpritePool`。

验收：

```text
npm run baseline:generic-weapon-levels
npm run validate:pixi-renderer
npm run validate:entity-stress
```

提交：

```text
feat: 接入战斗特效与地图贴图资源
feat: 适配Pixi贴图资源后端
```

## 9. 适配后的目录设计

```text
zero_downtime_refactor/
├── assets/
│   ├── source/
│   │   └── game_desginer/
│   │       ├── 美术资源生成方案.md
│   │       ├── asset-generation-queue.json
│   │       ├── asset-mapping-template.json
│   │       └── tools/
│   │           └── AssetLoader.ts
│   ├── asset-manifest.json
│   ├── style-bible.md
│   ├── prompts/
│   ├── weapons/
│   ├── enemies/
│   ├── bosses/
│   ├── player/
│   ├── skills/
│   ├── pickups/
│   ├── effects/
│   ├── tiles/
│   ├── ui/
│   └── atlases/
├── src/
│   └── render/
│       ├── AssetManifestSchema.ts
│       └── AssetLoader.ts
└── tools/
    ├── normalize-asset-queue.mjs
    ├── validate-asset-prompts.mjs
    ├── validate-assets.mjs
    └── build-asset-manifest.mjs
```

## 10. 最终建议

`game_desginer` 目录已经足够作为美术接入的第一批资料源，但不要先写渲染代码。正确顺序是：

1. 先归档资料。
2. 统一命名。
3. 拆分 prompts。
4. 补玩家/特效/地图/pickup 缺口。
5. 建 manifest 和校验器。
6. 加 AssetLoader 但不渲染。
7. 从图标开始，逐类开启美术资源。

这样能保持当前零停机原则：每个阶段都有开关，资源坏了就回退到原 Canvas 绘制，玩法快照仍然可对照。
