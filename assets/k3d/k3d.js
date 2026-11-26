/* ============================================================
   3D-КОНСТРУКТОР — самодостаточный бандл (движок + UI + CSS)
   Собран scripts/build_sites.py из файлов karkaskin.
   ============================================================ */
/* =========================================================
   КАРКАСКИН — параметрический 3D-конструктор
   Процедурная модель деревянного каркаса + предварительный расчёт
   ========================================================= */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { mergeGeometries } from 'three/addons/BufferGeometryUtils.js';

/* ---------- справочники ---------- */
export const SPECIES = {
  spruce:   { label: 'Ель',            color: 0xd9c49c, rough: .88, price: 21000, density: 450 },
  pine:     { label: 'Сосна',          color: 0xd0a566, rough: .84, price: 19500, density: 520 },
  larch:    { label: 'Лиственница',    color: 0xb3763a, rough: .80, price: 33000, density: 650 },
  glulam:   { label: 'Клеёный брус',   color: 0xe3d0ab, rough: .62, price: 42000, density: 490 },
};

export const ROOFS = {
  gable:   { label: 'Двускатная',   short: 'Двускатная',   desc: 'Два ската, конёк вдоль длины' },
  shed:    { label: 'Односкатная', short: 'Односкатная',  desc: 'Один скат — для пристройки' },
  hip:     { label: 'Вальмовая',   short: 'Вальмовая',   desc: 'Скаты с четырёх сторон' },
  mansard: { label: 'Мансардная',  short: 'Мансардная',  desc: 'Излом: крутой низ, пологий верх' },
  flat:    { label: 'Плоская',     short: 'Плоская',     desc: 'Плита с малым уклоном' },
};

export const COVERING = {
  metal:   { label: 'Профнастил / металл', price: 950 },
  tile:    { label: 'Металлочерепица',      price: 1600 },
  falts:   { label: 'Фальцевая кровля',     price: 1250 },
  membrane:{ label: 'Рулонное покрытие',   price: 720 },
};

export const SNOW = {
  1: { label: 'I район (1.0 кН/м²)',     val: 1.0 },
  2: { label: 'II район (1.5 кН/м²)',    val: 1.5 },
  3: { label: 'III район (2.5 кН/м²)',   val: 2.5 },
  4: { label: 'IV район (4.0 кН/м²)',    val: 4.0 },
};

/* готовые проекты — пресеты для быстрого старта в конструкторе */
export const PRESETS = {
  bath:      { label: 'Баня 6×4',        desc: 'Одноэтажная баня с односкатной кровлей',        params: { length: 6,  span: 4,  floors: 1, roof: 'shed',   species: 'pine',   slope: 25, step: 0.8 } },
  dacha:     { label: 'Дача 6×6',        desc: 'Компактный дачный домик, двускатная кровля',    params: { length: 6,  span: 6,  floors: 1, roof: 'gable',  species: 'spruce', slope: 30, step: 0.8 } },
  family:    { label: 'Дом 8×8',         desc: 'Одноэтажный дом для семьи из 3–4 человек',      params: { length: 8,  span: 8,  floors: 1, roof: 'gable',  species: 'spruce', slope: 30 } },
  two:       { label: 'Дом 9×9, 2 эт.',  desc: 'Полноценный двухэтажный дом ~160 м²',           params: { length: 9,  span: 9,  floors: 2, roof: 'gable',  species: 'pine',   slope: 35 } },
  mansard:   { label: 'С мансардой 10×8',desc: 'Дом с мансардным этажом, ломаная кровля',   params: { length: 10, span: 8,  floors: 1, roof: 'mansard',species: 'glulam', slope: 40 } },
  big:       { label: 'Большой 12×10',   desc: 'Просторный двухэтажный дом ~240 м²',            params: { length: 12, span: 10, floors: 2, roof: 'hip',    species: 'larch',  slope: 35 } },
};

export const DEFAULTS = {
  length: 12,       // A — длина здания, м
  span: 9,          // L — пролёт (ширина здания), м
  floors: 2,
  roof: 'gable',
  species: 'spruce',
  eave: 0.6,        // свесы, м
  slope: 30,        // уклон, °
  step: 0.9,        // шаг ферм, м
  insulation: 200,  // утеплитель, мм
  covering: 'metal',
  snow: 3,
};

const FLOOR_H = 2.7;     // высота этажа, м
const JOIST_STEP = 0.6;  // шаг балок перекрытия, м
const POST_STEP = 0.6;   // шаг стоек, м

/* ---------- геометрия ---------- */
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function member(p1, p2, w, h, bucket, stats) {
  const len = p1.distanceTo(p2);
  if (len < 1e-4) return;
  const g = new THREE.BoxGeometry(len, h, w);
  const mid = p1.clone().add(p2).multiplyScalar(0.5);
  const dir = p2.clone().sub(p1).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), dir);
  g.applyQuaternion(q);
  g.translate(mid.x, mid.y, mid.z);
  bucket.push(g);
  if (stats) stats.woodVol += len * w * h;
}

