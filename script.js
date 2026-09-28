'use strict';

/* =========================================================
   블록 러너 - 순수 JavaScript / Canvas 2D 게임
   ========================================================= */

// ---------- 기본 설정값 (여기 숫자를 바꿔서 게임을 조절할 수 있어요) ----------
const W = 800, H = 450;      // 게임 내부 해상도 (화면 크기에 맞춰 자동 확대/축소됨)
const GROUND = 380;          // 바닥의 y 위치
const SIZE = 40;             // 캐릭터/장애물 기본 크기
const PLAYER_SCREEN_X = 150; // 캐릭터가 화면에서 고정되어 보이는 x 위치

// 난이도별 설정: speed(일반 모드 속도), flySpeed(비행 모드 속도), length(결승선 위치),
// maxSpikes(가시 최대 연속 개수), flyGap(비행 모드 기둥 사이 빈 공간 높이)
const DIFF = {
  easy:   { speed: 300, flySpeed: 260, length: 9000,  maxSpikes: 2, flyGap: 230 },
  normal: { speed: 380, flySpeed: 320, length: 12000, maxSpikes: 3, flyGap: 195 },
  hard:   { speed: 460, flySpeed: 380, length: 15000, maxSpikes: 3, flyGap: 170 },
};

// ---------- 전역 상태 ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);
const screens = { menu: $('menu'), select: $('select'), gameover: $('gameover'), clear: $('clear') };

let state = 'menu';                          // 'menu' | 'select' | 'game' | 'gameover' | 'clear'
const settings = { mode: 'normal', diff: 'normal' };
let game = null;                             // 현재 게임 데이터
let spaceHeld = false;                       // Space(또는 캔버스 누름) 상태
let lastTime = 0;

// ---------- 게임 초기화 ----------
function init() {
  // 버튼 연결
  $('btn-start').onclick = () => { showScreen('select'); };
  $('btn-back').onclick = goToMenu;
  $('btn-play').onclick = startGame;
  $('btn-retry').onclick = startGame;
  $('btn-again').onclick = startGame;
  $('btn-over-menu').onclick = goToMenu;
  $('btn-clear-menu').onclick = goToMenu;

  // 모드/난이도 선택 버튼
  document.querySelectorAll('[data-mode]').forEach((b) => {
    b.onclick = () => { settings.mode = b.dataset.mode; updateSelection(); };
  });
  document.querySelectorAll('[data-diff]').forEach((b) => {
    b.onclick = () => { settings.diff = b.dataset.diff; updateSelection(); };
  });
  updateSelection();

  // 입력 이벤트
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('pointerdown', () => { if (state === 'game') spaceHeld = true; });
  window.addEventListener('pointerup', () => { spaceHeld = false; });

  showScreen('menu');
  requestAnimationFrame(loop);
}

// 선택된 모드/난이도 버튼에 강조 표시
function updateSelection() {
  document.querySelectorAll('[data-mode]').forEach((b) =>
    b.classList.toggle('selected', b.dataset.mode === settings.mode));
  document.querySelectorAll('[data-diff]').forEach((b) =>
    b.classList.toggle('selected', b.dataset.diff === settings.diff));
}

// 화면(오버레이) 전환: name 화면만 보이고 나머지는 숨김. null이면 모두 숨김
function showScreen(name) {
  for (const key in screens) screens[key].classList.toggle('hidden', key !== name);
  if (name) state = name;
  if (document.activeElement) document.activeElement.blur();
}

// ---------- 키보드 입력 ----------
function onKeyDown(e) {
  if (e.code === 'Space') {
    e.preventDefault();          // 스페이스로 페이지가 스크롤되거나 버튼이 눌리는 것 방지
    spaceHeld = true;
  }
}
function onKeyUp(e) {
  if (e.code === 'Space') {
    e.preventDefault();
    spaceHeld = false;
  }
}

// ---------- 게임 시작 ----------
function startGame() {
  const d = DIFF[settings.diff];
  game = {
    mode: settings.mode,
    d: d,
    speed: settings.mode === 'normal' ? d.speed : d.flySpeed,
    length: d.length,
    player: { x: 0, y: GROUND - SIZE, vy: 0, rot: 0, onGround: true },
    obstacles: createObstacles(settings.mode, d),
    particles: [],
    dead: false,
    deadTimer: 0,
    time: 0,
  };
  showScreen(null);
  state = 'game';
}

