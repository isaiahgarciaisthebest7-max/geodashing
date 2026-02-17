// script.js
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const highScoreElement = document.getElementById('high-score');
const attemptsElement = document.getElementById('attempts');
const levelInfoElement = document.getElementById('level-info');
const gameOverElement = document.getElementById('game-over');
const levelCompleteElement = document.getElementById('level-complete');
const instructionsElement = document.getElementById('instructions');
const pauseMenuElement = document.getElementById('pause-menu');
const fpsCounterElement = document.getElementById('fps-counter');

let canvasWidth = 900;
let canvasHeight = 500;
canvas.width = canvasWidth;
canvas.height = canvasHeight;

class RNG {
    constructor(seed) {
        this.seed = seed | 0;
    }
    next() {
        this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
        return this.seed / 0x7fffffff;
    }
}

const levels = [
    'Stereo Madness', 'Back on Track', 'Polargeist', 'Dry Out', 'Base after Base',
    'Cant Let Go', 'Jumper', 'Time Machine', 'Cycles', 'xStep',
    'Clutterfunk', 'Theory of Everything', 'Electroman Adventures', 'Clubstep', 'Electrodynamix',
    'Hexagon Force', 'Blast Processing', 'Geometrical Dominator', 'Deadlocked', 'Theory of Everything 2',
    'The Challenge'
];

const numLevels = levels.length;

let state = 'menu'; // 'menu', 'levelselect', 'game', 'gameover', 'win'
let currentLevelId = 1;
let levelStars = Array(numLevels).fill(0).map((_, i) => parseInt(localStorage.getItem(`stars_${i+1}`) || '0'));
let levelHighScores = Array(numLevels).fill(0).map((_, i) => parseInt(localStorage.getItem(`hs_${i+1}`) || '0'));

let player = {};
let obstacles = [];
let collectibles = []; // regular coins
let specialCoins = []; // level coins
let powerups = [];
let particles = [];
let gameSpeed = 5;
let baseGameSpeed = 5;
let totalDistance = 0;
let score = 0;
let highScore = 0;
let attempts = parseInt(localStorage.getItem('attempts') || 0);
let coinsCollected = 0;
let levelRNG = null;
let gameOver = false;
let paused = false;
let frame = 0;
let lastObstacleFrame = 0;
let backgroundOffset = 0;
let starOffset = 0;
let colorPhase = 0;
let muted = false;
let showFPS = false;
let lastTime = 0;
let fps = 60;
let keys = {};
let mouseDown = false;
let holdingJump = false;
let jumpCharge = 0;
let audioContext;
let jumpSound, coinSound, deathSound, winSound;

const groundY = canvasHeight - 30;
const ceilingY = 30;
const playerStartX = 100;
const maxParticles = 500;
const maxObstacles = 100;
const maxCollectibles = 50;

// Init audio
function initAudio() {
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    jumpSound = () => { if (muted || !audioContext) return; const o = audioContext.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(800, audioContext.currentTime); o.connect(audioContext.destination); o.start(); setTimeout(() => o.stop(), 80); };
    coinSound = () => { if (muted || !audioContext) return; const o = audioContext.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(1200, audioContext.currentTime); o.connect(audioContext.destination); o.start(); setTimeout(() => o.stop(), 120); };
    deathSound = () => { if (muted || !audioContext) return; const o = audioContext.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(200, audioContext.currentTime); o.connect(audioContext.destination); o.start(); setTimeout(() => o.stop(), 400); };
    winSound = () => { if (muted || !audioContext) return; const o = audioContext.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(600, audioContext.currentTime); o.frequency.exponentialRampToValueAtTime(1200, audioContext.currentTime + 0.5); o.connect(audioContext.destination); o.start(); setTimeout(() => o.stop(), 500); };
}
initAudio();

