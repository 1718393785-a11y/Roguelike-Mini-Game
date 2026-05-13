(function initUIBridge(global) {
    const STATE_CLASS = {
        0: 'is-menu',
        1: 'is-playing',
        2: 'is-paused',
        3: 'is-level-up',
        4: 'is-game-over',
        5: 'is-victory',
        6: 'is-perk-upgrade',
        7: 'is-cutscene',
    };

    class UIBridge {
        constructor(options = {}) {
            this.root = options.root || document.getElementById('gameUiRoot');
            this.game = null;
            this.lastLevelUpKey = '';
            this.lastStatusKey = '';
            this.lastStateClass = '';
        }

        mount(game) {
            if (!this.root) return false;
            this.game = game;
            this.root.innerHTML = this.createMarkup();
            this.bindEvents();
            this.root.hidden = false;
            return true;
        }

        createMarkup() {
            return `
                <div class="dom-hud">
                    <section class="hud-cluster hud-left" data-ui="hud-left">
                        <div class="hud-label"><span>生命</span><strong data-ui="hpText">0/0</strong></div>
                        <div class="meter meter-hp"><div class="meter-fill" data-ui="hpFill"></div></div>
                        <div class="hud-stat-grid">
                            <span>关卡<b data-ui="stageText">-</b></span>
                            <span>Boss<b data-ui="bossText">-</b></span>
                            <span>波次<b data-ui="waveText">-</b></span>
                            <span>残响<b data-ui="resonanceText">0</b></span>
                        </div>
                    </section>
                    <section class="hud-cluster hud-top">
                        <div class="level-text" data-ui="levelText">等级 1</div>
                        <div class="meter meter-exp"><div class="meter-fill" data-ui="expFill"></div></div>
                        <div class="time-text" data-ui="timeText">生存时间 0:00</div>
                    </section>
                    <div class="hud-actions">
                        <button class="hud-button" type="button" data-action="home">主页</button>
                        <button class="hud-button" type="button" data-action="pause">暂停</button>
                    </div>
                    <aside class="hud-cluster hud-right">
                        <div class="status-title"><span>武器</span><span data-ui="weaponCount">0/6</span></div>
                        <div class="status-list" data-ui="weaponList"></div>
                        <div class="status-title"><span>被动技能</span><span>局内</span></div>
                        <div class="status-list" data-ui="skillList"></div>
                    </aside>
                    <div class="boss-banner" data-ui="bossBanner" hidden>
                        <strong data-ui="bossBannerTitle"></strong>
                        <span data-ui="bossBannerDesc"></span>
                    </div>
                    <div class="low-hp-vignette"></div>
                </div>
                <section class="dom-levelup" role="dialog" aria-modal="true" aria-label="升级选择">
                    <div class="levelup-panel">
                        <header class="levelup-header">
                            <div class="levelup-title" data-ui="levelUpTitle">升级！</div>
                            <div class="levelup-subtitle">选择一项增益</div>
                        </header>
                        <div class="levelup-options" data-ui="levelUpOptions"></div>
                        <footer class="levelup-footer">
                            <button class="levelup-reroll" type="button" data-action="reroll">刷新选项</button>
                        </footer>
                    </div>
                </section>
                <section class="dom-menu" role="dialog" aria-modal="true" aria-label="系统菜单">
                    <div class="menu-panel">
                        <div class="menu-kicker" data-ui="menuKicker">SYSTEM</div>
                        <div class="menu-title" data-ui="menuTitle">已暂停</div>
                        <div class="menu-subtitle" data-ui="menuSubtitle">战斗逻辑已冻结</div>
                        <div class="menu-stats">
                            <span>存活时间<b data-ui="menuTime">0:00</b></span>
                            <span>本局等级<b data-ui="menuLevel">1</b></span>
                            <span>本局残响<b data-ui="menuRunResonance">0</b></span>
                            <span>累计残响<b data-ui="menuTotalResonance">0</b></span>
                        </div>
                        <div class="menu-actions">
                            <button class="menu-button" type="button" data-action="resume">继续</button>
                            <button class="menu-button" type="button" data-action="restart">重启时空</button>
                            <button class="menu-button menu-button-secondary" type="button" data-action="menu">返回主页</button>
                        </div>
                    </div>
                </section>
            `;
        }

        bindEvents() {
            this.root.addEventListener('click', (event) => {
                const action = event.target.closest('[data-action]')?.dataset.action;
                if (!action || !this.game) return;
                event.preventDefault();
                event.stopPropagation();
                if (action === 'pause') {
                    if (this.game.gameState === 1) this.game.gameState = 2;
                    else if (this.game.gameState === 2) this.game.gameState = 1;
                } else if (action === 'home') {
                    this.game.returnToMenu?.();
                } else if (action === 'resume') {
                    if (this.game.gameState === 2) this.game.gameState = 1;
                } else if (action === 'restart') {
                    this.game.restartGame?.();
                } else if (action === 'menu') {
                    this.game.returnToMenu?.();
                } else if (action === 'reroll') {
                    const player = this.game.player;
                    if (this.game.gameState === 3 && player && player.rerolls > 0) {
                        player.rerolls--;
                        this.game.levelUpOptions = this.game.generateLevelUpOptions();
                        this.lastLevelUpKey = '';
                        this.update(this.game);
                    }
                }
            });

            this.root.addEventListener('click', (event) => {
                const card = event.target.closest('[data-levelup-index]');
                if (!card || !this.game || this.game.gameState !== 3) return;
                event.preventDefault();
                event.stopPropagation();
                const index = Number(card.dataset.levelupIndex);
                if (Number.isInteger(index)) {
                    this.game.selectLevelUpOption(index);
                    this.lastLevelUpKey = '';
                    this.update(this.game);
                }
            });
        }

        update(game) {
            if (!this.root || !game || typeof game.getUiSnapshot !== 'function') return;
            const snapshot = game.getUiSnapshot();
            this.applyState(snapshot);
            this.updateHud(snapshot);
            this.updateStatus(snapshot);
            this.updateLevelUp(snapshot);
            this.updateMenu(snapshot);
        }

        applyState(snapshot) {
            const stateClass = STATE_CLASS[snapshot.gameState] || 'is-unknown';
            if (stateClass !== this.lastStateClass) {
                for (const value of Object.values(STATE_CLASS)) this.root.classList.remove(value);
                this.root.classList.add(stateClass);
                this.lastStateClass = stateClass;
            }
            this.root.classList.toggle('is-low-hp', snapshot.lowHp);
            const pauseButton = this.root.querySelector('[data-action="pause"]');
            if (pauseButton) pauseButton.textContent = snapshot.gameState === 2 ? '继续' : '暂停';
        }

        updateHud(snapshot) {
            this.setText('hpText', `${snapshot.hp}/${snapshot.maxHp}`);
            this.setMeter('hpFill', snapshot.hpPct);
            this.setText('stageText', snapshot.stageText);
            this.setText('bossText', snapshot.bossText);
            this.setText('waveText', snapshot.waveText);
            this.setText('resonanceText', `${snapshot.resonance}`);
            this.setText('levelText', `等级 ${snapshot.level}`);
            this.setText('timeText', snapshot.timeText);
            this.setMeter('expFill', snapshot.expPct);
            const left = this.root.querySelector('[data-ui="hud-left"]');
            if (left) left.classList.toggle('is-low', snapshot.lowHp);
            const banner = this.root.querySelector('[data-ui="bossBanner"]');
            if (banner) banner.hidden = !snapshot.bossActive;
            this.setText('bossBannerTitle', snapshot.bossActive ? `守将来袭：${snapshot.bossName}` : '');
            this.setText('bossBannerDesc', snapshot.bossActive ? snapshot.stageDescription : '');
        }

        updateStatus(snapshot) {
            const key = JSON.stringify({ weapons: snapshot.weapons, skills: snapshot.skills });
            if (key === this.lastStatusKey) return;
            this.lastStatusKey = key;
            this.setText('weaponCount', `${snapshot.weapons.length}/6`);
            this.renderRows('weaponList', snapshot.weapons, false);
            this.renderRows('skillList', snapshot.skills, true);
        }

        updateLevelUp(snapshot) {
            const key = JSON.stringify({
                state: snapshot.gameState,
                level: snapshot.level,
                rerolls: snapshot.rerolls,
                options: snapshot.levelUpOptions,
            });
            if (key === this.lastLevelUpKey) return;
            this.lastLevelUpKey = key;
            this.setText('levelUpTitle', `升级！ 等级 ${snapshot.level}`);
            const reroll = this.root.querySelector('[data-action="reroll"]');
            if (reroll) {
                reroll.textContent = `刷新选项（剩余：${snapshot.rerolls}次）`;
                reroll.disabled = snapshot.rerolls <= 0;
            }
            const container = this.root.querySelector('[data-ui="levelUpOptions"]');
            if (!container) return;
            container.innerHTML = snapshot.levelUpOptions.map((option, index) => {
                const icon = option.iconSrc
                    ? `<img src="${this.escapeAttr(option.iconSrc)}" alt="">`
                    : `<span>${option.type === 'passive' ? '◆' : '✦'}</span>`;
                return `
                    <button class="levelup-card" type="button" data-levelup-index="${index}">
                        <div class="levelup-card-title">${this.escape(option.title)}</div>
                        <div class="levelup-icon">${icon}</div>
                        <div class="levelup-card-desc">${this.escape(option.desc)}</div>
                        ${option.levelText ? `<div class="levelup-card-level">${this.escape(option.levelText)}</div>` : ''}
                    </button>
                `;
            }).join('');
        }

        updateMenu(snapshot) {
            const result = snapshot.result || {};
            this.setText('menuTitle', result.title || '');
            this.setText('menuSubtitle', result.subtitle || '');
            this.setText('menuTime', result.time || '0:00');
            this.setText('menuLevel', `${result.level || 1}`);
            this.setText('menuRunResonance', `${result.runResonance || 0}`);
            this.setText('menuTotalResonance', `${result.totalResonance || 0}`);
            const kicker = snapshot.gameState === 5 ? 'VICTORY'
                : snapshot.gameState === 4 ? 'GAME OVER'
                    : 'PAUSED';
            this.setText('menuKicker', kicker);
            const resume = this.root.querySelector('[data-action="resume"]');
            if (resume) resume.hidden = snapshot.gameState !== 2;
            const restart = this.root.querySelector('[data-action="restart"]');
            if (restart) restart.hidden = snapshot.gameState === 5;
        }

        renderRows(target, rows, isSkill) {
            const container = this.root.querySelector(`[data-ui="${target}"]`);
            if (!container) return;
            container.innerHTML = rows.map((row) => {
                const icon = row.iconSrc
                    ? `<img class="status-icon" src="${this.escapeAttr(row.iconSrc)}" alt="">`
                    : `<span class="status-icon"></span>`;
                return `
                    <div class="status-row ${isSkill && row.level <= 0 ? 'is-muted' : ''}">
                        ${icon}
                        <span class="status-name">${this.escape(row.name)}</span>
                        <span class="status-level">Lv.${this.escape(String(row.levelText ?? row.level))}</span>
                    </div>
                `;
            }).join('');
        }

        setText(key, value) {
            const node = this.root.querySelector(`[data-ui="${key}"]`);
            if (node && node.textContent !== value) node.textContent = value;
        }

        setMeter(key, pct) {
            const node = this.root.querySelector(`[data-ui="${key}"]`);
            if (!node) return;
            node.style.setProperty('--pct', `${Math.max(0, Math.min(100, Math.round(pct * 1000) / 10))}`);
        }

        escape(value) {
            return String(value ?? '').replace(/[&<>"']/g, (char) => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;',
            }[char]));
        }

        escapeAttr(value) {
            return this.escape(value).replace(/`/g, '&#96;');
        }
    }

    global.UIBridge = UIBridge;
})(window);
