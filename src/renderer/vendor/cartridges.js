/**
 * Cartridges: seven game cartridges standing in the slots of a low rack. One
 * sits half out at rest: the one being played. The cartridge under the pointer,
 * anywhere on what you can see of it, lifts out of its slot; the ones behind it
 * lift less, staggered back from it, and the ones in front stay put so they never
 * slide under the pointer and steal it.
 * Each cartridge has chamfered shoulders, grip ridges along its top and a
 * label recess, and its number is a lit dot on the label. The slider is how far
 * the chosen cartridge lifts.
 * Rack's additions: covers(urls) puts each game's cover on its cartridge's label,
 * drawn onto the face so the cartridges in front still hide it; pick(i) points at one.
 */
const {
  Cam, clamp, fillet, fit, hull, open, poly, proj, rrect, seg,
  tdone, tset, tval, tween, disposer, mk, place, pointer, reflect, register, facing, prism, rings, put, solid,
} = HL;

const W = 58, H = 74, T = 9, G = 13, CH = 7, SINK = 10, RH = 12, B = 1.4;
const X0 = -8, X1 = W + 8, Y0 = -8;
// Rack's addition: how many cartridges stand in the rack comes from the app (data-count, 3 to 12)
const MIN_N = 3, MAX_N = 12;
const REST_LIFT = 24, STEP = 45, FALL = [1, 0.22, 0.07];
const VIS = [0.612, 0.5]; // toward the camera, for a normal (u along x, v up z)
// the label: portrait, close to a game cover's 2:3, below the grip ridges
const LU0 = 12, LU1 = W - 12, LV0 = 13, LV1 = 61;
let uid = 0;

