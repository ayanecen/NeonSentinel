'use strict';

// ゲームの状態管理
const GameState = {
    PLAYING: 'playing',
    GAME_OVER: 'gameOver'
};

// プレイヤークラス
class Player {
    constructor() {
        this.width = 50;
        this.height = 30;
        this.x = width / 2;
        this.y = height - 50;
        this.speed = 8;
        this.color = '#0ff';
    }

    update() {
        if (keyIsDown(LEFT_ARROW) || keyIsDown(65)) {
            this.x = max(this.width / 2, this.x - this.speed);
        }
        if (keyIsDown(RIGHT_ARROW) || keyIsDown(68)) {
            this.x = min(width - this.width / 2, this.x + this.speed);
        }
    }

    draw() {
        push();
        fill(this.color);
        stroke('#fff');
        strokeWeight(2);
        drawingContext.shadowBlur = 15;
        drawingContext.shadowColor = this.color;
        rectMode(CENTER);
        rect(this.x, this.y, this.width, this.height);
        pop();
    }
}

// 弾クラス
class Bullet {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.speed = 10;
        this.size = 5;
        this.color = '#f0f';
    }

    update() {
        this.y -= this.speed;
    }

    draw() {
        push();
        fill(this.color);
        stroke('#fff');
        strokeWeight(2);
        drawingContext.shadowBlur = 10;
        drawingContext.shadowColor = this.color;
        ellipse(this.x, this.y, this.size);
        pop();
    }

    isOffScreen() {
        return this.y < 0;
    }
}

// 敵クラス
class Enemy {
    constructor() {
        this.reset();
        this.isUFO = random() < 0.05;
        this.color = this.isUFO ? '#ff0' : color(random(255), random(255), random(255));
        this.size = this.isUFO ? 40 : random(20, 40);
        this.points = this.isUFO ? 1000 : 100;
        this.vertices = this.generateVertices();
    }

    reset() {
        this.x = random(width);
        this.y = -50;
        this.speed = random(2, 5);
        this.angle = 0;
        this.rotationSpeed = random(-0.02, 0.02);
    }

    generateVertices() {
        const numVertices = floor(random(5, 8));
        const vertices = [];
        for (let i = 0; i < numVertices; i++) {
            const angle = (i / numVertices) * TWO_PI;
            const r = this.size / 2;
            vertices.push({
                x: cos(angle) * r,
                y: sin(angle) * r
            });
        }
        return vertices;
    }

    update() {
        this.y += this.speed;
        this.angle += this.rotationSpeed;
        if (this.isUFO) {
            this.x += sin(frameCount * 0.05) * 2;
        }
    }

    draw() {
        push();
        translate(this.x, this.y);
        rotate(this.angle);
        fill(this.color);
        stroke('#fff');
        strokeWeight(2);
        drawingContext.shadowBlur = 15;
        drawingContext.shadowColor = this.color;
        beginShape();
        for (let v of this.vertices) {
            vertex(v.x, v.y);
        }
        endShape(CLOSE);
        pop();
    }

    isOffScreen() {
        return this.y > height + 50;
    }
}

// パーティクルクラス
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = random(2, 6);
        this.speed = random(2, 5);
        this.angle = random(TWO_PI);
        this.life = 255;
    }

    update() {
        this.x += cos(this.angle) * this.speed;
        this.y += sin(this.angle) * this.speed;
        this.life -= 10;
    }

    draw() {
        push();
        fill(this.color);
        noStroke();
        drawingContext.shadowBlur = 10;
        drawingContext.shadowColor = this.color;
        ellipse(this.x, this.y, this.size);
        pop();
    }

    isDead() {
        return this.life <= 0;
    }
}

