///  MYFLIPPERGAME  v1.2.3
///  Neon pinball - sectioned & polished

(() => {
  "use strict";

///  1.  SETUP & CONSTANTS
//1.1 Canvas and rendering context
  const canvas = document.getElementById("gameCanvas");
  if (!canvas) {
    console.error("MyFlipperGame: #gameCanvas not found in index.html");
    return;
  }

  const ctx = canvas.getContext("2d");
  const $ = id => document.getElementById(id);

//1.2 Game dimensions and color palette
  const W = 360, H = 600;
  const VERSION = "v1.5.0";
  const TARGET_DECAY = 25; // seconds before lit target decays
  const C = {
    cyan: "#35f6ff",
    pink: "#ff39d4",
    yellow: "#ffe66d",
    purple: "#9c6bff",
    white: "#ffffff"
  };

///  2.  GAME STATE
//2.1 Core state variables
  let running = false;
  let score = 0, best = 0, lives = 30;
  let combo = 0, comboTimer = 0;
  let elapsed = 0, shake = 0, lastTime = 0;
  let ballWait = 0, dpr = 1;
  let ball, bumpers = [], targets = [], flippers = [];
  let particles = [], floatingText = [];
  let leftDown = false, rightDown = false;
  let difficulty = "normal";
  let tiltWarning = 0;
  let missions = [];
  let highScores = [];
  let soundEnabled = true;
  let vibrateEnabled = true;
  let multiballActive = false;
  let balls = [];
  let spinners = [];
  let ramps = [];
  let targetsHitThisBall = 0;
  let levelIndex = 0;
  let plungePower = 0, plungeDir = 1;
  let plunging = false;
  let ballInPlunger = false;
  let pendingLevel = 0;

// Performance: detect mobile once
  const isMobile = /Mobi|Android/i.test(navigator.userAgent);
  const LOW_PERF = isMobile;

// Cached gradients (created once canvas exists)
  let ballGradient = null;

//2.2 Persistent storage (best score, high scores, settings)
  try {
    best = Number(localStorage.getItem("myFlipperBest")) || 0;
    highScores = JSON.parse(localStorage.getItem("myFlipperScores") || "[]");
    difficulty = localStorage.getItem("myFlipperDifficulty") || "normal";
    soundEnabled = localStorage.getItem("myFlipperSound") !== "false";
    vibrateEnabled = localStorage.getItem("myFlipperVibrate") !== "false";
  } catch (_) {}

///  3.  AUDIO ENGINE
//3.1 Audio context bootstrap
  const Audio = (() => {
    let ctx = null;
    const resume = () => {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
    };

//3.2 Oscillator tone helper
    const osc = (freq, type, dur, gain = 0.1, slide = 0) => {
      if (!soundEnabled) return;
      resume();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, ctx.currentTime + dur);
      g.gain.value = gain;
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + dur);
    };

//3.3 Noise burst helper
    const noise = (dur, gain = 0.05, filterFreq = 2000) => {
      if (!soundEnabled) return;
      resume();
      const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      const g = ctx.createGain();
      const f = ctx.createBiquadFilter();
      src.buffer = buffer;
      f.type = "lowpass";
      f.frequency.value = filterFreq;
      g.gain.value = gain;
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      src.connect(f).connect(g).connect(ctx.destination);
      src.start();
      src.stop(ctx.currentTime + dur);
    };

//3.4 Sound effect library
    return {
      flip: () => osc(220, "square", 0.08, 0.15, 110),
      bumper: (pitch = 440) => osc(pitch, "triangle", 0.12, 0.18),
      target: () => { osc(880, "sine", 0.08, 0.12); osc(1320, "sine", 0.12, 0.08); },
      wall: () => osc(150, "sawtooth", 0.06, 0.1),
      drain: () => { osc(200, "sawtooth", 0.3, 0.15, 50); noise(0.3, 0.08, 500); },
      launch: () => { osc(110, "square", 0.15, 0.2, 440); noise(0.1, 0.1, 2000); },
      gameOver: () => { osc(220, "sine", 0.4, 0.15, 110); osc(165, "sine", 0.5, 0.1, 82); },
      highScore: () => { osc(880, "sine", 0.15, 0.15); osc(1100, "sine", 0.2, 0.1); osc(1320, "sine", 0.3, 0.1); },
      combo: () => { osc(660, "square", 0.1, 0.1); osc(880, "square", 0.1, 0.08); },
      multiball: () => { for (let i = 0; i < 3; i++) setTimeout(() => osc(330 + i * 110, "triangle", 0.2, 0.15), i * 80); },
      tilt: () => { osc(100, "sawtooth", 0.5, 0.2, 40); noise(0.5, 0.15, 300); },
      menu: () => osc(440, "sine", 0.08, 0.08),
      resume,
      get ctx() { return ctx; }
    };
  })();

///  4.  FEEDBACK & SETTINGS
//4.1 Vibration helper
  function vibrate(pattern = [15]) {
    if (vibrateEnabled && navigator.vibrate) navigator.vibrate(pattern);
  }

//4.2 Sound toggle
  function setSound(on) {
    soundEnabled = on;
    try { localStorage.setItem("myFlipperSound", String(on)); } catch (_) {}
    $("soundToggle").textContent = on ? "ON" : "OFF";
    $("soundToggle").classList.toggle("on", on);
    $("soundToggle").classList.toggle("off", !on);
    $("soundToggle").setAttribute("aria-pressed", on);
    if (on) Audio.menu();
  }

//4.3 Vibration toggle
  function setVibrate(on) {
    vibrateEnabled = on;
    try { localStorage.setItem("myFlipperVibrate", String(on)); } catch (_) {}
    $("vibrateToggle").textContent = on ? "ON" : "OFF";
    $("vibrateToggle").classList.toggle("on", on);
    $("vibrateToggle").classList.toggle("off", !on);
    $("vibrateToggle").setAttribute("aria-pressed", on);
    if (on) vibrate([10]);
  }

//4.4 Difficulty select
  function setDifficulty(d) {
    difficulty = d;
    try { localStorage.setItem("myFlipperDifficulty", d); } catch (_) {}
    $("difficultySelect").value = d;
    if (running) initGame();
    Audio.menu();
  }

///  5.  CANVAS RESIZE
//5.1 HiDPI-aware resize handler
  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    // Cap DPR at 1.5 for performance on mobile, 2 for desktop
    const isMobile = /Mobi|Android/i.test(navigator.userAgent);
    dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    draw();
  }

///  6.  BALL & PLUNGER MANAGEMENT
//6.1 Ball factory
  function resetBall(x = 180, vx = (Math.random() - 0.5) * 100) {
    return {
      x,
      y: 440,
      vx,
      vy: -180,
      r: 7,
      trail: []
    };
  }

//6.2 Ball spawn in play (multiball aware)
  function createBall(x, vx) {
    const b = resetBall(x, vx);
    balls.push(b);
    if (!ball) ball = b;
    targetsHitThisBall = 0;
    targets.forEach(t => { t.hit = 0; t.litTimer = 0; });
    Audio.launch();
  }