// Reset player
function resetPlayer() {
    player = {
        x: playerStartX,
        y: groundY - 40,
        width: 40,
        height: 40,
        velocityY: 0,
        gravity: 0.7,
        jumpForce: -16,
        flyForce: -0.6,
        isJumping: false,
        holdingJump: false,
        jumpCharge: 0,
        rotation: 0,
        rotationSpeed: 6,
        mode: 'cube',
        gravityDirection: 1,
        color1: '#00ff88',
        color2: '#ffffff',
        trail: [],
        speedMult: 1,
        sizeMult: 1,
        swingAngle: 0,
        swingVel: 0,
        swingDir: 1
    };
}

// Reset game for level
function resetGame() {
    resetPlayer();
    obstacles = [];
    collectibles = [];
    specialCoins = [];
    powerups = [];
    particles = [];
    score = 0;
    coinsCollected = 0;
    totalDistance = 0;
    gameSpeed = baseGameSpeed;
    gameOver = false;
    paused = false;
    frame = 0;
    lastObstacleFrame = 0;
    backgroundOffset = 0;
    starOffset = 0;
    colorPhase = 0;
    levelRNG = new RNG(currentLevelId * 1103515245 + 12345);
    spawnInitialCoins();
    spawnObstacle();
}

// Get level data
function getLevelData(id) {
    const diff = id / numLevels;
    return {
        name: levels[id-1],
        seed: id,
        length: 15000 + diff * 15000,
        baseSpeed: 4 + diff * 3,
        spawnProb: 0.015 + diff * 0.01,
        minGap: 120 + diff * 50,
        maxGap: 300 + diff * 100
    };
}

// Spawn 3 special coins
function spawnInitialCoins() {
    for (let i = 0; i < 3; i++) {
        const r = levelRNG.next();
        const pos = 4000 + r * (getLevelData(currentLevelId).length - 8000);
        specialCoins.push({
            x: canvasWidth + pos,
            y: groundY - 80 - r * 200,
            radius: 15,
            collected: false
        });
    }
}

function drawPlayer() {
    const trailLength = 15;
    player.trail.push({x: player.x + player.width/2, y: player.y + player.height/2, rot: player.rotation, alpha: 1});
    if (player.trail.length > trailLength) player.trail.shift();

    // Trail
    ctx.save();
    ctx.shadowBlur = 10;
    player.trail.forEach((p, i) => {
        const alpha = (i / trailLength) * 0.6;
        ctx.globalAlpha = alpha;
        ctx.shadowColor = player.color1;
        ctx.fillStyle = player.color1;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot * Math.PI / 180);
        ctx.fillRect(-player.width/2 * 0.8, -player.height/2 * 0.8, player.width * 0.8, player.height * 0.8);
        ctx.restore();
    });
    ctx.restore();
    ctx.globalAlpha = 1;

    // Main icon with glow
    ctx.save();
    ctx.translate(player.x + player.width/2, player.y + player.height/2);
    ctx.rotate(player.rotation * Math.PI / 180);
    ctx.shadowBlur = 25;
    ctx.shadowColor = player.color1;
    ctx.lineWidth = 3;
    ctx.strokeStyle = player.color2;
    ctx.fillStyle = player.color1;

    const w = player.width * player.sizeMult;
    const h = player.height * player.sizeMult;

    switch (player.mode) {
        case 'cube':
            ctx.fillRect(-w/2, -h/2, w, h);
            ctx.strokeRect(-w/2, -h/2, w, h);
            break;
        case 'ship':
            ctx.beginPath();
            ctx.moveTo(0, -h/2);
            ctx.lineTo(-w/2, h/2);
            ctx.lineTo(w/2, h/3);
            ctx.lineTo(w/2, -h/3);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            break;
        case 'ufo':
            ctx.beginPath();
            ctx.arc(0, 0, w/2, 0, Math.PI*2);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, -h/2);
            ctx.lineTo(-w/3, -h/3);
            ctx.lineTo(w/3, -h/3);
            ctx.fillStyle = player.color2;
            ctx.fill();
            break;
        case 'ball':
            ctx.beginPath();
            ctx.arc(0, 0, w/2, 0, Math.PI*2);
            ctx.fill();
            ctx.stroke();
            break;
        case 'wave':
            ctx.beginPath();
            for (let i = 0; i < 5; i++) {
                ctx.lineTo(-w/2 + i*(w/4), Math.sin(i) * h/4 - h/2);
            }
            ctx.lineTo(w/2, -h/2);
            ctx.lineTo(w/2, h/2);
            ctx.lineTo(-w/2, h/2);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            break;
        case 'robot':
            ctx.fillRect(-w/2, -h/2, w, h);
            ctx.strokeRect(-w/2, -h/2, w, h);
            // Legs
            ctx.strokeStyle = player.color2;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(-w/3, h/2);
            ctx.lineTo(-w/3 - w/6, h/2 + h/4);
            ctx.moveTo(w/3, h/2);
            ctx.lineTo(w/3 + w/6, h/2 + h/4);
            ctx.stroke();
            break;
        case 'spider':
            ctx.fillRect(-w/2, -h/2, w, h);
            ctx.strokeRect(-w/2, -h/2, w, h);
            // Spikes
            ctx.fillStyle = player.color2;
            ctx.beginPath();
            ctx.moveTo(-w/2, 0);
            ctx.lineTo(-w/2 - w/4, -h/4);
            ctx.lineTo(-w/2 - w/4, h/4);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(w/2, 0);
            ctx.lineTo(w/2 + w/4, -h/4);
            ctx.lineTo(w/2 + w/4, h/4);
            ctx.fill();
            break;
        case 'swing':
            ctx.beginPath();
            ctx.arc(0, h/4, w/3, 0, Math.PI*2);
            ctx.fill();
            ctx.stroke();
            // Chain
            ctx.strokeStyle = player.color2;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(0, -h/2);
            ctx.lineTo(0, -h/4);
            ctx.stroke();
            break;
    }
    ctx.restore();
    ctx.shadowBlur = 0;
}