function slabGeometry(pts, thickness) {
  const n = pts.length;
  const v0 = pts[1].clone().sub(pts[0]);
  const v1 = pts[2].clone().sub(pts[0]);
  const normal = new THREE.Vector3().crossVectors(v0, v1).normalize();
  // обходим контур против часовой (если смотреть сверху): иначе верхняя грань плиты
  // окажется «задней» и отсечётся — сквозь кровлю будут видны фермы
  if (normal.y < 0) { pts = [...pts].reverse(); normal.negate(); }
  const pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i < n; i++) { pos.push(pts[i].x, pts[i].y, pts[i].z); nor.push(normal.x, normal.y, normal.z); uv.push(i / (n - 1), 1); }
  for (let i = 0; i < n; i++) {
    const p = pts[i].clone().addScaledVector(normal, -thickness);
    pos.push(p.x, p.y, p.z); nor.push(-normal.x, -normal.y, -normal.z); uv.push(i / (n - 1), 0);
  }
  for (let i = 1; i < n - 1; i++) idx.push(0, i, i + 1);
  for (let i = 1; i < n - 1; i++) idx.push(n, n + i + 1, n + i);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    idx.push(i, n + i, j, j, n + i, n + j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/* сечение пояса по пролёту */
export function chordSection(span) {
  if (span <= 6)  return { w: 0.05, h: 0.15, label: '50 × 150 мм' };
  if (span <= 9)  return { w: 0.05, h: 0.20, label: '50 × 200 мм' };
  if (span <= 12) return { w: 0.05, h: 0.25, label: '50 × 250 мм' };
  if (span <= 16) return { w: 0.075, h: 0.25, label: '75 × 250 мм' };
  return { w: 0.075, h: 0.30, label: '75 × 300 мм' };
}

/* ---------- построение дома ---------- */
export function buildHouse(p) {
  const A = p.length, L = p.span;
  const halfL = L / 2, halfA = A / 2;
  const wallTop = FLOOR_H * p.floors;
  const bucket = { wood: [], metal: [], roof: [], concrete: [], glass: [] };
  const stats = { woodVol: 0, plates: 0, joists: 0, trusses: 0, roofArea: 0, braces: 0 };

  const chord = chordSection(L);
  const isFlat = p.roof === 'flat';
  const ridgeH = isFlat ? 0 : (L / 2) * Math.tan((p.slope * Math.PI) / 180);
  const eaveDrop = isFlat ? 0 : p.eave * Math.tan((p.slope * Math.PI) / 180);

  /* --- профиль верхнего пояса --- */
  let topNodes = [], bottomNodes = [];
  const half = halfL;
  if (p.roof === 'gable') {
    bottomNodes = [-half, -half / 2, 0, half / 2, half];
    topNodes = bottomNodes.map(x => ({ x, y: ridgeH * (1 - Math.abs(x) / half) }));
  } else if (p.roof === 'shed') {
    bottomNodes = [-half, -half / 2, 0, half / 2, half];
    topNodes = bottomNodes.map(x => ({ x, y: ridgeH * (1 + x / half) / 2 }));
  } else if (p.roof === 'mansard') {
    bottomNodes = [-half, -half / 2, 0, half / 2, half];
    topNodes = [
      { x: -half, y: 0 }, { x: -half * 0.55, y: ridgeH * 0.92 },
      { x: 0, y: ridgeH }, { x: half * 0.55, y: ridgeH * 0.92 }, { x: half, y: 0 },
    ];
  } else if (p.roof === 'hip') {
    bottomNodes = [-half, -half / 2, 0, half / 2, half];
    topNodes = bottomNodes.map(x => ({ x, y: ridgeH * (1 - Math.abs(x) / half) }));
  } else { // flat
    bottomNodes = [-half, -half / 2, 0, half / 2, half];
    topNodes = bottomNodes.map(x => ({ x, y: 0 }));
  }

  /* --- ферма --- */
  function buildTruss(z, tNodes, bNodes, y0, thin) {
    const chordW = chord.w, chordH = chord.h;
    const webW = Math.max(0.04, chord.w * 0.9), webH = Math.max(0.10, chord.h * 0.7);
    // узел считается «поднятым», если верхний пояс здесь выше нижнего:
    // у торцов вальмовой крыши фермы срезаны скатом и такие узлы не строим
    const up = t => t.y > 0.08;
    // профиль ската над фермой (высота кровли над обвязкой в точке x)
    const prof = x => {
      for (let k = 0; k < tNodes.length - 1; k++) {
        const p0 = tNodes[k], p1 = tNodes[k + 1];
        if (x >= Math.min(p0.x, p1.x) - 1e-6 && x <= Math.max(p0.x, p1.x) + 1e-6)
          return p0.y + (p1.y - p0.y) * ((x - p0.x) / (p1.x - p0.x || 1));
      }
      return 0;
    };
    // смещение элемента вдоль его нормали, чтобы верхний угол не вышел за профиль ската
    const flush = (ax, ay, bx, by, h) => {
      const L = Math.hypot(bx - ax, by - ay) || 1;
      let nx = -(by - ay) / L, ny = (bx - ax) / L;
      if (ny < 0) { nx = -nx; ny = -ny; }
      const k = h / 2;
      let t = 0;
      for (const [ex, ey] of [[ax, ay], [bx, by]]) {
        const off = k * nx;
        const g = Math.abs(off) > 1e-6 ? (prof(ex + off) - prof(ex)) / off : 0;
        const den = ny - g * nx;
        t = Math.max(t, den > 1e-6 ? k - (chordH / 2 - 0.005) / den : 0);
      }
      return [ax - nx * t, ay - ny * t, bx - nx * t, by - ny * t];
    };
    for (let i = 0; i < bNodes.length - 1; i++)
      member(V(bNodes[i], y0, z), V(bNodes[i + 1], y0, z), chordW, chordH, bucket.wood, stats);
    for (let i = 0; i < tNodes.length - 1; i++)
      if (up(tNodes[i]) || up(tNodes[i + 1])) {
        const [x1, y1, x2, y2] = flush(tNodes[i].x, tNodes[i].y + y0, tNodes[i + 1].x, tNodes[i + 1].y + y0, chordH);
        member(V(x1, y1, z), V(x2, y2, z), chordW, chordH, bucket.wood, stats);
      }
    // стойки
    for (let i = 1; i < bNodes.length - 1; i++) {
      const t = tNodes[i];
      if (!up(t)) continue;
      // верх стойки подрезан под скат
      const top = Math.min(t.y + y0, y0 + Math.min(prof(t.x - webW / 2), prof(t.x + webW / 2)) - webH / 2 - 0.005);
      member(V(bNodes[i], y0, z), V(t.x, top, z), webW, webH, bucket.wood, stats);
    }
    // раскосы
    for (let i = 0; i < tNodes.length - 1; i++) {
      if (!up(tNodes[i])) continue;
      const [x1, y1, x2, y2] = flush(tNodes[i].x, tNodes[i].y + y0, bNodes[i + 1], y0, webH);
      member(V(x1, y1, z), V(x2, y2, z), webW, webH, bucket.wood, stats);
    }
    // МЗП — металлозубчатые пластины в плоскости фермы
    const plateGeo = [];
    const addPlate = (pt, dir) => {
      const g = new THREE.BoxGeometry(0.22, 0.16, 0.003);
      const q = new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), dir.clone().normalize());
      g.applyQuaternion(q);
      g.translate(pt.x, pt.y, z);
      plateGeo.push(g);
      stats.plates++;
    };
    for (let i = 1; i < bNodes.length - 1; i++) {
      const t = tNodes[i];
      if (!up(t)) continue;
      const d = V(t.x - bNodes[i], t.y, 0);
      addPlate(V(bNodes[i], y0 + 0.02, z), d);
      addPlate(V(bNodes[i], y0 + 0.02, z), d.clone().multiplyScalar(-1));
    }
    for (let i = 0; i < tNodes.length - 1; i++) {
      const a = tNodes[i], b = bNodes[i + 1];
      if (!up(a)) continue;
      const d = V(b - a.x, -a.y, 0);
      // пластина прижата вниз так, чтобы ни один из её четырёх углов не вышел за профиль ската
      const len = d.length(), ca = d.x / len, sa = d.y / len;
      let py = a.y + y0 - 0.02;
      for (const u of [-0.11, 0.11]) for (const w2 of [-0.08, 0.08]) {
        const cx = a.x + u * ca - w2 * sa, cy = u * sa + w2 * ca;
        py = Math.min(py, chordH / 2 - 0.006 - cy + prof(cx));
      }
      addPlate(V(a.x, py, z), d);
      addPlate(V(a.x, py, z), d.clone().multiplyScalar(-1));
    }
    bucket.metal.push(...plateGeo);
    stats.trusses++;
  }

  /* --- кровля --- */
  function buildRoof() {
    const ez = p.eave, ex = p.eave;
    const baseY = FLOOR_H * p.floors;        // уровень верхней обвязки стен
    const eaveY = baseY - eaveDrop;          // низ карнизного свеса
    const eX = halfL + ex, eZ = halfA + ez;  // край кровли по X и Z (со свесами)
    const cover = 0.06;
    const ridgeY = baseY + ridgeH;
    const addSlabs = (...polys) => {
      for (const q of polys) { bucket.roof.push(slabGeometry(q, cover)); stats.roofArea += polyArea(q); }
    };
    // прогон/карнизная доска вдоль оси Z на всей длине кровли
    // фермы опущены на полвысоты пояса: верх пояса лежит вровень с низом кровли и не торчит сквозь скат
    const trussY = baseY - chord.h / 2;
    const runDrop = (w, h) => h / 2 + (w / 2) * Math.tan((p.slope * Math.PI) / 180);
    const run = (x, y, w, h, o = {}) => {
      const yy = y - runDrop(w, h) - (o.drop || 0), z0 = o.z0 ?? -eZ, z1 = o.z1 ?? eZ;
      member(V(x, yy, z0), V(x, yy, z1), w, h, bucket.wood, stats);
    };
    const n = Math.max(1, Math.round(A / p.step));
    const zs = Array.from({ length: n + 1 }, (_, i) => -halfA + (A * i) / n);

    if (p.roof === 'gable') {
      addSlabs(
        [V(0, ridgeY, -eZ), V(-eX, eaveY, -eZ), V(-eX, eaveY, eZ), V(0, ridgeY, eZ)],
        [V(0, ridgeY, eZ), V(eX, eaveY, eZ), V(eX, eaveY, -eZ), V(0, ridgeY, -eZ)]);
      run(0, ridgeY, 0.08, 0.14);
      run(-eX, eaveY, 0.06, 0.12);
      run(eX, eaveY, 0.06, 0.12);
      zs.forEach(z => buildTruss(z, topNodes, bottomNodes, trussY));

    } else if (p.roof === 'mansard') {
      // излом ската: кровля идёт по ломаной линии фермы (конёк → излом → карниз),
      // иначе верхний пояс фермы выпирает сквозь прямую плоскость кровли
      const kL = topNodes[1], kR = topNodes[3];
      const dirL = V(topNodes[0].x - kL.x, topNodes[0].y - kL.y, 0).normalize();
      const dirR = V(topNodes[4].x - kR.x, topNodes[4].y - kR.y, 0).normalize();
      const eL = V(topNodes[0].x, topNodes[0].y, 0).addScaledVector(dirL, ex);
      const eR = V(topNodes[4].x, topNodes[4].y, 0).addScaledVector(dirR, ex);
      const yl = baseY + kL.y, yr = baseY + kR.y;
      const elY = baseY + eL.y, erY = baseY + eR.y;
      addSlabs(
        [V(0, ridgeY, -eZ), V(kL.x, yl, -eZ), V(kL.x, yl, eZ), V(0, ridgeY, eZ)],
        [V(kL.x, yl, -eZ), V(eL.x, elY, -eZ), V(eL.x, elY, eZ), V(kL.x, yl, eZ)],
        [V(0, ridgeY, eZ), V(kR.x, yr, eZ), V(kR.x, yr, -eZ), V(0, ridgeY, -eZ)],
        [V(kR.x, yr, -eZ), V(eR.x, erY, -eZ), V(eR.x, erY, eZ), V(kR.x, yr, eZ)]);
      run(0, ridgeY, 0.08, 0.14);
      // ниже излома скат резко уходит вниз — прогон опускаем сильнее
      const knickDrop = 0.03 * ((0.92 / 0.45) * Math.tan((p.slope * Math.PI) / 180)) + 0.004;
      run(kL.x, yl, 0.06, 0.12, { drop: knickDrop });
      run(kR.x, yr, 0.06, 0.12, { drop: knickDrop });
      run(eL.x, elY, 0.06, 0.12);
      run(eR.x, erY, 0.06, 0.12);
      zs.forEach(z => buildTruss(z, topNodes, bottomNodes, trussY));

    } else if (p.roof === 'shed') {
      const yHi = baseY + ridgeH - eaveDrop;
      addSlabs([V(-eX, eaveY, -eZ), V(eX, yHi, -eZ), V(eX, yHi, eZ), V(-eX, eaveY, eZ)]);
      run(-eX, eaveY, 0.06, 0.12);
      run(eX, yHi, 0.06, 0.12);
      zs.forEach(z => buildTruss(z, topNodes, bottomNodes, trussY));

    } else if (p.roof === 'hip') {
      const ridgeLen = Math.max(0, A - L);   // длина конька; у квадратного дома — шатёр
      const rz = ridgeLen / 2;
      const rA = V(0, ridgeY, -rz), rB = V(0, ridgeY, rz);
      const c = [[-eX, -eZ], [eX, -eZ], [eX, eZ], [-eX, eZ]].map(([x, z]) => V(x, eaveY, z));
      if (rz > 0.01) addSlabs([rA, c[0], c[3], rB], [rB, c[2], c[1], rA]);
      addSlabs([rB, c[3], c[2]], [rA, c[1], c[0]]);
      // конёк только между вальмовыми рёбрами: за ними его не существует
      if (rz > 0.01) run(0, ridgeY, 0.08, 0.14, { z0: -rz, z1: rz });
      // накосные ноги и карнизные доски по периметру
      const hipDrop = 0.1 + 0.06 * Math.tan((p.slope * Math.PI) / 180);
      for (const [r, k] of [[rA, 0], [rA, 1], [rB, 2], [rB, 3]])
        member(V(r.x, r.y - hipDrop, r.z), V(c[k].x, c[k].y - hipDrop, c[k].z), 0.08, 0.16, bucket.wood, stats);
      for (let i = 0; i < 4; i++) member(c[i], c[(i + 1) % 4], 0.06, 0.12, bucket.wood, stats);
      // фермы: полные в пределах конька, к торцам — укороченные скатом вальмы
      const yEnd = z => ridgeY - Math.max(0, Math.abs(z) - rz) * (ridgeH + eaveDrop) / (eZ - rz);
      // срез ската опускаем на полтолщины пояса, чтобы торец пояса не выходил над вальмой
      const phi = Math.atan2(topNodes[1].y - topNodes[0].y, topNodes[1].x - topNodes[0].x);
      const cap = (chord.h * Math.cos(phi) + chord.w * Math.sin(phi)) / 2 + 0.006;
      zs.forEach(z => {
        const lim = yEnd(z) - baseY;
        const tn = topNodes.map(t => ({ x: t.x, y: Math.max(0, Math.min(t.y, lim - cap)) }));
        buildTruss(z, tn, bottomNodes, trussY);
      });

    } else { // плоская
      const deck = [V(-eX, baseY + 0.06, -eZ), V(eX, baseY + 0.06, -eZ), V(eX, baseY + 0.06, eZ), V(-eX, baseY + 0.06, eZ)];
      bucket.roof.push(slabGeometry(deck, 0.12));
      stats.roofArea += polyArea(deck);
      // балки перекрытия плоской кровли
      zs.forEach(z => {
        member(V(-halfL, baseY - 0.12, z), V(halfL, baseY - 0.12, z), chord.w, chord.h, bucket.wood, stats);
        stats.trusses++;
      });
      member(V(-halfL, baseY, -halfA), V(-halfL, baseY, halfA), 0.06, 0.12, bucket.wood, stats);
      member(V(halfL, baseY, -halfA), V(halfL, baseY, halfA), 0.06, 0.12, bucket.wood, stats);
    }
  }

  /* --- каркас стен и перекрытий --- */
  function wallFrames() {
    const postW = 0.1, postD = 0.1;
    // обвязка
    member(V(-halfL, 0.05, -halfA), V(halfL, 0.05, -halfA), postW, 0.1, bucket.wood, stats);
    member(V(-halfL, 0.05, halfA), V(halfL, 0.05, halfA), postW, 0.1, bucket.wood, stats);
    member(V(-halfL, 0.05, -halfA), V(-halfL, 0.05, halfA), postW, 0.1, bucket.wood, stats);
    member(V(halfL, 0.05, -halfA), V(halfL, 0.05, halfA), postW, 0.1, bucket.wood, stats);

    for (let lvl = 0; lvl < p.floors; lvl++) {
      const y0 = lvl * FLOOR_H + 0.1, y1 = (lvl + 1) * FLOOR_H;
      // верхняя обвязка
      member(V(-halfL, y1 - 0.05, -halfA), V(halfL, y1 - 0.05, -halfA), postW, 0.1, bucket.wood, stats);
      member(V(-halfL, y1 - 0.05, halfA), V(halfL, y1 - 0.05, halfA), postW, 0.1, bucket.wood, stats);
      member(V(-halfL, y1 - 0.05, -halfA), V(-halfL, y1 - 0.05, halfA), postW, 0.1, bucket.wood, stats);
      member(V(halfL, y1 - 0.05, -halfA), V(halfL, y1 - 0.05, halfA), postW, 0.1, bucket.wood, stats);

      // проёмы: [расстояние от начала стены, ширина, низ, верх] — 1-й этаж.
      // набор подстраивается под длину стены, чтобы окна не наезжали на дверь в маленьких домах
      const win = (pos, w) => [pos, w, 0.9, 2.3];
      const frontOps = len => {
        const door = [len / 2, 1.0, 0, 2.1];
        if (len >= 6) return [door, win(1.5, 1.2), win(len - 1.5, 1.2)];
        if (len >= 4.8) return [door, win(len - 1.2, 1.0)];
        return [[len / 2, 0.9, 0, 2.1]];
      };
      const backOps = len => {
        if (len >= 5.4) return [win(1.4, 1.2), win(len - 1.4, 1.2)];
        if (len >= 3) return [win(len / 2, Math.min(1.4, len - 2))];
        return [];
      };
      const sideOps = len => [win(2.0, 1.4), win(len - 2.0, 1.4)];
      const wallDefs = [
        { from: V(-halfL, 0, halfA), to: V(halfL, 0, halfA), along: 'x', len: L, ops: frontOps(L) },
        { from: V(halfL, 0, -halfA), to: V(-halfL, 0, -halfA), along: 'x', len: L, ops: backOps(L) },
        { from: V(-halfL, 0, -halfA), to: V(-halfL, 0, halfA), along: 'z', len: A, ops: sideOps(A) },
        { from: V(halfL, 0, halfA), to: V(halfL, 0, -halfA), along: 'z', len: A, ops: sideOps(A) },
      ];

      for (const w of wallDefs) {
        const len = w.len;
        const n = Math.max(1, Math.round(len / POST_STEP));
        const dirV = w.to.clone().sub(w.from).normalize();
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          const x = w.from.x + (w.to.x - w.from.x) * t;
          const z = w.from.z + (w.to.z - w.from.z) * t;
          const u = t * len;
          if (lvl === 0 && w.ops.some(o => Math.abs(u - o[0]) < o[1] / 2 + 0.07)) continue;
          member(V(x, y0, z), V(x, y1, z), postW, postD, bucket.wood, stats);
        }
        // перемычки, проёмные стойки, заполнение проёмов
        if (lvl !== 0) continue;
        for (const o of w.ops) {
          const center = w.from.clone().addScaledVector(dirV, o[0]);
          const s1 = center.clone().addScaledVector(dirV, -o[1] / 2);
          const s2 = center.clone().addScaledVector(dirV, o[1] / 2);
          // перемычка
          member(V(s1.x, y0 + o[3] + 0.05, s1.z), V(s2.x, y0 + o[3] + 0.05, s2.z), 0.08, 0.1, bucket.wood, stats);
          // стойки проёма
          member(V(s1.x, y0, s1.z), V(s1.x, y0 + o[3], s1.z), postW, postD, bucket.wood, stats);
          member(V(s2.x, y0, s2.z), V(s2.x, y0 + o[3], s2.z), postW, postD, bucket.wood, stats);
          // заполнение: дверь — дерево, окно — стекло
          const isDoor = o[2] === 0;
          const fill = new THREE.BoxGeometry(o[1] - 0.12, o[3] - 0.1, isDoor ? 0.05 : 0.02);
          if (w.along === 'z') fill.rotateY(Math.PI / 2);
          fill.translate(center.x, y0 + o[3] / 2, center.z);
          (isDoor ? bucket.wood : bucket.glass).push(fill);
        }
      }

      // укосины жёсткости (длина зависит от длины торцевой стены)
      const bl = Math.min(1.8, halfA - 0.6);
      for (const sx of [-1, 1]) {
        const x = sx * halfL;
        member(V(x, y0, -halfA + 0.35), V(x, y1 - 0.15, -halfA + 0.35 + bl), 0.06, 0.1, bucket.wood, stats);
        member(V(x, y0, halfA - 0.35), V(x, y1 - 0.15, halfA - 0.35 - bl), 0.06, 0.1, bucket.wood, stats);
        stats.braces += 2;
      }

      // перекрытие (кроме первого уровня): балки + настил, чтобы этаж читался как цельный
      if (lvl > 0) {
        const n = Math.max(2, Math.round(A / JOIST_STEP));
        for (let i = 0; i <= n; i++) {
          const z = -halfA + (A * i) / n;
          member(V(-halfL, y0 - 0.11, z), V(halfL, y0 - 0.11, z), 0.05, 0.2, bucket.wood, stats);
          stats.joists++;
        }
        bucket.wood.push(slabGeometry([V(-halfL, y0 + 0.02, -halfA), V(halfL, y0 + 0.02, -halfA), V(halfL, y0 + 0.02, halfA), V(-halfL, y0 + 0.02, halfA)], 0.04));
      }
    }

    // пол первого этажа
    const deck = slabGeometry([V(-halfL, 0.02, -halfA), V(halfL, 0.02, -halfA), V(halfL, 0.02, halfA), V(-halfL, 0.02, halfA)], 0.05);
    bucket.wood.push(deck);

    // фундамент
    const f = 0.18;
    member(V(-halfL, -f / 2, -halfA), V(halfL, -f / 2, -halfA), 0.35, f, bucket.concrete, null);
    member(V(-halfL, -f / 2, halfA), V(halfL, -f / 2, halfA), 0.35, f, bucket.concrete, null);
    member(V(-halfL, -f / 2, -halfA), V(-halfL, -f / 2, halfA), 0.35, f, bucket.concrete, null);
    member(V(halfL, -f / 2, -halfA), V(halfL, -f / 2, halfA), 0.35, f, bucket.concrete, null);
  }

  wallFrames();
  buildRoof();

  /* ---------- сборка сцены ---------- */
  const group = new THREE.Group();
  const sp = SPECIES[p.species];
  const materials = {
    wood: new THREE.MeshStandardMaterial({ color: sp.color, roughness: sp.rough, metalness: 0.02 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.38, metalness: 0.85 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x77828f, roughness: 0.55, metalness: 0.35 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0xb4b0a8, roughness: 0.95, metalness: 0 }),
    // светлое стекло: тёмное выглядело как пустые проёмы в каркасе
    glass: new THREE.MeshStandardMaterial({ color: 0x9fc6e8, roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.6, emissive: 0x24384c, emissiveIntensity: 0.7 }),
  };
  const coverColor = { metal: 0x8a95a3, tile: 0x9c4a36, falts: 0xa9b2ba, membrane: 0x565d68 };
  // цвет нужно задавать через Color: присваивание числа оставляло кровлю чёрной
  materials.roof.color.setHex(coverColor[p.covering] ?? 0x77828f);

  for (const key of Object.keys(bucket)) {
    const list = bucket[key];
    if (!list.length) continue;
    const merged = mergeGeometries(list, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, materials[key]);
    mesh.castShadow = key !== 'glass';
    mesh.receiveShadow = true;
    mesh.userData.role = key;
    group.add(mesh);
    list.forEach(g => g.dispose());
  }

  stats.roofArea = Math.round(stats.roofArea * 10) / 10;
  stats.woodVol = Math.round(stats.woodVol * 100) / 100;
  return { group, stats };
}