// ゲームマネージャー
let gameManager = {
    state: GameState.PLAYING,
    player: null,
    bullets: [],
    enemies: [],
    particles: [],
    score: 0,
    lives: 3,
    lastEnemySpawn: 0,
    enemySpawnInterval: 1000,
    shakeAmount: 0,

    init() {
        this.player = new Player();
        this.score = 0;
        this.lives = 3;
        this.state = GameState.PLAYING;
    },

    spawnEnemy() {
        if (millis() - this.lastEnemySpawn > this.enemySpawnInterval) {
            this.enemies.push(new Enemy());
            this.lastEnemySpawn = millis();
            this.enemySpawnInterval = max(500, this.enemySpawnInterval - 10);
        }
    },

    checkCollisions() {
        // 弾と敵の衝突判定
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const bullet = this.bullets[i];
                const enemy = this.enemies[j];
                const d = dist(bullet.x, bullet.y, enemy.x, enemy.y);
                
                if (d < enemy.size / 2) {
                    this.createExplosion(enemy.x, enemy.y, enemy.color);
                    this.score += enemy.points;
                    if (enemy.isUFO) {
                        this.shakeAmount = 20;
                        this.flashScreen();
                    }
                    this.bullets.splice(i, 1);
                    this.enemies.splice(j, 1);
                    break;
                }
            }
        }

        // プレイヤーと敵の衝突判定
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            const d = dist(this.player.x, this.player.y, enemy.x, enemy.y);
            
            if (d < (this.player.width + enemy.size) / 2) {
                this.lives--;
                this.shakeAmount = 30;
                this.enemies.splice(i, 1);
                if (this.lives <= 0) {
                    this.state = GameState.GAME_OVER;
                }
            }
        }
    },

    createExplosion(x, y, color) {
        for (let i = 0; i < 20; i++) {
            this.particles.push(new Particle(x, y, color));
        }
    },

    flashScreen() {
        push();
        fill(255, 255, 255, 100);
        rect(0, 0, width, height);
        pop();
    },

    update() {
        if (this.state === GameState.PLAYING) {
            this.player.update();
            this.spawnEnemy();

            // 弾の更新
            for (let i = this.bullets.length - 1; i >= 0; i--) {
                this.bullets[i].update();
                if (this.bullets[i].isOffScreen()) {
                    this.bullets.splice(i, 1);
                }
            }

            // 敵の更新
            for (let i = this.enemies.length - 1; i >= 0; i--) {
                this.enemies[i].update();
                if (this.enemies[i].isOffScreen()) {
                    this.enemies.splice(i, 1);
                    this.lives--;
                    if (this.lives <= 0) {
                        this.state = GameState.GAME_OVER;
                    }
                }
            }

            // パーティクルの更新
            for (let i = this.particles.length - 1; i >= 0; i--) {
                this.particles[i].update();
                if (this.particles[i].isDead()) {
                    this.particles.splice(i, 1);
                }
            }

            this.checkCollisions();
            this.shakeAmount *= 0.9;
        }
    },

    draw() {
        push();
        translate(random(-this.shakeAmount, this.shakeAmount), 
                 random(-this.shakeAmount, this.shakeAmount));

        // 背景の星
        background(0);
        fill(255);
        for (let i = 0; i < 100; i++) {
            const x = (frameCount * 0.5 + i * 100) % width;
            const y = (i * 50) % height;
            ellipse(x, y, 1);
        }

        // ゲームオブジェクトの描画
        this.player.draw();
        this.bullets.forEach(bullet => bullet.draw());
        this.enemies.forEach(enemy => enemy.draw());
        this.particles.forEach(particle => particle.draw());

        // UI
        this.drawUI();
        pop();
    },

    drawUI() {
        push();
        fill('#0ff');
        textSize(24);
        textAlign(LEFT);
        text(`SCORE: ${this.score}`, 20, 40);
        text(`LIVES: ${this.lives}`, 20, 70);

        if (this.state === GameState.GAME_OVER) {
            textAlign(CENTER);
            textSize(48);
            text('GAME OVER', width / 2, height / 2);
            textSize(24);
            text(`FINAL SCORE: ${this.score}`, width / 2, height / 2 + 40);
            text('Press SPACE to restart', width / 2, height / 2 + 80);
        }
        pop();
    }
};

// p5.js のセットアップ
function setup() {
    createCanvas(windowWidth, windowHeight);
    gameManager.init();
}

function draw() {
    gameManager.update();
    gameManager.draw();
}

function keyPressed() {
    if (key === ' ' && gameManager.state === GameState.PLAYING) {
        gameManager.bullets.push(new Bullet(gameManager.player.x, gameManager.player.y));
    } else if (key === ' ' && gameManager.state === GameState.GAME_OVER) {
        gameManager.init();
    }
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
} 