function drawBackground() {
    // Parallax lines
    ctx.fillStyle = '#222';
    for (let i = 0; i < canvasWidth / 40 + 2; i++) {
        ctx.fillRect((i * 40 - backgroundOffset) % canvasWidth, 0, 3, canvasHeight);
    }
    backgroundOffset = (backgroundOffset + gameSpeed * 0.8) % 40;

    // Stars
    ctx.fillStyle = '#555';
    for (let i = 0; i < canvasWidth / 80 + 2; i++) {
        const x = (i * 80 - starOffset) % canvasWidth;
        const y = (Math.sin(i * 0.5 + frame * 0.01) * 50) + 100;
        ctx.fillRect(x, y, 2, 2);
    }
    starOffset = (starOffset + gameSpeed * 0.5) % 80;

    // Color pulse
    colorPhase += 0.02;
    const hue = (colorPhase * 180 / Math.PI) % 360;
    ctx.fillStyle = `hsla(${hue}, 50%, 10%, 0.1)`;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
}

function drawGround() {
    ctx.fillStyle = `hsl(${(colorPhase * 57.3) % 360}, 100%, 70%)`;
    ctx.fillRect(0, groundY, canvasWidth, 30);
    ctx.fillRect(0, 0, canvasWidth, ceilingY);
    // Pulse
    const pulse = Math.sin(frame * 0.1) * 2;
    ctx.fillRect(0, groundY + pulse, canvasWidth, 2);
}