/** The cartridge's outline in its own plane, cut at v0 where it enters the slot. */
function outline(v0, w, h, ch, rb) {
  const cut = v0 > 0.01;
  return fillet(
    [[0, v0], [w, v0], [w, h - ch], [w - ch, h], [ch, h], [0, h - ch]],
    [cut ? 0.01 : rb, cut ? 0.01 : rb, 2.4, 2.4, 2.4, 2.4], 3,
  );
}

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let lift = value;
  // which cartridge stands raised at rest: the app passes the featured game's slot
  // (-1: none, when the featured game isn't on the rack)
  const N = clamp(Math.round(Number(stage.dataset.count) || 7), MIN_N, MAX_N);
  const Y1 = (N - 1) * G + T + 8;
  const rv = Number(stage.dataset.rest ?? 2);
  const REST_A = Number.isFinite(rv) && rv >= 0 ? clamp(Math.round(rv), 0, N - 1) : -1;

  const C = Cam(45, 0.5, 1.52);
  const frame = [[X0, Y0, 0], [X1, Y1, -6], [X1, Y0, 0], [X0, Y1, 0], [0, 0, RH - SINK + H + 48], [W, 0, RH - SINK + H + 48]];
  fit(C, frame, 200, 168);
  // a long rack shrinks to stay inside the picture; a short one keeps the usual size
  {
    const Q = proj(C), xs = frame.map((q) => Q(q[0], q[1], q[2])[0]), ys = frame.map((q) => Q(q[0], q[1], q[2])[1]);
    const k = Math.min(1, 384 / (Math.max(...xs) - Math.min(...xs)), 300 / (Math.max(...ys) - Math.min(...ys)));
    if (k < 1) { C.S *= k; fit(C, frame, 200, 168); }
  }
  const P = proj(C), front = facing(C);

  const g = mk("g", {}, svg);
  const [outer, inner] = rings(X0, Y0, X1, Y1, 6, 2);
  reflect(svg, g, P, front, outer, 0, 14);
  put(solid(g), prism(P, front, outer, inner, 0, RH));
  // the slots, cut into the rack's top
  for (let i = 0; i < N; i++) mk("path", { d: poly(rrect(4, i * G - 1.2, W - 4, i * G + T + 1.2, 1.5, 3).map((q) => P(q.u, q.v, RH))), class: "nf lo" }, g);

  const carts = [], id = "hl-cv" + ++uid;
  const defs = mk("defs", {}, svg);
  for (let i = 0; i < N; i++) {
    const grp = mk("g", { "data-cart": i }, g), s = solid(grp);
    // the cover, in the label's own flat coordinates; a matrix lays it on the face
    const clip = mk("clipPath", { id: id + i, clipPathUnits: "userSpaceOnUse" }, defs);
    mk("rect", { x: 0, y: 0, width: LU1 - LU0, height: LV1 - LV0, rx: 3 }, clip);
    const art = mk("g", { class: "cov", "clip-path": `url(#${id + i})`, style: "display:none" }, grp);
    const img = mk("image", { x: 0, y: 0, width: LU1 - LU0, height: LV1 - LV0, preserveAspectRatio: "xMidYMid slice" }, art);
    const label = mk("path", { class: "nf lo" }, grp), ridges = mk("path", { class: "nf lo" }, grp);
    const dg = mk("g", {}, grp), dots = [];
    for (let k = 0; k < N; k++) dots.push(mk("circle", { r: 1.05, class: "dot " + (k === i ? "m" : "off") }, dg));
    const z0 = i === REST_A ? REST_LIFT : 0;
    carts.push({ s, art, img, label, ridges, dg, dots, url: "", z: tween(z0), last: NaN });
  }

  // a cartridge's outline on screen at lift L
  function shapeAt(i, L) {
    const zb = RH - SINK + L, v0 = Math.max(0, SINK - L), yf = i * G + T, yb = i * G;
    const out = outline(v0, W, H, CH, 2.5);
    return hull(out.map((p) => P(p[0], yf, zb + p[1])).concat(out.map((p) => P(p[0], yb, zb + p[1]))));
  }
  // where each cartridge stands in its slot, unlifted
  const base = Array.from({ length: N }, (_, i) => shapeAt(i, 0));

  function draw(i, L) {
    const cd = carts[i];
    if (L === cd.last) return;
    cd.last = L;
    const zb = RH - SINK + L, v0 = Math.max(0, SINK - L), yf = i * G + T;
    const F = (u, v) => P(u, yf, zb + v);
    const shape = shapeAt(i, L);
    cd.shape = shape; // what the pointer is tested against: exactly what is drawn
    // a lifted cartridge also keeps the place it stood in, so lifting never moves it out from under the pointer
    cd.reach = L > 0.5 ? hull(shape.concat(base[i])) : shape;
    const sil = poly(shape);
    // the crease: the front face's inner edge where it meets the top and the right side
    const inn = fillet([[W - B, v0], [W - B, H - CH - B * 0.4], [W - CH - B * 0.4, H - B], [CH + B * 0.4, H - B]], [0.01, 2.4, 2.4, 0.01], 3);
    const crease = open(inn.map((p) => F(p[0], p[1])));
    put(cd.s, { sil, crease });
    cd.label.setAttribute("d", poly(rrect(LU0, LV0, LU1, LV1, 3, 4).map((q) => F(q.u, q.v))));
    if (cd.url) {
      const o = F(LU0, LV1), ex = F(LU0 + 1, LV1), ey = F(LU0, LV1 - 1);
      cd.art.setAttribute("transform", `matrix(${[ex[0] - o[0], ex[1] - o[1], ey[0] - o[0], ey[1] - o[1], o[0], o[1]].map((n) => Math.round(n * 1e4) / 1e4).join(" ")})`);
    }
    cd.ridges.setAttribute("d", [3.6, 6.6, 9.6].map((d) => seg(F(14, H - d), F(W - 14, H - d))).join(""));
    cd.dots.forEach((el, k) => place(el, F(W / 2 + (k - (N - 1) / 2) * 3.4, 19.5)));
  }

  const Bl = register(stage, (_dt, now) => {
    let moving = false;
    carts.forEach((cd, i) => { draw(i, tval(cd.z, now)); if (!tdone(cd.z, now)) moving = true; });
    return moving;
  });
  bag.add(Bl.unregister);

  // the pointer belongs to the front-most cartridge whose drawn outline holds it
  const inside = (pts, x, y) => {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const covered = (i, x, y) => { for (let j = N - 1; j > i; j--) if (carts[j].shape && inside(carts[j].shape, x, y)) return true; return false; };
  function hit([x, y]) {
    // the chosen one holds on over all it covers or vacated, unless one in front is in the way
    if (act >= 0 && carts[act].reach && inside(carts[act].reach, x, y) && !covered(act, x, y)) return act;
    for (let i = N - 1; i >= 0; i--) if (carts[i].shape && inside(carts[i].shape, x, y)) return i;
    return -1;
  }

  let act = -1;
  const mark = (a) => {
    const on = a < 0 ? REST_A : a;
    carts.forEach((cd, i) => cd.s.sil.classList.toggle("hi", i === on));
  };
  function setActive(a, force) {
    if (a === act && !force) return;
    const now = performance.now(), from = a >= 0 ? a : act >= 0 ? act : REST_A;
    act = a;
    carts.forEach((cd, i) => {
      const dist = Math.abs(i - from);
      // the front cartridge's label is already in view, so it only needs to rise a little
      const L = a === N - 1 ? Math.min(lift, 14) : lift;
      // Ones in front of the chosen cartridge don't move at all: rising or dropping, they could
      // slide over the pointer and take it. Ones behind may only rise, staggered back from it.
      const rest = i === REST_A ? REST_LIFT : 0;
      const to = a < 0 ? rest : i === a ? L : i > a ? rest : Math.max(rest, L * (FALL[a - i] ?? 0));
      tset(cd.z, to, now, dist * STEP);
    });
    mark(a);
    read.textContent = a < 0 ? "rest" : "slot " + String(a + 1).padStart(2, "0");
    Bl.wake();
  }
  mark(-1);
  read.textContent = "rest";

  bag.add(pointer(stage, { move: (p) => setActive(hit(p)), leave: () => setActive(-1) }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { lift = v; if (act >= 0) setActive(act, true); },
    // Rack's own addition: the cover thumbnails under the rack point at a cartridge (-1 lets go)
    pick: (i) => setActive(i >= 0 && i < N ? i : -1),
    // one image URL (or nothing) per cartridge, back to front
    covers: (urls) => {
      carts.forEach((cd, i) => {
        const u = (urls && urls[i]) || "";
        if (u === cd.url) return;
        cd.url = u;
        if (u) cd.img.setAttribute("href", u); else cd.img.removeAttribute("href");
        cd.art.style.display = u ? "" : "none";
        cd.dg.style.display = u ? "none" : "";
        cd.last = NaN;
      });
      Bl.wake();
    },
    destroy: bag.dispose,
  };
}

hairline({
  name: "cartridges",
  means: "Game cartridges in a rack: the one under the pointer lifts out of its slot, and the ones behind it follow less.",
  rules: [1, 2, 5, 10],
  range: [18, 38, 48],
  tour: [[250, 110], [200, 140], [140, 175], null],
  mount,
});
