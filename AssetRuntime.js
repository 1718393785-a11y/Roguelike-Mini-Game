(function () {
    class AssetRuntime {
        constructor() {
            this.ready = false;
            this.failed = false;
            this.manifest = null;
            this.basePath = 'assets/';
            this.cache = new Map();
            this.errors = [];
            this.loaded = 0;
            this.requested = 0;
            window.__ASSET_STATUS__ = this.getStatus();
        }

        async initialize(manifestPath = 'assets/asset-manifest.json') {
            try {
                const response = await fetch(manifestPath, { cache: 'no-store' });
                if (!response.ok) throw new Error(`manifest fetch failed: ${response.status}`);
                this.manifest = await response.json();
                this.basePath = this.manifest.basePath || 'assets/';
                this.ready = true;
            } catch (error) {
                this.failed = true;
                this.errors.push(String(error && error.message ? error.message : error));
            }
            this.publishStatus();
            return this.ready;
        }

        async preloadAll(plan = 'all') {
            if (!this.ready || !this.manifest) return { ok: false, total: 0, failed: 0 };
            const paths = this.collectRuntimeAssetPaths(plan);
            const results = await Promise.all(paths.map(path => this.loadImage(path)));
            const failed = results.filter(result => !result.ok).length;
            const summary = {
                plan,
                ok: failed === 0,
                total: results.length,
                loaded: results.length - failed,
                failed,
                errors: this.errors.slice(-10),
            };
            window.__ASSET_PRELOAD__ = summary;
            this.publishStatus();
            return summary;
        }

        preloadDeferred(plan = 'all') {
            return this.preloadAll(plan).then(summary => {
                window.__ASSET_DEFERRED_PRELOAD__ = summary;
                return summary;
            });
        }

        collectRuntimeAssetPaths(plan = 'all') {
            const paths = new Set();
            const collectEntry = (entry) => {
                if (!entry || typeof entry !== 'object') return;
                if (typeof entry.src === 'string') paths.add(this.basePath + entry.src);
                if (Array.isArray(entry.frames)) {
                    for (const frame of entry.frames) {
                        if (typeof frame === 'string') paths.add(this.basePath + frame);
                    }
                }
            };
            const visit = (value) => {
                if (!value || typeof value !== 'object') return;
                if (typeof value.src === 'string' || Array.isArray(value.frames)) {
                    collectEntry(value);
                    return;
                }
                for (const nested of Object.values(value)) {
                    visit(nested);
                }
            };

            const sections = plan === 'critical'
                ? [
                    ['weapons'],
                    ['skills'],
                    ['pickups'],
                    ['player'],
                    ['enemies'],
                    ['effects'],
                    ['ui'],
                    ['tiles'],
                ]
                : [
                    ['weapons'],
                    ['skills'],
                    ['pickups'],
                    ['player'],
                    ['enemies'],
                    ['bosses'],
                    ['effects'],
                    ['ui'],
                    ['tiles'],
                ];

            for (const [section] of sections) {
                visit(this.manifest?.[section]);
            }
            return Array.from(paths);
        }

        loadImage(path) {
            if (this.cache.has(path)) {
                const cached = this.cache.get(path);
                if (cached.complete) {
                    const ok = cached.naturalWidth > 0 && cached.naturalHeight > 0;
                    return Promise.resolve({ ok, path });
                }
                return new Promise(resolve => {
                    cached.addEventListener('load', () => resolve({ ok: true, path }), { once: true });
                    cached.addEventListener('error', () => resolve({ ok: false, path }), { once: true });
                });
            }

            const image = new Image();
            const done = (ok) => {
                if (ok) {
                    this.loaded++;
                } else {
                    this.errors.push(`image load failed: ${path}`);
                }
                this.publishStatus();
                return { ok, path };
            };

            this.requested++;
            this.cache.set(path, image);
            this.publishStatus();

            return new Promise(resolve => {
                image.onload = () => resolve(done(true));
                image.onerror = () => resolve(done(false));
                image.src = path;
            });
        }

        getWeaponIcon(weaponId, level = 1) {
            const weapon = this.manifest?.weapons?.[weaponId];
            const entry = weapon?.levels?.[String(Math.max(1, Math.min(6, level)))] || weapon?.levels?.['1'];
            return this.resolveImage(entry?.src);
        }

        getSkillIcon(skillId) {
            return this.resolveImage(this.manifest?.skills?.[skillId]?.src);
        }

        getPickupIcon(pickupId) {
            return this.resolveImage(this.manifest?.pickups?.[pickupId]?.src);
        }

        getEnemySprite(enemyId, state = 'idle', frameIndex = 0) {
            const states = this.manifest?.enemies?.[enemyId];
            const entry = states?.[state] || states?.idle;
            const frames = entry?.frames || [];
            const src = frames.length > 0 ? frames[Math.abs(frameIndex) % frames.length] : entry?.src;
            return this.resolveImage(src);
        }

        getPlayerSprite(playerId = 'guanyu', state = 'idle', frameIndex = 0) {
            const states = this.manifest?.player?.[playerId];
            const entry = states?.[state] || states?.idle;
            if (!entry) return null;
            const frames = entry.frames || [];
            const src = frames.length > 0 ? frames[Math.abs(frameIndex) % frames.length] : entry.src;
            return this.resolveImage(src);
        }

        getBossSprite(bossId, state = 'idle', frameIndex = 0) {
            const states = this.manifest?.bosses?.[bossId];
            const entry = states?.[state] || states?.idle;
            const frames = entry?.frames || [];
            const src = frames.length > 0 ? frames[Math.abs(frameIndex) % frames.length] : entry?.src;
            return this.resolveImage(src);
        }

        getBossWorldSize(bossId, state = 'idle') {
            const entry = this.manifest?.bosses?.[bossId]?.[state];
            const size = Number(entry?.worldSize);
            return Number.isFinite(size) && size > 0 ? size : null;
        }

        getTileTexture(tileId) {
            return this.resolveImage(this.manifest?.tiles?.[tileId]?.src);
        }

        getEffectTexture(effectId) {
            return this.resolveImage(this.manifest?.effects?.[effectId]?.src);
        }

        getUiSkin(uiId) {
            return this.resolveImage(this.manifest?.ui?.[uiId]?.src);
        }

        resolveImage(src) {
            if (!this.ready || !src) return null;
            const path = this.basePath + src;
            if (this.cache.has(path)) return this.cache.get(path);
            this.loadImage(path);
            return this.cache.get(path) || null;
        }

        canDraw(image) {
            return !!image && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
        }

        drawImage(ctx, image, x, y, width, height) {
            if (!this.canDraw(image)) return false;
            ctx.drawImage(image, x, y, width, height);
            return true;
        }

        getStatus() {
            return {
                ready: this.ready,
                failed: this.failed,
                requested: this.requested,
                loaded: this.loaded,
                cached: this.cache.size,
                errors: this.errors.slice(-10),
            };
        }

        publishStatus() {
            window.__ASSET_STATUS__ = this.getStatus();
        }
    }

    window.assetRuntime = new AssetRuntime();
})();