function drawObstacles() {
    obstacles.forEach(obs => {
        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = obs.color;
        ctx.fillStyle = obs.color;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;

        const oy = obs.y + obs.height / 2 * player.gravityDirection; // Adjust for gravity?

        if (obs.type === 'spike') {
            ctx.beginPath();
            ctx.moveTo(obs.x, obs.y + obs.height);
            ctx.lineTo(obs.x + obs.width / 2, obs.y);
            ctx.lineTo(obs.x + obs.width, obs.y + obs.height);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        } else if (obs.type === 'block') {
            ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
            ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
        } else if (obs.type === 'saw') {
            ctx.save();
            ctx.translate(obs.x + obs.width / 2, obs.y + obs.height / 2);
            ctx.rotate((obs.rotation || 0) * Math.PI / 180);
            ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                const ang = i * Math.PI / 4;
                const rad = (i % 2 === 0 ? obs.width / 2 : obs.width / 3);
                ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        } else if (obs.type.startsWith('portal_')) {
            const rad = obs.width / 2;
            ctx.beginPath();
            ctx.arc(obs.x + rad, obs.y + rad, rad, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0,100,255,0.6)';
            ctx.fill();
            ctx.shadowColor = '#00aaff';
            ctx.stroke();
        } else if (obs.type === 'yellowOrb') {
            const rad = obs.width / 2;
            ctx.beginPath();
            ctx.arc(obs.x + rad, obs.y + rad, rad, 0, Math.PI * 2);
            ctx.fillStyle = '#ffaa00';
            ctx.fill();
            ctx.shadowColor = '#ffff00';
            ctx.stroke();
            // Glow pulse
            ctx.shadowBlur = 15 + Math.sin(frame * 0.2) * 5;
        }
        ctx.restore();
    });
}