// ---------- 장애물 생성 ----------
// 일반 모드: 가시(spike)와 블록(block)을 간격을 두고 배치
// 비행 모드: 위/아래 기둥(pillar) 사이에 빈 공간을 만들고, 빈 공간 위치를 조금씩 바꿈
function createObstacles(mode, d) {
  const list = [];
  let x = 900;                                   // 시작 후 여유 거리
  const end = d.length - 700;                    // 결승선 앞 여유 거리

  if (mode === 'normal') {
    while (x < end) {
      if (Math.random() < 0.25) {
        list.push({ type: 'block', x, y: GROUND - SIZE, w: SIZE, h: SIZE });
        x += SIZE;
      } else {
        const n = 1 + Math.floor(Math.random() * d.maxSpikes);
        for (let i = 0; i < n; i++) {
          list.push({ type: 'spike', x: x + i * SIZE, y: GROUND - SIZE, w: SIZE, h: SIZE });
        }
        x += n * SIZE;
      }
      x += d.speed * 0.8 + Math.random() * d.speed * 0.6;   // 다음 장애물까지 간격
    }
  } else {
    const gap = d.flyGap;
    let center = GROUND / 2;
    while (x < end) {
      const lo = gap / 2 + 20, hi = GROUND - gap / 2 - 20;
      center += (Math.random() * 2 - 1) * 120;   // 이전 빈 공간에서 너무 멀지 않게 이동
      center = Math.max(lo, Math.min(hi, center));
      list.push({ type: 'pillar', x, y: 0, w: 60, h: center - gap / 2 });
      list.push({ type: 'pillar', x, y: center + gap / 2, w: 60, h: GROUND - (center + gap / 2) });
      x += 60 + d.flySpeed * 0.9 + Math.random() * 60;
    }
  }
  return list;
}

// ---------- 게임 업데이트 (매 프레임 호출) ----------
function update(dt) {
  game.time += dt;
  updateParticles(dt);

  if (game.dead) {                               // 충돌 후 잠깐 폭발 효과를 보여준 뒤 게임 오버
    game.deadTimer += dt;
    if (game.deadTimer > 0.7) gameOver();
    return;
  }

  movePlayer(dt);

  // 충돌 판정
  const p = game.player;
  for (const o of game.obstacles) {
    if (o.x > p.x + SIZE + 10) break;            // 장애물은 x순서 → 더 멀리 있는 건 검사 생략
    if (o.x + o.w < p.x - 10) continue;
    if (hitTest(p, o)) { crash(); return; }
  }

  // 결승선 도착
  if (p.x + SIZE >= game.length) gameClear();
}

// ---------- 캐릭터 이동 ----------
function movePlayer(dt) {
  const p = game.player;
  p.x += game.speed * dt;                        // 항상 오른쪽으로 자동 전진
  if (game.mode === 'normal') jumpMove(p, dt);
  else flyMove(p, dt);
}

// ---------- 점프 (일반 모드) ----------
// Space를 누르면 점프, 누른 채로 있으면 착지할 때마다 계속 점프
function jumpMove(p, dt) {
  const GRAVITY = 2200, JUMP_POWER = 720;
  if (spaceHeld && p.onGround) { p.vy = -JUMP_POWER; p.onGround = false; }

  p.vy += GRAVITY * dt;
  p.y += p.vy * dt;

  if (p.y >= GROUND - SIZE) {                    // 바닥에 착지
    p.y = GROUND - SIZE; p.vy = 0;
    if (!p.onGround) p.rot = Math.round(p.rot / (Math.PI / 2)) * (Math.PI / 2);
    p.onGround = true;
  }
  if (!p.onGround) p.rot += (Math.PI / 2) / 0.65 * dt;   // 공중에서 회전
}

// ---------- 비행 (비행 모드) ----------
// Space를 누르고 있으면 위로 상승, 떼면 아래로 하강
function flyMove(p, dt) {
  p.vy += (spaceHeld ? -1300 : 900) * dt;
  p.vy = Math.max(-380, Math.min(420, p.vy));
  p.y += p.vy * dt;
  if (p.y < 0) { p.y = 0; p.vy = 0; }            // 천장/바닥에 닿아도 죽지 않음
  if (p.y > GROUND - SIZE) { p.y = GROUND - SIZE; p.vy = 0; }
  p.rot = p.vy * 0.002;                          // 속도에 따라 살짝 기울기
}

// ---------- 충돌 판정 ----------
// 사각형끼리 겹치는지 검사. 조금 여유 있게(작게) 판정해서 억울한 죽음을 줄임
function hitTest(p, o) {
  const a = { x: p.x + 5, y: p.y + 5, w: SIZE - 10, h: SIZE - 10 };
  let b = { x: o.x, y: o.y, w: o.w, h: o.h };
  if (o.type === 'spike') b = { x: o.x + 11, y: o.y + 16, w: o.w - 22, h: o.h - 16 };
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// 충돌 순간: 폭발 효과 생성
function crash() {
  const p = game.player;
  game.dead = true;
  for (let i = 0; i < 24; i++) {
    const ang = Math.random() * Math.PI * 2, sp = 100 + Math.random() * 300;
    game.particles.push({ x: p.x + SIZE / 2, y: p.y + SIZE / 2, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 0.7 });
  }
}

function updateParticles(dt) {
  for (const q of game.particles) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 900 * dt; q.life -= dt; }
  game.particles = game.particles.filter((q) => q.life > 0);
}

// ---------- 게임 오버 ----------
function gameOver() {
  const pct = Math.min(99, Math.floor((game.player.x / game.length) * 100));
  $('over-text').textContent = '진행도 ' + pct + '%';
  showScreen('gameover');
}

// ---------- 게임 클리어 ----------
function gameClear() {
  $('clear-text').textContent = '결승선에 도착했어요! (' + game.time.toFixed(1) + '초)';
  showScreen('clear');
}