/* площадь плоского многоугольника (веером от первой вершины) */
function polyArea(q) {
  let s = 0;
  for (let i = 1; i < q.length - 1; i++)
    s += q[i].clone().sub(q[0]).cross(q[i + 1].clone().sub(q[0])).length() / 2;
  return s;
}

/* ---------- предварительный расчёт ---------- */
/* built — уже собранная модель {stats}; если не передана, дом строится ещё раз */
export function computeSpec(p, built) {
  const A = p.length, L = p.span;
  const sp = SPECIES[p.species];
  const cover = COVERING[p.covering];
  const snow = SNOW[p.snow];
  const chord = chordSection(L);
  const wallH = FLOOR_H * p.floors;
  const ridgeH = p.roof === 'flat' ? 0 : (L / 2) * Math.tan((p.slope * Math.PI) / 180);
  const roofHeight = ridgeH;

  const s = (built || buildHouse(p)).stats;

  const footprint = A * L;
  const trussCount = p.roof === 'flat' ? s.trusses : s.trusses;
  const joistCount = s.joists;
  const weight = Math.round(s.woodVol * sp.density + s.plates * 0.55);
  const timberCost = Math.round((s.woodVol * sp.price) / 100) * 100;
  const platesCost = s.plates * 420;
  const roofCost = Math.round(s.roofArea * cover.price);
  const total = Math.round((timberCost + platesCost + roofCost) * 1.22 / 1000) * 1000;
  const days = Math.max(10, Math.min(45, Math.round(8 + s.woodVol * 1.9 + trussCount * 0.35)));

  return {
    footprint: Math.round(footprint),
    totalArea: Math.round(footprint * p.floors),
    height: Math.round((wallH + roofHeight) * 10) / 10,
    ridgeH: Math.round(ridgeH * 100) / 100,
    trusses: trussCount,
    joists: joistCount,
    plates: s.plates,
    woodVol: s.woodVol,
    weight,
    roofArea: s.roofArea,
    chord: chord.label,
    step: p.step,
    snow: snow.val,
    price: total,
    days,
    species: sp.label,
    roofLabel: ROOFS[p.roof].label,
    coveringLabel: cover.label,
  };
}

