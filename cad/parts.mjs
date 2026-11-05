// Parametrische Konstruktion des Roboters. Einheiten: mm. x = vorne, y = links, z = oben.
// Alle Maße der Elektronik-Module stehen oben als Parameter: nachmessen und anpassen!
import { CSG, box, cylZ, coneZ, cylY, cylX, rrect, cyl, sphere } from './csg.mjs';

export const P = {
  L: 130, W: 92, R: 14,            // Grundriss Chassis/Torso
  zPlate0: 8, zPlate1: 11,         // Chassis-Platte (8 mm Bodenfreiheit)
  wall: 2.4,
  zTop: 49,                        // Oberkante Torso
  ceil: 3,                         // Deckenstärke Torso
  axleX: -5, axleZ: 21.5,          // Radachse
  wheelD: 43, wheelW: 18, wheelGap: 47.5,
  motor: { w: 12, h: 10, len: 24 },// N20 Getriebemotor (Gehäuse)
  tray: { cx: 8, w: 78.5, d: 22.5 },// 18650-Halter
  lugs: [[52, 34], [52, -34], [-52, 34], [-52, -34]], // Schrauben Torso <-> Chassis (M2)
  head: { cx: 35, w: 54, d: 78, r: 10, h: 42, z0: 49 },
  mods: {                          // Module: Mitte x, y, Breite (x), Tiefe (y)
    tp4056: [-47, 0, 26, 17], mt3608: [26, 34.5, 36, 17],
    drv8833: [18, -34.5, 20, 17], max98357: [-33, -34.5, 19, 18],
  },
  speaker: { x: -40, y: 0, d: 28.6 },
};
const U = (parts) => parts.reduce((a, b) => a.union(b));

// Eck-Halter (L-förmig) um ein Modul; corners: A=(x-,y-) B=(x+,y-) C=(x-,y+) D=(x+,y+)
function cradle(cx, cy, w, d, z0, h, corners, t = 1.3, leg = 5, clr = 0.3) {
  const hx = w / 2 + clr, hy = d / 2 + clr, out = [];
  const spec = { A: [-1, -1], B: [1, -1], C: [-1, 1], D: [1, 1] };
  for (const c of corners) {
    const [sx, sy] = spec[c];
    const X = cx + sx * hx, Y = cy + sy * hy;
    out.push(box(X, Y + sy * t, z0, X + sx * t, Y - sy * leg, z0 + h));   // Wand an der x-Kante
    out.push(box(X + sx * t, Y, z0, X - sx * leg, Y + sy * t, z0 + h));   // Wand an der y-Kante
  }
  return U(out);
}

// ---------------- Chassis ----------------
export function chassis() {
  const { L, W, R, zPlate0: z0, zPlate1: z1, axleX, axleZ, motor, tray, lugs, mods } = P;
  let c = rrect(0, 0, L, W, R, z0, z1);
  const adds = [];

  // Akku-Halter-Wanne (18650 + Halter) mit Kabelauslässen
  const tw = tray.w / 2, td = tray.d / 2, t = 1.6;
  let trayBox = box(tray.cx - tw - t, -td - t, z1 - 0.5, tray.cx + tw + t, td + t, z1 + 9)
    .subtract(box(tray.cx - tw, -td, z1, tray.cx + tw, td, z1 + 20));
  trayBox = trayBox.subtract(box(tray.cx + tw - 1, -5, z1 + 3, tray.cx + tw + t + 1, 5, z1 + 20));
  adds.push(trayBox);

  // Motortürme mit Tunnel (Motor wird von innen eingeschoben) und Anschlag-Lippe
  const holes = [];
  for (const s of [1, -1]) {
    adds.push(box(axleX - 9, s * 20, z1 - 1, axleX + 9, s * 46, axleZ + motor.h / 2 + 3.6));
    holes.push(box(axleX - 6.2, s * 19, axleZ - 5.2, axleX + 6.2, s * 44, axleZ + 5.2));
    holes.push(cylY(axleX, axleZ, s * 43, s * 47, 3.2, 20));
  }
  // Modul-Halter
  adds.push(cradle(...mods.tp4056.slice(0, 2), mods.tp4056[2], mods.tp4056[3], z1 - 0.5, 5.5, 'AC'));
  adds.push(cradle(mods.mt3608[0], mods.mt3608[1], mods.mt3608[2], mods.mt3608[3], z1 - 0.5, 5.5, 'AB'));
  adds.push(cradle(mods.drv8833[0], mods.drv8833[1], mods.drv8833[2], mods.drv8833[3], z1 - 0.5, 5.5, 'CD'));
  adds.push(cradle(mods.max98357[0], mods.max98357[1], mods.max98357[2], mods.max98357[3], z1 - 0.5, 5.5, 'CD'));
  c = c.union(...adds);

  // Löcher: Kabelbinder-Schlitze, Schrauben (mit Senkung unten), Motor-Tunnel, Stützfuß-Loch
  for (const s of [1, -1]) for (const dx of [-22, 22]) holes.push(box(tray.cx + dx - 4, s * 16 - 1, z0 - 1, tray.cx + dx + 4, s * 16 + 1, z1 + 1));
  for (const [x, y] of lugs) { holes.push(cylZ(x, y, z0 - 1, z1 + 1, 1.3, 16)); holes.push(cylZ(x, y, z0 - 1, z0 + 1.6, 2.5, 16)); }
  holes.push(cylZ(57, 0, z0 - 1, z1 + 1, 3.15, 20));
  return c.subtract(...holes);
}

