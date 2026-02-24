'use strict';

/**
 * Neon Sentinel - Core Game Script
 * 高品質なネオン調の縦スクロールシューティング
 */

// --- 設定と定数 ---
const CONFIG = {
    difficulty: {
        easy: { spawnRate: 0.02, speedMult: 0.8, scoreMult: 0.5, lives: 5 },
        normal: { spawnRate: 0.035, speedMult: 1.0, scoreMult: 1.0, lives: 3 },
        hard: { spawnRate: 0.06, speedMult: 1.3, scoreMult: 2.0, lives: 1 }
    },
    colors: {
        player: '#00f2ff',
        enemy: '#ff00ff',
        ufo: '#ffff00',
        bullet: '#ffffff',
        particle: '#ff00ff',
        grid: 'rgba(0, 242, 255, 0.15)'
    },
    bulletRate: 120, // 連射レート (ms)
    ufoChance: 0.05,
    bg_color: '#050505'
};

// --- サウンド管理 (Web Audio API) ---
class SoundManager {
    constructor() {
        this.ctx = null;
        this.enabled = true;
    }

    // AudioContextの初期化（ユーザー操作後に呼び出す必要あり）
    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }

    // 矩形波や三角波でシンセ音を生成
    playOsc(freq, type, duration, vol, rampDown = true) {
        if (!this.enabled || !this.ctx) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            if (rampDown) {
                osc.frequency.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
            }
            gain.gain.setValueAtTime(vol, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch (e) {
            console.warn("Audio playback failed", e);
        }
    }

    playShoot() { this.playOsc(500, 'triangle', 0.1, 0.05); }
    playExplosion() { this.playOsc(80, 'sawtooth', 0.4, 0.15); }
    playHit() { this.playOsc(120, 'square', 0.2, 0.2); }
    playUFO() { this.playOsc(880, 'sine', 0.6, 0.1, false); }
}

const sounds = new SoundManager();

// --- 入力管理 ---
class InputManager {
    constructor() {
        this.keys = {};
        this.isTouching = false;
    }

    init() {
        // キーボード入力の監視
        window.addEventListener('keydown', e => {
            this.keys[e.code] = true;
            if (e.code === 'Space') e.preventDefault();
        });
        window.addEventListener('keyup', e => this.keys[e.code] = false);

        // モバイル向けタッチイベント
        const uiLayer = document.getElementById('ui-layer');
        uiLayer.addEventListener('touchstart', (e) => {
            if (game.state === 'PLAYING') {
                this.isTouching = true;
            }
        }, { passive: true });
        uiLayer.addEventListener('touchend', () => this.isTouching = false, { passive: true });
    }

    isLeft() { return this.keys['ArrowLeft'] || this.keys['KeyA']; }
    isRight() { return this.keys['ArrowRight'] || this.keys['KeyD']; }
    isShoot() { return this.keys['Space'] || this.isTouching || (mouseIsPressed && game.state === 'PLAYING'); }
}

const input = new InputManager();

// --- ゲームオブジェクト群 ---

// プレイヤークラス（固定砲台）
class Player {
    constructor() {
        this.w = 50;
        this.h = 40;
        this.x = width / 2;
        this.y = height - 80;
        this.speed = 10;
        this.lastShot = 0;
    }

    update() {
        // キーボード移動
        if (input.isLeft()) this.x -= this.speed;
        if (input.isRight()) this.x += this.speed;

        // タッチ・マウス追従
        if (input.isTouching || (mouseIsPressed && game.state === 'PLAYING')) {
            let targetX = mouseX;
            this.x = lerp(this.x, targetX, 0.2);
        }

        this.x = constrain(this.x, this.w / 2, width - this.w / 2);

        // 連射処理
        if (input.isShoot() && millis() - this.lastShot > CONFIG.bulletRate) {
            this.shoot();
        }
    }

    shoot() {
        game.bullets.push(new Bullet(this.x, this.y - 15));
        this.lastShot = millis();
        sounds.playShoot();
    }

    draw() {
        push();
        translate(this.x, this.y);

        // ネオングロー効果
        drawingContext.shadowBlur = 15;
        drawingContext.shadowColor = CONFIG.colors.player;
        stroke(CONFIG.colors.player);
        strokeWeight(3);
        noFill();

        // 機体の描画
        beginShape();
        vertex(0, -25);
        vertex(25, 15);
        vertex(10, 5);
        vertex(-10, 5);
        vertex(-25, 15);
        endShape(CLOSE);

        // エンジン噴射の演出
        strokeWeight(1);
        fill(255, 200);
        ellipse(0, 10, 10, 5 + sin(frameCount * 0.5) * 3);
        pop();
    }
}

// 弾クラス
class Bullet {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.speed = 18;
        this.r = 4;
    }

    update() {
        this.y -= this.speed;
    }

    draw() {
        push();
        noStroke();
        fill(CONFIG.colors.bullet);
        drawingContext.shadowBlur = 8;
        drawingContext.shadowColor = CONFIG.colors.bullet;
        ellipse(this.x, this.y, this.r * 2, this.r * 5);
        pop();
    }

    isOffScreen() { return this.y < -50; }
}