function drawCollectibles() {
    [...collectibles, ...specialCoins].forEach((item, idx, arr) => {
        if (item.collected) return;
        ctx.save();
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ffff00';
        ctx.fillStyle = '#ffff00';
        const rad = item.radius;
        ctx.beginPath();
        ctx.arc(item.x + rad, item.y + rad, rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 3;
        ctx.stroke();
        // Spin
        ctx.save();
        ctx.translate(item.x + rad, item.y + rad);
        ctx.rotate((frame * 3 + idx * 10) * Math.PI / 180);
        ctx.beginPath();
        ctx.moveTo(-rad / 2, 0);
        ctx.lineTo(rad / 2, 0);
        ctx.stroke();
        ctx.restore();
        ctx.restore();
    });
}

function drawPowerups() {
    powerups.forEach(pu => {
        ctx.save();
        ctx.shadowBlur = 20;
        ctx.shadowColor = pu.color;
        ctx.fillStyle = pu.color;
        const rad = pu.radius;
        ctx.beginPath();
        ctx.arc(pu.x + rad, pu.y + rad, rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    });
}

function drawParticles() {
    particles.forEach((p, i) => {
        ctx.save();
        ctx.globalAlpha = p.life / 30;
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.2;
        p.life --;
        if (p.life <= 0) {
            particles.splice(i, 1);
            return;
        }
    });
    while (particles.length > maxParticles) particles.shift();
}

function updatePlayer() {
    if (paused || state !== 'game') return;

    player.holdingJump = keys[' '] || mouseDown;

    let floorY = player.gravityDirection > 0 ? groundY : ceilingY;
    let onGround = (player.gravityDirection > 0 && player.y + player.height >= floorY) ||
                   (player.gravityDirection < 0 && player.y <= floorY);

    switch (player.mode) {
        case 'cube':
        case 'ball':
            player.velocityY += player.gravity * player.gravityDirection;
            player.y += player.velocityY * player.speedMult;
            if (onGround) {
                player.y = floorY - player.height * (player.mode === 'ball' ? 0.5 : 1);
                player.velocityY = 0;
                player.isJumping = false;
                player.rotation = 0;
            } else {
                player.rotation += player.rotationSpeed * player.gravityDirection;
            }
            break;
        case 'ship':
        case 'ufo':
            const accel = player.mode === 'ufo' ? player.flyForce * 0.8 : player.flyForce;
            player.velocityY += (player.holdingJump ? accel : -accel * player.gravityDirection) * player.gravityDirection;
            player.velocityY *= 0.95;
            player.y += player.velocityY * player.speedMult;
            if (player.y < ceilingY) player.y = ceilingY;
            if (player.y > groundY - player.height) player.y = groundY - player.height;
            player.rotation = player.velocityY * 3;
            break;
        case 'wave':
            const waveSpeed = 8 * player.speedMult;
            player.y += (player.holdingJump ? -waveSpeed * 0.7 : waveSpeed * 0.7) * player.gravityDirection;
            if (player.y < ceilingY) {
                player.y = ceilingY;
                player.gravityDirection *= -1;
            }
            if (player.y > groundY - player.height) {
                player.y = groundY - player.height;
                player.gravityDirection *= -1;
            }
            player.rotation = player.velocityY * 5;
            break;
        case 'robot':
            if (onGround && player.holdingJump) {
                player.jumpCharge = Math.min(player.jumpCharge + 1, 45);
            } else if (player.jumpCharge > 0 && !player.holdingJump) {
                player.velocityY = - (player.jumpCharge / 45) * player.jumpForce * player.gravityDirection;
                player.jumpCharge = 0;
                player.isJumping = true;
            }
            player.velocityY += player.gravity * player.gravityDirection * 0.5; // Less gravity
            player.y += player.velocityY * player.speedMult;
            if (onGround) {
                player.y = floorY - player.height;
                player.velocityY = 0;
                player.isJumping = false;
            }
            player.rotation += player.rotationSpeed * 0.5 * player.gravityDirection;
            break;
        case 'spider':
            if (player.holdingJump && onGround) {
                player.gravityDirection *= -1;
                player.y = floorY - player.height;
                player.velocityY = 0;
                player.isJumping = true;
            }
            // No gravity for spider
            player.rotation = 0;
            break;
        case 'swing':
            player.swingVel += (player.holdingJump ? 0.3 : -0.3) * player.swingDir;
            player.swingVel *= 0.92;
            player.swingAngle += player.swingVel;
            player.y = (groundY + ceilingY)/2 + Math.sin(player.swingAngle) * 100 * player.speedMult;
            if (player.y < ceilingY) player.y = ceilingY;
            if (player.y > groundY - player.height) player.y = groundY - player.height;
            player.rotation = player.swingAngle * 180 / Math.PI;
            break;
    }

    if (player.y < 0) player.y = 0;
    if (player.y > canvasHeight - player.height) player.y = canvasHeight - player.height;
}

function updateEntities() {
    if (paused || state !== 'game') return;

    // Move left
    obstacles.forEach(o => o.x -= gameSpeed);
    collectibles.forEach(c => c.x -= gameSpeed);
    specialCoins.forEach(c => c.x -= gameSpeed);
    powerups.forEach(p => p.x -= gameSpeed);

    // Cleanup
    obstacles = obstacles.filter(o => o.x + o.width > -50 && obstacles.length < maxObstacles);
    collectibles = collectibles.filter(c => c.x + c.radius > -50 && collectibles.length < maxCollectibles);
    specialCoins = specialCoins.filter(c => !c.collected && c.x + c.radius > -50);
    powerups = powerups.filter(p => p.x + p.radius > -50);

    // Spawn
    const levelData = getLevelData(currentLevelId);
    const prob = levelData.spawnProb;
    if (levelRNG.next() < prob) {
        spawnObstacle();
    }
    if (levelRNG.next() < 0.08) {
        spawnCollectible();
    }
    if (levelRNG.next() < 0.05) {
        spawnPowerup();
    }

    totalDistance += gameSpeed;
}

function spawnObstacle() {
    const levelData = getLevelData(currentLevelId);
    const r = levelRNG.next();
    const types = ['spike', 'block', 'saw'];
    const type = types[Math.floor(r * types.length)];
    let width = 35 + levelRNG.next() * 40;
    let height = 45 + levelRNG.next() * 80;
    let x = canvasWidth + levelRNG.next() * 100;
    let y = groundY - height;
    let color = '#ff4444';

    if (levelRNG.next() < 0.2) {
        // Portal
        const portalTypes = ['portal_gravity', 'portal_mode', 'portal_speed2', 'portal_speed3', 'portal_speed4'];
        const ptype = portalTypes[Math.floor(levelRNG.next() * portalTypes.length)];
        type = ptype;
        width = 70;
        height = 90;
        y = 100 + levelRNG.next() * (canvasHeight - 200 - height);
        color = '#4444ff';
    } else if (levelRNG.next() < 0.15) {
        type = 'yellowOrb';
        width = 40;
        height = 40;
        y = groundY - height - levelRNG.next() * 150;
        color = '#ffaa00';
    } else if (type === 'saw') {
        width = 55;
        height = 55;
        y = groundY - height - levelRNG.next() * 120;
        color = '#ff8800';
    } else if (type === 'block') {
        width = 60 + levelRNG.next() * 80;
        height = 50 + levelRNG.next() * 100;
        y = groundY - height;
    }

    obstacles.push({x, y, width, height, type, color, rotation: 0});
}

function spawnCollectible() {
    const y = 100 + levelRNG.next() * (canvasHeight - 200);
    collectibles.push({
        x: canvasWidth + levelRNG.next() * 200,
        y,
        radius: 10
    });
}

function spawnPowerup() {
    const types = ['jump', 'speed', 'size'];
    const type = types[Math.floor(levelRNG.next() * types.length)];
    let color;
    switch (type) {
        case 'jump': color = '#ffff00'; break;
        case 'speed': color = '#ff6600'; break;
        case 'size': color = '#00ff00'; break;
    }
    powerups.push({
        x: canvasWidth + levelRNG.next() * 300,
        y: 100 + levelRNG.next() * 200,
        radius: 12,
        type,
        color
    });
}

function checkCollisions() {
    const pw = player.width * player.sizeMult;
    const ph = player.height * player.sizeMult;
    const px = player.x;
    const py = player.y;

    // Obstacles
    for (let obs of obstacles) {
        if (obs.x + obs.width < px || obs.x > px + pw) continue;
        if (py + ph < obs.y || py > obs.y + obs.height) continue;

        if (obs.type.startsWith('portal_')) {
            applyPortal(obs);
            return false;
        } else if (obs.type === 'yellowOrb') {
            player.velocityY = player.jumpForce * player.gravityDirection;
            createParticles(obs.x, obs.y, '#ffff00', 15);
            obstacles = obstacles.filter(o => o !== obs);
            jumpSound();
            return false;
        } else {
            // Death
            createExplosion(px + pw/2, py + ph/2, '#ff0000');
            deathSound();
            return true;
        }
    }

    // Coins
    [...collectibles, ...specialCoins].forEach((coin, i, arr) => {
        if (coin.collected) return;
        if (px < coin.x + coin.radius*2 && px + pw > coin.x &&
            py < coin.y + coin.radius*2 && py + ph > coin.y) {
            coin.collected = true;
            coinsCollected += arr === specialCoins ? 10 : 1; // Special give more?
            createParticles(coin.x, coin.y, '#ffff00', 25);
            coinSound();
            if (arr === collectibles) {
                collectibles.splice(i, 1);
            } else {
                specialCoins[i].collected = true;
            }
        }
    });

    // Powerups
    for (let i = 0; i < powerups.length; i++) {
        const pu = powerups[i];
        if (px < pu.x + pu.radius*2 && px + pw > pu.x &&
            py < pu.y + pu.radius*2 && py + ph > pu.y) {
            applyPowerup(pu);
            createParticles(pu.x, pu.y, pu.color, 35);
            coinSound();
            powerups.splice(i, 1);
            i--;
        }
    }

    return false;
}

function applyPortal(portal) {
    if (portal.type === 'portal_gravity') {
        player.gravityDirection *= -1;
        player.velocityY *= -1;
    } else if (portal.type === 'portal_mode') {
        const modes = ['cube','ship','ufo','ball','wave','robot','spider','swing'];
        player.mode = modes[Math.floor(levelRNG.next() * modes.length)];
    } else if (portal.type.startsWith('portal_speed')) {
        const mult = parseInt(portal.type.split('_')[2]);
        gameSpeed = baseGameSpeed * mult;
    }
    obstacles = obstacles.filter(o => o !== portal);
    createParticles(portal.x, portal.y, '#00aaff', 40);
}

function applyPowerup(pu) {
    switch (pu.type) {
        case 'jump':
            player.jumpForce = -22;
            setTimeout(() => player.jumpForce = -16, 8000);
            break;
        case 'speed':
            player.speedMult = 1.5;
            setTimeout(() => player.speedMult = 1, 6000);
            break;
        case 'size':
            player.sizeMult = 0.5;
            setTimeout(() => player.sizeMult = 1, 7000);
            break;
    }
}

function createParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x, y,
            vx: (levelRNG.next() - 0.5) * 8,
            vy: (levelRNG.next() - 0.5) * 8 - 2,
            size: levelRNG.next() * 4 + 1,
            life: 40 + levelRNG.next() * 20,
            color
        });
    }
}

