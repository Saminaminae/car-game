/* Canvas Racer – avskalad arkad med lane dodging, parallax och power-ups */

(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const HUD = {
    scoreEl: document.getElementById("score"),
    speedEl: document.getElementById("speed"),
    statusEl: document.getElementById("status"),
    setScore(v) { this.scoreEl.textContent = `Poäng: ${v}`; },
    setSpeed(v) { this.speedEl.textContent = `Fart: ${Math.round(v)} km/h`; },
    setStatus(t, color) {
      this.statusEl.textContent = t || "";
      this.statusEl.style.color = color || "var(--warn)";
    }
  };

  // World config
  const W = canvas.width;
  const H = canvas.height;
  const lanes = 3;
  const laneWidth = Math.round(W * 0.18);
  const roadWidth = laneWidth * lanes;
  const roadX = (W - roadWidth) / 2;
  const grassW = (W - roadWidth) / 2;

  const palette = {
    road: "#1b2330",
    lane: "#dde2f7",
    grass: "#0a7f40",
    car: "#00ff95",
    enemy: "#ff3b3b",
    power: "#ffd166",
    sky1: "#0b1020",
    sky2: "#0d0f14",
    glow: "rgba(0, 212, 255, 0.25)"
  };

  // Player state
  const player = {
    lane: 1,
    x: roadX + laneWidth * 1 + laneWidth / 2,
    y: H - 120,
    w: 48,
    h: 88,
    speed: 60, // km/h
    maxSpeed: 260,
    accel: 60, // km/h per second
    turnCooldown: 0, // s
    alive: true,
    shield: 0 // s
  };

  // Game state
  let running = true;
  let score = 0;
  let time = 0;
  let spawnTimer = 0;
  let powerTimer = 0;

  // Input
  const keys = new Set();
  window.addEventListener("keydown", (e) => {
    if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","KeyP","KeyR"].includes(e.code)) {
      e.preventDefault();
    }
    keys.add(e.code);
    if (e.code === "KeyP") { running = !running; HUD.setStatus(running ? "" : "Paus"); }
    if (e.code === "KeyR") { reset(); }
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));

  // Helpers
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const laneToX = (ln) => roadX + laneWidth * ln + laneWidth / 2;

  // Entities
  const enemies = [];
  const particles = [];
  const powers = [];

  function spawnEnemy() {
    const ln = Math.floor(Math.random() * lanes);
    enemies.push({
      lane: ln,
      x: laneToX(ln),
      y: -120,
      w: 46,
      h: 84,
      speed: 70 + Math.random() * 120,
      color: palette.enemy
    });
  }

  function spawnPower() {
    const ln = Math.floor(Math.random() * lanes);
    powers.push({
      lane: ln,
      x: laneToX(ln),
      y: -80,
      w: 34,
      h: 34,
      type: Math.random() < 0.6 ? "score" : "shield",
      speed: 90
    });
  }

  function rectsCollide(a, b) {
    return Math.abs(a.x - b.x) < (a.w/2 + b.w/2) && Math.abs(a.y - b.y) < (a.h/2 + b.h/2);
  }

  function addExplosion(x, y, color) {
    for (let i = 0; i < 24; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 100 + Math.random() * 200;
      particles.push({
        x, y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 0.6 + Math.random() * 0.4,
        color
      });
    }
  }

  // Update
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000); // clamp dt
    last = now;
    if (running) update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    time += dt;
    // Input: steering
    if (player.turnCooldown > 0) player.turnCooldown -= dt;
    if (player.alive) {
      if (player.turnCooldown <= 0) {
        if (keys.has("ArrowLeft")) { player.lane = clamp(player.lane - 1, 0, lanes - 1); player.turnCooldown = 0.12; }
        if (keys.has("ArrowRight")) { player.lane = clamp(player.lane + 1, 0, lanes - 1); player.turnCooldown = 0.12; }
      }
      player.x = laneToX(player.lane);

      // Input: speed
      if (keys.has("ArrowUp")) player.speed = clamp(player.speed + player.accel * dt, 40, player.maxSpeed);
      if (keys.has("ArrowDown")) player.speed = clamp(player.speed - player.accel * dt * 1.5, 20, player.maxSpeed);
      HUD.setSpeed(player.speed);

      // Shield timer
      if (player.shield > 0) player.shield = Math.max(0, player.shield - dt);

      // Spawns scale with speed/time
      spawnTimer += dt;
      powerTimer += dt;
      const enemyInterval = clamp(1.2 - time * 0.02, 0.4, 1.2);
      const powerInterval = 3.0;
      if (spawnTimer >= enemyInterval) { spawnTimer = 0; spawnEnemy(); }
      if (powerTimer >= powerInterval) { powerTimer = 0; spawnPower(); }

      // Move enemies/powers downward based on player speed
      const worldSpeed = (player.speed / 3.6); // px/s approx
      enemies.forEach(e => e.y += worldSpeed - (e.speed / 3.6));
      powers.forEach(p => p.y += worldSpeed - (p.speed / 3.6));

      // Remove off-screen
      for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].y > H + 200) enemies.splice(i, 1);
      for (let i = powers.length - 1; i >= 0; i--) if (powers[i].y > H + 120) powers.splice(i, 1);

      // Collisions: power-ups
      for (let i = powers.length - 1; i >= 0; i--) {
        if (rectsCollide(player, powers[i])) {
          if (powers[i].type === "score") { score += 50; HUD.setScore(score); HUD.setStatus("+50!", "var(--ok)"); }
          else { player.shield = 3.0; HUD.setStatus("Sköld aktiv (3s)", "var(--ok)"); }
          addExplosion(powers[i].x, powers[i].y, palette.power);
          powers.splice(i, 1);
        }
      }

      // Collisions: enemies
      for (let i = enemies.length - 1; i >= 0; i--) {
        if (rectsCollide(player, enemies[i])) {
          if (player.shield > 0) {
            // absorb hit
            addExplosion(enemies[i].x, enemies[i].y, "rgba(255,59,59,0.8)");
            enemies.splice(i, 1);
            score += 25; HUD.setScore(score);
            player.shield = Math.max(0, player.shield - 1.0);
            HUD.setStatus("Krock absorberad – sköld -1s", "var(--ok)");
          } else {
            // game over
            addExplosion(player.x, player.y, "rgba(255,59,59,0.9)");
            player.alive = false;
            running = false;
            HUD.setStatus("Krock! Tryck R för att starta om.");
          }
        }
      }

      // Score over time
      score += Math.round(dt * (5 + player.speed * 0.1));
      HUD.setScore(score);
    }

    // Particles update
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  // Render
  function render() {
    // Sky gradient (animated slight shift)
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, palette.sky1);
    grad.addColorStop(1, palette.sky2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Road and grass
    ctx.fillStyle = palette.grass;
    ctx.fillRect(0, 0, grassW, H);
    ctx.fillRect(W - grassW, 0, grassW, H);

    // Parallax stripes on grass
    const stripeH = 24;
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = "#ffffff";
    const offset = (time * (player.speed / 180)) % stripeH;
    for (let y = -offset; y < H; y += stripeH) {
      ctx.fillRect(12, y, grassW - 24, 6);
      ctx.fillRect(W - grassW + 12, y, grassW - 24, 6);
    }
    ctx.globalAlpha = 1;

    // Road
    ctx.fillStyle = palette.road;
    ctx.fillRect(roadX, 0, roadWidth, H);

    // Lane lines
    ctx.strokeStyle = palette.lane;
    ctx.lineWidth = 4;
    ctx.setLineDash([18, 18]);
    for (let i = 1; i < lanes; i++) {
      const x = roadX + laneWidth * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Draw powers
    powers.forEach(p => {
      ctx.fillStyle = palette.power;
      roundedRect(ctx, p.x - p.w/2, p.y - p.h/2, p.w, p.h, 6, true);
      ctx.strokeStyle = "#222";
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x - p.w/2 + 6, p.y - p.h/2 + 6, p.w - 12, p.h - 12);
      ctx.fillStyle = "#222";
      ctx.font = "12px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(p.type === "score" ? "+" : "S", p.x, p.y);
    });

    // Draw enemies
    enemies.forEach(e => {
      drawCar(e.x, e.y, e.w, e.h, e.color);
    });

    // Draw player
    drawCar(player.x, player.y, player.w, player.h, player.alive ? palette.car : "#888");
    if (player.shield > 0) {
      ctx.strokeStyle = palette.glow;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(player.x, player.y, Math.max(player.w, player.h)/2 + 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Particles
    particles.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 3, 3);
      ctx.globalAlpha = 1;
    });

    // Pause overlay
    if (!running) {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#fff";
      ctx.font = "24px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(player.alive ? "Paus" : "Game Over", W/2, H/2 - 20);
      ctx.font = "16px system-ui";
      ctx.fillText("Tryck R för att starta om", W/2, H/2 + 12);
    }
  }

  // Drawing helpers
  function drawCar(x, y, w, h, color) {
    // Body
    ctx.fillStyle = color;
    roundedRect(ctx, x - w/2, y - h/2, w, h, 10, true);

    // Windows
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    roundedRect(ctx, x - w/2 + 8, y - h/2 + 10, w - 16, h - 20, 6, true);

    // Wheels
    ctx.fillStyle = "#111";
    ctx.fillRect(x - w/2 - 2, y - h/2 + 16, 8, 18);
    ctx.fillRect(x + w/2 - 6, y - h/2 + 16, 8, 18);
    ctx.fillRect(x - w/2 - 2, y + h/2 - 34, 8, 18);
    ctx.fillRect(x + w/2 - 6, y + h/2 - 34, 8, 18);

    // Lights glow
    ctx.fillStyle = "rgba(255,255,140,0.25)";
    ctx.beginPath();
    ctx.ellipse(x, y - h/2 - 8, w * 0.5, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function roundedRect(ctx, x, y, w, h, r, fill = true, stroke = false) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  // Reset
  function reset() {
    score = 0; time = 0;
    player.lane = 1; player.x = laneToX(1); player.y = H - 120;
    player.speed = 60; player.alive = true; player.shield = 0;
    enemies.length = 0; particles.length = 0; powers.length = 0;
    running = true;
    HUD.setScore(score); HUD.setSpeed(player.speed); HUD.setStatus("");
  }

  // Boot
  reset();
  requestAnimationFrame(loop);
})();