// 敵クラス（不定形ポリゴン）
class Enemy {
    constructor(isUFO = false) {
        this.isUFO = isUFO;
        this.x = random(50, width - 50);
        this.y = -60;
        this.size = isUFO ? 60 : random(35, 55);
        this.hp = isUFO ? 2 : 1;

        const diffParams = CONFIG.difficulty[game.currentDiff];
        const timeElapsed = (millis() - game.startTime) / 1000;
        const speedBoost = 1 + (timeElapsed / 60) * 0.2; // 1分ごとに20%加速

        this.speed = (isUFO ? 4 : random(2, 5)) * diffParams.speedMult * speedBoost;
        // ネオンカラーの生成
        this.colorString = isUFO ? CONFIG.colors.ufo : `hsb(${floor(random(280, 340))}, 80%, 100%)`;
        this.vertices = this.generateVertices();
        this.rot = 0;
        this.rotSpeed = random(-0.04, 0.04);
    }

    // 不定形ポリゴンの頂点生成
    generateVertices() {
        const pts = floor(random(7, 13));
        const res = [];
        for (let i = 0; i < pts; i++) {
            const angle = map(i, 0, pts, 0, TWO_PI);
            const r = this.size / 2 * random(0.6, 1.4);
            res.push({ x: cos(angle) * r, y: sin(angle) * r });
        }
        return res;
    }

    update() {
        this.y += this.speed;
        this.rot += this.rotSpeed;
        if (this.isUFO) {
            this.x += sin(frameCount * 0.08) * 5; // UFOは左右に揺れる
        }
    }

    draw() {
        push();
        translate(this.x, this.y);
        rotate(this.rot);
        noFill();
        stroke(this.colorString);
        strokeWeight(2.5);
        drawingContext.shadowBlur = 12;
        drawingContext.shadowColor = this.colorString;

        beginShape();
        for (let p of this.vertices) vertex(p.x, p.y);
        endShape(CLOSE);

        if (this.isUFO) {
            ellipse(0, 0, this.size * 0.4);
            drawingContext.shadowBlur = 20;
            strokeWeight(1);
            ellipse(0, 0, this.size * 0.8);
        }
        pop();
    }

    isOffScreen() { return this.y > height + 80; }
}

// 爆発パーティクルクラス
class Particle {
    constructor(x, y, col) {
        this.x = x;
        this.y = y;
        // 色情報のキャッシュ（パフォーマンス最適化）
        let c = color(col);
        this.r = red(c);
        this.g = green(c);
        this.b = blue(c);

        let angle = random(TWO_PI);
        let force = random(2, 7);
        this.vx = cos(angle) * force;
        this.vy = sin(angle) * force;
        this.life = 255;
        this.decay = random(8, 15);
        this.size = random(2, 5);
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.95;
        this.vy *= 0.95;
        this.life -= this.decay;
    }

    draw() {
        if (this.life <= 0) return;
        push();
        noStroke();
        fill(this.r, this.g, this.b, this.life);
        ellipse(this.x, this.y, this.size);
        pop();
    }

    isDead() { return this.life <= 0; }
}

// 背景の星クラス
class Star {
    constructor() {
        this.reset();
        this.y = random(height);
    }

    reset() {
        this.x = random(width);
        this.y = -10;
        this.z = random(1, 4);
        this.speed = this.z * 1.5;
    }

    update() {
        this.y += this.speed;
        if (this.y > height) this.reset();
    }

    draw() {
        noStroke();
        fill(255, 255, 255, map(this.z, 1, 4, 50, 200));
        ellipse(this.x, this.y, this.z);
    }
}