/* =========================================================
   Рендерер / инстанс
   ========================================================= */
export function createViewer(container, params) {
  const scene = new THREE.Scene();
  const bg = 0x111820;
  scene.fog = new THREE.Fog(bg, 55, 150);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 500);
  camera.position.set(16, 11, 18);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  } catch (err) {
    // без WebGL показываем понятную подпись вместо пустого чёрного поля
    container.insertAdjacentHTML('beforeend',
      '<div class="cfg__loading">3D-модель недоступна в этом браузере — параметры и расчёт ниже работают как обычно</div>');
    return { build() {}, resize() {}, setAutoRotate() {}, toggleRoof() {}, resetView() {}, snapshot() { return ''; }, controls: { autoRotate: false } };
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(bg, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.classList.add('cfg__canvas');
  renderer.domElement.setAttribute('aria-label', '3D-модель каркаса: вращайте мышью или пальцем');
  container.appendChild(renderer.domElement);

  /* свет: небо + тёплое солнце с тенью + холодная подсветка сзади + мягкая заливка спереди */
  scene.add(new THREE.HemisphereLight(0xeaf1fa, 0x6b5846, 1.7));
  const sun = new THREE.DirectionalLight(0xfff2df, 3.4);
  sun.position.set(18, 26, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  // рамка теневой камеры должна накрывать весь дом с свесами, иначе тень обрезается
  sun.shadow.camera.left = -24;
  sun.shadow.camera.right = 24;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x8fb4ff, 1.3);
  rim.position.set(-16, 12, -14);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffffff, 1.0);
  fill.position.set(-8, 6, 22);
  scene.add(fill);

  /* земля и сетка осей */
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(90, 64),
    new THREE.MeshStandardMaterial({ color: 0x1a212a, roughness: 1, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.22;
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(120, 60, 0x435263, 0x2a3441);
  grid.position.y = -0.21;
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  scene.add(grid);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 4;
  controls.maxDistance = 120;
  controls.autoRotateSpeed = 0.55;
  let userMoved = false;
  controls.addEventListener('start', () => { userMoved = true; });

  let model = null;
  let current = { ...params };
  let lastStats = null;

  function box3() { return new THREE.Box3().setFromObject(model); }

  function clearModel() {
    if (!model) return;
    scene.remove(model);
    model.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    model = null;
  }

  /* подгонка камеры по реальному габариту: дистанция считается по 8 углам
     параллелепипеда модели с учётом вертикального и горизонтального угла обзора,
     поэтому дом занимает кадр целиком и в широком, и в узком блоке */
  function frameCamera(keepDir = false) {
    if (!model) return;
    const box = new THREE.Box3().setFromObject(model);
    const c = box.getCenter(new THREE.Vector3());
    // невысокая точка обзора (~14° над горизонтом): каркас виден, а крыша не закрывает его сверху
    let zAxis = new THREE.Vector3(1.05, 0.33, 0.82).normalize();   // от модели к камере
    if (keepDir) {
      // пользователь повернул модель: ракурс оставляем, подгоняем только дистанцию
      const dir = camera.position.clone().sub(controls.target);
      if (dir.length() > 0.01 && dir.normalize().y > 0.04) zAxis = dir;
    }
    const xAxis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), zAxis).normalize();
    const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
    const vFov = (camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(camera.aspect, 0.2));
    const tv = Math.tan(vFov / 2), th = Math.tan(hFov / 2);
    // внизу сцены лежат кнопки и подсказка: какая доля нижней половины кадра занята ими,
    // задаёт тема через --cfg-bottom-k на контейнере (по умолчанию 20%)
    const bottomK = 1 - (parseFloat(getComputedStyle(container).getPropertyValue('--cfg-bottom-k')) || 0.2);
    let need = 0;
    for (const px of [box.min.x, box.max.x]) for (const py of [box.min.y, box.max.y]) for (const pz of [box.min.z, box.max.z]) {
      const d = new THREE.Vector3(px, py, pz).sub(c);
      const z = d.dot(zAxis), x = d.dot(xAxis), y = d.dot(yAxis);
      need = Math.max(need, z + Math.abs(x) / th, z + Math.abs(y) / (tv * (y < 0 ? bottomK : 1)));
    }
    const radius = box.getBoundingSphere(new THREE.Sphere()).radius || 1;
    const dist = Math.max(need * 1.08, radius * 1.2);
    camera.position.copy(c).addScaledVector(zAxis, dist);
    controls.target.copy(c);
    controls.minDistance = radius * 0.6;
    controls.maxDistance = dist * 3;
    controls.update();
  }

  /* перестраивает модель; при ошибке геометрии предыдущая модель остаётся на месте,
     чтобы сцена не превращалась в пустое поле */
  function build(next) {
    current = { ...next };
    let built;
    try {
      built = buildHouse(current);
    } catch (err) {
      console.error('Конструктор: не удалось построить модель', err);
      return null;
    }
    clearModel();
    model = built.group;
    lastStats = built.stats;
    scene.add(model);
    frameCamera(userMoved);
    return built;
  }

  function resize() {
    const w = container.clientWidth || 600;
    const h = container.clientHeight || 420;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (model) frameCamera(userMoved);
  }

  const ro = new ResizeObserver(() => resize());
  ro.observe(container);
  resize();

  let visible = true;
  const io = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
  }, { threshold: 0.02 });
  io.observe(container);

  let running = true;
  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    if (!visible) return;
    controls.update();
    renderer.render(scene, camera);
  }
  loop();

  return {
    scene, camera, renderer, controls,
    build,
    resize,
    getStats: () => lastStats,
    getModelBox: () => (model ? { min: box3().min.toArray(), max: box3().max.toArray() } : null),
    setAutoRotate(v) { controls.autoRotate = v; },
    toggleRoof(v) {
      if (!model) return;
      model.traverse(o => { if (o.userData.role === 'roof') o.visible = v; });
    },
    resetView() { userMoved = false; frameCamera(); },
    snapshot() { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); },
    dispose() { running = false; ro.disconnect(); io.disconnect(); clearModel(); renderer.dispose(); },
  };
}