// ---------------- Stützfuß (Kufe) ----------------
export function skid() {
  return coneZ(0, 0, 0, 8, 4, 8, 28).union(cylZ(0, 0, 7.9, 15, 3, 20)); // Zapfen steckt in der Chassis-Platte
}

// ---------------- Torso ----------------
export function shell() {
  const { L, W, R, zPlate1: z1, wall, zTop, ceil, lugs, axleX, head, speaker } = P;
  let s = rrect(0, 0, L, W, R, z1, zTop - 2)
    .union(rrect(0, 0, L - 1.6, W - 1.6, R - 0.8, zTop - 2.1, zTop - 1), rrect(0, 0, L - 3.2, W - 3.2, R - 1.6, zTop - 1.1, zTop))
    .subtract(rrect(0, 0, L - 2 * wall, W - 2 * wall, R - wall, z1 - 1, zTop - ceil));
  const adds = [];
  for (const [x, y] of lugs) adds.push(cylZ(x, y, z1, zTop - ceil + 1, 3.2, 20));
  // Lautsprecher-Sitz unter der Decke
  adds.push(cylZ(speaker.x, speaker.y, 40, zTop - ceil + 1, speaker.d / 2 + 2, 40)
    .subtract(cylZ(speaker.x, speaker.y, 39, zTop, speaker.d / 2, 40)));
  s = s.union(...adds);

  const cuts = [];
  for (const [x, y] of lugs) { cuts.push(cylZ(x, y, z1 - 1, z1 + 10, 0.95, 12)); }
  // Radhäuser: Aussparungen für die Motortürme
  for (const sg of [1, -1]) cuts.push(box(axleX - 9.6, sg * 42, z1 - 1, axleX + 9.6, sg * 47, 30.2));
  // Lautsprecher-Gitter
  const sp = speaker, holes = [[0, 0]];
  for (let i = 0; i < 6; i++) holes.push([6.5 * Math.cos((i * Math.PI) / 3), 6.5 * Math.sin((i * Math.PI) / 3)]);
  for (let i = 0; i < 12; i++) holes.push([11.5 * Math.cos((i * Math.PI) / 6), 11.5 * Math.sin((i * Math.PI) / 6)]);
  for (const [dx, dy] of holes) cuts.push(cylZ(sp.x + dx, sp.y + dy, zTop - ceil - 1, zTop + 1, 1.6, 10));
  // Kopf-Schrauben (von innen) und Kabeldurchlass
  for (const [x, y] of headLugPos()) { cuts.push(cylZ(x, y, zTop - ceil - 1, zTop + 1, 1.3, 12)); cuts.push(cylZ(x, y, zTop - ceil - 1, zTop - ceil + 1.5, 2.4, 12)); }
  cuts.push(box(head.cx - 7, -14, zTop - ceil - 1, head.cx + 9, 14, zTop + 1));
  // Zierfuge rundherum (Gürtellinie)
  cuts.push(rrect(0, 0, L + 2, W + 2, R + 1, 38.2, 39.6).subtract(rrect(0, 0, L - 2, W - 2, R - 1, 38, 39.8)));
  // Rückwand: USB-C-Ladebuchse (TP4056) und Schalter
  cuts.push(box(-67, -6.5, z1 - 1, -61, 6.5, z1 + 6.5));
  cuts.push(cylX(30, 28, -67, -61, 3.1, 20));
  return s.subtract(...cuts);
}
const headLugPos = () => [[12, 30], [12, -30], [57, 30], [57, -30]];