function createExplosion(x, y, color) {
    createParticles(x, y, color, 80);
}

function updateScore() {
    score = Math.floor(totalDistance / 8) + coinsCollected * 100;
}

function checkWin() {
    const levelData = getLevelData(currentLevelId);
    if (totalDistance >= levelData.length) {
        winSound();
        const starsEarned = Math.min(3, 1 + coinsCollected);
        levelStars[currentLevelId - 1] = Math.max(levelStars[currentLevelId - 1], starsEarned);
        localStorage.setItem(`stars_${currentLevelId}`, levelStars[currentLevelId - 1]);
        levelCompleteElement.innerHTML = `Level Complete!<br>Stars: ${starsEarned}/3<br>Total Stars: ${starsEarned}<br>Press R to Restart`;
        levelCompleteElement.style.display = 'block';
        state = 'win';
        return true;
    }
    return false;
}

function gameLoop(time) {
    if (lastTime) {
        const delta = time - lastTime;
        fps = Math.round(1000 / delta);
    }
    lastTime = time;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    drawBackground();
    drawGround();

    if (state === 'menu') {
        drawMenu();
    } else if (state === 'levelselect') {
        drawLevelSelect();
    } else if (state === 'game') {
        drawObstacles();
        drawCollectibles();
        drawPowerups();
        drawPlayer();
        drawParticles();

        updatePlayer();
        updateEntities();

        if (checkCollisions()) {
            gameOver = true;
            attempts++;
            localStorage.setItem('attempts', attempts);
            attemptsElement.textContent = `Attempts: ${attempts}`;
            updateScore();
            levelHighScores[currentLevelId - 1] = Math.max(levelHighScores[currentLevelId - 1], score);
            localStorage.setItem(`hs_${currentLevelId}`, levelHighScores[currentLevelId - 1]);
            gameOverElement.innerHTML = `Game Over!<br>Score: ${score}<br>Press R to Restart`;
            gameOverElement.style.display = 'block';
            state = 'gameover';
        } else if (!checkWin()) {
            updateScore();
            if (score > highScore) highScore = score;
        }

        // UI
        const levelData = getLevelData(currentLevelId);
        const percent = Math.floor((totalDistance / levelData.length) * 100);
        levelInfoElement.innerHTML = `Level: ${levelData.name}<br>${percent}%<br>Coins: ${coinsCollected}/3`;
        scoreElement.textContent = `Score: ${score}`;
        highScoreElement.textContent = `High Score: ${levelHighScores[currentLevelId - 1]}`;
    }

    if (showFPS) {
        fpsCounterElement.textContent = `FPS: ${fps}`;
        fpsCounterElement.style.display = 'block';
    } else {
        fpsCounterElement.style.display = 'none';
    }

    if (paused && state === 'game') {
        pauseMenuElement.style.display = 'block';
    } else {
        pauseMenuElement.style.display = 'none';
    }

    frame++;
    requestAnimationFrame(gameLoop);
}

