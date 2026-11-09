// Copyright (c) 2026 Christoph Medicus
// Licensed under the MIT License

(() => {
  const btn = document.getElementById('flyToggle');
  if (!btn) return;

  const MAIL_TO = 'dev@betakontext.de';
  const EMAIL_GREETING = 'Hello Christoph,';
  const COOLDOWN_MS = 30_000;

  const flies = [];
  const flyCleanup = new WeakMap();
  const caughtFlies = new WeakSet();

  let flyEl = null;
  let catchMode = false;
  let lastCaughtCount = 0;
  let roundState = 'playing';
  let cooldownTimer = null;

  const SIT_SCALE = 1;
  const FLIGHT_SCALE = 0.82;

  function injectFlyStyles(href = 'fly/styles.css') {
    const alreadyLoaded = Array.from(document.styleSheets)
      .some(sheet => sheet.href && sheet.href.includes('styles.css'));

    if (!alreadyLoaded) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    }
  }

  function injectSwatterStyles() {
    if (document.getElementById('swatter-styles')) return;

    const style = document.createElement('style');
    style.id = 'swatter-styles';
    style.textContent = `
      .swatter-cursor {
        display: none;
        position: fixed;
        left: 0;
        top: 0;
        width: min(230px, 45vw, 45vh);
        aspect-ratio: 1;
        pointer-events: none;
        z-index: 99999;
        transform: translate(-50%, -50%) rotate(-14deg);
        transform-origin: 50% 50%;
        filter: drop-shadow(3px 5px 4px rgba(0, 0, 0, .35));
        will-change: transform;
      }

      .swatter-cursor svg {
        display: block;
        width: 100%;
        height: 100%;
        overflow: visible;
      }

      body.catch-mode,
      body.catch-mode * {
        cursor: none !important;
      }

      body.catch-mode .swatter-cursor {
        display: block;
      }

      .swatter-cursor.swatting {
        animation: swatter-swat 230ms cubic-bezier(.2, .8, .25, 1);
      }

      @keyframes swatter-swat {
        0% {
          transform: translate(-50%, -50%) rotate(-14deg) scale(1);
        }
        38% {
          transform: translate(-50%, -50%) rotate(24deg) scale(.94, .9);
        }
        62% {
          transform: translate(-50%, -50%) rotate(9deg) scale(1.02, .96);
        }
        100% {
          transform: translate(-50%, -50%) rotate(-14deg) scale(1);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .swatter-cursor.swatting {
          animation-duration: 1ms;
        }
      }
    `;

    document.head.appendChild(style);
  }

  injectFlyStyles();
  injectSwatterStyles();

  function cssVar(name, fallback) {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();

    if (!value) return fallback;
    if (value.endsWith('ms')) return parseFloat(value);
    if (value.endsWith('px')) return parseFloat(value);

    const number = Number(value);
    return Number.isNaN(number) ? fallback : number;
  }

  function randomViewportPos(margin = 12) {
    const size = cssVar('--fly-size', 40);
    const width = Math.max(0, window.innerWidth - size - margin * 2);
    const height = Math.max(0, window.innerHeight - size - margin * 2);

    return {
      x: margin + Math.random() * width,
      y: margin + Math.random() * height
    };
  }

  function createFlySVG() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');

    svg.setAttribute('viewBox', '0 0 64 64');
    svg.setAttribute('aria-hidden', 'true');

    svg.innerHTML = `
      <g fill="none" stroke="black" stroke-width="2" stroke-linecap="round">
        <g class="wings-top">
          <ellipse cx="22" cy="38" rx="23" ry="7" fill="#d2f0ff"
            fill-opacity=".35" stroke="#2878a0" stroke-opacity=".6"/>
          <ellipse cx="42" cy="38" rx="23" ry="7" fill="#d2f0ff"
            fill-opacity=".35" stroke="#2878a0" stroke-opacity=".6"/>
        </g>
        <g class="wings-bottom">
          <ellipse cx="22" cy="40" rx="18" ry="8" fill="#d2f0ff"
            fill-opacity=".35" stroke="#2878a0" stroke-opacity=".6"/>
          <ellipse cx="42" cy="40" rx="18" ry="8" fill="#d2f0ff"
            fill-opacity=".35" stroke="#2878a0" stroke-opacity=".6"/>
        </g>
        <ellipse cx="32" cy="38" rx="7" ry="18" fill="#1f2937" stroke="#111827"/>
        <ellipse cx="32" cy="25" rx="8" ry="5" fill="#1f2937" stroke="#111827"/>
        <g class="legs-front" stroke="#111">
          <path d="M33 14L22 35"/>
          <path d="M31 14L42 35"/>
        </g>
        <g class="legs-middle" stroke="#111">
          <path d="M22 32L46 54"/>
          <path d="M42 32L18 54"/>
        </g>
        <g class="legs-back" stroke="#111">
          <path d="M28 48L20 60"/>
          <path d="M36 48L44 60"/>
        </g>
        <circle cx="28" cy="24" r="2.5" fill="#fff" stroke="#333"/>
        <circle cx="36" cy="24" r="2.5" fill="#fff" stroke="#333"/>
      </g>`;

    return svg;
  }

  function randomSplatStyle() {
    const size = 18 + Math.floor(Math.random() * 18);
    const cores = ['#b91c1c', '#991b1b', '#7f1d1d'];
    const rings = ['#ef4444', '#dc2626', '#f87171'];
    const darks = ['#7f1d1d', '#6b1010', '#5b0f0f'];

    const core = cores[Math.floor(Math.random() * cores.length)];
    const ring = rings[Math.floor(Math.random() * rings.length)];
    const dark = darks[Math.floor(Math.random() * darks.length)];

    const backgrounds = [
      `radial-gradient(circle at 50% 50%, ${core} 0 35%, ${dark} 60%, transparent 65%)`
    ];

    const drops = 3 + Math.floor(Math.random() * 4);

    for (let i = 0; i < drops; i++) {
      const x = 5 + Math.floor(Math.random() * 90);
      const y = 5 + Math.floor(Math.random() * 90);
      const radius = 4 + Math.floor(Math.random() * 7);
      const color = Math.random() < 0.5 ? ring : core;

      backgrounds.push(
        `radial-gradient(circle at ${x}% ${y}%, ${color} 0 ${radius}%, transparent ${radius + 1}%)`
      );
    }

    return { size, background: backgrounds.join(', ') };
  }

  const swatterCursor = document.createElement('div');
  swatterCursor.className = 'swatter-cursor';
  swatterCursor.setAttribute('aria-hidden', 'true');
  swatterCursor.innerHTML = `
    <svg viewBox="0 0 230 230" aria-hidden="true">
      <defs>
        <linearGradient id="swatter-red-frame" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ff7777"/>
          <stop offset=".45" stop-color="#e52332"/>
          <stop offset="1" stop-color="#a80d1a"/>
        </linearGradient>

        <linearGradient id="swatter-red-handle" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ff777b"/>
          <stop offset=".5" stop-color="#e51c2b"/>
          <stop offset="1" stop-color="#a90e1a"/>
        </linearGradient>

        <pattern id="swatter-red-mesh"
          width="9" height="9"
          patternUnits="userSpaceOnUse">
          <path d="M0 0H9M0 0V9"
            fill="none"
            stroke="#d91e2d"
            stroke-width="2.2"/>
        </pattern>

        <clipPath id="swatter-hand-clip">
          <path d="
            M39 111
            C24 104 22 91 34 81
            C23 72 25 59 39 52
            C31 39 39 27 52 29
            C53 15 68 10 79 24
            C86 9 101 10 108 26
            C117 12 133 15 137 32
            C151 31 160 43 155 58
            C170 64 174 79 164 91
            C177 104 173 119 160 127
            C166 143 155 157 140 155
            C129 172 109 175 96 161
            C79 173 60 165 59 149
            C42 153 30 141 37 127
            C28 122 29 115 39 111
            Z"/>
        </clipPath>
      </defs>

      <!-- Langer, leicht gerundeter Kunststoffstiel -->
      <path d="M145 145L226 226"
        fill="none"
        stroke="#a80d1a"
        stroke-width="19"
        stroke-linecap="round"/>

      <path d="M145 143L224 222"
        fill="none"
        stroke="url(#swatter-red-handle)"
        stroke-width="14"
        stroke-linecap="round"/>

      <path d="M151 145L218 212"
        fill="none"
        stroke="#ff9a9e"
        stroke-opacity=".7"
        stroke-width="2"
        stroke-linecap="round"/>

      <!-- Handförmiger Kopf: Raster ohne gefüllten Hintergrund -->
      <path d="
        M39 111
        C24 104 22 91 34 81
        C23 72 25 59 39 52
        C31 39 39 27 52 29
        C53 15 68 10 79 24
        C86 9 101 10 108 26
        C117 12 133 15 137 32
        C151 31 160 43 155 58
        C170 64 174 79 164 91
        C177 104 173 119 160 127
        C166 143 155 157 140 155
        C129 172 109 175 96 161
        C79 173 60 165 59 149
        C42 153 30 141 37 127
        C28 122 29 115 39 111
        Z"
        transform="translate(2 3)"
        fill="#8f101a"
        opacity=".28"/>

      <path d="
        M39 111
        C24 104 22 91 34 81
        C23 72 25 59 39 52
        C31 39 39 27 52 29
        C53 15 68 10 79 24
        C86 9 101 10 108 26
        C117 12 133 15 137 32
        C151 31 160 43 155 58
        C170 64 174 79 164 91
        C177 104 173 119 160 127
        C166 143 155 157 140 155
        C129 172 109 175 96 161
        C79 173 60 165 59 149
        C42 153 30 141 37 127
        C28 122 29 115 39 111
        Z"
        fill="url(#swatter-red-mesh)"
        clip-path="url(#swatter-hand-clip)"/>

      <!-- Erhabener roter Rand -->
      <path d="
        M39 111
        C24 104 22 91 34 81
        C23 72 25 59 39 52
        C31 39 39 27 52 29
        C53 15 68 10 79 24
        C86 9 101 10 108 26
        C117 12 133 15 137 32
        C151 31 160 43 155 58
        C170 64 174 79 164 91
        C177 104 173 119 160 127
        C166 143 155 157 140 155
        C129 172 109 175 96 161
        C79 173 60 165 59 149
        C42 153 30 141 37 127
        C28 122 29 115 39 111
        Z"
        fill="none"
        stroke="url(#swatter-red-frame)"
        stroke-width="5"
        stroke-linejoin="round"/>

      <!-- Dezente Lichtkanten für glänzenden Kunststoff -->
      <path d="M43 51C40 42 46 34 54 34M83 25C89 18 99 19 103 27"
        fill="none"
        stroke="#ffb0b3"
        stroke-opacity=".8"
        stroke-width="2"
        stroke-linecap="round"/>
    </svg>`;



  document.body.appendChild(swatterCursor);

  function setCatchMode(enabled) {
    catchMode = enabled;
    document.body.classList.toggle('catch-mode', enabled);
    btn.setAttribute('aria-pressed', String(enabled));
  }

  function playSwatAnimation() {
    swatterCursor.classList.remove('swatting');
    void swatterCursor.offsetWidth;
    swatterCursor.classList.add('swatting');
  }

  function updateButtonLabel() {
    if (flies.length === 1) {
      btn.textContent = 'Catch the fly!';
      btn.setAttribute('aria-label', 'Catch the fly!');
      btn.classList.add('state-kill');
      btn.classList.remove('state-get');
    } else if (flies.length > 1) {
      btn.textContent = 'Catch the flies!';
      btn.setAttribute('aria-label', 'Catch the flies!');
      btn.classList.add('state-kill');
      btn.classList.remove('state-get');
    } else {
      btn.textContent = 'Get in touch :)';
      btn.setAttribute('aria-label', 'Get in touch :)');
      btn.classList.remove('state-kill');
      btn.classList.add('state-get');
    }
  }

  function getTransformPosition(el) {
    const transform = getComputedStyle(el).transform;

    if (!transform || transform === 'none') {
      const rect = el.getBoundingClientRect();
      return { x: rect.left, y: rect.top, angle: 0 };
    }

    const is3d = transform.startsWith('matrix3d');
    const values = transform
      .slice(is3d ? 9 : 7, -1)
      .split(',')
      .map(Number);

    return {
      x: is3d ? values[12] : values[4],
      y: is3d ? values[13] : values[5],
      angle: Math.atan2(values[1], values[0])
    };
  }

  function makeFlightKeyframes(from, to) {
    const points = [from];

    for (let i = 0; i < 3; i++) {
      points.push(randomViewportPos(8));
    }

    points.push(to);

    const totalSegments = points.length - 1;
    const frames = [];

    for (let i = 0; i < totalSegments; i++) {
      const start = points[i];
      const end = points[i + 1];
      const angle = Math.atan2(end.y - start.y, end.x - start.x);

      frames.push({
        transform:
          `translate(${start.x}px, ${start.y}px) ` +
          `rotate(${angle}rad) scale(${FLIGHT_SCALE})`,
        offset: i / totalSegments
      });
    }

    const last = points[points.length - 1];
    const previous = points[points.length - 2];
    const lastAngle = Math.atan2(last.y - previous.y, last.x - previous.x);

    frames.push({
      transform:
        `translate(${last.x}px, ${last.y}px) ` +
        `rotate(${lastAngle}rad) scale(${FLIGHT_SCALE})`,
      offset: 1
    });

    return frames;
  }

  function createExplosion(el) {
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const particleCount = 10 + Math.floor(Math.random() * 8);

    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';

      const angle = Math.random() * Math.PI * 2;
      const distance = 30 + Math.random() * 70;

      particle.style.left = `${cx}px`;
      particle.style.top = `${cy}px`;
      particle.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
      particle.style.setProperty('--dy', `${Math.sin(angle) * distance}px`);

      document.body.appendChild(particle);
      particle.addEventListener(
        'animationend',
        () => particle.remove(),
        { once: true }
      );
    }

    const splat = document.createElement('div');
    splat.className = 'splat';

    const style = randomSplatStyle();
    splat.style.left = `${cx}px`;
    splat.style.top = `${cy}px`;
    splat.style.width = `${style.size}px`;
    splat.style.height = `${style.size}px`;
    splat.style.backgroundImage = style.background;
    splat.style.transform =
      `translate(-50%, -50%) rotate(${Math.random() * 80 - 40}deg)`;

    document.body.appendChild(splat);

    setTimeout(() => {
      splat.style.opacity = '0';
      setTimeout(() => splat.remove(), 420);
    }, 5000);
  }

  function beginCooldown() {
    if (roundState === 'cooldown') return;

    roundState = 'cooldown';
    setCatchMode(false);
    updateButtonLabel();

    if (cooldownTimer) clearTimeout(cooldownTimer);

    cooldownTimer = setTimeout(() => {
      roundState = 'ready';
      cooldownTimer = null;
      // Button bleibt auf „Get in touch“.
      // Der nächste Seitenklick startet eine neue Runde.
    }, COOLDOWN_MS);
  }

  function createFly() {
    if (roundState === 'cooldown') return null;

    if (flies.length === 0) {
      lastCaughtCount = 0;
      roundState = 'playing';
    }

    const el = document.createElement('div');
    el.className = 'fly';

    const start = randomViewportPos();
    el.style.transform =
      `translate(${start.x}px, ${start.y}px) rotate(0rad) scale(${SIT_SCALE})`;
    el.appendChild(createFlySVG());
    document.body.appendChild(el);

    flies.push(el);

    let animation = null;
    let perchTimer = null;
    let perching = false;
    let stopped = false;

    function stop() {
      if (stopped) return;
      stopped = true;

      if (perchTimer) {
        clearTimeout(perchTimer);
        perchTimer = null;
      }

      try {
        animation?.cancel();
      } catch {}

      window.removeEventListener('pointermove', onPointerMove);
    }

    flyCleanup.set(el, stop);

    function startFlight() {
      if (stopped || !el.isConnected) return;

      perching = false;
      el.classList.remove('perching', 'walking');

      if (perchTimer) {
        clearTimeout(perchTimer);
        perchTimer = null;
      }

      try {
        animation?.cancel();
      } catch {}

      const rect = el.getBoundingClientRect();
      const from = { x: rect.left, y: rect.top };
      const to = randomViewportPos(8);

      const minDuration = cssVar('--fly-min-duration', 900);
      const maxDuration = cssVar('--fly-max-duration', 1800);
      const duration = Math.floor(
        minDuration +
        Math.random() * Math.max(0, maxDuration - minDuration)
      );

      animation = el.animate(makeFlightKeyframes(from, to), {
        duration,
        easing: 'linear',
        fill: 'forwards'
      });

      animation.onfinish = () => {
        if (stopped) return;

        try {
          animation.commitStyles();
        } catch {}

        try {
          animation.cancel();
        } catch {}

        const position = getTransformPosition(el);
        const jitter = (Math.random() * 24 - 12) * Math.PI / 180;

        el.style.transform =
          `translate(${position.x}px, ${position.y}px) ` +
          `rotate(${position.angle + jitter}rad) scale(${SIT_SCALE})`;

        startPerch();
      };
    }

    function startPerch() {
      if (stopped || !el.isConnected) return;

      perching = true;
      el.classList.add('perching');
      el.classList.remove('walking');

      perchTimer = setTimeout(
        startFlight,
        cssVar('--perch-time', 5000)
      );
    }

    function onPointerMove(event) {
      if (!perching || stopped || !el.isConnected) return;

      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const radius = cssVar('--scare-radius', 90);

      if (Math.hypot(cx - event.clientX, cy - event.clientY) <= radius) {
        startFlight();
      }
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true });

    startFlight();
    updateButtonLabel();

    return el;
  }

  function catchFly(el) {
    if (!flies.includes(el) || caughtFlies.has(el)) return;

    caughtFlies.add(el);
    flyCleanup.get(el)?.();

    const index = flies.indexOf(el);
    if (index !== -1) flies.splice(index, 1);

    if (el === flyEl) flyEl = null;

    lastCaughtCount++;
    updateButtonLabel();

    setTimeout(() => {
      if (!el.isConnected) return;
      createExplosion(el);
      el.remove();
    }, 110);

    if (flies.length === 0) {
      beginCooldown();
    }
  }

  function catchFliesAt(x, y) {
    const cursorRect = swatterCursor.getBoundingClientRect();

    // Netzfläche: 168 von 230 SVG-Einheiten breit.
    const halfSurface = cursorRect.width * (168 / 230) / 2;

    const hits = flies.filter(el => {
      if (caughtFlies.has(el)) return false;

      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const overlapsNet =
        rect.right >= x - halfSurface &&
        rect.left <= x + halfSurface &&
        rect.bottom >= y - halfSurface &&
        rect.top <= y + halfSurface;

      const withinRadius =
        Math.hypot(centerX - x, centerY - y) <= 50;

      return overlapsNet || withinRadius;
    });

    if (hits.length === 0) return;

    playSwatAnimation();
    hits.forEach(catchFly);
  }

  function explodeAllFlies() {
    const snapshot = [...flies];

    lastCaughtCount += snapshot.length;

    for (const el of snapshot) {
      flyCleanup.get(el)?.();
      createExplosion(el);
      el.remove();

      const index = flies.indexOf(el);
      if (index !== -1) flies.splice(index, 1);

      if (el === flyEl) flyEl = null;
    }

    updateButtonLabel();
    beginCooldown();
  }

  function caughtText(count) {
    if (count === 1) return 'I caught a fly!';
    if (count > 1) return `I caught ${count} flies!`;
    return 'I would like to get in touch.';
  }

  function openEmail() {
    const count = lastCaughtCount;
    const subject = count === 1
      ? 'I caught a fly'
      : count > 1
        ? `I caught ${count} flies`
        : 'Get in touch';

    const body = encodeURIComponent(
      `${EMAIL_GREETING}\n\n${caughtText(count)}\n`
    );

    window.location.href =
      `mailto:${MAIL_TO}?subject=${encodeURIComponent(subject)}&body=${body}`;
  }

  window.addEventListener('pointermove', event => {
    swatterCursor.style.left = `${event.clientX}px`;
    swatterCursor.style.top = `${event.clientY}px`;
  }, { passive: true });

  // Klick im Fangmodus: Netzfläche oder 50-Pixel-Radius prüfen.
  document.addEventListener('click', event => {
    if (!catchMode) return;

    const target = event.target instanceof Element
      ? event.target
      : event.target?.parentElement;

    if (target?.closest('#flyToggle')) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    catchFliesAt(event.clientX, event.clientY);
  }, true);

  btn.addEventListener('click', event => {
    event.preventDefault();

    if (flies.length > 0) {
      setCatchMode(!catchMode);
    } else {
      openEmail();
    }
  });

  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || roundState !== 'playing') return;

    explodeAllFlies();
  });

  // Seitenklicks erzeugen nur außerhalb der 30-Sekunden-Pause Fliegen.
  document.addEventListener('click', event => {
    const target = event.target instanceof Element
      ? event.target
      : event.target?.parentElement;

    if (!target || roundState === 'cooldown') return;

    const interactiveSelector =
      'a, button, [role="button"], input, textarea, select, label, summary, details, ' +
      '[contenteditable=""], [contenteditable="true"], .fly';

    if (target.closest(interactiveSelector)) return;

    createFly();
  });

  // Eine Fliege zum Start.
  flyEl = createFly();
  updateButtonLabel();
})();