//6.3 New ball resting on the plunger (game start / after drain)
  function createPlungerBall() {
    const b = resetBall(322, 0);
    b.y = 545;
    balls.push(b);
    if (!ball) ball = b;
    targetsHitThisBall = 0;
    targets.forEach(t => { t.hit = 0; t.litTimer = 0; });
    ballInPlunger = true;
    plungePower = 0;
    plungeDir = 1;
  }

//6.4 Release the spring - launch speed is proportional to spring power
  function releasePlunger() {
    if (!plunging) return;
    plunging = false;
    if (!ballInPlunger) return;
    ballInPlunger = false;
    const b = balls[0];
    if (!b) return;
    b.vy = -(710 + 290 * plungePower);
    b.vx = 0;
    plungePower = 0;
    plungeDir = 1;
    Audio.launch();
    vibrate([10]);
  }

///  7.  GAME INITIALIZATION
//7.1 initGame - reset state, fixed parts, then level content
  function initGame(startLevel = 0) {
    score = 0;
    lives = DIFFICULTY[difficulty].lives;
    combo = 0;
    comboTimer = 0;
    elapsed = 0;
    shake = 0;
    ballWait = 0;
    tiltWarning = 0;
    multiballActive = false;
    particles = [];
    floatingText = [];
    leftDown = rightDown = false;
    balls = [];
    levelIndex = startLevel;

//7.2 Fixed flippers (bottom of table - never change between levels)
    flippers = [
      {x:101,y:510,len:65,rest:0.32,active:-0.45,angle:0.32,side:-1},
      {x:259,y:510,len:65,rest:Math.PI-0.32,
        active:Math.PI+0.45,angle:Math.PI-0.32,side:1}
    ];

//7.3 Inner playfield content (changes per level)
    buildLevel(levelIndex);

//7.4 Missions and first ball (starts on the plunger)
    initMissions();
    createPlungerBall();
    updateStats();
  }

///  8.  LEVELS (inner canvas content only)
//8.1 Level definitions - plunger lane, walls and flippers always stay fixed
  const LEVELS = [
    { // LV 1 CLASSIC
      bumpers: [
        [80,160,23,C.cyan,100],[165,125,26,C.pink,150],[250,160,23,C.yellow,100],
        [120,225,19,C.purple,200],[210,225,19,C.cyan,200],[165,290,22,C.yellow,250]
      ],
      targets: [[55,85],[105,85],[155,85],[205,85],[255,85]],
      spinners: [[62,280,18,C.pink],[268,280,18,C.cyan]],
      ramps: [[38,320,88,260,-1],[292,320,242,260,1]]
    },
    { // LV 2 HIGH & LOW
      bumpers: [
        [78,140,22,C.pink,100],[165,120,24,C.cyan,150],[252,140,22,C.yellow,100],
        [125,235,18,C.purple,200],[205,235,18,C.pink,200],[165,330,20,C.cyan,250]
      ],
      targets: [[65,75],[115,75],[165,75],[215,75],[265,75]],
      spinners: [[78,330,16,C.cyan],[252,330,16,C.pink]],
      ramps: [[42,300,92,240,-1],[288,300,238,240,1]]
    },
    { // LV 3 GRID
      bumpers: [
        [70,150,18,C.cyan,100],[120,150,18,C.pink,100],[210,150,18,C.yellow,100],[260,150,18,C.purple,100],
        [90,240,18,C.pink,150],[165,240,18,C.cyan,150],[240,240,18,C.yellow,150],
        [165,320,20,C.purple,250]
      ],
      targets: [[55,85],[105,85],[155,85],[205,85],[255,85]],
      spinners: [[165,280,16,C.yellow]],
      ramps: [[52,340,92,280,-1],[278,340,238,280,1]]
    },
    { // LV 4 DIAMOND
      bumpers: [
        [165,110,24,C.pink,150],[105,180,20,C.cyan,100],[225,180,20,C.yellow,100],
        [165,250,22,C.purple,200],[75,290,18,C.cyan,200],[255,290,18,C.pink,200]
      ],
      targets: [[65,70],[115,70],[165,70],[215,70],[265,70]],
      spinners: [[45,200,16,C.purple],[285,200,16,C.purple]],
      ramps: [[32,260,72,320,-1],[298,260,258,320,1]]
    },
    { // LV 5 TWIN TOWERS
      bumpers: [
        [85,140,20,C.cyan,100],[85,220,20,C.pink,100],[85,300,20,C.yellow,100],
        [245,140,20,C.yellow,100],[245,220,20,C.cyan,100],[245,300,20,C.pink,100],
        [165,180,26,C.purple,250]
      ],
      targets: [[65,75],[115,75],[165,75],[215,75],[265,75]],
      spinners: [[165,380,18,C.cyan]],
      ramps: [[125,340,165,280,-1],[205,340,165,280,1]]
    },
    { // LV 6 SWIRL
      bumpers: [
        [165,105,22,C.pink,150],[225,150,18,C.cyan,100],[235,220,18,C.yellow,100],
        [165,260,20,C.purple,200],[95,220,18,C.cyan,100],[105,150,18,C.yellow,100],
        [165,340,20,C.pink,250]
      ],
      targets: [[65,65],[115,65],[165,65],[215,65],[265,65]],
      spinners: [[45,300,16,C.purple],[285,300,16,C.purple]],
      ramps: [[32,380,92,330,-1],[298,380,238,330,1]]
    },
    { // LV 7 BOWL
      bumpers: [
        [70,150,18,C.cyan,100],[125,120,18,C.pink,100],[205,120,18,C.yellow,100],
        [260,150,18,C.purple,100],[165,140,20,C.cyan,150],[95,240,18,C.pink,200],
        [235,240,18,C.yellow,200],[165,300,24,C.purple,250]
      ],
      targets: [[65,75],[115,75],[165,75],[215,75],[265,75]],
      spinners: [[165,250,16,C.yellow]],
      ramps: [[52,350,92,300,-1],[278,350,238,300,1]]
    },
    { // LV 8 CROSSFIRE
      bumpers: [
        [165,110,16,C.yellow,100],[85,130,18,C.cyan,100],[245,130,18,C.pink,100],
        [165,190,24,C.purple,150],[85,250,18,C.yellow,100],[245,250,18,C.cyan,100],
        [165,320,20,C.pink,250]
      ],
      targets: [[65,70],[115,70],[165,70],[215,70],[265,70]],
      spinners: [[45,190,16,C.cyan],[285,190,16,C.pink]],
      ramps: [[32,200,82,250,-1],[298,200,248,250,1]]
    },
    { // LV 9 FORTRESS
      bumpers: [
        [70,140,18,C.pink,100],[120,140,18,C.cyan,100],[210,140,18,C.yellow,100],[260,140,18,C.purple,100],
        [90,260,18,C.cyan,150],[165,260,20,C.pink,200],[240,260,18,C.yellow,150],
        [165,200,24,C.purple,250]
      ],
      targets: [[65,75],[115,75],[165,75],[215,75],[265,75]],
      spinners: [[45,340,16,C.pink],[285,340,16,C.cyan]],
      ramps: [[125,360,165,300,-1],[205,360,165,300,1]]
    },
    { // LV 10 HOURGLASS
      bumpers: [
        [70,120,18,C.cyan,100],[260,120,18,C.pink,100],[165,150,22,C.yellow,150],
        [105,220,18,C.purple,100],[225,220,18,C.cyan,100],[165,280,20,C.pink,200],
        [70,360,18,C.yellow,100],[260,360,18,C.purple,100]
      ],
      targets: [[65,70],[115,70],[165,70],[215,70],[265,70]],
      spinners: [[165,220,16,C.yellow]],
      ramps: [[32,300,82,350,-1],[298,300,248,350,1]]
    },
    { // LV 11 STORM
      bumpers: [
        [165,100,20,C.pink,150],[75,170,18,C.cyan,100],[255,170,18,C.yellow,100],
        [135,210,18,C.purple,100],[195,210,18,C.cyan,100],[165,250,22,C.yellow,200],
        [95,320,18,C.pink,200],[235,320,18,C.purple,200]
      ],
      targets: [[65,65],[115,65],[165,65],[215,65],[265,65]],
      spinners: [[45,250,16,C.cyan],[285,250,16,C.pink]],
      ramps: [[42,390,102,340,-1],[288,390,228,340,1]]
    },
    { // LV 12 FINAL
      bumpers: [
        [70,120,18,C.cyan,100],[125,120,18,C.pink,100],[205,120,18,C.yellow,100],[265,120,18,C.purple,100],
        [95,190,18,C.pink,100],[165,190,24,C.cyan,150],[235,190,18,C.yellow,100],
        [70,260,18,C.purple,200],[125,260,18,C.cyan,200],[205,260,18,C.pink,200],[265,260,18,C.yellow,200],
        [165,340,22,C.purple,250]
      ],
      targets: [[65,70],[115,70],[165,70],[215,70],[265,70]],
      spinners: [[45,340,16,C.yellow],[285,340,16,C.yellow]],
      ramps: [[32,400,92,350,-1],[298,400,238,350,1]]
    }
  ];