/* =========================================================
   КАРКАСКИН — интерфейс 3D-конструктора (доработанная версия)
   + пресеты готовых проектов
   + троттлинг пересчёта при движении слайдеров
   + CTA «Оставить заявку» с передачей параметров в форму
   Один и тот же файл работает на karkaskin (data-configurator)
   и в самодостаточном бандле k3d.js (data-k3d, data-accent).
   ========================================================= */

/* локальные помощники (вместо app.js) */
const fmt = n => Number(n).toLocaleString('ru-RU');
const money = n => fmt(Math.round(n)) + ' ₽';
let __toastEl;
function toast(msg, ms = 3800) {
  if (!__toastEl) {
    __toastEl = document.createElement('div');
    __toastEl.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translate(-50%,16px);z-index:9999;'
      + 'background:#1c2430;color:#fff;padding:11px 18px;border-radius:12px;font:600 13.5px/1.3 system-ui,sans-serif;'
      + 'box-shadow:0 12px 28px rgba(0,0,0,.35);opacity:0;transition:.3s;pointer-events:none;max-width:90vw';
    document.body.appendChild(__toastEl);
  }
  __toastEl.textContent = msg;
  requestAnimationFrame(() => { __toastEl.style.opacity = '1'; __toastEl.style.transform = 'translate(-50%,0)'; });
  clearTimeout(__toastEl._t);
  __toastEl._t = setTimeout(() => { __toastEl.style.opacity = '0'; __toastEl.style.transform = 'translate(-50%,16px)'; }, ms);
}

const ICON = {
  reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
  rotate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><ellipse cx="12" cy="12" rx="9" ry="3.6"/><path d="M12 3v18" opacity=".45"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l1.6-2h6.8L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.2"/></svg>',
  roof: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-7 9 7"/><path d="M5 10.5V20h14v-9.5"/></svg>',
};

const TOOLS = [
  ['roof', 'Кровля', 'Скрыть кровлю и увидеть фермы'],
  ['rotate', 'Вращение', 'Авто-вращение'],
  ['reset', 'Сброс вида', 'Вернуть камеру в исходное положение'],
  ['camera', 'Картинка', 'Сохранить картинку модели'],
];

const floorsLabel = n => `${n} ${n === 1 ? 'этаж' : 'этажа'}`;

/* слайдер с текущим значением и метками диапазона */
function rangeHTML(key, label, min, max, step, value, unit) {
  return `
      <div class="field">
        <label class="cfg__label" for="cfg-${key}"><span>${label}</span><span class="cfg__val" data-out="${key}"></span></label>
        <input class="range" type="range" id="cfg-${key}" min="${min}" max="${max}" step="${step}" value="${value}" data-set="${key}">
        <div class="cfg__range"><span>${min} ${unit}</span><span>${max} ${unit}</span></div>
      </div>`;
}

function panelHTML(p) {
  const presetBtns = Object.entries(PRESETS).map(([k, v]) =>
    `<button type="button" data-preset="${k}" title="${v.desc}">${v.label}</button>`).join('');

  const roofBtns = Object.entries(ROOFS).map(([k, v]) =>
    `<button type="button" data-set="roof" data-val="${k}" class="${p.roof === k ? 'is-active' : ''}">
       <b>${v.label}</b><small>${v.desc}</small>
     </button>`).join('');

  const spBtns = Object.entries(SPECIES).map(([k, v]) =>
    `<button type="button" data-set="species" data-val="${k}" class="${p.species === k ? 'is-active' : ''}">${v.label}</button>`).join('');

  const coverOpts = Object.entries(COVERING).map(([k, v]) =>
    `<option value="${k}" ${p.covering === k ? 'selected' : ''}>${v.label}</option>`).join('');

  const snowOpts = Object.entries(SNOW).map(([k, v]) =>
    `<option value="${k}" ${String(p.snow) === String(k) ? 'selected' : ''}>${v.label}</option>`).join('');

  return `
  <aside class="cfg__panel">
    <div class="cfg__title">Конструктор каркаса</div>
    <div class="cfg__hint">Задайте параметры — модель и расчёт пересчитаются сразу</div>

    <div class="cfg__group">
      <div class="cfg__label"><span>Готовые проекты</span></div>
      <div class="cfg__presets">${presetBtns}</div>
    </div>

    <div class="cfg__group">
      <div class="cfg__label"><span>Габариты здания</span></div>
      ${rangeHTML('length', 'Длина (A)', 6, 20, 0.5, p.length, 'м')}
      ${rangeHTML('span', 'Ширина / пролёт (L)', 4, 14, 0.5, p.span, 'м')}
    </div>

    <div class="cfg__group">
      <div class="cfg__label"><span>Этажность</span><span class="cfg__val" data-out="floors"></span></div>
      <div class="seg" data-set-group="floors">
        ${[1, 2, 3].map(n => `<button type="button" data-set="floors" data-val="${n}" class="${p.floors === n ? 'is-active' : ''}">${n}</button>`).join('')}
      </div>
    </div>

    <div class="cfg__group">
      <div class="cfg__label"><span>Тип крыши</span><span class="cfg__val" data-out="roof"></span></div>
      <div class="seg seg--grid" data-set-group="roof">${roofBtns}</div>
    </div>

    <div class="cfg__group">
      <div class="cfg__label"><span>Порода древесины</span><span class="cfg__val" data-out="species"></span></div>
      <div class="seg seg--grid seg--even" data-set-group="species">${spBtns}</div>
    </div>

    <details class="cfg__group cfg__more">
      <summary>Дополнительные параметры</summary>
      <div class="cfg__more-body">
        ${rangeHTML('eave', 'Свесы кровли', 0.3, 1.5, 0.1, p.eave, 'м')}
        ${rangeHTML('slope', 'Уклон ската', 15, 45, 1, p.slope, '°')}
        ${rangeHTML('step', 'Шаг ферм', 0.6, 1.2, 0.1, p.step, 'м')}
        ${rangeHTML('insulation', 'Утеплитель', 100, 300, 20, p.insulation, 'мм')}
        <div class="field">
          <label class="cfg__label" for="cfg-cover"><span>Покрытие кровли</span></label>
          <select class="select" id="cfg-cover" data-set="covering">${coverOpts}</select>
        </div>
        <div class="field">
          <label class="cfg__label" for="cfg-snow"><span>Снеговой район</span></label>
          <select class="select" id="cfg-snow" data-set="snow">${snowOpts}</select>
        </div>
      </div>
    </details>

    <div class="cfg__actions">
      <button type="button" class="btn btn--ghost btn--sm" data-reset>Сбросить параметры</button>
      <button type="button" class="btn btn--primary" data-lead>Оставить заявку по этому расчёту</button>
    </div>
  </aside>`;
}

