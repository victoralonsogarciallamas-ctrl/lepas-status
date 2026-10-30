/* =====================================================================
   MAPA DE CÓDIGOS POSTALES (extraído de «Áreas de influencia»)
   ---------------------------------------------------------------------
   Datos que necesita (definidos antes de este script):
     CPGEO  {cp: "M x y l dx dy … z"}  polígono SVG de cada CP
     CPGB   {cp: [x0,y0,x1,y1]}       caja envolvente de cada CP
     CPNAME {cp: "Municipio"}         (opcional) nombre para el tooltip
     BM     {r1,r2,r3,rv:[[x0,y0,x1,y1,"path"]…], pl:[[nombre,tipo,x,y,pob]…]}
            (opcional) carreteras, ríos y nombres de poblaciones
   Coordenadas: x = lon·1000·cos(40°) ; y = −lat·1000  (ver MapaCP.toXY)

   Uso:
     const m = MapaCP.create(document.getElementById('map'), {
       fill: cp => '#67b0c4',                // color de cada CP
       tooltip: cp => cp + ' ' + CPNAME[cp], // texto al pasar el ratón
       onClick: cp => console.log(cp),       // clic en un CP
       pins: [{id:'a', x, y, color:'#c8372d', label:'Centro'}]  // opcional
     });
     m.repaint();              // tras cambiar los datos de color
     m.fitCPs(['28001','28002']);
     m.highlight(['28001']);   // contorno grueso
   ===================================================================== */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const K = Math.cos(40 * Math.PI / 180), SC = 1000;
  const isCanarias = y => y > -30000;

  function create(host, opt = {}) {
    opt = Object.assign({ fill: () => '#c9cfd2', tooltip: cp => cp, onClick: null, pins: [], basemap: true }, opt);
    host.classList.add('mcp');
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    const gCP = document.createElementNS(NS, 'g');
    const gBM = document.createElementNS(NS, 'g'); gBM.setAttribute('class', 'bm');
    const gLab = document.createElementNS(NS, 'g'); gLab.setAttribute('class', 'bm labels');
    const gPin = document.createElementNS(NS, 'g');
    const tip = document.createElement('div'); tip.className = 'mcp-tip';
    let VB = [0, 0, 1, 1], HOME = null, LABT = null, sel = new Set();

    // --- polígonos de CP
    const frag = document.createDocumentFragment();
    for (const cp in CPGEO) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', CPGEO[cp]); p.dataset.cp = cp; frag.appendChild(p);
    }
    gCP.appendChild(frag);

    // --- mapa base (carreteras, ríos, nombres)
    const hasBM = opt.basemap && typeof BM !== 'undefined';
    if (hasBM) {
      ['rv', 'r3', 'r2', 'r1'].forEach(k => {
        if (!BM[k]) return;
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', BM[k].map(c => c[4]).join('')); p.setAttribute('class', k); gBM.appendChild(p);
      });
      (BM.pl || []).forEach(([n, ty, x, y]) => {
        const t = document.createElementNS(NS, 'text');
        t.setAttribute('x', x); t.setAttribute('y', y); t.setAttribute('class', ty); t.textContent = n; gLab.appendChild(t);
      });
    }

    // --- pines
    function drawPins() {
      gPin.innerHTML = '';
      (opt.pins || []).forEach(pn => {
        const g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'pin');
        g.dataset.id = pn.id; g.dataset.x = pn.x; g.dataset.y = pn.y; g.dataset.label = pn.label || pn.id;
        g.innerHTML = `<path d="M0,0 C-6,-9 -11,-14 -11,-21 A11,11 0 1 1 11,-21 C11,-14 6,-9 0,0Z"/><circle cx="0" cy="-21" r="5.2" fill="${pn.color || '#67b0c4'}"/>`;
        gPin.appendChild(g);
      });
    }
    drawPins();

    svg.append(gCP, gBM, gLab, gPin);
    host.append(svg, tip);

    // --- zoom: viewBox + grosor de línea y tamaño de texto según escala
    function setVB(v) {
      VB = v; svg.setAttribute('viewBox', v.join(' '));
      const W = host.clientWidth, H = host.clientHeight; if (!W || !H) return;
      const s = Math.max(v[2] / W, v[3] / H);
      const z = v[2] > 5000 ? 0 : v[2] > 1800 ? 1 : v[2] > 700 ? 2 : 3;
      svg.classList.remove('z0', 'z1', 'z2', 'z3'); svg.classList.add('z' + z);
      svg.style.setProperty('--sw', v[2] > 6000 ? .15 : v[2] > 2000 ? .35 : .7);
      gLab.setAttribute('font-size', (s * 12.5).toFixed(2)); gLab.setAttribute('stroke-width', (s * 3).toFixed(2));
      const k = v[2] > 6000 ? .55 : v[2] > 2000 ? .8 : 1.1;
      gPin.querySelectorAll('.pin').forEach(g => g.setAttribute('transform', `translate(${g.dataset.x},${g.dataset.y}) scale(${(s * k).toFixed(3)})`));
      clearTimeout(LABT); LABT = setTimeout(declutter, 50);
    }

    // --- muestra solo los nombres que no se pisan (rejilla de colisiones)
    function declutter() {
      if (!hasBM || !BM.pl) return;
      const W = host.clientWidth, H = host.clientHeight; if (!W || !H) return;
      const s = Math.max(VB[2] / W, VB[3] / H), ox = VB[0] + (VB[2] - W * s) / 2, oy = VB[1] + (VB[3] - H * s) / 2;
      const z = VB[2] > 5000 ? 0 : VB[2] > 1800 ? 1 : VB[2] > 700 ? 2 : 3, lvl = { city: 0, town: 1, village: 2 };
      const maxLv = z === 0 ? 0 : z === 1 ? 1 : 2, cap = z === 0 ? 40 : z === 1 ? 90 : 220, fs = 12.5, cell = 48, grid = new Map();
      const key = (a, b) => a * 100003 + b;
      const cells = (b, f) => { for (let gx = Math.floor(b[0] / cell); gx <= Math.floor(b[2] / cell); gx++) for (let gy = Math.floor(b[1] / cell); gy <= Math.floor(b[3] / cell); gy++) if (f(key(gx, gy))) return true; return false; };
      const hit = b => cells(b, k => (grid.get(k) || []).some(o => !(b[2] < o[0] || b[0] > o[2] || b[3] < o[1] || b[1] > o[3])));
      const add = b => cells(b, k => { (grid.get(k) || grid.set(k, []).get(k)).push(b); });
      gPin.querySelectorAll('.pin').forEach(g => { const px = (g.dataset.x - ox) / s, py = (g.dataset.y - oy) / s; add([px - 10, py - 27, px + 10, py]); });
      const kids = gLab.children; let shown = 0;
      for (let i = 0; i < BM.pl.length; i++) {
        const p = BM.pl[i], el = kids[i]; let on = false; const lv = lvl[p[1]];
        if (lv != null && lv <= maxLv && shown < cap) {
          const px = (p[2] - ox) / s, py = (p[3] - oy) / s;
          if (px > -60 && px < W + 60 && py > -20 && py < H + 20) {
            const f = fs * (p[1] === 'city' ? 1.08 : 1), w = p[0].length * f * .53 + 8, h = f + 3, b = [px - w / 2, py - h / 2, px + w / 2, py + h / 2];
            if (!hit(b)) { add(b); on = true; shown++; }
          }
        }
        if (el._on !== on) { el._on = on; el.classList.toggle('on', on); }
      }
    }

    // --- encuadre
    function bboxOf(cps) {
      let b = [1e12, 1e12, -1e12, -1e12];
      cps.forEach(cp => { const q = CPGB[cp]; if (!q) return; b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[2]); b[3] = Math.max(b[3], q[3]); });
      return b[0] > b[2] ? null : b;
    }
    function vbFor(b, pad = .12) {
      const w = b[2] - b[0], h = b[3] - b[1];
      const W = Math.max(w, h * .6, 350) * (1 + 2 * pad), H = Math.max(h, w * .5, 250) * (1 + 2 * pad);
      const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, ar = host.clientWidth / host.clientHeight || 1.6;
      let vw = W, vh = H; if (vw / vh < ar) vw = vh * ar; else vh = vw / ar;
      return [cx - vw / 2, cy - vh / 2, vw, vh];
    }
    function fitCPs(cps, pad = .12) { const b = bboxOf(cps); if (b) setVB(vbFor(b, pad)); }
    function fitSpain() { HOME = vbFor(bboxOf(Object.keys(CPGB).filter(cp => !isCanarias(CPGB[cp][1]))), .02); setVB(HOME); }
    function fitCanarias() { fitCPs(Object.keys(CPGB).filter(cp => isCanarias(CPGB[cp][1])), .05); }

    // --- pintar
    function repaint() {
      gCP.querySelectorAll('path').forEach(p => {
        const cp = p.dataset.cp; p.setAttribute('fill', opt.fill(cp) || 'var(--mcp-empty)');
        p.classList.toggle('chk', sel.has(cp));
      });
    }
    function highlight(cps) { sel = new Set(cps || []); repaint(); }

    // --- interacción: rueda, arrastrar, pellizcar, tooltip, clic
    const toWorld = (vb, cx, cy) => { const r = host.getBoundingClientRect(), s = Math.max(vb[2] / r.width, vb[3] / r.height); return [vb[0] + (vb[2] - r.width * s) / 2 + (cx - r.left) * s, vb[1] + (vb[3] - r.height * s) / 2 + (cy - r.top) * s, s]; };
    const zoom = (f, cx, cy) => {
      const r = host.getBoundingClientRect(); if (cx == null) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
      const [wx, wy] = toWorld(VB, cx, cy), nw = VB[2] * f, nh = VB[3] * f; if (nw < 40 || nw > 30000) return;
      setVB([wx - (wx - VB[0]) * f, wy - (wy - VB[1]) * f, nw, nh]);
    };
    host.addEventListener('wheel', e => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.25 : .8, e.clientX, e.clientY); }, { passive: false });

    const PT = new Map(); let drag = null, pinch = null, moved = false;
    host.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      PT.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { host.setPointerCapture(e.pointerId); } catch (_) {}
      if (PT.size === 2) { const [a, b] = [...PT.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, vb: VB.slice() }; drag = null; moved = true; return; }
      drag = { x: e.clientX, y: e.clientY, vb: VB.slice() }; moved = false; host.style.cursor = 'grabbing';
    });
    host.addEventListener('pointermove', e => {
      if (PT.has(e.pointerId)) PT.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && PT.size >= 2) {
        const [a, b] = [...PT.values()], d = Math.hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const f = pinch.d / d, nw = pinch.vb[2] * f, nh = pinch.vb[3] * f; if (nw < 40 || nw > 30000) return;
        const [wx, wy] = toWorld(pinch.vb, pinch.mx, pinch.my), r = host.getBoundingClientRect(), s2 = Math.max(nw / r.width, nh / r.height);
        const ox = wx - (mx - r.left) * s2, oy = wy - (my - r.top) * s2;
        setVB([ox - (nw - r.width * s2) / 2, oy - (nh - r.height * s2) / 2, nw, nh]); tip.style.display = 'none'; return;
      }
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > (e.pointerType === 'touch' ? 8 : 4)) moved = true;
        if (moved) { const s = toWorld(VB, 0, 0)[2]; setVB([drag.vb[0] - dx * s, drag.vb[1] - dy * s, drag.vb[2], drag.vb[3]]); tip.style.display = 'none'; return; }
      }
      if (e.pointerType === 'touch') return;
      const el = document.elementFromPoint(e.clientX, e.clientY), pin = el && el.closest('.pin'), p = el && el.closest('path[data-cp]');
      const t = pin ? pin.dataset.label : p ? opt.tooltip(p.dataset.cp) : '';
      const b = host.getBoundingClientRect();
      if (t) { tip.textContent = t; tip.style.left = Math.min(e.clientX - b.left + 14, b.width - 240) + 'px'; tip.style.top = (e.clientY - b.top + 14) + 'px'; tip.style.display = 'block'; }
      else tip.style.display = 'none';
    });
    const end = e => {
      PT.delete(e.pointerId);
      if (pinch) { if (PT.size < 2) { pinch = null; drag = null; } return; }
      host.style.cursor = 'grab'; const had = !!drag; drag = null;
      if (moved || !had || e.type === 'pointercancel') return;
      const el = document.elementFromPoint(e.clientX, e.clientY), p = el && el.closest('path[data-cp]');
      if (p && opt.onClick) opt.onClick(p.dataset.cp);
    };
    host.addEventListener('pointerup', end); host.addEventListener('pointercancel', end);
    host.addEventListener('pointerleave', () => { tip.style.display = 'none'; });
    window.addEventListener('resize', () => { if (HOME) setVB(VB); });

    repaint(); fitSpain();
    return {
      svg, repaint, highlight, fitCPs, fitSpain, fitCanarias, zoom,
      setPins(p) { opt.pins = p; drawPins(); setVB(VB); },
      setBasemap(on) { svg.classList.toggle('nobm', !on); },
      set(o) { Object.assign(opt, o); repaint(); }
    };
  }

  // lon/lat (WGS84) → coordenadas del mapa, para colocar pines propios
  const toXY = (lon, lat) => [Math.round(lon * SC * K), Math.round(-lat * SC)];
  window.MapaCP = { create, toXY };
})();
