import { useEffect } from 'react';

// Real pixel-art animation for the Cosmic accent: a canvas starfield with
// twinkling constellations, an orbiting pixel planet + moon, drifting UFOs,
// and occasional shooting stars. Mounted to <body> so it sits behind the
// translucent app chrome (like the sakura/sunset CSS atmospheres it replaces).
// Screen-only, pointer-events: none, and static when reduced motion is on.

const PIXEL = 3; // device px per logical pixel — chunky, deliberately blocky
const FPS = 14; // low frame rate reinforces the retro pixel-art feel

type Star = { x: number; y: number; phase: number; speed: number; color: string };
type Ufo = { x: number; y: number; vx: number; row: number; hue: string };
type Shooting = { x: number; y: number; vx: number; vy: number; life: number };

function isCosmic(): boolean {
  return document.documentElement.classList.contains('accent-cosmic');
}

export function CosmicBackground() {
  useEffect(() => {
    let teardown: (() => void) | null = null;

    const sync = () => {
      if (isCosmic() && !teardown) {
        teardown = start();
      } else if (!isCosmic() && teardown) {
        teardown();
        teardown = null;
      }
    };

    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    sync();

    return () => {
      observer.disconnect();
      teardown?.();
      teardown = null;
    };
  }, []);

  return null;
}