//8.2 buildLevel - construct only the inner playfield content
  function buildLevel(idx) {
    const L = LEVELS[idx];
    const mult = DIFFICULTY[difficulty].bumperMult;

    bumpers = L.bumpers.map(b => ({
      x: b[0], y: b[1], r: b[2],
      color: b[3], points: b[4] * mult, pulse: 0
    }));

    targets = L.targets.map((t, i) => ({
      x: t[0], y: t[1], w: 34, h: 10,
      color: [C.cyan, C.pink, C.yellow, C.purple, C.cyan][i % 5],
      litTimer: 0
    }));

    spinners = L.spinners.map(s => ({
      x: s[0], y: s[1], r: s[2], angle: 0, speed: 0, color: s[3]
    }));

    ramps = L.ramps.map(r => ({
      x1: r[0], y1: r[1], x2: r[2], y2: r[3],
      color: C.purple, side: r[4]
    }));
  }

//8.3 advanceLevel - reward for clearing all targets in one ball
  function advanceLevel() {
    levelIndex = (levelIndex + 1) % LEVELS.length;
    buildLevel(levelIndex);
    floatingText.push({x: 180, y: 300, text: "LEVEL " + (levelIndex + 1), color: C.pink, life: 2.5});
    Audio.highScore();
  }

///  9.  DIFFICULTY PRESETS
//9.1 Difficulty parameter table
  const DIFFICULTY = {
    easy: { gravity: 300, ballSpeed: 0.85, flipperPower: 1.15, bumperMult: 1.2, lives: 5, name: "EASY" },
    normal: { gravity: 360, ballSpeed: 1, flipperPower: 1, bumperMult: 1, lives: 4, name: "NORMAL" },
    hard: { gravity: 420, ballSpeed: 1.15, flipperPower: 0.9, bumperMult: 0.85, lives: 3, name: "HARD" }
  };

///  10.  MISSIONS SYSTEM
//10.1 Mission definitions
  function initMissions() {
    missions = [
      {id:"combo3", name:"TRIPLE THREAT", desc:"Get a 3x combo", target:3, progress:0, done:false, reward:5000},
      {id:"score50k", name:"HIGH ROLLER", desc:"Score 50,000 points", target:50000, progress:0, done:false, reward:10000},
      {id:"targets", name:"BULLSEYE", desc:"Hit all 5 targets", target:5, progress:0, done:false, reward:3000},
      {id:"survive", name:"SURVIVOR", desc:"Play for 60 seconds", target:60, progress:0, done:false, reward:2000},
      {id:"multiball", name:"CHAOS", desc:"Trigger multiball", target:1, progress:0, done:false, reward:5000},
      {id:"perfect", name:"PERFECT BALL", desc:"Clear all targets in one ball", target:5, progress:0, done:false, reward:15000}
    ];
  }

//10.2 Mission progress tracking
  function updateMission(id, value) {
    const m = missions.find(m => m.id === id);
    if (!m || m.done) return;
    if (id === "combo3") m.progress = Math.max(m.progress, value);
    else if (id === "score50k") m.progress = score;
    else if (id === "survive") m.progress = Math.floor(elapsed);
    else m.progress = value;
    if (m.progress >= m.target) completeMission(m);
  }

//10.3 Mission completion reward
  function completeMission(m) {
    m.done = true;
    addScore(m.reward, 180, 300, C.yellow);
    Audio.highScore();
    vibrate([30, 20, 30]);
    floatingText.push({x:180,y:300,text:"MISSION: "+m.name,color:C.yellow,life:3});
  }

//10.4 Periodic mission checks
  function checkMissions() {
    updateMission("combo3", combo);
    updateMission("score50k");
    updateMission("survive");
    missions.forEach(m => { if (m.id === "targets") m.progress = targetsHitThisBall; });
  }

///  11.  SCORING SYSTEM
//11.1 HUD stats update
  function updateStats() {
    $("score").textContent = score.toLocaleString();
    $("best").textContent = best.toLocaleString();
    $("lives").textContent = lives;
  }

//11.2 Score add with combo multiplier and floating text
  function addScore(points,x,y,color) {
    const multiplier = combo >= 3 ? 3 : combo >= 2 ? 2 : 1;
    const amount = points * multiplier;
    score += amount;

    floatingText.push({
      x,y,text:"+"+amount+(multiplier>1?" x"+multiplier:""),
      color,life:1
    });

    if (score > best) {
      best = score;
      try {
        localStorage.setItem("myFlipperBest",String(best));
      } catch (_) {}
    }

    updateStats();
  }

//11.3 Hit award with combo chaining
  function awardHit(points,x,y,color) {
    combo = comboTimer > 0 ? Math.min(combo+1,10) : 1;
    comboTimer = 2.2;
    addScore(points,x,y,color);
  }

///  12.  PARTICLES
//12.1 Particle burst spawner
  function burst(x,y,color,count=10) {
    for (let i=0;i<count;i++) {
      const a = Math.random()*Math.PI*2;
      const speed = 40+Math.random()*220;
      particles.push({
        x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,
        life:.35+Math.random()*.4,color,
        r:1+Math.random()*3
      });
    }
  }

