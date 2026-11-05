// Erzeugt web/index.html: ein einziges HTML mit eingebetteten Meshes (Zusammenbau-Lage) + WebGL-Viewer.
import { readFileSync, writeFileSync } from 'fs';
import { CSG, box, cylX, cylY, cylZ, cyl } from './csg.mjs';
import * as part from './parts.mjs';
const P = part.P;

const merge = (...a) => new CSG(a.flatMap((c) => c.polygons));
const rotWheel = (sg) => ([x, y, z]) => [P.axleX + x, sg * (P.wheelGap + z), P.axleZ + y];
function pack(csg) {
  const tris = csg.triangles(), f = new Float32Array(tris.length * 9);
  let i = 0, vol = 0;
  for (const [a, b, c] of tris) {
    for (const v of [a, b, c]) { f[i++] = v[0]; f[i++] = v[1]; f[i++] = v[2]; }
    vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return { p: Buffer.from(f.buffer).toString('base64'), vol: Math.abs(vol) / 1000 };
}
const M = (csg, c) => ({ csg, c });
const part_ = (o) => o;

const wheelL = part.wheel().transform(rotWheel(1)), wheelR = part.wheel().transform(rotWheel(-1));
const skid = part.skid().transform(([x, y, z]) => [57 + x, y, z]);
const T = P.tray, mods = P.mods, ax = P.axleX, az = P.axleZ;

const motors = [1, -1].flatMap((s) => [
  M(box(ax - 6, s * 20, az - 5, ax + 6, s * 35, az + 5), '#c4c8ce'),
  M(box(ax - 6, s * 35, az - 5, ax + 6, s * 44, az + 5), '#8d97a3'),
  M(cylY(ax, az, s * 44, s * 46, 2, 16), '#c4c8ce'),
  M(cylY(ax, az, s * 46, s * 55, 1.5, 16), '#e4e7ea'),
]);
const pcb = (m, z = 11.2) => box(m[0] - m[2] / 2, m[1] - m[3] / 2, z, m[0] + m[2] / 2, m[1] + m[3] / 2, z + 1.6);
const [tp, mt, drv, mx] = [mods.tp4056, mods.mt3608, mods.drv8833, mods.max98357];
const hx = P.head.cx; // 35

const parts = [
  part_({ id: 'chassis', name: 'Chassis', kind: 'print', color: '#4b5059', off: [0, 0, 0], qty: 1, size: '130 × 92 × 22 mm',
    note: 'Platte liegt auf dem Druckbett. 0,2 mm, 3 Wände, 20 % Infill, ohne Stützen.', meshes: [M(part.chassis(), null)] }),
  part_({ id: 'torso', name: 'Torso', kind: 'print', color: '#e4e1d9', off: [0, 0, 40], qty: 1, size: '130 × 92 × 38 mm',
    note: 'Kopfüber drucken (Decke auf dem Bett). 0,2 mm, 3 Wände, 15 % Infill.', meshes: [M(part.shell(), null)] }),
  part_({ id: 'kopf', name: 'Kopf', kind: 'print', color: '#e8590c', off: [0, 0, 86], qty: 1, size: '54 × 78 × 42 mm',
    note: 'Kopfüber drucken. 0,16 mm, 3 Wände, 15 % Infill.', meshes: [M(part.head(), null)] }),
  part_({ id: 'rad', name: 'Rad', kind: 'print', color: '#2d3035', off: [0, 0, 0], offL: [0, 38, 0], offR: [0, -38, 0], qty: 2, size: 'Ø 43 × 18 mm',
    note: 'Flach drucken, 2 Stück. Reifenprofil aus TPU oder Gummiband optional.', meshes: [M(wheelL, null), M(wheelR, null)], perMeshOff: [[0, 38, 0], [0, -38, 0]] }),
  part_({ id: 'fuss', name: 'Stützfuß', kind: 'print', color: '#e8590c', off: [0, 0, -26], qty: 1, size: 'Ø 16 × 15 mm',
    note: 'Zapfen nach unten in die Chassis-Platte stecken und kleben.', meshes: [M(skid, null)] }),

  part_({ id: 'antenne', name: 'Antenne', kind: 'print', color: '#e8590c', off: [0, 0, 150], qty: 1, size: 'Ø 10 × 24 mm',
    note: 'Stehend drucken, Fuß auf die Kopf-Oberseite kleben.', meshes: [M(part.antenna().transform(([x, y, z]) => [hx - 12 + x, y, 91 + z]), null)] }),
  part_({ id: 'kotf', name: 'Kotflügel', kind: 'print', color: '#e8590c', off: [0, 0, 40], perMeshOff: [[0, 24, 0], [0, -24, 0]], qty: 2, size: '53 × 34 × 21 mm',
    note: 'Links und rechts, liegend drucken (Platte unten), an die Torso-Seite kleben.', meshes: [M(part.fender(1), null), M(part.fender(-1), null)] }),

  part_({ id: 'akku', name: '18650-Akku mit Halter', kind: 'buy', color: '#2f6fd0', off: [0, 0, 18], qty: 1, size: '77 × 21 × 20 mm', price: '5,00 €',
    meshes: [M(box(T.cx - 38.5, -10.5, 11.6, T.cx + 38.5, 10.5, 21.6), '#26282c'), M(cylX(0, 21.5, T.cx - 32.5, T.cx + 32.5, 9, 32), '#2f6fd0'), M(cylX(0, 21.5, T.cx + 32.5, T.cx + 33.5, 4, 16), '#d9dde1')] }),
  part_({ id: 'motor', name: 'N20-Motor 6 V', kind: 'buy', color: '#c4c8ce', off: [0, 0, 12], perMeshOff: motors.map((_, i) => [0, (i < 4 ? 1 : -1) * 20, 0]), qty: 2, size: '12 × 10 × 24 mm', price: '6,00 €', meshes: motors }),
  part_({ id: 'tp4056', name: 'TP4056 Lademodul', kind: 'buy', color: '#1d4fa3', off: [-20, 0, 24], qty: 1, size: '26 × 17 mm', price: '1,50 €',
    meshes: [M(pcb(tp), '#1d4fa3'), M(box(tp[0] - 13.3, -4.5, 12.8, tp[0] - 4.5, 4.5, 16), '#d9dde1'), M(box(tp[0] + 2, -3, 12.8, tp[0] + 8, 3, 14.2), '#1a1b1e')] }),
  part_({ id: 'mt3608', name: 'MT3608 Step-up', kind: 'buy', color: '#1d4fa3', off: [0, 16, 26], qty: 1, size: '36 × 17 mm', price: '1,00 €',
    meshes: [M(pcb(mt), '#1d4fa3'), M(box(mt[0] - 4, mt[1] - 5, 12.8, mt[0] + 6, mt[1] + 5, 18), '#25272b'), M(box(mt[0] + 12, mt[1] + 2, 12.8, mt[0] + 16, mt[1] + 7, 16), '#e0a330')] }),
  part_({ id: 'drv', name: 'DRV8833 Motortreiber', kind: 'buy', color: '#b0302a', off: [8, -16, 22], qty: 1, size: '20 × 17 mm', price: '1,50 €',
    meshes: [M(pcb(drv), '#b0302a'), M(box(drv[0] - 3, drv[1] - 3, 12.8, drv[0] + 3, drv[1] + 3, 14.2), '#1a1b1e')] }),
  part_({ id: 'max', name: 'MAX98357A Verstärker', kind: 'buy', color: '#6a3fa0', off: [-8, -16, 32], qty: 1, size: '19 × 18 mm', price: '2,00 €',
    meshes: [M(pcb(mx), '#6a3fa0'), M(box(mx[0] - 2, mx[1] - 2, 12.8, mx[0] + 2, mx[1] + 2, 13.8), '#1a1b1e'), M(box(mx[0] - 8, mx[1] + 5, 12.8, mx[0] - 2, mx[1] + 8.5, 17), '#2a63c8')] }),
  part_({ id: 'speaker', name: 'Lautsprecher 28 mm', kind: 'buy', color: '#202226', off: [0, 0, 58], qty: 1, size: 'Ø 28 × 5 mm', price: '1,50 €',
    meshes: [M(cylZ(P.speaker.x, 0, 40.6, 45.6, 14, 40), '#202226'), M(cylZ(P.speaker.x, 0, 45.6, 46, 10, 40), '#9aa2ab')] }),
  part_({ id: 'esp', name: 'ESP32-S3 DevKitC', kind: 'buy', color: '#1d6b45', off: [0, 0, 112], qty: 1, size: '69 × 25,5 mm', price: '8,00 €',
    meshes: [M(box(hx - 8, -34.5, 52, hx - 6.4, 34.5, 77.5), '#1d6b45'), M(box(hx - 6.4, 14, 53, hx - 3.4, 33.5, 76.5), '#b9bec5'),
      M(box(hx - 10.5, -28, 52.8, hx - 8, 28, 55.3), '#1a1b1e'), M(box(hx - 10.5, -28, 74.2, hx - 8, 28, 76.7), '#1a1b1e'),
      M(box(hx - 6.4, -36, 58, hx - 3, -31, 64), '#d9dde1'), M(box(hx - 6.4, -36, 66, hx - 3, -31, 72), '#d9dde1')] }),
  part_({ id: 'hcsr', name: 'HC-SR04 Ultraschall', kind: 'buy', color: '#1d4fa3', off: [26, 0, 98], qty: 1, size: '45 × 20 × 15 mm', price: '1,50 €',
    meshes: [M(box(hx + 13.4, -22.5, 60, hx + 15, 22.5, 80), '#1d4fa3'), M(cylX(13, 70, hx + 15, hx + 27, 8, 36), '#c9ced4'), M(cylX(-13, 70, hx + 15, hx + 27, 8, 36), '#c9ced4'),
      M(cylX(13, 70, hx + 26.6, hx + 27.1, 6.4, 36), '#2a2d32'), M(cylX(-13, 70, hx + 26.6, hx + 27.1, 6.4, 36), '#2a2d32'), M(box(hx + 10.4, -6, 66, hx + 13.4, 6, 74), '#c9ced4')] }),
  part_({ id: 'mic', name: 'INMP441 Mikrofon', kind: 'buy', color: '#1f7a5a', off: [0, 0, 124], qty: 1, size: '14 × 14 mm', price: '3,00 €',
    meshes: [M(box(hx + 3 - 7, -7, 85, hx + 3 + 7, 7, 86.6), '#1f7a5a'), M(box(hx + 2, -1.6, 86.6, hx + 4.4, 1.6, 88.4), '#c9ced4')] }),
];

for (const p of parts) {
  let vol = 0;
  p.meshes = p.meshes.map((m) => { const k = pack(m.csg); vol += k.vol; return { p: k.p, c: m.c }; });
  p.vol = +(vol / (p.qty === 2 && p.id === 'rad' ? 2 : 1)).toFixed(1);
  delete p.offL; delete p.offR;
}
const tpl = readFileSync(new URL('../web/template.html', import.meta.url), 'utf8');
writeFileSync(new URL('../web/index.html', import.meta.url), tpl.replace('/*__PARTS__*/null', JSON.stringify(parts)));
console.log('web/index.html', (readFileSync(new URL('../web/index.html', import.meta.url)).length / 1e6).toFixed(2), 'MB');
for (const p of parts.filter((p) => p.kind === 'print')) console.log(p.id, p.vol, 'cm3');