// ---------- 메인 메뉴 이동 ----------
function goToMenu() {
  game = null;
  spaceHeld = false;
  showScreen('menu');
}

// ---------- 화면 렌더링 ----------
function render(ts) {
  const cam = game ? game.player.x - PLAYER_SCREEN_X : ts * 0.15;   // 카메라 x (메뉴에서는 자동으로 흐름)
  drawBackground(cam);
  drawGround(cam);
  if (!game) return;
  drawFinishLine(cam);
  for (const o of game.obstacles) {
    const sx = o.x - cam;
    if (sx > W || sx + o.w < 0) continue;        // 화면 밖은 그리지 않음
    drawObstacle(o, sx);
  }
  if (!game.dead) drawPlayer(cam);
  drawParticles(cam);
  drawHUD();
}

// 배경: 그라데이션 + 느리게 움직이는 큰 도형(원근감)
function drawBackground(cam) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#141a3a'); g.addColorStop(1, '#2b2266');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = -1; i < 8; i++) {                 // 멀리 있는 큰 사각형
    const x = i * 220 - ((cam * 0.25) % 220);
    const h = 120 + ((i + 20) * 53) % 140;
    ctx.fillRect(x, GROUND - h, 140, h);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.09)';
  for (let i = -1; i < 12; i++) {                // 가까운 작은 사각형
    const x = i * 130 - ((cam * 0.5) % 130);
    const h = 40 + ((i + 20) * 37) % 70;
    ctx.fillRect(x, GROUND - h, 70, h);
  }
}

// 바닥
function drawGround(cam) {
  ctx.fillStyle = '#0d1030'; ctx.fillRect(0, GROUND, W, H - GROUND);
  ctx.fillStyle = '#5cf2e0'; ctx.fillRect(0, GROUND, W, 4);
  ctx.fillStyle = 'rgba(92,242,224,0.35)';
  for (let x = -(cam % 80); x < W; x += 80) ctx.fillRect(x, GROUND + 20, 40, 4);
}

// 결승선: 체크무늬 기둥
function drawFinishLine(cam) {
  const sx = game.length - cam;
  if (sx > W || sx < -40) return;
  for (let y = 0; y < GROUND; y += 20) {
    for (let i = 0; i < 2; i++) {
      ctx.fillStyle = ((y / 20 + i) % 2 === 0) ? '#ffffff' : '#111111';
      ctx.fillRect(sx + i * 20, y, 20, 20);
    }
  }
}

// 장애물 종류별로 다른 색/모양으로 그림
function drawObstacle(o, sx) {
  if (o.type === 'spike') {
    ctx.fillStyle = '#ff4d6d';
    ctx.beginPath();
    ctx.moveTo(sx, o.y + o.h); ctx.lineTo(sx + o.w / 2, o.y); ctx.lineTo(sx + o.w, o.y + o.h);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  } else if (o.type === 'block') {
    ctx.fillStyle = '#4db8ff'; ctx.fillRect(sx, o.y, o.w, o.h);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(sx + 1, o.y + 1, o.w - 2, o.h - 2);
  } else {
    ctx.fillStyle = '#4ade80'; ctx.fillRect(sx, o.y, o.w, o.h);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(sx + 1, o.y + 1, o.w - 2, o.h - 2);
  }
}

// 캐릭터: 노란 네모 + 눈
function drawPlayer() {
  const p = game.player;
  ctx.save();
  ctx.translate(PLAYER_SCREEN_X + SIZE / 2, p.y + SIZE / 2);
  ctx.rotate(p.rot);
  ctx.fillStyle = '#ffd84a'; ctx.fillRect(-SIZE / 2, -SIZE / 2, SIZE, SIZE);
  ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = 3; ctx.strokeRect(-SIZE / 2, -SIZE / 2, SIZE, SIZE);
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(2, -8, 8, 10); ctx.fillRect(-12, -8, 8, 10);
  ctx.restore();
}

function drawParticles(cam) {
  ctx.fillStyle = '#ffd84a';
  for (const q of game.particles) ctx.fillRect(q.x - cam - 4, q.y - 4, 8, 8);
}

// 진행도 표시줄과 조작 안내
function drawHUD() {
  const ratio = Math.min(1, game.player.x / game.length);
  ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(100, 16, W - 200, 10);
  ctx.fillStyle = '#5cf2e0'; ctx.fillRect(100, 16, (W - 200) * ratio, 10);
  ctx.fillStyle = '#fff'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(Math.floor(ratio * 100) + '%', W / 2, 44);
  if (game.time < 3) {
    ctx.font = '18px sans-serif';
    ctx.fillText(game.mode === 'normal' ? 'Space: 점프 (누르고 있으면 계속 점프)' : 'Space를 누르고 있으면 위로 상승', W / 2, 90);
  }
}

// ---------- 메인 루프 ----------
function loop(ts) {
  const dt = Math.min((ts - lastTime) / 1000, 1 / 30);   // 프레임 시간 (너무 큰 값은 제한)
  lastTime = ts;
  if (game && state === 'game') update(dt);
  render(ts);
  requestAnimationFrame(loop);
}

init();