// ---------------- Kopf ----------------
export function head() {
  const { cx, w, d, r, h, z0 } = P.head, wall = P.wall, zc = z0 + h;
  let hd = rrect(cx, 0, w, d, r, z0, zc - 3)
    .union(rrect(cx, 0, w - 1.6, d - 1.6, r - 0.8, zc - 3.1, zc - 2), rrect(cx, 0, w - 3.2, d - 3.2, r - 1.6, zc - 2.1, zc - 1), rrect(cx, 0, w - 4.8, d - 4.8, r - 2.4, zc - 1.1, zc))
    .subtract(rrect(cx, 0, w - 2 * wall, d - 2 * wall, r - wall, z0 - 1, zc - 2.4));
  const ceilZ = zc - 2.4, adds = [];
  for (const [x, y] of headLugPos()) adds.push(cylZ(x, y, z0, ceilZ + 1, 3.2, 20));
  // HC-SR04: Führungsblöcke (Platine liegt bei x = cx+15 .. cx+16.6, Augen zeigen nach vorn)
  const bx = cx + 14.6;
  for (const s of [1, -1]) {
    adds.push(box(bx - 2.6, s * 23, z0 + 12, bx + 3.4, s * 25.6, ceilZ + 1));          // seitliche Anschläge
    adds.push(box(bx - 4.4, s * 18.5, z0 + 14, bx - 1.6, s * 22, ceilZ + 1));          // Rückanschlag
  }
  // ESP32 steht senkrecht an der Rückseite; Gabeln greifen die Oberkante an beiden Enden
  const ex = cx - 8;
  for (const s of [1, -1]) adds.push(box(ex - 2.6, s * 29, z0 + 23, ex + 4.2, s * 35.6, ceilZ + 1)
    .subtract(box(ex - 0.2, s * 28, z0 + 22, ex + 1.8, s * 36.5, z0 + 33)));
  // Mikrofon-Tasche an der Decke
  adds.push(cradle(cx + 3, 0, 14, 14, ceilZ - 5, 5.5, 'ABCD'));
  // Optik: Ohren (Scheiben an den Seiten) und Augenringe vorn
  for (const s of [1, -1]) {
    adds.push(cylY(cx + 12, z0 + 22, s * (d / 2 - 1), s * (d / 2 + 4), 9, 40));
    adds.push(cylX(s * 13, z0 + 21, cx + w / 2 - 1, cx + w / 2 + 2.5, 11, 48));
  }
  hd = hd.union(...adds);

  const cuts = [];
  for (const [x, y] of headLugPos()) cuts.push(cylZ(x, y, z0 - 1, z0 + 12, 0.95, 12));
  for (const s of [1, -1]) {
    cuts.push(cylX(s * 13, z0 + 21, cx + w / 2 - 4, cx + w / 2 + 4, 8.4, 40));                  // Ultraschall-Augen
    cuts.push(cylY(cx + 12, z0 + 22, s * (d / 2 + 2.8), s * (d / 2 + 5), 6.2, 32));             // Vertiefung im Ohr
  }
  for (let i = 0; i < 3; i++) cuts.push(box(cx + w / 2 - 1.2, -9, z0 + 3 + i * 2.3, cx + w / 2 + 1, 9, z0 + 4.2 + i * 2.3)); // Mund
  cuts.push(box(cx - 9, -d / 2 - 1, z0 + 4, cx + 1, -d / 2 + 4, z0 + 27));               // USB-Zugang ESP32
  cuts.push(cylZ(cx + 3, 0, ceilZ - 1, zc + 1, 1.3, 16));                                  // Mikrofon-Öffnung
  return hd.subtract(...cuts);
}

// ---------------- Antenne (stehend drucken, Fuß auf den Kopf kleben) ----------------
export function antenna() {
  return cylZ(0, 0, 0, 2.5, 5, 32).union(cylZ(0, 0, 2, 17, 1.6, 20), sphere(0, 0, 20, 4.2, 28, 14));
}

// ---------------- Kotflügel (liegend drucken, an die Torso-Seite kleben) ----------------
export function fender(sg) {
  const { axleX: ax, axleZ: az } = P;
  const ring = cylY(ax, az, sg * 46, sg * 67, 26.5, 64).subtract(cylY(ax, az, sg * 45, sg * 68, 23.5, 64));
  const plate = cylY(ax, az, sg * 46, sg * 47.2, 26.5, 64).subtract(cylY(ax, az, sg * 45, sg * 48, 10, 32));
  return ring.union(plate).subtract(box(ax - 40, sg * 40, az - 60, ax + 40, sg * 70, az - 8));
}

// ---------------- Rad ----------------
export function wheel() {
  const { wheelD: D, wheelW: Wd } = P, R = D / 2;
  let w = cylZ(0, 0, 0, Wd, R, 64).subtract(cylZ(0, 0, 2, Wd + 1, R - 2.2, 64));
  const hub = [cylZ(0, 0, 0, Wd - 2, 6, 32)];
  for (let i = 0; i < 5; i++) {
    hub.push(spoke((i * 2 * Math.PI) / 5, R));
  }
  w = w.union(...hub.filter(Boolean));
  // Profil: Kerben am Umfang
  const notch = [];
  for (let i = 0; i < 24; i++) {
    const a = (i * 2 * Math.PI) / 24;
    notch.push(box(R - 1, -1.1, -1, R + 1, 1.1, Wd + 1).transform(([x, y, z]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), z]));
  }
  w = w.subtract(...notch);
  // Achsbohrung (N20-D-Welle: Ø3 mit Flachstelle), 7 mm tief von der Innenseite (z = 0)
  const bore = cylZ(0, 0, -1, 7, 1.55, 20).subtract(box(1.25, -3, -2, 3, 3, 8));
  return w.subtract(bore);
}
function spoke(a, R) {
  return box(3, -1.5, 0, R - 1.5, 1.5, 4).transform(([x, y, z]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), z]);
}
