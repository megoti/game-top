/**
 * Deep Sea Shrimp Survivor
 * Main Game Logic
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game State
let gameState = 'START';
let lastTime = 0;
let scoreTime = 0;
let difficultyTimer = 0;
let enemySpawnTimer = 0;

// Configuration
const BASE_ENEMY_SPEED = 300;
let currentEnemySpeed = BASE_ENEMY_SPEED;
const DIFFICULTY_INTERVAL = 10;
const SPEED_INCREASE_AMOUNT = 50;
const SPAWN_INTERVAL_BASE = 1.5; // seconds
let spawnInterval = SPAWN_INTERVAL_BASE;

// Entities
const player = {
    x: 0,
    y: 0,
    radius: 12, // Hitbox size
    color: '#ff6b6b',
    angle: 0,
    velocity: { x: 0, y: 0 },
    friction: 0.85, // Stronger friction for snapping
    dashForce: 5000, // EXPLOSIVE SPEED
    lastDashTime: 0,
    dashCooldown: 0.1, // Seconds between dashes
    animTimer: 0, // For visual animation
    isLobster: false,
    lobsterTimer: 0,
    health: 2, // 2 lives
    invincibleTimer: 0, // Grace period after hit
    isHalf: false, // Visual state
    maxLobsterTime: 10,
    skillUsed: false
};

let enemies = [];
let items = [];
let particles = [];
let backgroundBubbles = [];

// Input
const keys = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false
};

// UI Elements
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const timeDisplay = document.getElementById('time-display');
const scoreDisplay = document.getElementById('score');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const hud = document.getElementById('hud');

// Sound System
let audioCtx;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playDashSound() {
    if (!audioCtx) initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    // Cute "Pew" sound geometry
    // Frequency sweep from high to low quickly
    const now = audioCtx.currentTime;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);

    // Envelope
    gainNode.gain.setValueAtTime(0.3, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

    osc.start(now);
    osc.stop(now + 0.1);
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if (gameState === 'START') {
        player.x = canvas.width / 2;
        player.y = canvas.height / 2;
    }
}
window.addEventListener('resize', resize);
window.addEventListener('click', () => {
    // Ensure audio context is ready on user interaction
    if (!audioCtx) initAudio();
});
resize();

// Input Handling
window.addEventListener('keydown', (e) => {
    // Prevent default scrolling for arrow keys and space (button click prevention)
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
    }

    if (e.code === 'Escape' && gameState === 'GAMEOVER') {
        startGame();
        return;
    }

    if (e.code === 'KeyR') {
        resetToTitle();
        return;
    }

    if (e.repeat) return; // Ignore hold-down repeats
    if (gameState !== 'PLAYING') return;

    let dx = 0;
    let dy = 0;

    if (e.code === 'ArrowUp') dy = -1;
    if (e.code === 'ArrowDown') dy = 1;
    if (e.code === 'ArrowLeft') dx = -1;
    if (e.code === 'ArrowRight') dx = 1;

    if (dx !== 0 || dy !== 0) {
        // Apply strong immediate impulse
        // "One click one time instant acceleration"
        const impulse = 800; // Adjusted for single burst

        player.velocity.x += dx * impulse;
        player.velocity.y += dy * impulse;

        // Update Angle
        player.angle = Math.atan2(dy, dx);

        // Splash!
        createSplash(player.x, player.y, player.angle);

        // Sound!
        playDashSound();
    }

    if (keys.hasOwnProperty(e.code)) keys[e.code] = true;

    // Skill Trigger
    if (e.code === 'Space' && !player.skillUsed && !player.isLobster) {
        player.isLobster = true;
        player.lobsterTimer = player.maxLobsterTime;
        player.skillUsed = true;
        player.invincibleTimer = 0; // Handled by lobster mode
        createSplash(player.x, player.y, 0);
        // Maybe sound?
    }
});
window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.code)) keys[e.code] = false;
});

// Background Bubble System
class Bubble {
    constructor() {
        this.reset();
        this.y = Math.random() * canvas.height; // Start anywhere initially
    }

    reset() {
        this.x = Math.random() * canvas.width;
        this.y = canvas.height + Math.random() * 100;
        this.speed = Math.random() * 50 + 20;
        this.size = Math.random() * 5 + 2;
        this.wobble = Math.random() * Math.PI * 2;
        this.wobbleSpeed = Math.random() * 2 + 1;
        this.alpha = Math.random() * 0.3 + 0.1;
    }

    update(dt) {
        this.y -= this.speed * dt;
        this.wobble += this.wobbleSpeed * dt;
        this.x += Math.sin(this.wobble) * 0.5; // Gentle sway

        if (this.y < -50) {
            this.reset();
        }
    }

    draw(ctx) {
        ctx.fillStyle = `rgba(255, 255, 255, ${this.alpha})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

function initBubbles() {
    backgroundBubbles = [];
    for (let i = 0; i < 50; i++) {
        backgroundBubbles.push(new Bubble());
    }
}

// Particle System
class Particle {
    constructor(x, y, angle, speed, color, life, size) {
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.color = color;
        this.life = life;
        this.maxLife = life;
        this.size = size;
        this.decay = Math.random() * 0.05 + 0.02;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
        this.size *= 0.95; // Shrink
        this.vx *= 0.9;
        this.vy *= 0.9;
    }

    draw(ctx) {
        ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

function createSplash(x, y, angle) {
    // Create a burst of bubbles/water opposite to movement
    const count = 10;
    const spread = 1.0; // Angle spread
    const reverseAngle = angle + Math.PI;

    for (let i = 0; i < count; i++) {
        const a = reverseAngle + (Math.random() - 0.5) * spread;
        const s = Math.random() * 200 + 50;
        const life = Math.random() * 0.5 + 0.3;
        const size = Math.random() * 5 + 2;
        const color = `rgba(200, 240, 255, ${Math.random()})`;
        particles.push(new Particle(x, y, a, s, color, life, size));
    }
}

// Item System
class Item {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 15;
        this.color = '#2ecc71'; // Green for heal
        this.glow = 0;
    }

    update(dt) {
        this.glow += dt * 5;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        ctx.shadowBlur = 20;
        ctx.shadowBlur = 20;
        ctx.shadowColor = this.color;

        // Pulsate
        const scale = 1 + Math.sin(this.glow) * 0.2;
        ctx.scale(scale, scale);

        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();

        // Draw Plus Sign
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(0, 6);
        ctx.moveTo(-6, 0);
        ctx.lineTo(6, 0);
        ctx.stroke();

        ctx.restore();
    }
}

// Enemy System
class Enemy {
    constructor(x, y, targetX, targetY, speed, type = 'NORMAL') {
        this.x = x;
        this.y = y;
        this.type = type; // NORMAL, GIANT, HOMING
        this.isGiant = type === 'GIANT';

        if (this.isGiant) {
            this.radius = 120; // 4x radius
            this.color = '#ff4757';
        } else if (type === 'HOMING') {
            this.radius = 30; // Normal size
            this.color = '#2ecc71'; // Green for Homing
        } else if (type === 'GOLD_GIANT') {
            this.radius = 120;
            this.color = '#ffd700'; // Gold
            this.isGiant = true;
        } else {
            this.radius = 30;
            this.color = '#4ecdc4';
        }

        // Initial Velocity
        this.speed = speed;
        this.updateVelocity(targetX, targetY);

        // Animation State
        this.mouthOpen = true;
        this.mouthTimer = 0;
        this.mouthSpeed = 10; // Biting speed
    }

    updateVelocity(targetX, targetY) {
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0) {
            this.vx = (dx / dist) * this.speed;
            this.vy = (dy / dist) * this.speed;
            this.angle = Math.atan2(this.vy, this.vx);
        }
    }

    update(dt) {
        if (this.type === 'HOMING' || this.type === 'GOLD_GIANT') {
            // Constant tracking
            this.updateVelocity(player.x, player.y);
        }

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Animate Mouth
        this.mouthTimer += dt * this.mouthSpeed;
        // Oscillate between 0.05 and 0.15 PI (Narrower)
        this.mouthOpenness = 0.05 + (Math.sin(this.mouthTimer) + 1) * 0.05;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        if (this.isGiant) {
            ctx.scale(4, 4); // 4x visual size
        }

        // Glow
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;

        ctx.fillStyle = this.color;

        // BIG FISH BODY
        ctx.beginPath();
        // Main body arc with dynamic mouth
        const mouthGap = this.mouthOpenness * Math.PI;
        ctx.arc(0, 0, 30, mouthGap, (2 * Math.PI) - mouthGap);
        // Connect to center (mouth pivot)
        ctx.lineTo(0, 5);
        ctx.lineTo(0, -5);
        ctx.fill();

        // Tail
        ctx.beginPath();
        ctx.moveTo(-25, 0);
        ctx.lineTo(-50, -20);
        ctx.lineTo(-50, 20);
        ctx.lineTo(-25, 0);
        ctx.fill();

        // Eye
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(10, -15, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(12, -17, 2, 0, Math.PI * 2);
        ctx.fill();

        // Teeth
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(15, 10);
        ctx.lineTo(20, 25);
        ctx.lineTo(25, 10);
        ctx.fill();

        ctx.restore();
    }

    isOffScreen() {
        const margin = 100;
        return (this.x < -margin || this.x > canvas.width + margin ||
            this.y < -margin || this.y > canvas.height + margin);
    }
}

function spawnEnemy(forceGroup = false) {
    // Pick an edge: 0:Top, 1:Right, 2:Bottom, 3:Left
    const edge = Math.floor(Math.random() * 4);
    let x, y, targetX, targetY;
    const margin = 50;

    // Randomize start position on chosen edge
    if (edge === 0) { // Top
        x = Math.random() * canvas.width;
        y = -margin;
    } else if (edge === 1) { // Right
        x = canvas.width + margin;
        y = Math.random() * canvas.height;
    } else if (edge === 2) { // Bottom
        x = Math.random() * canvas.width;
        y = canvas.height + margin;
    } else { // Left
        x = -margin;
        y = Math.random() * canvas.height;
    }

    // Target generic area
    if (edge === 0) targetY = canvas.height + margin;
    else if (edge === 1) targetX = -margin;
    else if (edge === 2) targetY = -margin;
    else targetX = canvas.width + margin;

    if (targetX === undefined) targetX = Math.random() * canvas.width;
    if (targetY === undefined) targetY = Math.random() * canvas.height;

    let speed = currentEnemySpeed * (0.8 + Math.random() * 0.4);

    // Determine Type
    const rand = Math.random();
    let type = 'NORMAL';

    if (rand < 0.1) { // 10%
        type = 'GIANT';
        triggerRedFlash();
    } else if (rand < 0.15) { // Next 5% (0.1 to 0.15)
        type = 'HOMING';
        speed *= 1.1; // 1.1x Speed for Homing
    }

    // After 60 seconds, chance for GOLD GIANT HOMING
    if (scoreTime > 60 && Math.random() < 0.05) { // 5% chance relative to spawn
        type = 'GOLD_GIANT';
        speed *= 1.3; // Very Fast
        triggerRedFlash();
    }

    enemies.push(new Enemy(x, y, targetX, targetY, speed, type));
}

let redFlashOpacity = 0;

function triggerRedFlash() {
    redFlashOpacity = 0.6;
}

function spawnWave() {
    // Spawn 2, 3, or 4 enemies
    const count = 2 + Math.floor(Math.random() * 3); // rand(0, 1, 2) -> 2, 3, 4
    for (let i = 0; i < count; i++) {
        spawnEnemy();
    }

    // Spawn Item Chance (5%)
    if (Math.random() < 0.05) {
        const margin = 50;
        const x = Math.random() * (canvas.width - margin * 2) + margin;
        const y = Math.random() * (canvas.height - margin * 2) + margin;
        items.push(new Item(x, y));
    }
}


// Core Logic
function update(dt) {
    if (gameState !== 'PLAYING') return;

    // Timers
    scoreTime += dt;
    difficultyTimer += dt;
    enemySpawnTimer -= dt;
    timeDisplay.innerText = scoreTime.toFixed(1);

    // Lobster Mode Timer
    if (player.isLobster) {
        player.lobsterTimer -= dt;
        if (player.lobsterTimer <= 0) {
            player.isLobster = false;
        }
    }

    // Invincibility Timer
    if (player.invincibleTimer > 0) {
        player.invincibleTimer -= dt;
    }

    // Difficulty Increase - REMOVED per user request
    /*
    if (difficultyTimer > DIFFICULTY_INTERVAL) {
        difficultyTimer = 0;
        currentEnemySpeed += SPEED_INCREASE_AMOUNT;
        // Visual or Sound effect here?

        // Also decrease spawn interval slightly?
        spawnInterval = Math.max(0.5, spawnInterval * 0.95);
    }
    */

    // Spawning
    if (enemySpawnTimer <= 0) {
        spawnWave();
        enemySpawnTimer = spawnInterval;
    }

    // Player Movement
    // Player Movement - MOVED TO KEYDOWN for "Single Click Dash"
    // We strictly rely on the impulse from keydown now.
    // No continuous acceleration from holding keys.


    // Physics
    player.x += player.velocity.x * dt;
    player.y += player.velocity.y * dt;

    // Friction
    player.velocity.x *= Math.pow(player.friction, dt * 60); // Framerate independent-ish friction
    player.velocity.y *= Math.pow(player.friction, dt * 60);

    // Bounds
    if (player.x < player.radius) { player.x = player.radius; player.velocity.x *= -0.5; }
    if (player.x > canvas.width - player.radius) { player.x = canvas.width - player.radius; player.velocity.x *= -0.5; }
    if (player.y < player.radius) { player.y = player.radius; player.velocity.y *= -0.5; }
    if (player.y < player.radius) { player.y = player.radius; player.velocity.y *= -0.5; }
    if (player.y > canvas.height - player.radius) { player.y = canvas.height - player.radius; player.velocity.y *= -0.5; }

    // Update Player Animation
    // Speed up animation based on velocity
    const speed = Math.sqrt(player.velocity.x * player.velocity.x + player.velocity.y * player.velocity.y);
    player.animTimer += dt * (5 + speed * 0.02);

    // Update Enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        e.update(dt);

        // Collision Detection (Circle)
        const dx = player.x - e.x;
        const dy = player.y - e.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < player.radius + e.radius) {
            if (player.isLobster) {
                // DESTROY ENEMY
                enemies.splice(i, 1);
                createSplash(e.x, e.y, 0);
            } else if (player.invincibleTimer <= 0) {
                // Take Damage
                if (player.health > 1) {
                    // FIRST HIT
                    player.health--;
                    player.isHalf = true;
                    player.radius = 8; // Shrink hitbox
                    player.invincibleTimer = 2.0; // 2 seconds invincibility
                    createSplash(player.x, player.y, 0);
                    // Sound?
                } else {
                    // SECOND HIT - DEATH
                    gameOver();
                }
            }
        }

        // Remove off-screen
        if (e.isOffScreen()) {
            enemies.splice(i, 1);
        }
    }

    // Update Items
    for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        item.update(dt);

        // Item Collision
        const dx = player.x - item.x;
        const dy = player.y - item.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < player.radius + item.radius + 10) {
            // Pick up Heal
            items.splice(i, 1);
            if (player.health < 2) {
                player.health = 2;
                player.isHalf = false;
                player.radius = 12;
                createSplash(player.x, player.y, 0);
            }
        }
    }

    // Update Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.update(dt);
        if (p.life <= 0) particles.splice(i, 1);
    }

    // Update Background Bubbles
    for (const b of backgroundBubbles) b.update(dt);

    // Update Red Flash
    if (redFlashOpacity > 0) {
        redFlashOpacity -= dt * 0.5; // Fade duration ~1.2s
        if (redFlashOpacity < 0) redFlashOpacity = 0;
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Background Bubbles (Behind everything)
    for (const b of backgroundBubbles) b.draw(ctx);

    // Draw Particles
    for (const p of particles) p.draw(ctx);

    // Draw Items
    for (const item of items) item.draw(ctx);

    // Draw Player
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);
    ctx.shadowBlur = 15;
    ctx.shadowColor = player.color;

    // Blink if invincible
    if (player.invincibleTimer > 0 && Math.floor(Date.now() / 100) % 2 === 0) {
        ctx.globalAlpha = 0.5;
    }

    if (player.isLobster) {
        // ISE-EBI MODE (Giant Red Lobster)
        const flash = Math.sin(Date.now() / 50) > 0;
        ctx.scale(3, 3);
        ctx.shadowColor = flash ? '#fff' : '#ff0000';
    }

    ctx.fillStyle = player.color;
    ctx.beginPath();

    if (player.isHalf) {
        // Half Body Mode (Cut in half)
        // Draw only front part of ellipse
        ctx.arc(0, 0, 15, Math.PI * 0.5, Math.PI * 1.5, false); // Front semicircle
        ctx.lineTo(0, 15); // Close path
        ctx.fill();

        // Draw "Cut" surface
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -15);
        ctx.lineTo(0, 15);
        ctx.stroke();
    } else {
        // Normal Body
        ctx.ellipse(0, 0, 20, 10, 0, 0, Math.PI * 2);
        ctx.fill();

        // Animate Tail
        const tailWag = Math.sin(player.animTimer) * 5;

        ctx.beginPath();
        ctx.moveTo(-15, 0);
        ctx.lineTo(-25, -8 + tailWag);
        ctx.lineTo(-25, 8 + tailWag);
        ctx.fill();
    }

    // Animate Antenna
    const antSway = Math.cos(player.animTimer * 0.7) * 5;

    ctx.strokeStyle = player.color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(15, -2);
    ctx.bezierCurveTo(30, -10 + antSway, 40, -5 + antSway, 45, -15 + antSway);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(15, 2);
    ctx.bezierCurveTo(30, 10 - antSway, 40, 5 - antSway, 45, 15 - antSway);
    ctx.stroke();

    ctx.restore();

    // Draw Enemies
    for (const e of enemies) e.draw(ctx);

    // Red Flash Overlay
    if (redFlashOpacity > 0) {
        ctx.fillStyle = `rgba(255, 0, 0, ${redFlashOpacity})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // UI: Skill Gauge
    if (!player.skillUsed || player.isLobster) {
        const barWidth = 200;
        const barHeight = 20;
        const x = (canvas.width - barWidth) / 2;
        const y = canvas.height - 50;

        ctx.save();
        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(x, y, barWidth, barHeight);

        // Fill
        let fillPct = 1.0;
        if (player.isLobster) {
            fillPct = player.lobsterTimer / player.maxLobsterTime;
            ctx.fillStyle = '#ff4757';
        } else {
            ctx.fillStyle = '#ff6b6b';
        }

        ctx.fillRect(x, y, barWidth * fillPct, barHeight);

        // Border
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, barWidth, barHeight);

        // Text
        ctx.fillStyle = '#fff';
        ctx.font = '16px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(player.isLobster ? 'ACTIVE!' : 'PRESS SPACE', x + barWidth / 2, y - 10);

        ctx.restore();
    }
}

function startGame() {
    gameState = 'PLAYING';
    startScreen.classList.remove('active');
    startScreen.classList.add('hidden');
    gameOverScreen.classList.remove('active');
    gameOverScreen.classList.add('hidden');
    hud.classList.remove('hidden');

    scoreTime = 0;
    difficultyTimer = 0;
    enemySpawnTimer = 0;
    currentEnemySpeed = BASE_ENEMY_SPEED;
    spawnInterval = SPAWN_INTERVAL_BASE;

    player.x = canvas.width / 2;
    player.y = canvas.height / 2;
    player.velocity = { x: 0, y: 0 };
    player.angle = 0;

    // Reset Health
    player.health = 2;
    player.isHalf = false;
    player.radius = 12;
    player.invincibleTimer = 0;
    player.radius = 12;
    player.invincibleTimer = 0;
    player.isLobster = false;
    player.skillUsed = false;

    enemies = [];
    particles = [];
    initBubbles();

    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

function resetToTitle() {
    location.reload();
}

function gameOver() {
    gameState = 'GAMEOVER';
    gameOverScreen.classList.remove('hidden');
    gameOverScreen.classList.add('active');
    scoreDisplay.innerText = scoreTime.toFixed(1);
    // Draw one last time to show collision? 
    // Usually better to freeze or keep updating particles but stop game
}

function gameLoop(timestamp) {
    if (gameState === 'GAMEOVER') {
        // Maybe slowly update particles?
        return;
    }

    const dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    // Cap dt to prevent huge jumps if tab is inactive
    const safeDt = Math.min(dt, 0.1);

    update(safeDt);
    draw();

    if (gameState === 'PLAYING') {
        requestAnimationFrame(gameLoop);
    }
}

// Init
startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);