function stageHTML() {
  const tool = ([kind, label, title]) =>
    `<button type="button" class="cfg__tool" data-tool="${kind}" title="${title}" aria-label="${title}" aria-pressed="false">
       ${ICON[kind]}<span>${label}</span>
     </button>`;
  // два ряда по две кнопки: в один ряд панель не влезает и наезжает на модель
  const tools = `<div class="cfg__tools-row">${TOOLS.slice(0, 2).map(tool).join('')}</div>` +
                `<div class="cfg__tools-row">${TOOLS.slice(2).map(tool).join('')}</div>`;
  const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  return `
  <div class="cfg__stage" data-stage>
    <div class="cfg__badge"><i></i> 3D-модель в реальном времени</div>
    <div class="cfg__tools">${tools}</div>
    <div class="cfg__hintbar">${touch ? 'Вращайте пальцем · щипок — масштаб' : 'Вращайте мышью · колесо — масштаб'}</div>
    <div class="cfg__loading" role="status">Собираем 3D-модель…</div>
  </div>`;
}

export function mountConfigurator(root, opts = {}) {
  const p = { ...DEFAULTS, ...(opts.params || {}) };
  const variant = opts.variant || 'full';
  if (opts.accent) root.style.setProperty('--cfg-accent', opts.accent);

  root.classList.add('cfg');
  if (variant === 'hero') root.classList.add('cfg--solo');
  root.innerHTML = variant === 'hero' ? stageHTML() : panelHTML(p) + stageHTML();
  const stage = root.querySelector('[data-stage]');
  const viewer = createViewer(stage, p);
  const loading = root.querySelector('.cfg__loading');
  let roofVisible = true;

  /* троттлинг: не чаще ~8 раз в секунду пересобирать модель при движении слайдера */
  let pending = false;
  function applyThrottled() {
    if (pending) return;
    pending = true;
    setTimeout(() => { pending = false; apply(); }, 120);
  }

  /* обновление полей */
  const outputs = {};
  root.querySelectorAll('[data-out]').forEach(el => { outputs[el.dataset.out] = el; });

  function paintRange(el, text) {
    const input = root.querySelector(`[data-set="${el.dataset.out}"]`);
    el.textContent = text;
    if (input && input.type === 'range') {
      const f = (parseFloat(input.value) - parseFloat(input.min)) / (parseFloat(input.max) - parseFloat(input.min));
      input.style.setProperty('--fill', `${Math.round(Math.max(0, Math.min(1, f)) * 100)}%`);
    }
  }

  function paintParams() {
    if (!Object.keys(outputs).length) return;
    if (outputs.length) paintRange(outputs.length, `${p.length} м`);
    if (outputs.span) paintRange(outputs.span, `${p.span} м`);
    if (outputs.eave) paintRange(outputs.eave, `${p.eave} м`);
    if (outputs.slope) paintRange(outputs.slope, `${p.slope}°`);
    if (outputs.step) paintRange(outputs.step, `${p.step} м`);
    if (outputs.insulation) paintRange(outputs.insulation, `${p.insulation} мм`);
    if (outputs.floors) outputs.floors.textContent = floorsLabel(p.floors);
    if (outputs.roof) outputs.roof.textContent = ROOFS[p.roof].label;
    if (outputs.species) outputs.species.textContent = SPECIES[p.species].label;
  }

  function paintSpec(built) {
    const s = computeSpec(p, built);
    const out = opts.specTarget ? document.querySelector(opts.specTarget) : null;
    if (out) {
      const fields = [
        ['Площадь застройки', s.footprint + ' м²'],
        ['Общая площадь', s.totalArea + ' м²'],
        ['Высота здания', s.height + ' м'],
        ['Стропильных ферм', s.trusses + ' шт'],
        ['Балок перекрытия', s.joists + ' шт'],
        ['МЗП пластин', s.plates + ' шт'],
        ['Объём древесины', s.woodVol + ' м³'],
        ['Вес конструкций', fmt(s.weight) + ' кг'],
        ['Кровля', s.roofArea + ' м²'],
        ['Сечение пояса', s.chord],
        ['Снеговая нагрузка', s.snow + ' кН/м²'],
        ['Ориентировочно', money(s.price)],
      ];
      out.innerHTML = '<h4>Предварительный расчёт конструкции</h4>' + fields.map(([k, v]) =>
        `<div class="spec"><b>${v}</b><span>${k}</span></div>`).join('');
    }
    const summary = document.querySelector('[data-cfg-summary]');
    if (summary) {
      summary.textContent = `${p.length} × ${p.span} м · ${floorsLabel(p.floors)} · ${ROOFS[p.roof].label} · ${SPECIES[p.species].label}`;
    }
    document.dispatchEvent(new CustomEvent('cfg:change', { detail: { params: { ...p }, spec: s } }));
    return s;
  }

  /* пересборка модели: фермы дважды не считаем — статистику берём из построенной сцены */
  function apply() {
    paintParams();
    const built = viewer.build(p);
    viewer.toggleRoof(roofVisible);
    if (loading && viewer.renderer) {
      if (built) {
        loading.classList.add('is-hidden');
        setTimeout(() => loading.remove(), 500);
      } else {
        loading.textContent = 'Не удалось собрать модель с такими параметрами';
      }
    } else if (loading) {
      loading.remove();   // WebGL недоступен — движок уже показал свою подпись
    }
    if (!built && viewer.renderer) toast('Модель с такими параметрами не построилась — показан предыдущий вариант');
    return paintSpec(built || undefined);
  }

  function syncControls() {
    root.querySelectorAll('[data-set][data-val]').forEach(b => {
      const key = b.dataset.set;
      b.classList.toggle('is-active', String(p[key]) === b.dataset.val);
      b.setAttribute('aria-pressed', String(p[key] == b.dataset.val));
    });
    root.querySelectorAll('input[type=range]').forEach(i => { i.value = p[i.dataset.set]; });
    root.querySelectorAll('select[data-set]').forEach(s => { s.value = s.dataset.set === 'snow' ? String(p.snow) : p[s.dataset.set]; });
  }

  /* слушатели панели */
  root.addEventListener('input', e => {
    const t = e.target;
    const key = t.dataset.set;
    if (!key) return;
    if (t.type !== 'range') return;
    p[key] = parseFloat(t.value);
    paintParams();
    applyThrottled();
  });
  root.addEventListener('change', e => {
    const t = e.target;
    if (t.tagName !== 'SELECT' || !t.dataset.set) return;
    p[t.dataset.set] = t.dataset.set === 'snow' ? parseInt(t.value, 10) : t.value;
    apply();
  });
  root.addEventListener('click', e => {
    const preset = e.target.closest('[data-preset]');
    if (preset) {
      const pr = PRESETS[preset.dataset.preset];
      if (pr) {
        Object.assign(p, pr.params);
        syncControls();
        apply();
        toast(`Пресет «${pr.label}» применён`);
      }
      return;
    }
    const btn = e.target.closest('[data-set][data-val]');
    if (btn) {
      const key = btn.dataset.set;
      p[key] = key === 'floors' ? parseInt(btn.dataset.val, 10) : btn.dataset.val;
      btn.parentElement.querySelectorAll('button').forEach(b => {
        const on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      apply();
      return;
    }
    if (e.target.closest('[data-reset]')) {
      Object.assign(p, DEFAULTS);
      roofVisible = true;
      syncControls();
      apply();
      setToolState();
      return;
    }
    if (e.target.closest('[data-lead]')) {
      const s = computeSpec(p);
      document.dispatchEvent(new CustomEvent('cfg:lead', { detail: { params: { ...p }, spec: s } }));
      toast('Параметры переданы в форму заявки');
      const target = document.getElementById('lead-wizard') || document.getElementById('contacts');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const tool = e.target.closest('[data-tool]');
    if (!tool) return;
    const kind = tool.dataset.tool;
    if (kind === 'reset') viewer.resetView();
    if (kind === 'rotate') viewer.setAutoRotate(!viewer.controls.autoRotate);
    if (kind === 'roof') roofVisible = !roofVisible;
    if (kind === 'camera') {
      const url = viewer.snapshot();
      const a = document.createElement('a');
      a.href = url;
      a.download = `karkaskin-3d-${p.length}x${p.span}.png`;
      a.click();
      toast('Картинка модели сохранена');
    }
    setToolState();
  });

  /* состояние кнопок сцены: «Кровля» и «Вращение» — переключатели */
  function setToolState() {
    const rot = !!(viewer.controls && viewer.controls.autoRotate);
    viewer.toggleRoof(roofVisible);
    root.querySelectorAll('[data-tool]').forEach(t => {
      const on = t.dataset.tool === 'roof' ? !roofVisible : t.dataset.tool === 'rotate' ? rot : false;
      t.classList.toggle('is-on', on);
      t.setAttribute('aria-pressed', String(on));
      if (t.dataset.tool === 'roof') {
        const title = roofVisible ? 'Скрыть кровлю и увидеть фермы' : 'Показать кровлю';
        t.title = title;
        t.setAttribute('aria-label', title);
      }
    });
  }

  apply();
  setToolState();

  const api = {
    viewer,
    params: p,
    getSpec: () => computeSpec(p),
    setParams: next => { Object.assign(p, next); syncControls(); apply(); },
  };
  root.__cfg = api;   // доступ для диагностики и внешних скриптов
  return api;
}

/* автозапуск контейнеров: data-configurator (karkaskin) или data-k3d (бандл) */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-configurator], [data-k3d]').forEach(el => {
    mountConfigurator(el, {
      variant: el.dataset.variant || 'full',
      params: el.dataset.params ? JSON.parse(el.dataset.params) : undefined,
      specTarget: el.dataset.specTarget || null,
      accent: el.dataset.accent || null,
    });
  });
});