// --- ゲームエンジン本体 ---
const game = {
    state: 'TITLE', // TITLE, PLAYING, GAMEOVER
    currentDiff: 'normal',
    startTime: 0,
    player: null,
    bullets: [],
    enemies: [],
    particles: [],
    stars: [],
    score: 0,
    lives: 0,
    shake: 0,
    flash: 0,

    // 初期化
    init() {
        for (let i = 0; i < 80; i++) this.stars.push(new Star());
        this.setupEventListeners();
    },

    // UI要素のイベント登録
    setupEventListeners() {
        document.getElementById('start-btn').onclick = () => this.start();
        document.getElementById('restart-btn').onclick = () => this.start();

        const soundBtn = document.getElementById('sound-toggle');
        soundBtn.onclick = () => {
            const on = sounds.toggle();
            soundBtn.innerText = on ? 'ON' : 'OFF';
            sounds.init();
        };

        const diffSelect = document.getElementById('difficulty-select');
        diffSelect.onchange = (e) => {
            this.currentDiff = e.target.value;
        };
    },

    // ゲーム開始処理
    start() {
        sounds.init();
        this.startTime = millis();
        const diffParams = CONFIG.difficulty[this.currentDiff];
        this.score = 0;
        this.lives = diffParams.lives;
        this.player = new Player();
        this.bullets = [];
        this.enemies = [];
        this.particles = [];
        this.state = 'PLAYING';
        this.shake = 0;
        this.flash = 0;

        document.getElementById('title-screen').classList.add('hidden');
        document.getElementById('game-over-screen').classList.add('hidden');
        document.getElementById('hud').classList.remove('hidden');
        this.updateHUD();
    },

    // ゲームオーバー処理
    gameOver() {
        this.state = 'GAMEOVER';
        document.getElementById('game-over-screen').classList.remove('hidden');
        document.getElementById('final-score-val').innerText = floor(this.score);
    },

    // HUDの更新
    updateHUD() {
        document.getElementById('score-val').innerText = floor(this.score);
        document.getElementById('lives-val').innerText = this.lives;
    },

    // 敵の生成ロジック（時間経過で頻度上昇）
    spawnEnemies() {
        const diffParams = CONFIG.difficulty[this.currentDiff];
        const timeElapsed = (millis() - game.startTime) / 1000;
        const spawnFreq = diffParams.spawnRate * (1 + (timeElapsed / 60) * 0.5); // 1分ごとに50%湧き増加

        if (random() < spawnFreq) {
            const isUFO = random() < CONFIG.ufoChance;
            this.enemies.push(new Enemy(isUFO));
        }
    },

    // 当たり判定処理
    handleCollisions() {
        // 弾 vs 敵
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const b = this.bullets[i];
                const e = this.enemies[j];
                const d = dist(b.x, b.y, e.x, e.y);

                if (d < e.size * 0.6 + b.r) {
                    this.bullets.splice(i, 1);
                    e.hp--;
                    if (e.hp <= 0) {
                        this.triggerExplosion(e.x, e.y, e.colorString);
                        const points = e.isUFO ? 1000 : 100 * CONFIG.difficulty[this.currentDiff].scoreMult;
                        this.score += points;

                        if (e.isUFO) {
                            this.flash = 15;
                            this.shake = 15;
                            sounds.playUFO();
                        } else {
                            sounds.playExplosion();
                        }
                        this.enemies.splice(j, 1);
                        this.updateHUD();
                    } else {
                        sounds.playHit();
                    }
                    break;
                }
            }
        }

        // 敵 vs プレイヤー or 下端到達
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            const d = dist(this.player.x, this.player.y, e.x, e.y);

            if (d < (this.player.w * 0.5 + e.size * 0.5)) {
                this.enemies.splice(i, 1);
                this.triggerExplosion(e.x, e.y, e.colorString);
                this.onDamage();
            } else if (e.y > height + 40) {
                this.enemies.splice(i, 1);
                this.onDamage();
            }
        }
    },

    // ダメージ時の処理
    onDamage() {
        this.lives--;
        this.shake = 25;
        sounds.playHit();
        this.updateHUD();
        if (this.lives <= 0) this.gameOver();
    },

    // 爆発エフェクトの生成
    triggerExplosion(x, y, col) {
        for (let i = 0; i < 20; i++) {
            this.particles.push(new Particle(x, y, col));
        }
    },

    // 背景描画（星とグリッド）
    drawBackground() {
        background(CONFIG.bg_color);

        // 星屑の更新と描画
        this.stars.forEach(s => { s.update(); s.draw(); });

        // ネオングリッドのスクロール
        stroke(CONFIG.colors.grid);
        strokeWeight(1);
        const spacing = 60;
        const scrollSpeed = 2;
        const yOffset = (frameCount * scrollSpeed) % spacing;

        for (let x = 0; x <= width; x += spacing) {
            line(x, 0, x, height);
        }
        for (let y = yOffset; y <= height; y += spacing) {
            line(0, y, width, y);
        }
    },

    // ゲームメインループ
    run() {
        this.drawBackground();

        if (this.state === 'PLAYING') {
            // スクリーンシェイクの適用
            if (this.shake > 0) {
                translate(random(-this.shake, this.shake), random(-this.shake, this.shake));
                this.shake *= 0.9;
            }

            this.spawnEnemies();
            this.player.update();
            this.player.draw();

            // 各種オブジェクトの更新と描画
            for (let i = this.bullets.length - 1; i >= 0; i--) {
                this.bullets[i].update();
                this.bullets[i].draw();
                if (this.bullets[i].isOffScreen()) this.bullets.splice(i, 1);
            }

            for (let i = this.enemies.length - 1; i >= 0; i--) {
                this.enemies[i].update();
                this.enemies[i].draw();
            }

            for (let i = this.particles.length - 1; i >= 0; i--) {
                this.particles[i].update();
                this.particles[i].draw();
                if (this.particles[i].isDead()) this.particles.splice(i, 1);
            }

            this.handleCollisions();

            // 画面フラッシュ演出（UFO撃破時）
            if (this.flash > 0) {
                push();
                noStroke();
                fill(255, 255, 255, map(this.flash, 0, 15, 0, 150));
                rect(0, 0, width, height);
                pop();
                this.flash--;
            }
        }
    }
};

// --- p5.js フック関数 ---
window.setup = () => {
    const cvs = createCanvas(windowWidth, windowHeight);
    cvs.style('display', 'block');
    input.init();
    game.init();
};

window.draw = () => {
    game.run();
};

window.windowResized = () => {
    resizeCanvas(windowWidth, windowHeight);
};
