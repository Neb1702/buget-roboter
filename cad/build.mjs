import { writeFileSync, mkdirSync } from 'fs';
import { toSTL, bounds } from './csg.mjs';
import * as part from './parts.mjs';

mkdirSync(new URL('./stl/', import.meta.url), { recursive: true });
const out = {};
const jobs = [
  ['chassis', part.chassis, (v) => [v[0], v[1], v[2] - 8]],            // Platte liegt auf dem Druckbett
  ['torso', part.shell, ([x, y, z]) => [x, -y, 49 - z]],              // kopfüber drucken (Decke auf dem Bett)
  ['kopf', part.head, ([x, y, z]) => [x - 35, -y, 91 - z]],           // kopfüber drucken
  ['rad', part.wheel, (v) => v],                                      // 2x drucken
  ['stuetzfuss', part.skid, (v) => v],                                // 1x drucken
];
for (const [name, fn, orient] of jobs) {
  const t = Date.now();
  const csg = fn();                       // Zusammenbau-Lage
  out[name] = csg;
  const printed = csg.transform(orient);  // Druck-Lage
  writeFileSync(new URL(`./stl/${name}.stl`, import.meta.url), toSTL(printed, name));
  const b = bounds(printed);
  console.log(name.padEnd(11), `${csg.polygons.length} Flächen`, 'Maße', b.mx.map((m, i) => (m - b.mn[i]).toFixed(1)).join(' x '), `${Date.now() - t} ms`);
}