function start(): () => void {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    zIndex: '0',
    pointerEvents: 'none',
    imageRendering: 'pixelated',
  });
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return () => {};
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let width = 0;
  let height = 0;
  let cols = 0;
  let rows = 0;
  let stars: Star[] = [];
  let ufos: Ufo[] = [];
  let shooting: Shooting | null = null;
  let tick = 0;

  const starPalette = ['#a5f3fc', '#c4b5fd', '#ffffff', '#67e8f9', '#f5d0fe'];

  const px = (gx: number, gy: number, w = 1, h = 1) => {
    ctx.fillRect(Math.round(gx) * PIXEL, Math.round(gy) * PIXEL, w * PIXEL, h * PIXEL);
  };

  const makeUfo = (offset = 0): Ufo => {
    const dir = Math.random() > 0.5 ? 1 : -1;
    return {
      x: dir === 1 ? -12 - offset * cols : cols + 12 + offset * cols,
      y: 6 + Math.random() * Math.max(6, rows * 0.5),
      vx: dir * (0.12 + Math.random() * 0.16),
      row: 0,
      hue: Math.random() > 0.5 ? '#22d3ee' : '#c4b5fd',
    };
  };

  const seed = () => {
    const count = Math.min(340, Math.max(40, Math.round((cols * rows) / 850)));
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * cols,
      y: Math.random() * rows,
      phase: Math.random() * Math.PI * 2,
      speed: 0.04 + Math.random() * 0.12,
      color: starPalette[Math.floor(Math.random() * starPalette.length)],
    }));
    ufos = [makeUfo(0), makeUfo(0.6)];
    shooting = null;
  };

  const resize = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    cols = Math.ceil(width / PIXEL);
    rows = Math.ceil(height / PIXEL);
    ctx.imageSmoothingEnabled = false;
    seed();
    if (reduceMotion) render();
  };

  const drawPlanet = () => {
    // Orbiting pixel planet parked toward the top-right, with a ring + moon.
    const cx = cols - 24;
    const cy = 22;
    const r = 9;
    const drift = reduceMotion ? 0 : Math.sin(tick * 0.02) * 2;

    // Ring (behind).
    ctx.fillStyle = '#22d3ee';
    for (let a = Math.PI * 0.05; a < Math.PI; a += 0.14) {
      const rx = Math.cos(a) * (r + 5);
      const ry = Math.sin(a) * 3;
      px(cx - rx, cy + ry + drift);
    }

    // Body with simple left-light shading.
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y > r * r) continue;
        const shade = x * 0.8 + y * 0.4;
        ctx.fillStyle = shade < -r * 0.35 ? '#ddd6fe' : shade > r * 0.35 ? '#5b21b6' : '#8b5cf6';
        px(cx + x, cy + y + drift);
      }
    }

    // Ring (front half).
    ctx.fillStyle = '#67e8f9';
    for (let a = Math.PI; a < Math.PI * 1.95; a += 0.14) {
      const rx = Math.cos(a) * (r + 5);
      const ry = Math.sin(a) * 3;
      px(cx - rx, cy + ry + drift);
    }

    // Moon orbiting the planet.
    const moonAngle = tick * 0.05;
    const mx = cx + Math.cos(moonAngle) * (r + 9);
    const my = cy + Math.sin(moonAngle) * 5 + drift;
    ctx.fillStyle = '#e0e7ff';
    px(mx, my, 2, 2);
  };

  const drawUfo = (u: Ufo) => {
    const x = Math.round(u.x);
    const y = Math.round(u.y);
    const bob = reduceMotion ? 0 : Math.round(Math.sin(tick * 0.2 + u.x * 0.1));
    const yy = y + bob;
    // Dome.
    ctx.fillStyle = '#e0f2fe';
    px(x + 3, yy, 3, 1);
    px(x + 2, yy + 1, 5, 1);
    // Saucer body.
    ctx.fillStyle = u.hue;
    px(x + 1, yy + 2, 7, 1);
    // Glow underside.
    ctx.fillStyle = 'rgba(34,211,238,0.45)';
    px(x, yy + 3, 9, 1);
    // Blinking lights.
    if (Math.floor(tick / 3) % 2 === 0) {
      ctx.fillStyle = '#fde68a';
      px(x + 1, yy + 2);
      px(x + 7, yy + 2);
    }
  };

  const render = () => {
    ctx.clearRect(0, 0, width, height);

    // Stars.
    for (const star of stars) {
      const twinkle = 0.45 + 0.55 * ((Math.sin(tick * star.speed + star.phase) + 1) / 2);
      const quantized = Math.round(twinkle * 3) / 3;
      ctx.globalAlpha = quantized;
      ctx.fillStyle = star.color;
      px(star.x, star.y);
      // Brighter stars get a little pixel cross.
      if (star.speed > 0.13 && quantized > 0.8) {
        px(star.x - 1, star.y);
        px(star.x + 1, star.y);
        px(star.x, star.y - 1);
        px(star.x, star.y + 1);
      }
    }
    ctx.globalAlpha = 1;

    drawPlanet();
    for (const u of ufos) drawUfo(u);

    if (shooting) {
      ctx.fillStyle = '#ffffff';
      px(shooting.x, shooting.y, 2, 2);
      ctx.fillStyle = 'rgba(165,243,252,0.7)';
      for (let i = 1; i <= 5; i++) {
        px(shooting.x - shooting.vx * i, shooting.y - shooting.vy * i);
      }
    }
  };

  const step = () => {
    tick += 1;
    for (const u of ufos) {
      u.x += u.vx;
      if (u.vx > 0 && u.x > cols + 14) Object.assign(u, makeUfo(0));
      if (u.vx < 0 && u.x < -14) Object.assign(u, makeUfo(0));
    }
    if (shooting) {
      shooting.x += shooting.vx;
      shooting.y += shooting.vy;
      shooting.life -= 1;
      if (shooting.life <= 0 || shooting.x > cols || shooting.y > rows) shooting = null;
    } else if (Math.random() < 0.03) {
      shooting = {
        x: Math.random() * cols * 0.6,
        y: Math.random() * rows * 0.4,
        vx: 2 + Math.random() * 2,
        vy: 1 + Math.random(),
        life: 24 + Math.round(Math.random() * 12),
      };
    }
    render();
  };

  let raf = 0;
  let last = 0;
  const frameInterval = 1000 / FPS;
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (now - last < frameInterval) return;
    last = now;
    step();
  };

  resize();
  window.addEventListener('resize', resize);

  if (reduceMotion) {
    render();
  } else {
    raf = requestAnimationFrame(loop);
  }

  return () => {
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    canvas.remove();
  };
}
