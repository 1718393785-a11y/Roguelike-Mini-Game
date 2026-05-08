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

        getBossSprite(bossId, state = 'idle') {
            const entry = this.manifest?.bosses?.[bossId]?.[state];
            return this.resolveImage(entry?.frames?.[0] || entry?.src);
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
            const image = new Image();
            image.onload = () => {
                this.loaded++;
                this.publishStatus();
            };
            image.onerror = () => {
                this.errors.push(`image load failed: ${path}`);
                this.publishStatus();
            };
            this.requested++;
            image.src = path;
            this.cache.set(path, image);
            this.publishStatus();
            return image;
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