function drawMenu() {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 48px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('ULTIMATE', canvasWidth/2, 150);
    ctx.fillText('GEOMETRY DASH', canvasWidth/2, 210);
    ctx.font = '32px Courier New';
    ctx.fillText('Press SPACE to Play', canvasWidth/2, 300);
    ctx.font = '20px Courier New';
    ctx.fillText(`Total Stars: ${levelStars.reduce((a,b)=>a+b,0)}`, canvasWidth/2, 380);
    ctx.textAlign = 'left';
}

function drawLevelSelect() {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 36px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('SELECT LEVEL', canvasWidth/2, 60);

    const cols = 4;
    const rowH = 60;
    const startY = 100;
    const btnW = 200;
    const btnH = 50;
    const startX = (canvasWidth - cols * btnW) / 2 - 20;

    for (let i = 0; i < numLevels; i++) {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const x = startX + col * (btnW + 10);
        const y = startY + row * rowH;

        ctx.fillStyle = levelStars[i] > 0 ? '#44ff44' : '#666';
        ctx.fillRect(x, y, btnW, btnH);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, btnW, btnH);

        ctx.fillStyle = '#000';
        ctx.font = 'bold 20px Courier New';
        ctx.textAlign = 'center';
        ctx.fillText(`${i+1}. ${levels[i]}`, x + btnW/2, y + 32);
        ctx.font = '18px Courier New';
        ctx.fillStyle = '#fff';
        ctx.fillText(`${levelStars[i]}/3`, x + btnW/2, y + 48);

        ctx.textAlign = 'left';
    }

    ctx.font = '24px Courier New';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#aaa';
    ctx.fillText('Click a level to play | ESC: Back', canvasWidth/2, canvasHeight - 40);
}