///  13.  COLLISION PHYSICS
//13.1 Segment collision (walls, flippers)
  function hitSegment(ball, x1, y1, x2, y2, radius, bounce = .9) {
    const dx = x2 - x1, dy = y2 - y1;
    const length2 = dx * dx + dy * dy;
    let t = ((ball.x - x1) * dx + (ball.y - y1) * dy) / length2;
    t = Math.max(0, Math.min(1, t));

    const px = x1 + t * dx, py = y1 + t * dy;
    let nx = ball.x - px, ny = ball.y - py;
    let dist = Math.hypot(nx, ny);

    if (dist >= ball.r + radius) return false;

    if (dist < .001) {
      nx = -dy; ny = dx; dist = Math.hypot(nx, ny);
    }

    nx /= dist; ny /= dist;
    ball.x = px + nx * (ball.r + radius);
    ball.y = py + ny * (ball.r + radius);

    const dot = ball.vx * nx + ball.vy * ny;
    if (dot < 0) {
      ball.vx -= (1 + bounce) * dot * nx;
      ball.vy -= (1 + bounce) * dot * ny;
    }
    return true;
  }

//13.2 Bumper collision
  function hitBumper(ball, b) {
    const dx = ball.x - b.x, dy = ball.y - b.y;
    const dist = Math.hypot(dx, dy);
    const min = ball.r + b.r;

    if (dist >= min || dist < .001) return;

    const nx = dx / dist, ny = dy / dist;
    ball.x = b.x + nx * min;
    ball.y = b.y + ny * min;

    const dot = ball.vx * nx + ball.vy * ny;
    if (dot < 0) {
      ball.vx -= 2 * dot * nx;
      ball.vy -= 2 * dot * ny;
    }

    ball.vx += nx * 65;
    ball.vy += ny * 65;

    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed < 330) {
      ball.vx *= 330 / speed;
      ball.vy *= 330 / speed;
    }

    b.pulse = 1;
    awardHit(b.points, b.x, b.y - b.r - 12, b.color);
    burst(b.x, b.y, b.color, 13);
    shake = 3;
    Audio.bumper(b.points === 250 ? 550 : b.points === 200 ? 500 : b.points === 150 ? 440 : 380);
    vibrate([8]);

    if (b.points === 250 && !multiballActive && Math.random() < 0.15) {
      triggerMultiball();
    }
  }

//13.3 Spinner collision
  function hitSpinner(ball, sp) {
    const dx = ball.x - sp.x, dy = ball.y - sp.y;
    const dist = Math.hypot(dx, dy);
    const min = ball.r + sp.r;

    if (dist >= min || dist < .001) return;

    const nx = dx / dist, ny = dy / dist;
    ball.x = sp.x + nx * min;
    ball.y = sp.y + ny * min;

    const dot = ball.vx * nx + ball.vy * ny;
    if (dot < 0) {
      ball.vx -= 1.8 * dot * nx;
      ball.vy -= 1.8 * dot * ny;
    }

    const tangentX = -ny, tangentY = nx;
    const spinForce = sp.speed * 120;
    ball.vx += tangentX * spinForce;
    ball.vy += tangentY * spinForce;

    sp.speed = Math.max(sp.speed, Math.hypot(ball.vx, ball.vy) * 0.003);

    awardHit(30, sp.x, sp.y - sp.r - 10, sp.color);
    burst(sp.x, sp.y, sp.color, 8);
    shake = 1;
    Audio.bumper(300);
    vibrate([5]);
  }

//13.4 Ramp collision
  function hitRamp(ball, r) {
    const dx = r.x2 - r.x1, dy = r.y2 - r.y1;
    const length2 = dx * dx + dy * dy;
    let t = ((ball.x - r.x1) * dx + (ball.y - r.y1) * dy) / length2;

    if (t < 0 || t > 1) return;

    const px = r.x1 + t * dx, py = r.y1 + t * dy;
    const dist = Math.hypot(ball.x - px, ball.y - py);

    if (dist > ball.r + 8) return;

    const nx = -dy / Math.sqrt(length2), ny = dx / Math.sqrt(length2);
    const dot = ball.vx * nx + ball.vy * ny;

    if (dot < 0) {
      ball.vx -= 1.5 * dot * nx;
      ball.vy -= 1.5 * dot * ny;
      ball.vx += nx * 120 * r.side;
      ball.vy -= 180;
      awardHit(100, px, py - 15, r.color);
      burst(px, py, r.color, 10);
      shake = 2;
      Audio.bumper(600);
      vibrate([15]);
    }
  }

//13.5 Flipper collision
  function hitFlipper(ball, f) {
    const x2 = f.x + Math.cos(f.angle) * f.len;
    const y2 = f.y + Math.sin(f.angle) * f.len;

    if (!hitSegment(ball, f.x, f.y, x2, y2, 10, .8)) return;

    const diff = DIFFICULTY[difficulty];
    const power = diff.flipperPower;
    const pressed = f.side === -1 ? leftDown : rightDown;

    if (pressed) {
      ball.vx = f.side === -1
        ? Math.abs(ball.vx) * .7 + 95 * power
        : -Math.abs(ball.vx) * .7 - 95 * power;

      ball.vy = -Math.max(390 * power, Math.abs(ball.vy) * .92);
      ball.vx += (Math.random() - .5) * 70;

      awardHit(10, ball.x, ball.y - 15, C.cyan);
      burst(ball.x, ball.y, f.side === -1 ? C.cyan : C.pink, 4);
      Audio.flip();
      vibrate([12]);
    }
  }

///  14.  MULTIBALL
//14.1 Multiball trigger
  function triggerMultiball() {
    if (multiballActive) return;
    multiballActive = true;
    updateMission("multiball", 1);

    const mainBall = balls[0];
    if (!mainBall) return;

    createBall(mainBall.x - 20, mainBall.vx - 100);
    createBall(mainBall.x + 20, mainBall.vx + 100);

    balls[1].vy = mainBall.vy * 0.8;
    balls[2].vy = mainBall.vy * 0.8;

    Audio.multiball();
    vibrate([50, 30, 50, 30, 50]);
    shake = 8;
    floatingText.push({x: 180, y: 300, text: "MULTIBALL!", color: C.pink, life: 2});
  }

