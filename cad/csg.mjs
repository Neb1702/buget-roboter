// Minimale CSG-Engine (BSP, Algorithmus nach evanw/csg.js), ohne Abhängigkeiten.
// Einheiten: mm. Polygone müssen konvex sein.
const EPS = 1e-5;
const COPLANAR = 0, FRONT = 1, BACK = 2, SPANNING = 3;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);

class Plane {
  constructor(normal, w) { this.normal = normal; this.w = w; }
  static fromVerts(vs) {
    // Newell-Normale: robust auch bei fast kollinearen Punkten
    let n = [0, 0, 0];
    for (let i = 0; i < vs.length; i++) {
      const a = vs[i], b = vs[(i + 1) % vs.length];
      n[0] += (a[1] - b[1]) * (a[2] + b[2]);
      n[1] += (a[2] - b[2]) * (a[0] + b[0]);
      n[2] += (a[0] - b[0]) * (a[1] + b[1]);
    }
    const l = len(n) || 1;
    n = [n[0] / l, n[1] / l, n[2] / l];
    return new Plane(n, dot(n, vs[0]));
  }
  flip() { this.normal = [-this.normal[0], -this.normal[1], -this.normal[2]]; this.w = -this.w; }
  split(poly, cf, cb, f, b) {
    let type = 0; const types = [];
    for (const v of poly.vertices) {
      const t = dot(this.normal, v) - this.w;
      const ty = t < -EPS ? BACK : t > EPS ? FRONT : COPLANAR;
      type |= ty; types.push(ty);
    }
    switch (type) {
      case COPLANAR: (dot(this.normal, poly.plane.normal) > 0 ? cf : cb).push(poly); break;
      case FRONT: f.push(poly); break;
      case BACK: b.push(poly); break;
      default: {
        const fv = [], bv = [], n = poly.vertices.length;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n, ti = types[i], tj = types[j];
          const vi = poly.vertices[i], vj = poly.vertices[j];
          if (ti !== BACK) fv.push(vi);
          if (ti !== FRONT) bv.push(vi);
          if ((ti | tj) === SPANNING) {
            const t = (this.w - dot(this.normal, vi)) / dot(this.normal, sub(vj, vi));
            const v = [vi[0] + (vj[0] - vi[0]) * t, vi[1] + (vj[1] - vi[1]) * t, vi[2] + (vj[2] - vi[2]) * t];
            fv.push(v); bv.push(v);
          }
        }
        if (fv.length >= 3) f.push(new Polygon(fv));
        if (bv.length >= 3) b.push(new Polygon(bv));
      }
    }
  }
}

class Polygon {
  constructor(vertices, plane) { this.vertices = vertices; this.plane = plane || Plane.fromVerts(vertices); }
  clone() { return new Polygon(this.vertices.map((v) => v.slice()), new Plane(this.plane.normal.slice(), this.plane.w)); }
  flip() { this.vertices.reverse(); this.plane = new Plane(this.plane.normal.slice(), this.plane.w); this.plane.flip(); }
}

class Node {
  constructor(polys) { this.plane = null; this.front = null; this.back = null; this.polygons = []; if (polys) this.build(polys); }
  invert() {
    for (const p of this.polygons) p.flip();
    this.plane.flip();
    if (this.front) this.front.invert();
    if (this.back) this.back.invert();
    [this.front, this.back] = [this.back, this.front];
  }
  clip(polys) {
    if (!this.plane) return polys.slice();
    let f = [], b = [];
    for (const p of polys) this.plane.split(p, f, b, f, b);
    if (this.front) f = this.front.clip(f);
    b = this.back ? this.back.clip(b) : [];
    return f.concat(b);
  }
  clipTo(bsp) {
    this.polygons = bsp.clip(this.polygons);
    if (this.front) this.front.clipTo(bsp);
    if (this.back) this.back.clipTo(bsp);
  }
  all() {
    let r = this.polygons.slice();
    if (this.front) r = r.concat(this.front.all());
    if (this.back) r = r.concat(this.back.all());
    return r;
  }
  build(polys) {
    if (!polys.length) return;
    if (!this.plane) this.plane = new Plane(polys[0].plane.normal.slice(), polys[0].plane.w);
    const f = [], b = [];
    for (const p of polys) this.plane.split(p, this.polygons, this.polygons, f, b);
    if (f.length) { if (!this.front) this.front = new Node(); this.front.build(f); }
    if (b.length) { if (!this.back) this.back = new Node(); this.back.build(b); }
  }
}