function handleInput(e) {
    if (state === 'menu') {
        if (e.type === 'keydown' && e.code === 'Space') {
            state = 'levelselect';
            e.preventDefault();
        }
    } else if (state === 'levelselect') {
        if (e.type === 'keydown' && e.code === 'Escape') {
            state = 'menu';
        }
    } else if (state === 'game' || state === 'gameover' || state === 'win') {
        if (e.type === 'keydown') {
            if (e.code === 'Space') {
                keys[' '] = true;
                e.preventDefault();
            } else if (e.code === 'KeyR') {
                resetGame();
                state = 'game';
                gameOverElement.style.display = 'none';
                levelCompleteElement.style.display = 'none';
            } else if (e.code === 'KeyP') {
                paused = !paused;
            } else if (e.code === 'KeyM') {
                muted = !muted;
            } else if (e.code === 'KeyF') {
                showFPS = !showFPS;
            } else if (e.code === 'Escape') {
                state = 'levelselect';
            }
        } else if (e.type === 'keyup') {
            if (e.code === 'Space') {
                keys[' '] = false;
                player.holdingJump = false;
            }
        }
    }
}

// Mouse/Touch
canvas.addEventListener('mousedown', (e) => {
    mouseDown = true;
    if (state === 'levelselect') {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const cols = 4;
        const rowH = 60;
        const startY = 100;
        const btnW = 200;
        const btnH = 50;
        const startX = (canvasWidth - cols * btnW) / 2 - 20;
        const row = Math.floor((my - startY) / rowH);
        const col = Math.floor((mx - startX) / (btnW + 10));
        const id = row * cols + col + 1;
        if (id >= 1 && id <= numLevels && mx > startX + col*(btnW+10) && mx < startX + (col+1)*(btnW+10) + 10 &&
            my > startY + row*rowH && my < startY + row*rowH + btnH) {
            currentLevelId = id;
            baseGameSpeed = getLevelData(id).baseSpeed;
            resetGame();
            state = 'game';
        }
    }
});
canvas.addEventListener('mouseup', () => mouseDown = false);
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); mouseDown = true; });
canvas.addEventListener('touchend', (e) => { e.preventDefault(); mouseDown = false; });

canvas.addEventListener('click', () => {
    if (state === 'menu') state = 'levelselect';
});

document.addEventListener('keydown', handleInput);
document.addEventListener('keyup', handleInput);

// Resize
window.addEventListener('resize', () => {
    canvasWidth = Math.min(900, window.innerWidth - 20);
    canvasHeight = Math.min(500, window.innerHeight - 20);
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
});

// Fullscreen
canvas.addEventListener('dblclick', () => {
    if (document.fullscreenElement) {
        document.exitFullscreen();
    } else {
        canvas.requestFullscreen();
    }
});

highScoreElement.textContent = `High Score: 0`;
attemptsElement.textContent = `Attempts: ${attempts}`;

resetGame();
gameLoop();
