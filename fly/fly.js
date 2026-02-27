// Copyright (c) 2026 Christoph Medicus
// Licensed under the MIT License

(() => {
  const btn = document.getElementById('flyToggle');
  const hud = document.querySelector('.hud');

  const LABEL_KILL = 'Catch the fly!';
  const LABEL_GET  = 'Get in touch :)';
  const MAIL_TO = 'info@betakontext.de';

  let flyEl = null;
  let perchTimer = null;
  let landCount = 0;
  let nextWalkIn = 2 + Math.floor(Math.random() * 3); // 2..4
  let lastFlightAngle = 0; // aus persistierter Flug-Endpose

  let isAlive = false;
  let currentAnim = null;
  let mousePos = { x: -9999, y: -9999 };
  let isPerching = false;

  // Verhalten: Flug kleiner; Sitzen/Laufen größer
  const SIT_SCALE = 1.0;
  const FLIGHT_SCALE = 0.82;

  // Laufmodus: preferUp = true → Vorwärtsvektor wird in obere Halbebene projiziert (dy < 0)
  const preferUp = true;

  // CSS dynamisch einbinden (Pfad ggf. anpassen)
  function injectFlyStyles(href = 'fly/styles.css') {
    const already = Array.from(document.styleSheets).some(s => s.href && s.href.includes('styles.css'));
    if (!already) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    }
  }
  injectFlyStyles();

  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (!v) return fallback;
    if (v.endsWith('ms')) return parseInt(v, 10);
    if (v.endsWith('px')) return parseFloat(v);
    const n = Number(v);
    return isNaN(n) ? v : n;
  }

  function randomViewportPos(margin = 12) {
    const flySize = cssVar('--fly-size', 40);
    const w = window.innerWidth, h = window.innerHeight;
    const x = Math.random() * (w - flySize - margin * 2) + margin;
    const y = Math.random() * (h - flySize - margin * 2) + margin;
    return { x, y };
  }

  // Inline-SVG
  function createFlySVG() {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 64 64');

    const g = document.createElementNS(ns, 'g');
    g.setAttribute('fill', 'none');
    g.setAttribute('stroke', 'black');
    g.setAttribute('stroke-width', '2');
    g.setAttribute('stroke-linecap', 'round');
    svg.appendChild(g);

    // Flügel oben
    const wingsTop = document.createElementNS(ns, 'g');
    wingsTop.setAttribute('class', 'wings-top');
    const w1 = document.createElementNS(ns, 'ellipse');
    w1.setAttribute('cx', '22'); w1.setAttribute('cy', '38'); w1.setAttribute('rx', '23'); w1.setAttribute('ry', '7');
    w1.setAttribute('fill', '#d2f0ff'); w1.setAttribute('fill-opacity', '0.35');
    w1.setAttribute('stroke', '#2878a0'); w1.setAttribute('stroke-opacity', '0.6');
    const w2 = w1.cloneNode(false);
    w2.setAttribute('cx', '42');
    wingsTop.appendChild(w1); wingsTop.appendChild(w2);
    g.appendChild(wingsTop);

    // Flügel unten
    const wingsBottom = document.createElementNS(ns, 'g');
    wingsBottom.setAttribute('class', 'wings-bottom');
    const wb1 = document.createElementNS(ns, 'ellipse');
    wb1.setAttribute('cx', '22'); wb1.setAttribute('cy', '40'); wb1.setAttribute('rx', '18'); wb1.setAttribute('ry', '8');
    wb1.setAttribute('fill', '#d2f0ff'); wb1.setAttribute('fill-opacity', '0.35');
    wb1.setAttribute('stroke', '#2878a0'); wb1.setAttribute('stroke-opacity', '0.6');
    const wb2 = wb1.cloneNode(false);
    wb2.setAttribute('cx', '42');
    wingsBottom.appendChild(wb1); wingsBottom.appendChild(wb2);
    g.appendChild(wingsBottom);

    // Körper
    const body = document.createElementNS(ns, 'ellipse');
    body.setAttribute('cx', '32'); body.setAttribute('cy', '38'); body.setAttribute('rx', '7'); body.setAttribute('ry', '18');
    body.setAttribute('fill', '#1f2937'); body.setAttribute('stroke', '#111827');
    g.appendChild(body);

    // Kopf
    const head = document.createElementNS(ns, 'ellipse');
    head.setAttribute('cx', '32'); head.setAttribute('cy', '25'); head.setAttribute('rx', '8'); head.setAttribute('ry', '5');
    head.setAttribute('fill', '#1f2937'); head.setAttribute('stroke', '#111827');
    g.appendChild(head);

    // Vorderbeine
    const legsFront = document.createElementNS(ns, 'g');
    legsFront.setAttribute('class', 'legs-front');
    const lf1 = document.createElementNS(ns, 'path');
    lf1.setAttribute('d', 'M33 14 L22 35'); lf1.setAttribute('stroke', '#111');
    const lf2 = document.createElementNS(ns, 'path');
    lf2.setAttribute('d', 'M31 14 L42 35'); lf2.setAttribute('stroke', '#111');
    legsFront.appendChild(lf1); legsFront.appendChild(lf2);
    g.appendChild(legsFront);

    // Mittelbeine
    const legsMiddle = document.createElementNS(ns, 'g');
    legsMiddle.setAttribute('class', 'legs-middle');
    const lm1 = document.createElementNS(ns, 'path');
    lm1.setAttribute('d', 'M22 32 L46 54'); lm1.setAttribute('stroke', '#111');
    const lm2 = document.createElementNS(ns, 'path');
    lm2.setAttribute('d', 'M42 32 L18 54'); lm2.setAttribute('stroke', '#111');
    legsMiddle.appendChild(lm1); legsMiddle.appendChild(lm2);
    g.appendChild(legsMiddle);

    // Hinterbeine
    const legsBack = document.createElementNS(ns, 'g');
    const lb1 = document.createElementNS(ns, 'path');
    const lb2 = document.createElementNS(ns, 'path');
    legsBack.setAttribute('class', 'legs-back');
    lb1.setAttribute('d', 'M28 48 L20 60'); lb1.setAttribute('stroke', '#111');
    lb2.setAttribute('d', 'M36 48 L44 60'); lb2.setAttribute('stroke', '#111');
    legsBack.appendChild(lb1); legsBack.appendChild(lb2);
    g.appendChild(legsBack);

    // Augen
    const eye1 = document.createElementNS(ns, 'circle');
    eye1.setAttribute('cx', '28'); eye1.setAttribute('cy', '24'); eye1.setAttribute('r', '2.5');
    eye1.setAttribute('fill', '#fefefe'); eye1.setAttribute('stroke', '#333');
    const eye2 = eye1.cloneNode(false);
    eye2.setAttribute('cx', '36');
    g.appendChild(eye1); g.appendChild(eye2);

    return svg;
  }

  function currentFlyPos() {
    const rect = flyEl.getBoundingClientRect();
    return { x: rect.left, y: rect.top, cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
  }

  function getElementAngleScale(el) {
    const st = getComputedStyle(el);
    const tr = st.transform || 'matrix(1, 0, 0, 1, 0, 0)';
    if (tr === 'none') return { angle: 0, scale: 1 };
    const parts = tr.startsWith('matrix3d') ? tr.slice(9, -1).split(',').map(parseFloat)
                                            : tr.slice(7, -1).split(',').map(parseFloat);
    const a = parts[0], b = parts[1];
    const scale = Math.hypot(a, b);
    const angle = Math.atan2(b, a);
    return { angle, scale };
  }

  function getElementTranslate(el) {
    const st = getComputedStyle(el);
    const tr = st.transform;
    if (!tr || tr === 'none') return { x: 0, y: 0 };
    if (tr.startsWith('matrix3d')) {
      const m = tr.slice(9, -1).split(',').map(parseFloat);
      return { x: m[12], y: m[13] };
    } else {
      const m = tr.slice(7, -1).split(',').map(parseFloat);
      return { x: m[4], y: m[5] };
    }
  }

  function randomSplatStyle() {
    const base = 18 + Math.floor(Math.random() * 18);
    const coreColor = ['#b91c1c', '#991b1b', '#7f1d1d'][Math.floor(Math.random()*3)];
    const ringColor = ['#ef4444', '#dc2626', '#f87171'][Math.floor(Math.random()*3)];
    const darkColor = ['#7f1d1d', '#6b1010', '#5b0f0f'][Math.floor(Math.random()*3)];
    const blobs = [];
    blobs.push(`radial-gradient(circle at 50% 50%, ${coreColor} 0 ${30 + Math.floor(Math.random()*10)}%, ${darkColor} ${55 + Math.floor(Math.random()*10)}%, transparent ${56 + Math.floor(Math.random()*8)}%)`);
    const drops = 3 + Math.floor(Math.random()*4);
    for (let i = 0; i < drops; i++) {
      const cx = Math.floor(Math.random()*90)+5;
      const cy = Math.floor(Math.random()*90)+5;
      const r0 = 8 + Math.floor(Math.random()*14);
      const color = Math.random() < 0.5 ? ringColor : coreColor;
      blobs.push(`radial-gradient(circle at ${cx}% ${cy}%, ${color} 0 ${r0/2}%, transparent ${(r0/2)+1}%)`);
    }
    return { size: base, background: blobs.join(', ') };
  }

  function pickDuration() {
    const minD = cssVar('--fly-min-duration', 900);
    const maxD = cssVar('--fly-max-duration', 1800);
    return Math.floor(minD + Math.random() * (maxD - minD));
  }

  // Flug-Keyframes
  function buildChaoticKeyframes(from, to, duration, scaleMul = 1) {
    const segments = 3 + Math.floor(Math.random() * 3);
    const pts = [from];
    for (let i = 0; i < segments - 1; i++) pts.push(randomViewportPos(8));
    pts.push(to);

    const kf = [];
    let prev = pts[0];
    for (let s = 1; s < pts.length; s++) {
      const next = pts[s];
      const dx = next.x - prev.x, dy = next.y - prev.y;
      const dist = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      const amp = Math.max(30, dist * (0.5 + Math.random() * 0.9));
      const c1 = { x: prev.x + Math.cos(ang + Math.PI/2)*(amp*(0.4+Math.random()*0.6)),
                   y: prev.y + Math.sin(ang + Math.PI/2)*(amp*(0.4+Math.random()*0.6)) };
      const c2 = { x: next.x + Math.cos(ang - Math.PI/2)*(amp*(0.4+Math.random()*0.6)),
                   y: next.y + Math.sin(ang - Math.PI/2)*(amp*(0.4+Math.random()*0.6)) };
      const samples = 12;

      for (let i = 1; i <= samples; i++) {
        const t = i / samples;
        const x = (1 - t)**3 * prev.x + 3 * (1 - t)**2 * t * c1.x + 3 * (1 - t) * t**2 * c2.x + t**3 * next.x;
        const y = (1 - t)**3 * prev.y + 3 * (1 - t)**2 * t * c1.y + 3 * (1 - t) * t**2 * c2.y + t**3 * next.y;

        const t2 = Math.min(1, t + 0.04);
        const x2 = (1 - t2)**3 * prev.x + 3 * (1 - t2)**2 * t2 * c1.x + 3 * (1 - t2) * t2**2 * c2.x + t2**3 * next.x;
        const y2 = (1 - t2)**3 * prev.y + 3 * (1 - t2)**2 * t2 * c1.y + 3 * (1 - t2) * t2**2 * c2.y + t2**3 * next.y;

        const ang2 = Math.atan2(y2 - y, x2 - x);
        const jitter = 0.95 + Math.random() * 0.1;

        kf.push({ transform: `translate(${x}px, ${y}px) rotate(${ang2}rad) scale(${SIT_SCALE * scaleMul * jitter})` });
      }
      prev = next;
    }

    return { keyframes: kf, options: { duration, easing: 'linear', iterations: 1, fill: 'forwards' } };
  }

  function setButtonState(alive) {
    isAlive = alive;
    btn.classList.toggle('state-kill', alive);
    btn.classList.toggle('state-get', !alive);
    btn.textContent = alive ? LABEL_KILL : LABEL_GET;
    btn.setAttribute('aria-pressed', String(alive));
  }

  // Flug-Endpose persistieren, dann landen
  function startFlight(fromPos) {
    if (!flyEl) return;
    isPerching = false;
    flyEl.classList.remove('perching');

    const from = fromPos || currentFlyPos();
    const to = randomViewportPos(8);
    const duration = pickDuration();

    if (currentAnim) currentAnim.cancel();
    const { keyframes, options } = buildChaoticKeyframes(from, to, duration, FLIGHT_SCALE);
    currentAnim = flyEl.animate(keyframes, options);

    currentAnim.onfinish = () => {
      try { currentAnim.commitStyles?.(); } catch {}
      currentAnim.cancel();

      const { x, y } = getElementTranslate(flyEl);
      const { angle } = getElementAngleScale(flyEl);

      flyEl.style.transform = `translate(${x}px, ${y}px) rotate(${angle}rad) scale(${FLIGHT_SCALE})`;
      lastFlightAngle = angle;

      startPerch();
    };
  }

  // Landen + optional laufen (preferUp aktiv)
  function startPerch() {
    if (!flyEl) return;
    isPerching = true;

    // Winkel der Endpose + Jitter
    let { angle } = getElementAngleScale(flyEl);
    if (!isFinite(angle)) angle = lastFlightAngle || 0;
    const jitter = (Math.random() * 24 - 12) * (Math.PI / 180); // ±12°
    const landAngle = angle + jitter;

    // Position aus Matrix
    const { x, y } = getElementTranslate(flyEl);

    // Sitzpose (größer)
    flyEl.style.transform = `translate(${x}px, ${y}px) rotate(${landAngle}rad) scale(${SIT_SCALE})`;
    flyEl.classList.add('perching');

    // Entscheidung: zufällig ca. jedes 2.–4. Mal
    // Variante: Zähler 2..4, der jedes Mal dekrementiert und bei 0 Lauf auslöst und neu würfelt
    if (typeof window._walkCountdown !== 'number') {
      window._walkCountdown = 2 + Math.floor(Math.random() * 3); // 2..4
    }
    window._walkCountdown--;
    const willWalk = window._walkCountdown <= 0;

    if (willWalk) {
      window._walkCountdown = 2 + Math.floor(Math.random() * 3);
      const cs = getComputedStyle(document.documentElement);
      const minDist = parseFloat(cs.getPropertyValue('--fly-walk-min')) || 24;
      const maxDist = parseFloat(cs.getPropertyValue('--fly-walk-max')) || 44;
      const dist = minDist + Math.random() * (maxDist - minDist);

      const minDur = parseInt(cs.getPropertyValue('--fly-walk-dur-min')) || 1400;
      const maxDur = parseInt(cs.getPropertyValue('--fly-walk-dur-max')) || 2000;
      const duration = Math.floor(minDur + Math.random() * (maxDur - minDur));

      // 1) Kopf-Richtung
      const dirX = Math.cos(landAngle);
      const dirY = Math.sin(landAngle);

      // 2) 90° drehen → fwd zeigt jetzt ‘hoch/runter’ relativ zu deiner Pose
      let fwdX = -dirY;
      let fwdY =  dirX;

      // 3) preferUp auf den GEDREHTEN Vektor anwenden (entscheidend!)
      if (fwdY > 0) {           // würde nach unten laufen? -> invertieren
        fwdX = -fwdX;
        fwdY = -fwdY;
      }

      // 4) Seitenachse orthogonal zu fwd (für eine sanfte Kurve)
      const orthoX = -fwdY;
      const orthoY =  fwdX;

      // 5) leichte Kurve 8–14%, mal links/mal rechts
      const sideSign = Math.random() < 0.5 ? -1 : 1;
      const sideAmp = dist * (0.08 + Math.random() * 0.06);

      // 6) Punkte: vorwärts (fwd) + ein Bogen (ortho)
      const endDx = fwdX * dist;
      const endDy = fwdY * dist;  // dank preferUp immer < 0

      const midDx = fwdX * (dist * 0.5) + orthoX * (sideAmp * sideSign);
      const midDy = fwdY * (dist * 0.5) + orthoY * (sideAmp * sideSign);

      const rotAmp = 0.020 * sideSign; // ~1.15°
      const kf = [
        { transform: `translate(${x}px, ${y}px) rotate(${landAngle}rad) scale(${SIT_SCALE})` },
        { transform: `translate(${x + midDx}px, ${y + midDy}px) rotate(${landAngle + rotAmp}rad) scale(${SIT_SCALE})` },
        { transform: `translate(${x + endDx}px, ${y + endDy}px) rotate(${landAngle}rad) scale(${SIT_SCALE})` },
      ];

      flyEl.animate(kf, { duration, easing: 'ease-in-out', fill: 'forwards' });
    }



    // Nach Sitzen/Laufen wieder starten
    const perchMs = cssVar('--perch-time', 5000);
    perchTimer = setTimeout(() => { if (flyEl) startFlight(currentFlyPos()); }, perchMs);
  }

  function explodeFly() {
    if (!flyEl) return;
    const rect = flyEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    if (perchTimer) clearTimeout(perchTimer);
    if (currentAnim) currentAnim.cancel();

    flyEl.remove();
    flyEl = null;

    // Partikel
    const particles = 10 + Math.floor(Math.random() * 8);
    for (let i = 0; i < particles; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      const angle = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 70;
      p.style.left = `${cx}px`;
      p.style.top = `${cy}px`;
      p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      p.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
      document.body.appendChild(p);
      p.addEventListener('animationend', () => p.remove(), { once: true });
    }

    // variabler Blutfleck
    const splat = document.createElement('div');
    splat.className = 'splat';
    const { size, background } = randomSplatStyle();
    splat.style.left = `${cx}px`;
    splat.style.top = `${cy}px`;
    splat.style.width = `${size}px`;
    splat.style.height = `${size}px`;
    splat.style.backgroundImage = background;
    splat.style.transform = `translate(-50%, -50%) rotate(${(Math.random() * 80 - 40)}deg)`;
    document.body.appendChild(splat);

    setTimeout(() => {
      splat.style.opacity = '0';
      setTimeout(() => splat.remove(), 420);
    }, 5000);

    isPerching = false;
    setButtonState(false);
  }

  window.addEventListener('mousemove', (e) => {
    mousePos = { x: e.clientX, y: e.clientY };
    if (!flyEl || !isAlive || !isPerching) return;
    const rect = flyEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const scareR = cssVar('--scare-radius', 90);
    if (Math.hypot(cx - mousePos.x, cy - mousePos.y) <= scareR) {
      if (perchTimer) { clearTimeout(perchTimer); perchTimer = null; }
      startFlight({ x: rect.left, y: rect.top, cx, cy });
    }
  }, { passive: true });

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    if (isAlive) {
      explodeFly();
    } else {
      spawnFly();
      const subject = encodeURIComponent('Get in touch');
      const body = encodeURIComponent('Hallo betakontext,\n\nich habe eine Fliege erwischt :)');
      window.location.href = `mailto:${MAIL_TO}?subject=${subject}&body=${body}`;
    }
  });

  function spawnFly() {
    if (flyEl) return;
    flyEl = document.createElement('div');
    flyEl.className = 'fly';
    const start = randomViewportPos();
    flyEl.style.transform = `translate(${start.x}px, ${start.y}px) rotate(0rad) scale(${SIT_SCALE})`;

    flyEl.appendChild(createFlySVG());
    document.body.appendChild(flyEl);
    setButtonState(true);
    startFlight(start);
  }

  setButtonState(true);
  spawnFly();
})();