export class CSG {
  constructor(polygons) { this.polygons = polygons; }
  clone() { return new CSG(this.polygons.map((p) => p.clone())); }
  union(...others) {
    let r = this;
    for (const o of others) {
      const a = new Node(r.clone().polygons), b = new Node(o.clone().polygons);
      a.clipTo(b); b.clipTo(a); b.invert(); b.clipTo(a); b.invert();
      a.build(b.all());
      r = new CSG(a.all());
    }
    return r;
  }
  subtract(...others) {
    let r = this;
    for (const o of others) {
      const a = new Node(r.clone().polygons), b = new Node(o.clone().polygons);
      a.invert(); a.clipTo(b); b.clipTo(a); b.invert(); b.clipTo(a); b.invert();
      a.build(b.all()); a.invert();
      r = new CSG(a.all());
    }
    return r;
  }
  transform(fn) { // fn: [x,y,z] -> [x,y,z]; mirror=true dreht die Flächenorientierung
    return new CSG(this.polygons.map((p) => new Polygon(p.vertices.map(fn))));
  }
  triangles() {
    const t = [];
    for (const p of this.polygons) {
      const v = p.vertices;
      for (let i = 1; i < v.length - 1; i++) t.push([v[0], v[i], v[i + 1]]);
    }
    return t;
  }
}

// ---------- Primitive ----------
const poly = (vs) => new Polygon(vs);

export function box(x0, y0, z0, x1, y1, z1) {
  [x0, x1] = [Math.min(x0, x1), Math.max(x0, x1)];
  [y0, y1] = [Math.min(y0, y1), Math.max(y0, y1)];
  [z0, z1] = [Math.min(z0, z1), Math.max(z0, z1)];
  const P = (x, y, z) => [x, y, z];
  return new CSG([
    poly([P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0)]),
    poly([P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)]),
    poly([P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1)]),
    poly([P(x0, y1, z0), P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0)]),
    poly([P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), P(x1, y0, z0)]),
    poly([P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)]),
  ]);
}

// Prisma aus konvexem 2D-Umriss (Liste [x,y]) zwischen z0 und z1
export function prism(pts, z0, z1) {
  const n = pts.length, polys = [];
  polys.push(poly(pts.map(([x, y]) => [x, y, z1])));
  polys.push(poly(pts.map(([x, y]) => [x, y, z0]).reverse()));
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    polys.push(poly([[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]]));
  }
  return new CSG(polys);
}

export function rrectPts(cx, cy, w, d, r, seg = 8) {
  const pts = [], hw = w / 2 - r, hd = d / 2 - r;
  const corners = [[hw, hd, 0], [-hw, hd, 90], [-hw, -hd, 180], [hw, -hd, 270]];
  for (const [ox, oy, a0] of corners)
    for (let i = 0; i <= seg; i++) {
      const a = ((a0 + (90 * i) / seg) * Math.PI) / 180;
      pts.push([cx + ox + r * Math.cos(a), cy + oy + r * Math.sin(a)]);
    }
  return pts;
}
export const rrect = (cx, cy, w, d, r, z0, z1, seg = 8) => prism(rrectPts(cx, cy, w, d, r, seg), z0, z1);

// Zylinder/Kegelstumpf entlang beliebiger Achse von a nach b
export function cyl(a, b, r0, r1 = r0, n = 24) {
  const ax = sub(b, a), l = len(ax), u = [ax[0] / l, ax[1] / l, ax[2] / l];
  const h = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  let e1 = cross(u, h); const l1 = len(e1); e1 = [e1[0] / l1, e1[1] / l1, e1[2] / l1];
  const e2 = cross(u, e1);
  const ring = (c, r, i) => {
    const t = (2 * Math.PI * i) / n, ct = Math.cos(t), st = Math.sin(t);
    return [c[0] + r * (e1[0] * ct + e2[0] * st), c[1] + r * (e1[1] * ct + e2[1] * st), c[2] + r * (e1[2] * ct + e2[2] * st)];
  };
  const polys = [];
  polys.push(poly(Array.from({ length: n }, (_, i) => ring(a, r0, n - 1 - i))));
  polys.push(poly(Array.from({ length: n }, (_, i) => ring(b, r1, i))));
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    polys.push(poly([ring(a, r0, i), ring(a, r0, j), ring(b, r1, j), ring(b, r1, i)]));
  }
  return new CSG(polys);
}
export const cylZ = (x, y, z0, z1, r, n = 24) => cyl([x, y, z0], [x, y, z1], r, r, n);
export const coneZ = (x, y, z0, z1, r0, r1, n = 24) => cyl([x, y, z0], [x, y, z1], r0, r1, n);
export const cylY = (x, z, y0, y1, r, n) => cyl([x, y0, z], [x, y1, z], r, r, n);
export const cylX = (y, z, x0, x1, r, n) => cyl([x0, y, z], [x1, y, z], r, r, n);

// ---------- Export ----------
export function toSTL(csg, name = 'part') {
  const tris = csg.triangles();
  const buf = Buffer.alloc(84 + tris.length * 50);
  buf.write(name.slice(0, 79), 0, 'ascii');
  buf.writeUInt32LE(tris.length, 80);
  let o = 84;
  for (const [a, b, c] of tris) {
    let n = cross(sub(b, a), sub(c, a)); const l = len(n) || 1; n = [n[0] / l, n[1] / l, n[2] / l];
    for (const v of [n, a, b, c]) for (const k of v) { buf.writeFloatLE(k, o); o += 4; }
    buf.writeUInt16LE(0, o); o += 2;
  }
  return buf;
}
export function bounds(csg) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const p of csg.polygons) for (const v of p.vertices) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], v[i]); mx[i] = Math.max(mx[i], v[i]); }
  return { mn, mx };
}