///  15.  GAME UPDATE LOOP
//15.1 update() - timers, pulses, particles and floating text
  function update(dt) {
    elapsed += dt;    comboTimer = Math.max(0, comboTimer - dt);
    if (comboTimer === 0) combo = 0;
    shake = Math.max(0, shake - dt * 18);
    tiltWarning = Math.max(0, tiltWarning - dt);

    for (const b of bumpers) b.pulse = Math.max(0, b.pulse - dt * 3);
    for (const t of targets) {
      t.hit = Math.max(0, t.hit - dt * 3);
      t.litTimer = Math.max(0, t.litTimer - dt);
    }

    for (const s of spinners) {
      s.angle += s.speed * dt;
      s.speed *= Math.pow(0.98, dt * 60);
    }

    particles = particles.filter(p => {
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= Math.pow(.15, dt);
      p.vy *= Math.pow(.15, dt);
      return p.life > 0;
    });

    floatingText = floatingText.filter(t => {
      t.life -= dt; t.y -= 35 * dt;
      return t.life > 0;
    });

//15.2 Ball spawn wait
    if (!running) return;

    if (ballWait > 0) {
      ballWait -= dt;
      if (ballWait <= 0) createPlungerBall();
      return;
    }

//15.3 Flipper animation (active even while the ball rests on the plunger)
    for (let i = 0; i < flippers.length; i++) {
      const f = flippers[i];
      const pressed = i === 0 ? leftDown : rightDown;
      const target = pressed ? f.active : f.rest;
      let delta = target - f.angle;

      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;

      f.angle += delta * Math.min(1, dt * (pressed ? 20 : 13));
    }

//15.4 Tilt detection (active even while the ball rests on the plunger)
    if (leftDown && rightDown) {
      tiltWarning += dt * 2;
      if (tiltWarning >= 1 && tiltWarning - dt * 2 < 1) {
        Audio.tilt();
        vibrate([100, 50, 100]);
        floatingText.push({x: 180, y: 300, text: "TILT WARNING!", color: C.pink, life: 1.5});
      }
      if (tiltWarning >= 3) {
        Audio.tilt();
        vibrate([200, 100, 200]);
        floatingText.push({x: 180, y: 300, text: "TILT! GAME OVER", color: C.pink, life: 2});
        endGame();
        return;
      }
    } else {
      tiltWarning = 0;
    }

//15.5 Plunger - hold ball, charge spring while trigger held
    if (ballInPlunger) {
      if (plunging) {
        plungePower += plungeDir * dt / 0.8;
        if (plungePower >= 1) { plungePower = 1; plungeDir = -1; }
        if (plungePower <= 0) { plungePower = 0; plungeDir = 1; }
      }
      const pb = balls[0];
      if (pb) {
        pb.x = 322;
        pb.y = 545;
        pb.vx = 0;
        pb.vy = 0;
        pb.trail.length = 0;
      }
      return;
    }

//15.6 Gravity and wall table (incl. plunger lane on the right)
    const diff = DIFFICULTY[difficulty];
    const gravity = diff.gravity;

    const walls = [
      [24,45,24,430],[336,45,336,575],
      [24,45,306,45],[24,430,75,475],
      [306,430,285,475],[75,475,96,500],[285,475,264,500],
      [306,75,306,575],[306,30,336,60],[308,555,336,555]
    ];

//15.6b One-way gate at the top of the plunger lane (blocks field -> lane only)
    const gates = [
      [306,55,306,75]
    ];

//15.7 Ball physics and collisions
    for (let bi = balls.length - 1; bi >= 0; bi--) {
      const ball = balls[bi];
      const steps = Math.max(1, Math.ceil(Math.hypot(ball.vx, ball.vy) * dt / 5));
      const step = dt / steps;

      for (let s = 0; s < steps; s++) {
        ball.vy = Math.min(ball.vy + gravity * step, 650);
        ball.vx *= Math.pow(.999, step * 60);
        ball.vx = Math.max(-400, Math.min(400, ball.vx));

        ball.x += ball.vx * step;
        ball.y += ball.vy * step;

        for (const f of flippers) hitFlipper(ball, f);

        for (const w of walls) hitSegment(ball, ...w, 3, .92);
        for (const g of gates) {
          if (ball.vx > 0) hitSegment(ball, ...g, 3, .92);
        }
        for (const b of bumpers) hitBumper(ball, b);

        for (const sp of spinners) hitSpinner(ball, sp);

        for (const r of ramps) hitRamp(ball, r);

        for (const t of targets) {
          if (t.litTimer > 0) continue;

          if (ball.x + ball.r > t.x && ball.x - ball.r < t.x + t.w &&
             ball.y + ball.r > t.y && ball.y - ball.r < t.y + t.h) {
            t.litTimer = TARGET_DECAY;
            t.hit = 1;
            targetsHitThisBall++;
            if (targetsHitThisBall === 5) {
              updateMission("perfect", 5);
              Audio.highScore();
              vibrate([30, 20, 30, 20, 50]);
              floatingText.push({x: 180, y: 250, text: "PERFECT BALL!", color: C.yellow, life: 2});
            }
            // Check for level advance: all 5 lit simultaneously
            if (targets.every(t => t.litTimer > 0)) {
              advanceLevel();
              floatingText.push({x: 180, y: 280, text: "LEVEL CLEARED!", color: C.pink, life: 2});
              Audio.highScore();
              vibrate([50, 30, 50, 30, 80]);
            }
            ball.y = t.y + t.h + ball.r;
            ball.vy = Math.abs(ball.vy) * .8 + 170;
            ball.vx += ball.x < t.x + t.w / 2 ? -70 : 70;
            awardHit(50, t.x + t.w / 2, t.y - 10, t.color);
            burst(t.x + t.w / 2, t.y, t.color, 7);
          }
        }

        if (ball.x < 32 && ball.y < 430) {
          ball.x = 32; ball.vx = Math.abs(ball.vx) * .9;
        }
        if (ball.x > 328 && ball.y < 430) {
          ball.x = 328; ball.vx = -Math.abs(ball.vx) * .9;
        }

        ball.trail.push({x: ball.x, y: ball.y});
        if (ball.trail.length > 8) ball.trail.shift();
      }

//15.7b Ball settled back in the plunger lane - recapture for next launch
      if (balls.length === 1 && ball && ball.x > 306 && ball.y > 540 && ball.vy > -50) {
        ballInPlunger = true;
        plungePower = 0;
        plungeDir = 1;
      }

//15.7c Anti-stuck: pop a ball dwelling in one spot for too long
      if (!ballInPlunger && ball.y < 470) {
        if (!ball.dwell) ball.dwell = { t: 0, n: 0, x: ball.x, y: ball.y, px: ball.x, py: ball.y };
        const d = ball.dwell;

        if (Math.abs(ball.x - d.x) > 20 || Math.abs(ball.y - d.y) > 20) {
          if (Math.abs(ball.x - d.px) > 120 || Math.abs(ball.y - d.py) > 120) d.n = 0;
          d.x = ball.x; d.y = ball.y; d.t = 0;
        } else {
          d.t += dt;
          if (d.t > 6) {
            d.t = 0;
            d.n = Math.min(d.n + 1, 4);
            d.x = d.px = ball.x; d.y = d.py = ball.y;
            ball.vy = -(280 + 120 * d.n);
            ball.vx = (Math.random() - .5) * (160 + 80 * d.n);
          }
        }
      }

//15.8 Drain and life loss
      if (ball.y > H + 20) {
        balls.splice(bi, 1);
        Audio.drain();
        vibrate([50, 30, 50]);

        if (balls.length === 0) {
          lives--;
          combo = 0;
          comboTimer = 0;
          updateStats();

          if (lives <= 0) endGame();
          else {
            ballWait = .8;
            burst(180, 560, C.pink, 18);
          }
        }
      }
    }

//15.9 Mission progress checks
    checkMissions();
  }

///  16.  DRAWING HELPERS
//16.1 Line primitive with glow
  function line(x1,y1,x2,y2,color,width=2,glow=0) {
    ctx.save();
    ctx.strokeStyle=color;
    ctx.lineWidth=width;
    ctx.lineCap="round";
    ctx.shadowColor=color;
    ctx.shadowBlur=glow;
    ctx.beginPath();
    ctx.moveTo(x1,y1);
    ctx.lineTo(x2,y2);
    ctx.stroke();
    ctx.restore();
  }

