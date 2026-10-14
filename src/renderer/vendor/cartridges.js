/**
 * Cartridges: seven game cartridges standing in the slots of a low rack. One
 * sits half out at rest: the one being played. The cartridge under the pointer
 * lifts out of its slot; its neighbours lift less, staggered outwards from it.
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

const N = 7, W = 58, H = 74, T = 9, G = 13, CH = 7, SINK = 10, RH = 12, B = 1.4;
const X0 = -8, X1 = W + 8, Y0 = -8, Y1 = (N - 1) * G + T + 8;
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
  const rv = Number(stage.dataset.rest ?? 2);
  const REST_A = Number.isFinite(rv) && rv >= 0 ? clamp(Math.round(rv), 0, N - 1) : -1;

  const C = Cam(45, 0.5, 1.52);
  fit(C, [[X0, Y0, 0], [X1, Y1, -6], [X1, Y0, 0], [X0, Y1, 0], [0, 0, RH - SINK + H + 48], [W, 0, RH - SINK + H + 48]], 200, 168);
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
    const grp = mk("g", {}, g), s = solid(grp);
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

  function draw(i, L) {
    const cd = carts[i];
    if (L === cd.last) return;
    cd.last = L;
    const zb = RH - SINK + L, v0 = Math.max(0, SINK - L), yf = i * G + T, yb = i * G;
    const F = (u, v) => P(u, yf, zb + v), Bk = (u, v) => P(u, yb, zb + v);
    const out = outline(v0, W, H, CH, 2.5);
    const sil = poly(hull(out.map((p) => F(p[0], p[1])).concat(out.map((p) => Bk(p[0], p[1])))));
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

  // hit bands along the RESTING top edges, unlifted: they never move, and nothing draws them
  const top = (i) => P(W / 2, i * G + T / 2, RH - SINK + H);
  const c0 = top(0), c1 = top(1), d = [c1[0] - c0[0], c1[1] - c0[1]];
  const px0 = P(0, 0, 0), px1 = P(1, 0, 0), ex = [px1[0] - px0[0], px1[1] - px0[1]];
  const HALF = W / 2 + 4, det = d[0] * ex[1] - d[1] * ex[0];
  function hit([x, y]) {
    const qx = x - c0[0], qy = y - c0[1];
    const s = (qx * ex[1] - qy * ex[0]) / det, r = (d[0] * qy - d[1] * qx) / det;
    if (Math.abs(r) > HALF || s < -0.6 || s > N + 2.5) return -1;
    return clamp(Math.round(s), 0, N - 1);
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
      const to = a < 0 ? (i === REST_A ? REST_LIFT : 0) : L * (FALL[Math.abs(i - a)] ?? 0);
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
  means: "Seven game cartridges in a rack: the one under the pointer lifts out of its slot, and its neighbours follow less.",
  rules: [1, 2, 5, 10],
  range: [18, 38, 48],
  tour: [[250, 110], [200, 140], [140, 175], null],
  mount,
});