/* ---------- встроенные стили ---------- */
(function(){var st=document.createElement('style');st.id='k3d-style';st.textContent='/* =========================================================\n   3D-КОНСТРУКТОР — стили (единый источник для всех сайтов)\n   Устанавливается в style.css karkaskin и во бандл k3d.js.\n   Токены: --cfg-accent (цвет сайта), --on-dark-2, --dark-2, --dark-3,\n   --font-display, --font-body — берутся из темы сайта, вне темы — запасные значения.\n   ========================================================= */\n.cfg {\n  --ac: var(--cfg-accent, var(--wood, #C0763C));\n  --dim: var(--on-dark-2, #A9B0BA);\n  --panel: var(--dark-2, #141A21);\n  --panel-3: var(--dark-3, #1C242D);\n  --scene: #0D1116;\n  --line: rgba(255,255,255,.11);\n  --fd: var(--font-display, inherit);\n  display: grid;\n  grid-template-columns: 340px minmax(0, 1fr);\n  border-radius: 18px;\n  background: var(--panel);\n  border: 1px solid var(--line);\n  box-shadow: 0 24px 48px rgba(0,0,0,.35);\n  color: var(--on-dark, #F3EFE8);\n}\n.cfg--solo { display: block; }\n\n/* ---------- панель параметров: без внутренней прокрутки, тянется за контентом ---------- */\n.cfg__panel {\n  padding: 24px 22px 22px;\n  background: var(--panel);\n  border-right: 1px solid var(--line);\n  border-radius: 18px 0 0 18px;\n}\n.cfg__title { font-family: var(--fd); font-size: 17px; font-weight: 600; color: #fff; margin-bottom: 5px; }\n.cfg__hint { font-size: 12.5px; line-height: 1.45; color: var(--dim); margin-bottom: 20px; }\n.cfg__group { margin: 0 0 20px; }\n.cfg__label {\n  display: flex; justify-content: space-between; align-items: baseline; gap: 10px;\n  font-size: 11.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;\n  color: #C9D0D9; margin-bottom: 8px;\n}\n.cfg__label[for] { cursor: pointer; }\n.cfg__val { font-family: var(--fd); font-size: 14px; font-weight: 700; color: #F0BE86; letter-spacing: 0; text-transform: none; white-space: nowrap; }\n.cfg .field { margin-bottom: 10px; }\n.cfg .field:last-child { margin-bottom: 0; }\n\n/* пресеты */\n.cfg__presets { display: flex; flex-wrap: wrap; gap: 6px; }\n.cfg__presets button {\n  padding: 7px 12px; border-radius: 999px; border: 1px solid rgba(255,255,255,.18);\n  background: var(--panel-3); color: #D5DBE2; font-family: inherit; font-size: 12px; font-weight: 600;\n  line-height: 1.3; cursor: pointer; transition: border-color .15s, color .15s, background .15s;\n}\n.cfg__presets button:hover { border-color: var(--ac); color: #fff; background: rgba(192,118,60,.16); }\n.cfg__presets button:active { transform: translateY(1px); }\n\n/* слайдер: заполненная часть трека + метки диапазона */\n.cfg .range {\n  -webkit-appearance: none; appearance: none; display: block; width: 100%; height: 22px;\n  background: transparent; outline: none; margin: 0; cursor: pointer;\n}\n.cfg .range::-webkit-slider-runnable-track {\n  height: 6px; border-radius: 6px;\n  background: linear-gradient(to right, var(--ac) 0 var(--fill, 50%), rgba(255,255,255,.16) var(--fill, 50%) 100%);\n}\n.cfg .range::-moz-range-track { height: 6px; border-radius: 6px; background: rgba(255,255,255,.16); }\n.cfg .range::-moz-range-progress { height: 6px; border-radius: 6px; background: var(--ac); }\n.cfg .range::-webkit-slider-thumb {\n  -webkit-appearance: none; width: 18px; height: 18px; margin-top: -6px; border-radius: 50%;\n  background: #fff; border: 4px solid var(--ac); box-shadow: 0 2px 6px rgba(0,0,0,.45); cursor: pointer;\n}\n.cfg .range::-moz-range-thumb {\n  width: 10px; height: 10px; border-radius: 50%; background: #fff; border: 4px solid var(--ac);\n  box-shadow: 0 2px 6px rgba(0,0,0,.45); cursor: pointer;\n}\n.cfg .range:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 4px rgba(192,118,60,.35); }\n.cfg__range { display: flex; justify-content: space-between; font-size: 11px; color: var(--dim); margin-top: -2px; font-variant-numeric: tabular-nums; }\n\n/* переключатели-сегменты */\n.cfg .seg { display: flex; gap: 6px; background: var(--panel-3); padding: 5px; border-radius: 12px; }\n.cfg .seg button {\n  flex: 1 1 0; min-width: 0; padding: 9px 10px; border: 0; border-radius: 9px;\n  font-family: inherit; font-size: 13px; font-weight: 600; line-height: 1.25; text-align: center;\n  color: #C9D0D9; transition: background .18s, color .18s; white-space: nowrap; cursor: pointer;\n}\n.cfg .seg button:hover { color: #fff; background: rgba(255,255,255,.06); }\n.cfg .seg button.is-active { background: var(--ac); color: #fff; }\n/* пилюли этажности и породы: светлая подложка + тёмный текст (по замечанию заказчика),\n   у сетки крыш (seg--grid) оформление остаётся прежним */\n.cfg .seg:not(.seg--grid) button { background: #EFE9DE; color: #1C2430; }\n.cfg .seg:not(.seg--grid) button:hover { background: #E4DCCB; color: #1C2430; }\n.cfg .seg:not(.seg--grid) button.is-active { background: var(--ac); color: #1C2430; }\n.cfg .seg--grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }\n.cfg .seg--grid button { text-align: left; padding: 9px 12px; white-space: normal; display: flex; flex-direction: column; justify-content: center; min-height: 54px; }\n.cfg .seg--grid button b { font-size: 13px; font-weight: 600; }\n.cfg .seg--grid button small { display: block; font-size: 11px; font-weight: 400; line-height: 1.3; color: #B3BBC5; margin-top: 2px; }\n.cfg .seg--grid button.is-active small { color: rgba(255,255,255,.86); }\n.cfg .seg--grid button:last-child:nth-child(odd) { grid-column: 1 / -1; }   /* нечётный последний — на всю ширину */\n.cfg .seg--even button { text-align: center; min-height: 40px; }\n\n/* раскрывающийся блок «Дополнительные параметры» */\n.cfg__more { margin-bottom: 18px; }\n.cfg__more summary {\n  display: flex; align-items: center; justify-content: space-between; gap: 10px;\n  list-style: none; cursor: pointer; padding: 10px 12px; margin: 0 -12px; border-radius: 10px;\n  font-size: 11.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;\n  color: #D5DBE2; transition: background .15s, color .15s; user-select: none;\n}\n.cfg__more summary::-webkit-details-marker { display: none; }\n.cfg__more summary::after {\n  content: \'\'; width: 8px; height: 8px; flex: none; margin-right: 3px;\n  border-right: 2px solid var(--ac); border-bottom: 2px solid var(--ac);\n  transform: rotate(45deg) translateY(-2px); transition: transform .2s;\n}\n.cfg__more[open] summary::after { transform: rotate(225deg) translateY(-2px); }\n.cfg__more summary:hover { background: rgba(255,255,255,.06); color: #fff; }\n.cfg__more summary:focus-visible { outline: 2px solid var(--ac); outline-offset: 2px; }\n.cfg__more-body { padding-top: 12px; display: grid; gap: 10px; }\n.cfg__more-body .field { margin-bottom: 0; }\n.cfg select.select {\n  width: 100%; padding: 11px 36px 11px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,.16);\n  background-color: var(--panel-3); color: #fff; font-family: inherit; font-size: 14px; outline: none; cursor: pointer;\n  appearance: none; -webkit-appearance: none;\n  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\' viewBox=\'0 0 12 8\'%3E%3Cpath fill=\'none\' stroke=\'%23C9D0D9\' stroke-width=\'1.8\' stroke-linecap=\'round\' d=\'M1.5 1.5l4.5 4.5 4.5-4.5\'/%3E%3C/svg%3E");\n  background-repeat: no-repeat; background-position: right 13px center;\n}\n.cfg select.select:focus { border-color: var(--ac); box-shadow: 0 0 0 3px rgba(192,118,60,.22); }\n.cfg select.select option { background: var(--panel-3); color: #fff; }\n\n/* кнопки панели */\n.cfg__actions { display: grid; gap: 10px; margin-top: 4px; }\n.cfg .btn {\n  display: inline-flex; align-items: center; justify-content: center; gap: 8px;\n  padding: 14px 18px; border-radius: 12px; border: 1.5px solid transparent;\n  font-family: inherit; font-size: 14px; font-weight: 700; line-height: 1.2; cursor: pointer;\n  transition: filter .15s, border-color .15s, color .15s, background .15s; user-select: none;\n}\n.cfg .btn--primary { width: 100%; background: var(--ac); color: #fff; }\n.cfg .btn--primary:hover { filter: brightness(1.08); }\n.cfg .btn--ghost { background: transparent; border-color: rgba(255,255,255,.24); color: #D5DBE2; }\n.cfg .btn--ghost:hover { border-color: #fff; color: #fff; background: rgba(255,255,255,.05); }\n.cfg .btn--sm { padding: 11px 18px; font-size: 13.5px; }\n\n/* ---------- сцена ---------- */\n/* вариант «только модель» (в первом экране): сцена на всю ширину блока */\n.cfg--solo .cfg__stage { position: relative; top: 0; height: clamp(380px, 56vh, 660px); border-radius: 18px; --cfg-bottom-k: 0.06; }\n/* в первом экране кнопки уходят наверх направо и не закрывают модель */\n.cfg--solo .cfg__tools { top: 14px; bottom: auto; }\n.cfg--solo .cfg__tools .cfg__tool span { display: inline; }\n.cfg--solo .cfg__tools .cfg__tool { width: auto; padding: 0 13px 0 11px; justify-content: flex-start; }\n.cfg__stage {\n  position: sticky; top: 16px; align-self: start;\n  height: min(760px, calc(100vh - 40px)); min-height: 460px;\n  border-radius: 0 18px 18px 0; overflow: hidden;\n  background: radial-gradient(120% 100% at 50% 0%, #1D242D 0%, var(--scene) 70%);\n}\n.cfg__canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; }\n.cfg__badge {\n  position: absolute; top: 16px; left: 16px; display: inline-flex; align-items: center; gap: 8px;\n  padding: 8px 14px; border-radius: 999px; background: rgba(10,14,19,.78); backdrop-filter: blur(8px);\n  border: 1px solid rgba(255,255,255,.16); font-size: 12px; font-weight: 700; color: #fff; z-index: 3; pointer-events: none;\n}\n.cfg__badge i { width: 7px; height: 7px; border-radius: 50%; background: #5BD48A; box-shadow: 0 0 0 3px rgba(91,212,138,.22); }\n.cfg__tools { position: absolute; right: 14px; bottom: 14px; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; z-index: 3; }\n.cfg__tools-row { display: flex; gap: 8px; }\n.cfg__tool {\n  display: inline-flex; align-items: center; gap: 7px; padding: 0 13px 0 11px; height: 40px;\n  border-radius: 12px; background: rgba(10,14,19,.78); backdrop-filter: blur(8px);\n  border: 1px solid rgba(255,255,255,.14); color: #E6EBF1; font-family: inherit; font-size: 12.5px; font-weight: 600;\n  cursor: pointer; transition: background .18s, border-color .18s, color .18s; user-select: none;\n}\n.cfg__tool svg { width: 18px; height: 18px; flex: none; }\n.cfg__tool span { white-space: nowrap; }\n.cfg__tool:hover { background: rgba(192,118,60,.9); border-color: transparent; color: #fff; }\n.cfg__tool.is-on { background: var(--ac); border-color: transparent; color: #fff; }\n.cfg__tool:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }\n.cfg__hintbar {\n  position: absolute; left: 16px; bottom: 22px; font-size: 12px; color: #C9D0D9;\n  background: rgba(10,14,19,.62); padding: 7px 13px; border-radius: 999px; backdrop-filter: blur(8px);\n  border: 1px solid rgba(255,255,255,.1); z-index: 2; pointer-events: none;\n}\n.cfg__loading {\n  position: absolute; inset: 0; display: grid; place-items: center; padding: 20px; text-align: center;\n  background: var(--scene); z-index: 4; color: #C9D0D9; font-size: 14px; transition: opacity .45s;\n}\n.cfg__loading.is-hidden { opacity: 0; pointer-events: none; }\n\n/* ---------- результат расчёта (может стоять вне .cfg) ---------- */\n.cfg__out {\n  --ac: var(--cfg-accent, var(--wood, #C0763C)); --dim: var(--on-dark-2, #A9B0BA);\n  border: 1px solid rgba(255,255,255,.09); background: var(--dark, #10141A); color: #fff;\n  padding: 20px 24px 22px; display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 16px 22px;\n}\n.cfg__out h4 {\n  grid-column: 1 / -1; font-family: var(--fd, inherit); font-size: 12px; letter-spacing: .12em; text-transform: uppercase;\n  color: #F0BE86; font-weight: 700; margin: 0 0 2px;\n}\n.cfg__out .spec { display: flex; flex-direction: column; gap: 3px; }\n.cfg__out .spec b { font-family: var(--font-display, inherit); font-size: 20px; font-weight: 600; color: #fff; letter-spacing: -.01em; }\n.cfg__out .spec span { font-size: 12px; color: var(--dim); }\n\n/* ---------- адаптив ---------- */\n@media (max-width: 1360px) {\n  .cfg__tool span { display: none; }\n  .cfg__tool { width: 40px; padding: 0; justify-content: center; }\n}\n@media (max-width: 1100px) { .cfg { grid-template-columns: 310px minmax(0, 1fr); } }\n@media (max-width: 900px) {\n  .cfg { grid-template-columns: minmax(0, 1fr); }\n  .cfg__stage { order: -1; position: relative; top: 0; height: clamp(340px, 58vh, 560px); min-height: 0; border-radius: 18px 18px 0 0; }\n  .cfg__panel { border-right: 0; border-top: 1px solid var(--line); border-radius: 0 0 18px 18px; }\n}\n@media (max-width: 560px) {\n  .cfg__stage { height: 62vh; min-height: 320px; }\n  .cfg__panel { padding: 18px 16px; }\n  .cfg__hintbar { display: none; }\n  .cfg__badge { top: 12px; left: 12px; font-size: 11.5px; }\n  .cfg__tools { right: 10px; bottom: 10px; }\n  .cfg__tool { height: 38px; }\n  .cfg__out { padding: 16px; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 12px; }\n  .cfg__out .spec b { font-size: 17px; }\n  .cfg--solo .cfg__stage { height: clamp(320px, 56vh, 460px); --cfg-bottom-k: 0.3; }\n  .cfg--solo .cfg__tools { top: auto; bottom: 10px; }\n}\n';document.head.appendChild(st);})();