//16.2 Circle primitive with glow - optimized (no save/restore for simple fills)
  function circle(x,y,r,color,glow=0,fill=false) {
    ctx.beginPath();
    ctx.arc(x,y,Math.max(.1,r),0,Math.PI*2);
    if (glow > 0 && !LOW_PERF) {
      ctx.shadowColor=color;
      ctx.shadowBlur=glow;
    }
    if(fill) { ctx.fillStyle=color; ctx.fill(); }
    else { ctx.strokeStyle=color; ctx.lineWidth=2; ctx.stroke(); }
    ctx.shadowBlur=0;
  }

///  17.  RENDER
//17.1 Background and starfield
  function draw() {
    if(!canvas.width || !canvas.height) return;

    ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);
    ctx.clearRect(0,0,W,H);

    // Cached background gradient
    const bg = ctx.createLinearGradient(0,0,W,H);
    bg.addColorStop(0,"#10102b");
    bg.addColorStop(1,"#080817");
    ctx.fillStyle=bg;
    ctx.fillRect(0,0,W,H);

    ctx.save();

    if(shake>0) {
      ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);
    }

    // Reduced starfield on mobile (20 vs 55), no sin() per frame
    const starCount = LOW_PERF ? 20 : 40;
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = C.cyan;
    for(let i=0;i<starCount;i++) {
      const x = (i * 79 + 13) % W;
      const y = (i * 137 + 21) % H;
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha=1;

    //17.2 Playfield walls - reduced shadow on mobile
    ctx.strokeStyle=C.cyan;
    ctx.lineWidth=2;
    if (!LOW_PERF) { ctx.shadowColor=C.cyan; ctx.shadowBlur=12; }
    ctx.beginPath();
    ctx.moveTo(24,45); ctx.lineTo(306,45);
    ctx.moveTo(24,45); ctx.lineTo(24,430);
    ctx.lineTo(75,475); ctx.lineTo(96,500);
    ctx.moveTo(336,45); ctx.lineTo(336,575);
    ctx.moveTo(306,430); ctx.lineTo(285,475);
    ctx.lineTo(264,500);
    ctx.moveTo(306,55); ctx.lineTo(306,575);
    ctx.moveTo(306,30); ctx.lineTo(336,60);
    ctx.moveTo(308,555); ctx.lineTo(336,555);
    ctx.stroke();
    ctx.shadowBlur=0;

    //17.3 Targets - batched, reduced shadows
    const targetsLit = targets.filter(t => t.litTimer > 0).length;
    for(const t of targets) {
      if (t.litTimer > 0) {
        const pulse = t.litTimer < 5 && !LOW_PERF ? 0.5 + Math.sin(elapsed * 10) * 0.5 : 1;
        ctx.globalAlpha = pulse;
        if (!LOW_PERF) { ctx.shadowColor = t.color; ctx.shadowBlur = 14; }
        ctx.fillStyle = t.color;
        ctx.fillRect(t.x, t.y, t.w, t.h);
        ctx.fillStyle = C.white;
        ctx.fillRect(t.x + 4, t.y + 3, t.w - 8, 2);
        // Timer bar
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = C.white;
        ctx.fillRect(t.x, t.y - 4, (t.w * t.litTimer) / TARGET_DECAY, 2);
        ctx.shadowBlur = 0;
      } else {
        if (!LOW_PERF) { ctx.shadowColor = t.color; ctx.shadowBlur = 6; }
        ctx.fillStyle = t.color;
        ctx.fillRect(t.x, t.y, t.w, t.h);
        ctx.fillStyle = C.white;
        ctx.fillRect(t.x + 4, t.y + 3, t.w - 8, 2);
        ctx.shadowBlur = 0;
      }
    }

    ctx.fillStyle = targetsLit === 5 ? C.yellow : targetsLit > 0 ? C.cyan : "#aaaacb";
    ctx.font = "bold 10px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(`TARGETS: ${targetsLit}/5`, 180, 65);

//17.4 Bumpers - batched, reduced effects on mobile
    for(const b of bumpers) {
      const r=b.r+b.pulse*5;
      if (!LOW_PERF) { ctx.shadowColor=b.color; ctx.shadowBlur=10+b.pulse*15; }
      ctx.fillStyle="#17152f";
      ctx.beginPath();
      ctx.arc(b.x,b.y,r,0,Math.PI*2);
      ctx.fill();
      ctx.strokeStyle=b.color;
      ctx.lineWidth=2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(b.x,b.y,r*.63,0,Math.PI*2);
      ctx.strokeStyle=C.white;
      ctx.lineWidth=1;
      ctx.stroke();

      ctx.fillStyle=b.color;
      ctx.font="bold 9px system-ui";
      ctx.textBaseline="middle";
      ctx.fillText(String(b.points),b.x,b.y);
      ctx.shadowBlur=0;
    }

    //17.5 Slingshots, flippers, spinners and ramps
    if (!LOW_PERF) { ctx.shadowColor=C.pink; ctx.shadowBlur=8; }
    line(75,475,96,500,C.pink,3,0);
    line(285,475,264,500,C.pink,3,0);

    for (const f of flippers) {
      const x2 = f.x + Math.cos(f.angle) * f.len;
      const y2 = f.y + Math.sin(f.angle) * f.len;
      const color = f.side === -1 ? C.cyan : C.pink;
      circle(f.x, f.y, 9, color, LOW_PERF ? 0 : 8, true);
      line(f.x, f.y, x2, y2, color, 10, LOW_PERF ? 0 : 10);
      line(f.x, f.y, x2, y2, C.white, 2, 0);
    }

    for (const sp of spinners) {
      ctx.save();
      ctx.translate(sp.x, sp.y);
      ctx.rotate(sp.angle);
      ctx.strokeStyle = sp.color;
      ctx.lineWidth = 2;
      if (!LOW_PERF) { ctx.shadowColor = sp.color; ctx.shadowBlur = 6; }
      ctx.beginPath();
      ctx.moveTo(-sp.r, 0);
      ctx.lineTo(sp.r, 0);
      ctx.moveTo(0, -sp.r);
      ctx.lineTo(0, sp.r);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, sp.r, 0, Math.PI * 2);
      ctx.strokeStyle = sp.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
      ctx.shadowBlur = 0;
    }

    for (const r of ramps) {
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 5;
      if (!LOW_PERF) { ctx.shadowColor = r.color; ctx.shadowBlur = 8; }
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(r.x1, r.y1);
      ctx.lineTo(r.x2, r.y2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    //17.6 Balls with trails - reduced on mobile
    for (const ball of balls) {
      const trailLen = LOW_PERF ? Math.min(ball.trail.length, 4) : ball.trail.length;
      for (let i = 0; i < trailLen; i++) {
        const p = ball.trail[i];
        ctx.globalAlpha = (i + 1) / trailLen * .25;
        circle(p.x, p.y, ball.r * (i + 1) / trailLen, C.cyan, 0, true);
      }
      ctx.globalAlpha = 1;

      if (!LOW_PERF) {
        const g = ctx.createRadialGradient(
          ball.x - 2, ball.y - 3, 1, ball.x, ball.y, ball.r * 1.5
        );
        g.addColorStop(0, C.white);
        g.addColorStop(.4, "#c7ffff");
        g.addColorStop(1, C.cyan);
        ctx.shadowColor = C.cyan;
        ctx.shadowBlur = 12;
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = C.cyan;
      }
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

//17.7 Particles and floating text - reduced on mobile
    for(const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / .8);
      circle(p.x, p.y, p.r, p.color, 0, true);
    }
    ctx.globalAlpha = 1;

    for(const t of floatingText) {
      ctx.globalAlpha = Math.min(1, t.life * 2);
      ctx.fillStyle = t.color;
      ctx.font = "900 12px system-ui";
      ctx.textAlign = "center";
      if (!LOW_PERF) { ctx.shadowColor = t.color; ctx.shadowBlur = 8; }
      ctx.fillText(t.text, t.x, t.y);
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;

    //17.8 Combo, plunger and next-ball labels
    if(combo >= 2 && comboTimer > 0) {
      ctx.textAlign = "center";
      ctx.fillStyle = C.yellow;
      ctx.font = "900 16px system-ui";
      if (!LOW_PERF) { ctx.shadowColor = C.yellow; ctx.shadowBlur = 10; }
      ctx.fillText("COMBO x" + Math.min(combo, 3), 180, 350);
      ctx.shadowBlur = 0;
    }

    if(ballWait > 0) {
      ctx.fillStyle = C.white;
      ctx.font = "bold 12px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("NEXT BALL...", 180, 400);
    }

    ctx.fillStyle = "#9292b8";
    ctx.font = "bold 9px system-ui";
    ctx.textAlign = "left";
    ctx.fillText("LV " + (levelIndex + 1), 34, 585);
    ctx.fillText(VERSION, 34, 598);

    if(ballInPlunger) {
      const base = 584, top = 560 + plungePower * 18;
      ctx.strokeStyle = C.yellow;
      ctx.lineWidth = 3;
      if (!LOW_PERF) { ctx.shadowColor = C.yellow; ctx.shadowBlur = 6; }
      ctx.beginPath();
      ctx.moveTo(314, base);
      for (let i = 1; i <= 10; i++) {
        ctx.lineTo(i % 2 ? 330 : 314, top + (base - top) * i / 10);
      }
      ctx.lineTo(322, top);
      ctx.stroke();
      ctx.shadowBlur = 0;

      line(308, 588, 336, 588, C.yellow, 4, 0);

      ctx.fillStyle = "#2a2a4a";
      ctx.fillRect(331, 440, 4, 100);
      ctx.fillStyle = plungePower > .7 ? C.pink : plungePower > .35 ? C.yellow : C.cyan;
      ctx.fillRect(331, 540 - 100 * plungePower, 4, 100 * plungePower);

      ctx.fillStyle = C.white;
      ctx.font = "bold 11px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("HOLD SPACE TO LAUNCH", 180, 585);
    }

    ctx.restore();
  }

///  18.  GAME FLOW
//18.1 endGame - save scores and show overlay
  function endGame() {
    running = false;
    leftDown = rightDown = false;
    plunging = false;
    ballInPlunger = false;

    $("leftBtn").classList.remove("active");
    $("rightBtn").classList.remove("active");

    const allTargetsHit = targets.every(t => t.hit);
    if (allTargetsHit) updateMission("perfect", 5);

    highScores.push({score, date: Date.now()});
    highScores.sort((a, b) => b.score - a.score);
    highScores = highScores.slice(0, 10);
    try { localStorage.setItem("myFlipperScores", JSON.stringify(highScores)); } catch (_) {}

    Audio.gameOver();
    vibrate([100, 50, 100, 50, 200]);

    $("overlayTitle").textContent = "GAME OVER";
    $("overlayMessage").innerHTML =
      'FINAL SCORE: <strong style="color:#35f6ff">' +
      score.toLocaleString() +
      "</strong><br>Best score: " + best.toLocaleString() +
      "<br><br>Ready for another round?";

    $("startBtn").textContent = "RETRY ↻";
    $("overlay").classList.remove("hidden");
  }

//18.2 startGame
  function startGame() {
    initGame(pendingLevel);
    pendingLevel = 0;
    running=true;
    $("overlayTitle").textContent = "READY?";
    $("overlayMessage").innerHTML =
      "Hit the bumpers.<br>Build combos. Beat your best!";
    $("startBtn").textContent = "START GAME ▶";
    $("overlay").classList.add("hidden");
    lastTime=performance.now();
  }

///  19.  CONTROLS
//19.1 setControl helper
  function setControl(side,pressed) {
    if(side==="left") leftDown=pressed;
    else rightDown=pressed;
    $(side+"Btn").classList.toggle("active",pressed);
  }

//19.2 Pointer (touch) flipper buttons + plunger trigger
  for(const side of ["left","right"]) {
    const btn=$(side+"Btn");

    btn.addEventListener("pointerdown",e=>{
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      setControl(side,true);
    });

    const release=e=>{
      e.preventDefault();
      setControl(side,false);
    };

    btn.addEventListener("pointerup",release);
    btn.addEventListener("pointercancel",release);
    btn.addEventListener("lostpointercapture",()=>setControl(side,false));
    btn.addEventListener("contextmenu",e=>e.preventDefault());
  }

  const plungeBtn = $("plungeBtn");
  plungeBtn.addEventListener("pointerdown",e=>{
    e.preventDefault();
    if(ballInPlunger) plunging = true;
  });
  const plungeRelease=e=>{
    e.preventDefault();
    releasePlunger();
  };
  plungeBtn.addEventListener("pointerup",plungeRelease);
  plungeBtn.addEventListener("pointercancel",plungeRelease);
  plungeBtn.addEventListener("contextmenu",e=>e.preventDefault());

//19.3 Keyboard controls (flippers + plunger trigger)
  window.addEventListener("keydown",e=>{
    if(["ArrowLeft","ArrowRight","ArrowUp"," "].includes(e.key)) e.preventDefault();

    if(e.key==="ArrowLeft" || e.key.toLowerCase()==="a")
      setControl("left",true);

    if(e.key==="ArrowRight" || e.key.toLowerCase()==="d")
      setControl("right",true);

    if(e.code==="Space" || e.key==="ArrowUp" || e.key.toLowerCase()==="w") {
      if(!running) startGame();
      else if(ballInPlunger) plunging = true;
    }
  });

  window.addEventListener("keyup",e=>{
    if(e.key==="ArrowLeft" || e.key.toLowerCase()==="a")
      setControl("left",false);

    if(e.key==="ArrowRight" || e.key.toLowerCase()==="d")
      setControl("right",false);

    if(e.code==="Space" || e.key==="ArrowUp" || e.key.toLowerCase()==="w")
      releasePlunger();
  });

//19.4 Reset controls on window blur
  window.addEventListener("blur",()=>{
    setControl("left",false);
    setControl("right",false);
    plunging = false;
  });

///  20.  UI WIRING
//20.1 Start button and resize
  $("startBtn").addEventListener("click",startGame);
  window.addEventListener("resize",resize);

//20.2 Settings panel and toggles
  $("settingsBtn").addEventListener("click",() => {
    $("settingsPanel").classList.toggle("hidden");
    Audio.menu();
  });

  $("closeSettings").addEventListener("click",() => {
    $("settingsPanel").classList.add("hidden");
    Audio.menu();
  });

  $("soundToggle").addEventListener("click",() => setSound(!soundEnabled));
  $("vibrateToggle").addEventListener("click",() => setVibrate(!vibrateEnabled));
  $("difficultySelect").addEventListener("change",e => setDifficulty(e.target.value));

//20.3 High scores, missions and levels buttons
  $("highScoresBtn").addEventListener("click",() => {
    showHighScores();
    $("settingsPanel").classList.add("hidden");
  });

  $("missionsBtn").addEventListener("click",() => {
    showMissions();
    $("settingsPanel").classList.add("hidden");
  });

  $("levelsBtn").addEventListener("click",() => {
    showLevels();
    $("settingsPanel").classList.add("hidden");
  });

  $("closeLevels").addEventListener("click",() => {
    $("levelsPanel").classList.add("hidden");
    Audio.menu();
  });

  $("levelsCanvas").addEventListener("click",e => {
    const cv = $("levelsCanvas");
    const rect = cv.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (cv.width / rect.width);
    const cy = (e.clientY - rect.top) * (cv.height / rect.height);
    const idx = Math.floor(cy / (cv.height / 4)) * 3 + Math.floor(cx / (cv.width / 3));
    if (idx >= 0 && idx < LEVELS.length) {
      pendingLevel = idx;
      $("levelsPanel").classList.add("hidden");
      $("settingsPanel").classList.add("hidden");
      startGame();
    }
  });

///  21.  INFO PANELS
//21.1 High scores panel
  function showHighScores() {
    const panel = document.createElement("div");
    panel.className = "settings-panel";
    panel.style.maxHeight = "70vh";
    panel.style.overflow = "auto";
    panel.innerHTML = `
      <h3 style="margin:0 0 12px;color:var(--pink);font-size:20px;text-align:center">HIGH SCORES</h3>
      <ol style="margin:0;padding-left:20px;color:#c2c2e1;font-size:13px;line-height:2">
        ${highScores.length ? highScores.map((s,i)=>`<li>${i+1}. <strong style="color:var(--cyan)">${s.score.toLocaleString()}</strong> <span style="color:var(--muted)">${new Date(s.date).toLocaleDateString()}</span></li>`).join("") : '<li style="color:var(--muted)">No scores yet</li>'}
      </ol>
      <button class="close-btn" onclick="this.parentElement.remove()">CLOSE</button>
    `;
    document.body.appendChild(panel);
    Audio.menu();
  }

//21.2 Missions panel
  function showMissions() {
    const panel = document.createElement("div");
    panel.className = "settings-panel";
    panel.style.maxHeight = "70vh";
    panel.style.overflow = "auto";
    panel.innerHTML = `
      <h3 style="margin:0 0 12px;color:var(--pink);font-size:20px;text-align:center">MISSIONS</h3>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${missions.map(m=>`
          <div style="background:#10102b;border:1px solid ${m.done?"#35f6ff44":"#414071"};border-radius:10px;padding:12px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <strong style="color:${m.done?"var(--cyan)":"white"}">${m.name}</strong>
              ${m.done ? '<span style="color:var(--yellow);font-size:11px">✓ DONE</span>' : ''}
            </div>
            <div style="color:#c2c2e1;font-size:11px;margin:4px 0">${m.desc}</div>
            <div style="height:6px;background:#2a2a4a;border-radius:3px;overflow:hidden">
              <div style="width:${Math.min(100,(m.progress/m.target)*100)}%;height:100%;background:${m.done?"var(--cyan)":"var(--pink)"};transition:width 300ms"></div>
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:10px;color:var(--muted)">
              <span>${m.progress}/${m.target}</span>
              <span style="color:var(--yellow)">+${m.reward.toLocaleString()}</span>
            </div>
          </div>
        `).join("")}
      </div>
      <button class="close-btn" onclick="this.parentElement.remove()">CLOSE</button>
    `;
    document.body.appendChild(panel);
    Audio.menu();
  }

//21.3 Level select panel (dedicated levels canvas)
  function renderLevelPreview(g, L, x, y, w, h) {
    const sc = Math.min(w / W, h / H);
    const ox = x + (w - W * sc) / 2;
    const oy = y + (h - H * sc) / 2;
    const X = px => ox + px * sc;
    const Y = py => oy + py * sc;

    g.strokeStyle = C.cyan;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(X(24), Y(45)); g.lineTo(X(306), Y(45));
    g.moveTo(X(24), Y(45)); g.lineTo(X(24), Y(430));
    g.lineTo(X(75), Y(475)); g.lineTo(X(96), Y(500));
    g.moveTo(X(336), Y(45)); g.lineTo(X(336), Y(575));
    g.moveTo(X(306), Y(430)); g.lineTo(X(285), Y(475));
    g.lineTo(X(264), Y(500));
    g.moveTo(X(306), Y(55)); g.lineTo(X(306), Y(575));
    g.moveTo(X(306), Y(30)); g.lineTo(X(336), Y(60));
    g.moveTo(X(308), Y(555)); g.lineTo(X(336), Y(555));
    for (const f of flippers) {
      g.moveTo(X(f.x), Y(f.y));
      g.lineTo(X(f.x + Math.cos(f.angle) * f.len), Y(f.y + Math.sin(f.angle) * f.len));
    }
    g.stroke();

    L.targets.forEach((t, i) => {
      g.fillStyle = [C.cyan, C.pink, C.yellow, C.purple, C.cyan][i % 5];
      g.fillRect(X(t[0]), Y(t[1]), 34 * sc, 10 * sc);
    });

    for (const b of L.bumpers) {
      g.beginPath();
      g.arc(X(b[0]), Y(b[1]), b[2] * sc, 0, Math.PI * 2);
      g.strokeStyle = b[3];
      g.stroke();
    }
    for (const s of L.spinners) {
      g.beginPath();
      g.arc(X(s[0]), Y(s[1]), s[2] * sc, 0, Math.PI * 2);
      g.strokeStyle = s[3];
      g.stroke();
    }
    g.strokeStyle = C.purple;
    for (const r of L.ramps) {
      g.beginPath();
      g.moveTo(X(r[0]), Y(r[1]));
      g.lineTo(X(r[2]), Y(r[3]));
      g.stroke();
    }
  }

  function showLevels() {
    $("levelsPanel").classList.remove("hidden");
    const lc = $("levelsCanvas");
    const g = lc.getContext("2d");
    g.clearRect(0, 0, lc.width, lc.height);
    const cols = 3, rows = 4;
    const cw = lc.width / cols, ch = lc.height / rows;
    for (let i = 0; i < LEVELS.length; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      renderLevelPreview(g, LEVELS[i], col * cw + 4, row * ch + 4, cw - 8, ch - 24);
      g.fillStyle = i === levelIndex ? C.yellow : "#9292b8";
      g.font = "bold 10px system-ui";
      g.textAlign = "center";
      g.fillText("LV " + (i + 1), col * cw + cw / 2, row * ch + ch - 8);
    }
    Audio.menu();
  }

///  22.  BOOTSTRAP & MAIN LOOP
//22.1 Initial setup
  setSound(soundEnabled);
  setVibrate(vibrateEnabled);
  setDifficulty(difficulty);

  initGame();
  resize();

//22.2 Main loop
  function loop(now) {
    const dt=Math.min((now-(lastTime||now))/1000,.033);
    lastTime=now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
})();
