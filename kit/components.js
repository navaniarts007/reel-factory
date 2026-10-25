// ============ COMPONENT LIBRARY ============
// Each component: (g, props) => { run(u), len }. Props come from the timeline file.
// Shared props: title, logo (a key from the timeline's "logos"), dur (seconds, set by the timeline).
// To add a component: write it here, register it in COMPONENTS at the bottom, document it in README.md.

const W = 540, CX = 270;
const S = BRAND.size;
const asItem = it => typeof it === "string" ? { text: it } : it;

// Title at the top of a scene, with an optional official logo beside it.
function titleBlock(g, p, y = 150) {
  if (!p.title) return () => {};
  const t = handText(p.title, CX, y, S.title, g), logo = logoTitle(t, p.logo);
  return u => { write(t, prog(u, 0, 0.6)); logo(prog(u, 0.45, 0.75)); };
}

// ---------- hello / bye: waving character ----------
function wave(g, word, line2) {
  const hi = handText(word, CX, 330, 66, g);
  const under = ink(underlineD(CX, 352, 300), g, ACCENT, 5);
  const sub = line2 ? handText(line2, CX, 410, 28, g) : null;
  const body = [ink(circD(270, 500, 30), g),
    ink("M 249 479 L 253 468 M 260 474 L 262 462 M 274 472 L 273 460 M 286 477 L 291 466", g),
    ink(`M ${pt(250, 533)} L ${pt(241, 600)} L ${pt(299, 600)} L ${pt(290, 533)} Z`, g),
    ink(lineD(250, 545, 226, 600), g), ink(lineD(262, 600, 259, 662), g), ink(lineD(278, 600, 281, 662), g)];
  const drawBody = drawAll(body, 0, 0.5);
  const arm = el("g", {}, g);
  const armP = ink(`${lineD(290, 545, 330, 500)} M 330 500 m -6 -3 l 4 -10 M 330 500 l 2 -11 M 330 500 l 8 -8`, arm);
  const waves = ink("M 346 480 Q 355 492 346 504 M 356 471 Q 369 492 356 513", g);
  const face = el("g", { opacity: 0 }, g);
  el("circle", { cx: 260, cy: 495, r: 3, fill: INK }, face);
  el("circle", { cx: 280, cy: 495, r: 3, fill: INK }, face);
  ink("M 257 508 Q 270 521 283 508", face).style.strokeDasharray = "none";
  return { len: line2 ? 2.4 : 1.6, run: u => {
    drawBody(u); draw(armP, prog(u, 0.4, 0.6)); show(face, prog(u, 0.45, 0.55));
    arm.setAttribute("transform", `rotate(${(Math.sin(u * 11) * 14 * prog(u, 0.6, 0.8)).toFixed(1)} 290 545)`);
    draw(waves, prog(u, 0.7, 0.9)); show(waves, 0.5 + 0.5 * Math.sin(u * 11));
    write(hi, prog(u, 0.3, 1.2)); draw(under, prog(u, 1.3, 1.6));
    if (sub) write(sub, prog(u, 1.6, 2.4));
  } };
}

// ---------- hook: big statement, optional second line and subline ----------
// props: title, title2, sub, logo
function hook(g, p) {
  const t1 = handText(p.title, CX, 380, S.big, g), logo = logoTitle(t1, p.logo);
  const t2 = p.title2 ? handText(p.title2, CX, 445, 44, g) : null;
  const under = ink(underlineD(CX, t2 ? 466 : 402, 320), g, ACCENT, 5);
  const sub = p.sub ? handText(p.sub, CX, 530, 25, g, MUTED) : null;
  const sparks = [[110, 300, 12], [430, 296, 14], [80, 420, 9], [462, 430, 10], [270, 250, 10]]
    .map(([x, y, r]) => ({ n: el("path", { d: sparkD(x, y, r), fill: ACCENT, opacity: 0 }, g), x, y }));
  return { len: 3.2, run: u => {
    write(t1, prog(u, 0, 0.8)); logo(prog(u, 0.6, 0.9));
    if (t2) write(t2, prog(u, 0.8, 1.5));
    draw(under, prog(u, 1.5, 1.8));
    sparks.forEach((s, i) => { const on = prog(u, 1.7 + i * 0.06, 1.85 + i * 0.06); show(s.n, on); scaleAt(s.n, on * (0.8 + 0.2 * Math.sin(u * 9 + i)), s.x, s.y); });
    if (sub) write(sub, prog(u, 2.0, 3.0));
  } };
}

// ---------- list / checklist: rows with a number, bullet or tick ----------
// props: title, logo, items [ "text" | {text, sub} ], marker "number" | "dot" | "tick", highlight [indexes]
function rows(g, p, marker) {
  const title = titleBlock(g, p);
  const items = (p.items || []).map(asItem), n = items.length;
  const room = BRAND.safe.bottom - 190, step = Math.min(112, room / n), top0 = 190 + Math.max(0, (room - n * step) * 0.35);  // short lists sit a bit lower
  const hiSet = new Set(p.highlight || []);
  const R = items.map((it, i) => {
    const top = top0 + i * step, cy = top + 26;
    const r = { mark: hiSet.has(i) ? hl(50, top - 6, 440, it.sub ? 76 : 54, g) : null,
      text: handText(it.text, 104, top + 34, S.body, g, INK, "left", 380),
      sub: it.sub ? handText(it.sub, 104, top + 62, S.small, g, MUTED, "left", 380) : null };
    if (marker === "tick") r.m = [ink(tickD(72, cy + 2, 1), g, ACCENT, 4.5)];
    else {
      r.bg = el("circle", { cx: 72, cy, r: 20, fill: ACCENT, "fill-opacity": 0.25, opacity: 0 }, g);
      r.m = [ink(circD(72, cy, 20, 18), g)];
      if (marker === "number") { r.num = el("text", { x: 72, y: cy + 8, "font-size": 22, fill: INK, opacity: 0 }, g); r.num.textContent = i + 1 + (p.start || 0); }
    }
    return r;
  });
  const each = 0.9;
  return { len: 0.7 + n * each + 0.6, run: u => {
    title(u);
    R.forEach((r, i) => {
      const s = 0.7 + i * each;
      drawAll(r.m, s, s + 0.2)(u); if (r.bg) show(r.bg, prog(u, s + 0.1, s + 0.2)); if (r.num) show(r.num, prog(u, s + 0.15, s + 0.25));
      write(r.text, prog(u, s + 0.15, s + 0.6)); if (r.sub) write(r.sub, prog(u, s + 0.5, s + 0.85));
      if (r.mark) swipe(r.mark, 440, prog(u, 0.7 + n * each, 0.95 + n * each));
    });
  } };
}

// ---------- flow: vertical steps joined by arrows, a dot travels down ----------
// props: title, logo, steps [ "text" | {text, sub} ], keepLast (default true)
function flow(g, p) {
  const title = titleBlock(g, p, 140);
  const steps = (p.steps || []).map(asItem), n = steps.length;
  const room = BRAND.safe.bottom - 175, bh = Math.min(70, room / n - 26), gap = n > 1 ? Math.min(72, (room - n * bh) / (n - 1)) : 0;
  const top0 = 175 + Math.max(0, (room - n * bh - (n - 1) * gap) * 0.4);   // centre short flows
  const R = steps.map((st, i) => {
    const y = top0 + i * (bh + gap);
    return { y, mark: hl(54, y - 6, 432, bh + 12, g), box: ink(rectD(60, y, 420, bh, 10), g),
      text: handText(st.text, CX, y + (st.sub ? bh * 0.45 : bh * 0.62), 25, g, INK, "", 390),
      sub: st.sub ? handText(st.sub, CX, y + bh * 0.8, 17, g, MUTED, "", 390) : null,
      arrow: i < n - 1 ? ink(arrowD(CX, y + bh + 5, CX, y + bh + gap - 5), g) : null };
  });
  const dot = el("circle", { cx: CX, cy: 0, r: 6, fill: INK, opacity: 0 }, g);
  const each = 1.5;
  return { len: 0.6 + n * each, run: u => {
    title(u);
    let dy = null;
    R.forEach((r, i) => {
      const s = 0.6 + i * each, last = i === n - 1, keep = last && p.keepLast !== false;
      draw(r.box, prog(u, s, s + 0.25)); write(r.text, prog(u, s + 0.25, s + 0.7)); if (r.sub) write(r.sub, prog(u, s + 0.6, s + 1.0));
      swipe(r.mark, 432, prog(u, s + 0.95, s + 1.1), keep ? 1 : 1 - prog(u, s + 1.4, s + 1.7));
      if (r.arrow) {
        draw(r.arrow, prog(u, s + 1.1, s + 1.3));
        if (u > s + 1.25 && u < s + 1.5) dy = lerp(r.y + bh + 5, r.y + bh + gap - 5, prog(u, s + 1.25, s + 1.5));
      }
    });
    dot.setAttribute("cy", dy ?? 0); show(dot, dy === null ? 0 : 1);
  } };
}

// ---------- terminal: command lines typed one by one ----------
// props: title, logo, lines [ "$ command" | "# comment" ], highlight (line index), note
function terminal(g, p) {
  const title = titleBlock(g, p, 165);
  const lines = p.lines || [], top = 196, h = 62 + lines.length * 32;
  const term = ink(rectD(40, top, 460, h, 10), g);
  const bar = [ink(circD(60, top + 20, 5, 12), g), ink(circD(76, top + 20, 5, 12), g), ink(circD(92, top + 20, 5, 12), g), ink(lineD(40, top + 35, 500, top + 35, .4), g)];
  const hiI = p.highlight ?? -1;
  const mark = hiI >= 0 ? hl(52, top + 54 + hiI * 32, 436, 30, g) : null;
  const L = lines.map((s, i) => handText(s, 58, top + 72 + i * 32, BRAND.size.code, g, s.trim().startsWith("#") ? MUTED : INK, "mono left", 430));
  const cur = el("rect", { x: 0, y: top + 58 + (lines.length - 1) * 32, width: 9, height: 19, fill: INK, opacity: 0 }, g);
  const note = p.note ? handText(p.note, CX, top + h + 60, 24, g) : null;
  const end = 1.0 + lines.length * 0.6;
  return { len: end + (note ? 1.4 : 0.5), run: u => {
    title(u);
    draw(term, prog(u, 0.5, 0.8)); drawAll(bar, 0.7, 0.9)(u);
    L.forEach((l, i) => write(l, prog(u, 1.0 + i * 0.6, 1.55 + i * 0.6)));
    if (mark) swipe(mark, 436, prog(u, end, end + 0.3));
    const last = L[L.length - 1];
    if (last) cur.setAttribute("x", (58 + last.node.getComputedTextLength() + 5).toFixed(1));
    show(cur, u > end - 0.2 ? (Math.floor(u * 2.5) % 2 ? 1 : 0) : 0);
    if (note) write(note, prog(u, end + 0.3, end + 1.2));
  } };
}

// ---------- compare: two columns, = when the same, ≠ (red) when different ----------
// props: left, right, rows [[left, right]], caption, versus (true = neutral "vs" instead of =/≠)
function compare(g, p) {
  const cols = [145, 395], rowsIn = p.rows || [];
  const heads = [handText(p.left || "", cols[0], 215, 26, g, INK, "", 200), handText(p.right || "", cols[1], 215, 26, g, INK, "", 200)];
  const R = rowsIn.map(([l, r], i) => {
    const y = 250 + i * 76, same = l === r, vs = !!p.versus;
    const marks = same || vs ? [] : cols.map(cx => hl(cx - 95, y - 4, 190, 62, g, BAD, 0.26));
    const boxes = cols.map(cx => ink(rectD(cx - 90, y, 180, 54, 8), g));
    const texts = [handText(l, cols[0], y + 35, 23, g, INK, "", 165), handText(r, cols[1], y + 35, 23, g, INK, "", 165)];
    const sym = el("text", { x: CX, y: y + (vs ? 34 : 38), "font-size": vs ? 20 : 34, fill: same || vs ? INK : BAD, opacity: 0 }, g);
    sym.textContent = vs ? "vs" : same ? "=" : "≠";
    return { y, marks, boxes, texts, sym };
  });
  const capY = 250 + rowsIn.length * 76 + 50;
  const cap = p.caption ? handText(p.caption, CX, capY, 30, g) : null;
  const under = p.caption ? ink(underlineD(CX, capY + 18, 320), g, p.versus ? ACCENT : BAD, 4) : null;
  const n = rowsIn.length, endRows = 0.7 + n * 0.55;
  return { len: endRows + n * 0.3 + (cap ? 1.6 : 0.4), run: u => {
    heads.forEach(h => write(h, prog(u, 0.1, 0.7)));
    R.forEach((r, i) => {
      const s = 0.7 + i * 0.55;
      r.boxes.forEach(b => draw(b, prog(u, s, s + 0.3))); r.texts.forEach(t => write(t, prog(u, s + 0.25, s + 0.5)));
      const k = endRows + i * 0.3;
      show(r.sym, prog(u, k, k + 0.1)); scaleAt(r.sym, 1 + 0.5 * pulse(prog(u, k, k + 0.3)), CX, r.y + 28);
      r.marks.forEach(m => swipe(m, 190, prog(u, k + 0.1, k + 0.3)));
    });
    if (cap) { const c = endRows + n * 0.3; write(cap, prog(u, c, c + 1.0)); draw(under, prog(u, c + 1.0, c + 1.3)); }
  } };
}

// ---------- takeaway: headline, ticked points, optional link box ----------
// props: title (default TAKEAWAY), headline, items [], link
function takeaway(g, p) {
  const title = handText(p.title || "TAKEAWAY", CX, 150, 44, g);
  const under = ink(underlineD(CX, 170, 200), g, ACCENT, 5);
  const mark = p.headline ? hl(55, 214, 430, 50, g) : null;
  const big = p.headline ? handText(p.headline, CX, 248, 29, g, INK, "", 410) : null;
  const items = (p.items || []).map(asItem);
  const L = items.map((it, i) => ({ tick: ink(tickD(80, 330 + i * 62, 1), g, ACCENT, 4.5),
                                    text: handText(it.text, 108, 338 + i * 62, 26, g, INK, "left", 390) }));
  const ly = 330 + items.length * 62 + 40;
  const box = p.link ? ink(rectD(60, ly, 420, 58, 10), g) : null;
  const url = p.link ? handText(p.link, CX, ly + 36, 20, g, INK, "mono", 390) : null;
  const end = 2.0 + items.length * 0.6;
  return { len: end + (p.link ? 1.6 : 0.4), run: u => {
    write(title, prog(u, 0, 0.6)); draw(under, prog(u, 0.6, 0.85));
    if (big) { write(big, prog(u, 0.9, 1.8)); swipe(mark, 430, prog(u, 1.8, 2.0)); }
    L.forEach((l, i) => { const s = 2.0 + i * 0.6; draw(l.tick, prog(u, s, s + 0.15)); write(l.text, prog(u, s + 0.1, s + 0.5)); });
    if (box) { draw(box, prog(u, end, end + 0.3)); write(url, prog(u, end + 0.3, end + 1.2)); }
  } };
}

// ---------- cta: "Comment WORD" speech bubble ----------
// props: ask, word, note
function cta(g, p) {
  const ask = handText(p.ask || "Want the full guide?", CX, 330, 28, g);
  const bg = el("rect", { x: 85, y: 368, width: 370, height: 84, rx: 18, fill: ACCENT, "fill-opacity": 0.3, opacity: 0 }, g);
  const bubble = ink(`${rectD(85, 368, 370, 84, 18)} M 250 452 L 256 478 L 274 452`, g);
  const word = handText(`Comment "${p.word || "YES"}"`, CX, 422, 34, g, INK, "", 340);
  const note = handText(p.note || "I'll send it to your DM", CX, 540, 25, g);
  return { len: 3.4, run: u => {
    write(ask, prog(u, 0, 0.8)); draw(bubble, prog(u, 0.8, 1.2)); show(bg, prog(u, 1.2, 1.4)); write(word, prog(u, 1.2, 2.0));
    const pop = 1 + 0.06 * Math.max(0, Math.sin((u - 2.0) * 5)) * prog(u, 2.0, 2.2);
    [bubble, bg, word.node].forEach(n => scaleAt(n, pop, CX, 410));
    write(note, prog(u, 2.2, 3.0));
  } };
}

// ---------- statement: 1–4 big lines punch in one by one (kinetic type) ----------
// props: lines [ "text" ] (≤ 16 chars each), accent (line index, purple highlight), sub
function statement(g, p) {
  const lines = (p.lines || []).slice(0, 4), n = lines.length, size = n > 2 ? 46 : 56, gap = size * 1.35;
  const top = 470 - (n - 1) * gap / 2 - (p.sub ? 30 : 0);
  const L = lines.map((s, i) => {
    const y = top + i * gap, grp = el("g", { opacity: 0 }, g), acc = p.accent === i;
    return { y, grp, acc, mark: acc ? hl(50, y - size * 0.8, 440, size * 1.05, grp) : null, t: handText(s, CX, y, size, grp, INK, "", 460) };
  });
  const sub = p.sub ? handText(p.sub, CX, top + n * gap + 10, 25, g, MUTED, "", 440) : null;
  const each = 0.55, end = 0.3 + n * each;
  return { len: end + 0.6 + (sub ? 1.0 : 0), run: u => {
    const landed = L.filter((l, i) => u >= 0.3 + i * each + 0.3).length;
    L.forEach((l, i) => {
      const s = 0.3 + i * each, k = prog(u, s, s + 0.3);
      const sc = 1 + 0.35 * (1 - ease(k)) - 0.06 * pulse(prog(u, s + 0.3, s + 0.45));   // comes in big, settles with a bump
      show(l.grp, k > 0 ? (i < landed - 1 && !l.acc ? 0.55 : 1) : 0);                   // older lines step back
      scaleAt(l.grp, sc, CX, l.y - size * 0.35);
      write(l.t, prog(u, s, s + 0.15));
      if (l.mark) swipe(l.mark, 440, prog(u, s + 0.35, s + 0.55));
    });
    if (sub) write(sub, prog(u, end + 0.3, end + 1.1));
  } };
}

// ---------- chart: hand-drawn horizontal bars grow, values count up ----------
// props: title, logo, bars [ {label, value, note} ], unit ("%", " ms"…), highlight (bar index), caption
function chart(g, p) {
  const title = titleBlock(g, p);
  const bars = (p.bars || []).map(b => typeof b === "object" ? b : { label: String(b), value: 0 }), n = bars.length;
  const max = Math.max(1e-9, ...bars.map(b => +b.value || 0)), x0 = 64, full = 340;
  const room = BRAND.safe.bottom - 200 - (p.caption ? 90 : 0), step = Math.min(118, room / Math.max(1, n));
  const top0 = 200 + Math.max(0, (room - n * step) * 0.4);
  const axis = ink(lineD(x0 - 8, top0 + 20, x0 - 8, top0 + n * step - 10, .6), g);
  const R = bars.map((b, i) => {
    const y = top0 + i * step, v = +b.value || 0, w = Math.max(14, full * v / max), hi = p.highlight === i;
    const dec = (String(b.value).split(".")[1] || "").length;
    return { w, v, dec,
      label: handText(b.label, x0, y + 22, 23, g, INK, "left", 440),
      fill: el("rect", { x: x0, y: y + 34, width: 0, height: 34, rx: 6, fill: hi ? ACCENT : INK, "fill-opacity": hi ? 0.55 : 0.12, opacity: 0 }, g),
      box: ink(rectD(x0, y + 34, w, 34, 6), g),
      num: el("text", { x: x0 + w + 12, y: y + 60, "font-size": 24, fill: INK, opacity: 0, class: "left" }, g),
      note: b.note ? handText(b.note, x0, y + 92, 17, g, MUTED, "left", 440) : null };
  });
  const capY = top0 + n * step + 40;
  const cap = p.caption ? handText(p.caption, CX, capY, 28, g) : null;
  const under = cap ? ink(underlineD(CX, capY + 16, 300), g, ACCENT, 4) : null;
  const each = 0.8, end = 0.6 + n * each;
  return { len: end + 0.4 + (cap ? 1.4 : 0), run: u => {
    title(u); draw(axis, prog(u, 0.4, 0.7));
    R.forEach((r, i) => {
      const s = 0.6 + i * each, k = ease(prog(u, s + 0.3, s + 0.8));
      write(r.label, prog(u, s, s + 0.35)); draw(r.box, prog(u, s + 0.2, s + 0.5));
      r.fill.setAttribute("width", (r.w * k).toFixed(1)); show(r.fill, k > 0 ? 1 : 0);
      r.num.textContent = (r.v * k).toFixed(r.dec) + (p.unit || ""); show(r.num, k > 0 ? 1 : 0);
      if (r.note) write(r.note, prog(u, s + 0.6, s + 0.9));
    });
    if (cap) { write(cap, prog(u, end + 0.2, end + 1.0)); draw(under, prog(u, end + 1.0, end + 1.3)); }
  } };
}

// ---------- story: comic-strip panels with a hand-drawn icon each, joined by arrows ----------
// props: title, beats [ {icon, text, sub} ] (icon: person book bulb laptop database chat clock cloud), highlight (beat index)
const ICONS = {
  person: (x, y) => `${circD(x, y - 14, 9, 16)} M ${pt(x - 17, y + 22)} Q ${pt(x, y - 8)} ${pt(x + 17, y + 22)}`,
  book: (x, y) => `M ${x - 22} ${y - 14} Q ${x - 10} ${y - 19} ${x} ${y - 12} Q ${x + 10} ${y - 19} ${x + 22} ${y - 14} L ${x + 22} ${y + 16}
    Q ${x + 10} ${y + 11} ${x} ${y + 18} Q ${x - 10} ${y + 11} ${x - 22} ${y + 16} Z M ${x} ${y - 12} L ${x} ${y + 18}`,
  bulb: (x, y) => `${circD(x, y - 6, 14, 18)} M ${x - 6} ${y + 8} L ${x - 6} ${y + 17} L ${x + 6} ${y + 17} L ${x + 6} ${y + 8} M ${x - 5} ${y + 22} L ${x + 5} ${y + 22}`,
  laptop: (x, y) => `${rectD(x - 20, y - 18, 40, 27, 3)} M ${x - 27} ${y + 14} L ${x + 27} ${y + 14} L ${x + 22} ${y + 20} L ${x - 22} ${y + 20} Z`,
  database: (x, y) => `M ${x - 18} ${y - 14} Q ${x} ${y - 25} ${x + 18} ${y - 14} Q ${x} ${y - 3} ${x - 18} ${y - 14} L ${x - 18} ${y + 16}
    Q ${x} ${y + 27} ${x + 18} ${y + 16} L ${x + 18} ${y - 14} M ${x - 18} ${y + 1} Q ${x} ${y + 12} ${x + 18} ${y + 1}`,
  chat: (x, y) => `${rectD(x - 22, y - 16, 44, 28, 8)} M ${x - 8} ${y + 12} L ${x - 12} ${y + 22} L ${x + 2} ${y + 12}`,
  clock: (x, y) => `${circD(x, y, 19, 22)} M ${x} ${y - 11} L ${x} ${y} L ${x + 8} ${y + 6}`,
  cloud: (x, y) => `M ${x - 20} ${y + 10} Q ${x - 27} ${y - 4} ${x - 12} ${y - 6} Q ${x - 8} ${y - 20} ${x + 6} ${y - 12} Q ${x + 22} ${y - 15} ${x + 20} ${y + 2}
    Q ${x + 28} ${y + 10} ${x + 18} ${y + 12} Z`,
};
function story(g, p) {
  const title = titleBlock(g, p);
  const beats = (p.beats || []).slice(0, 4).map(asItem), n = beats.length;
  const t0 = p.title ? 195 : 150, room = BRAND.safe.bottom - t0, gap = 44, ph = Math.min(150, (room - (n - 1) * gap) / Math.max(1, n));
  const top0 = t0 + Math.max(0, (room - n * ph - (n - 1) * gap) * 0.4);
  const R = beats.map((b, i) => {
    const y = top0 + i * (ph + gap), cy = y + ph / 2, hi = p.highlight === i;
    return { y,
      bg: hi ? el("rect", { x: 40, y, width: 460, height: ph, rx: 10, fill: ACCENT, "fill-opacity": 0.22, opacity: 0 }, g) : null,
      box: ink(rectD(40, y, 460, ph, 10), g),
      icon: ink((ICONS[b.icon] || ICONS.person)(100, cy), g, hi ? ACCENT : INK, 2.2),
      text: handText(b.text, 150, cy + (b.sub ? -2 : 9), 24, g, INK, "left", 335),
      sub: b.sub ? handText(b.sub, 150, cy + 28, 18, g, MUTED, "left", 335) : null,
      arrow: i < n - 1 ? ink(arrowD(CX, y + ph + 6, CX, y + ph + gap - 6), g) : null };
  });
  const each = 1.3;
  return { len: 0.5 + n * each + 0.3, run: u => {
    title(u);
    R.forEach((r, i) => {
      const s = 0.5 + i * each;
      draw(r.box, prog(u, s, s + 0.3)); if (r.bg) show(r.bg, prog(u, s + 0.2, s + 0.4));
      draw(r.icon, prog(u, s + 0.2, s + 0.6)); write(r.text, prog(u, s + 0.4, s + 0.9));
      if (r.sub) write(r.sub, prog(u, s + 0.8, s + 1.1));
      if (r.arrow) draw(r.arrow, prog(u, s + 1.05, s + 1.3));
    });
  } };
}

// ---------- image: one of my real images in a marker frame; arrows land on marked spots when the word is said ----------
// props: media (id from the Media tab), title, logo, callouts [{spot, label, word}], zoom (spot name), zoomWord, caption
let CLIPS = 0;
function image(g, p) {
  const title = titleBlock(g, p, 150), m = MEDIA[p.media];
  const top = p.title ? 190 : 140, bottom = BRAND.safe.bottom - (p.caption ? 60 : 10), boxW = 450, boxH = bottom - top;
  const asp = m ? m.aspect : 16 / 9;
  let w = boxW, h = w / asp; if (h > boxH) { h = boxH; w = h * asp; }
  const x = CX - w / 2, y = top + (boxH - h) * 0.42;                      // wide images sit near the middle
  const frame = ink(rectD(x - 7, y - 7, w + 14, h + 14, 10), g);
  const id = `clip${++CLIPS}`, cp = el("clipPath", { id }, g), wipe = el("rect", { x, y, width: w, height: 0 }, cp);
  const view = el("g", { "clip-path": `url(#${id})` }, g), zoomG = el("g", {}, view);
  if (m) el("image", { href: m.url, x, y, width: w, height: h, preserveAspectRatio: "xMidYMid meet" }, zoomG);
  const play = m?.video ? clipPlayer(zoomG, m.video, x, y, w, h, "xMidYMid meet") : null;   // a video plays over its poster
  if (!m) handText(`(image "${p.media}" missing)`, CX, y + h / 2, 22, zoomG, BAD).forEach(s => s.setAttribute("fill-opacity", 1));
  const spot = name => (m?.spots || []).find(s => normWord(s.name) === normWord(name));
  // when a word is said in this scene (from the captions); later callouts look after earlier ones
  let after = 0.9;
  const cue = (word, k) => {
    const hit = word && (p._words || []).find(x => x.t >= after - 0.05 && x.w === normWord(word.split(/\s+/)[0]));
    const t = Math.max(after, hit ? hit.t : 1.2 + k * 1.3); after = t + 0.5; return t;
  };
  const C = (p.callouts || []).slice(0, 3).map((c, k) => {
    const s = spot(c.spot); if (!s) return null;
    const px = x + s.x * w, py = y + s.y * h, label = String(c.label || c.spot).slice(0, 24);
    const lw = label.length * 10 + 28, lh = 36;
    const lx = clamp(px + (s.x < 0.5 ? 60 : -60 - lw), x + 6, x + w - lw - 6), ly = clamp(py + (s.y < 0.5 ? 56 : -56 - lh), y + 6, y + h - lh - 6);
    const ex = clamp(px, lx, lx + lw), ey = py < ly ? ly : py > ly + lh ? ly + lh : ly + lh / 2;   // arrow leaves the box edge nearest the spot
    const ang = Math.atan2(py - ey, px - ex), tip = [px - Math.cos(ang) * 20, py - Math.sin(ang) * 20];
    return { t: cue(c.word || c.label, k), px, py,
      ring: ink(circD(px, py, 16, 22), zoomG, ACCENT, 3.2),
      arrow: ink(arrowD(ex, ey, tip[0], tip[1]), zoomG, INK, 2.4),
      bg: el("rect", { x: lx, y: ly, width: lw, height: lh, rx: 8, fill: PAPER, opacity: 0 }, zoomG),
      box: ink(rectD(lx, ly, lw, lh, 8), zoomG),
      text: handText(label, lx + lw / 2, ly + 25, 20, zoomG, INK, "", lw - 12) };
  }).filter(Boolean);
  const z = p.zoom && spot(p.zoom), zt = z ? cue(p.zoomWord || p.zoom, C.length) : 0;
  const cap = p.caption ? handText(p.caption, CX, bottom + 40, 26, g) : null;
  const end = Math.max(1.4, ...C.map(c => c.t + 0.8), z ? zt + 1.4 : 0);
  const len = end + (cap ? 1.0 : 0.2);
  const capAt = p.dur ? Math.min(end, Math.max(0.5, p.dur - 1.3)) : end;   // the caption is always fully written before the cut
  return { len: p.dur ? Math.min(len, p.dur - 0.4) : len, run: u => {     // never sped up: arrows must stay on their words
    title(u);
    draw(frame, prog(u, 0, 0.5));
    wipe.setAttribute("height", (h * ease(prog(u, 0.25, 0.85))).toFixed(1));      // the picture is revealed top to bottom
    if (play) play(u - 0.25);                                                     // starts as the reveal starts, holds its last frame
    C.forEach(c => {
      draw(c.ring, prog(u, c.t, c.t + 0.25)); draw(c.arrow, prog(u, c.t + 0.1, c.t + 0.35));
      show(c.bg, prog(u, c.t + 0.2, c.t + 0.3)); draw(c.box, prog(u, c.t + 0.2, c.t + 0.4)); write(c.text, prog(u, c.t + 0.3, c.t + 0.65));
    });
    if (z) scaleAt(zoomG, 1 + 0.5 * ease(prog(u, zt, zt + 1.2)), x + z.x * w, y + z.y * h);
    if (cap) write(cap, prog(u, capAt, capAt + 0.8));
  } };
}

// ---------- objects: picture-like hand-drawn things pop in when their word is said; content flows between them ----------
// Each object is drawn in a 100 x 100 box around 0,0: "fill" shapes get a soft purple fill, "ink" lines are the marker.
// Brand logos are never drawn here (use the Media tab for those).
const R4 = (x, y, w, h) => `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
const OBJECTS = {
  container: () => { const b = rectD(-46, -26, 92, 52, 3); return { fill: [b], ink: [b, "M -34 -20 L -34 20 M -23 -20 L -23 20 M -12 -20 L -12 20 M -1 -20 L -1 20 M 10 -20 L 10 20 M 21 -20 L 21 20",
    "M 30 -20 L 30 20 M 36 -8 L 36 8 M 41 -8 L 41 8", "M -48 -30 L 48 -30 M -48 30 L 48 30"] }; },
  ship: () => { const h = "M -48 6 L 48 6 L 36 32 L -36 32 Z", c = [R4(-36, -18, 22, 24), R4(-12, -18, 22, 24), R4(12, -18, 22, 24), R4(-24, -38, 22, 20)];
    return { fill: [h, c[1], c[3]], ink: [h, ...c, "M -56 40 Q -44 34 -32 40 T -8 40 T 16 40 T 40 40 T 60 40"] }; },
  computer: () => { const s = rectD(-44, -40, 88, 60, 5), i = R4(-36, -33, 72, 46); return { fill: [i], ink: [s, i, "M -8 20 L -12 35 L 12 35 L 8 20", "M -24 37 L 24 37"] }; },
  laptop: () => { const s = rectD(-34, -36, 68, 46, 4), i = R4(-28, -30, 56, 34), b = "M -46 12 L 46 12 L 40 25 L -40 25 Z"; return { fill: [i, b], ink: [s, i, b] }; },
  server: () => { const r = [0, 1, 2].map(k => rectD(-36, -42 + k * 29, 72, 23, 4)); return { fill: [r[1]], ink: [...r, ...[0, 1, 2].map(k => `M -26 ${-30 + k * 29} L -6 ${-30 + k * 29}`), ...[0, 1, 2].map(k => circD(24, -30 + k * 29, 3.5, 10))] }; },
  cloud: () => { const c = "M -34 20 Q -52 20 -48 3 Q -45 -12 -28 -10 Q -24 -33 0 -31 Q 23 -31 27 -12 Q 47 -14 47 4 Q 47 20 32 20 Z"; return { fill: [c], ink: [c] }; },
  database: () => { const top = "M -32 -26 Q 0 -40 32 -26 Q 0 -12 -32 -26 Z"; return { fill: [top], ink: [top, "M -32 -26 L -32 26 Q 0 40 32 26 L 32 -26", "M -32 0 Q 0 14 32 0"] }; },
  phone: () => { const b = rectD(-23, -42, 46, 84, 9), s = R4(-17, -32, 34, 58); return { fill: [s], ink: [b, s, circD(0, 34, 3.5, 10)] }; },
  person: () => { const b = "M -28 34 Q -28 -4 0 -4 Q 28 -4 28 34 Z", h = circD(0, -24, 13, 20); return { fill: [b], ink: [h, b] }; },
  team: () => { const b1 = "M -46 34 Q -46 6 -24 6 Q -2 6 -2 34 Z", b2 = "M 2 34 Q 2 6 24 6 Q 46 6 46 34 Z";
    return { fill: [b1, b2], ink: [circD(-24, -10, 11, 18), circD(24, -10, 11, 18), b1, b2] }; },
  robot: () => { const h = rectD(-28, -22, 56, 44, 8); return { fill: [h], ink: [h, circD(-11, -4, 5, 12), circD(11, -4, 5, 12), "M -10 11 L 10 11", "M 0 -22 L 0 -33", circD(0, -37, 4, 10), "M -28 -4 L -35 -4 M 28 -4 L 35 -4"] }; },
  document: () => { const p = "M -26 -38 L 12 -38 L 28 -22 L 28 38 L -26 38 Z"; return { fill: [p], ink: [p, "M 12 -38 L 12 -22 L 28 -22", "M -16 -12 L 16 -12 M -16 2 L 18 2 M -16 16 L 18 16 M -16 28 L 6 28"] }; },
  folder: () => { const f = "M -40 -26 L -12 -26 L -6 -17 L 40 -17 L 40 30 L -40 30 Z"; return { fill: [f], ink: [f, "M -40 -8 L 40 -8"] }; },
  book: () => { const b = "M -40 -26 Q -20 -34 0 -24 Q 20 -34 40 -26 L 40 28 Q 20 20 0 30 Q -20 20 -40 28 Z"; return { fill: [b], ink: [b, "M 0 -24 L 0 30"] }; },
  lock: () => { const b = rectD(-28, -6, 56, 44, 6); return { fill: [b], ink: ["M -18 -6 L -18 -20 Q -18 -40 0 -40 Q 18 -40 18 -20 L 18 -6", b, circD(0, 10, 5, 12), "M 0 14 L 0 24"] }; },
  key: () => { const r = circD(-24, 0, 14, 20); return { fill: [r], ink: [r, circD(-24, 0, 5, 10), "M -10 0 L 38 0 M 27 0 L 27 13 M 35 0 L 35 10"] }; },
  shield: () => { const s = "M 0 -40 L 32 -28 Q 32 18 0 40 Q -32 18 -32 -28 Z"; return { fill: [s], ink: [s, "M -12 0 L -2 12 L 16 -12"] }; },
  globe: () => { const c = circD(0, 0, 36, 30); return { fill: [c], ink: [c, "M -36 0 L 36 0", "M 0 -36 Q 22 0 0 36 Q -22 0 0 -36", "M -30 -18 Q 0 -10 30 -18 M -30 18 Q 0 10 30 18"] }; },
  rocket: () => { const b = "M 0 -44 Q 20 -24 16 18 L -16 18 Q -20 -24 0 -44 Z"; return { fill: [b], ink: [b, circD(0, -14, 7, 14), "M -16 4 L -28 24 L -14 18 M 16 4 L 28 24 L 14 18", "M -8 22 Q 0 42 8 22"] }; },
  gear: () => { let d = ""; for (let k = 0; k <= 16; k++) { const a = (k / 16) * Math.PI * 2, r = k % 2 ? 26 : 35, a2 = a + Math.PI / 16;
      d += `${k ? " L " : "M "}${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)} L ${(Math.cos(a2) * r).toFixed(1)} ${(Math.sin(a2) * r).toFixed(1)}`; }
    d += " Z"; return { fill: [d], ink: [d, circD(0, 0, 10, 14)] }; },
  code: () => { const w = rectD(-42, -30, 84, 60, 8); return { fill: [w], ink: [w, "M -10 -12 L -22 0 L -10 12 M 10 -12 L 22 0 L 10 12 M 5 -17 L -5 17"] }; },
  terminal: () => { const w = rectD(-42, -30, 84, 60, 6); return { fill: [w], ink: [w, "M -42 -18 L 42 -18", "M -30 -4 L -20 4 L -30 12 M -12 14 L 6 14"] }; },
  package: () => { const f = "M -30 -6 L 6 -6 L 6 32 L -30 32 Z", t = "M -30 -6 L -8 -28 L 30 -28 L 6 -6 Z"; return { fill: [f, t], ink: [f, t, "M 6 -6 L 30 -28 L 30 10 L 6 32", "M -14 -6 L 10 -28"] }; },
  mail: () => { const e = rectD(-38, -25, 76, 50, 4); return { fill: [e], ink: [e, "M -38 -25 L 0 6 L 38 -25"] }; },
  coin: () => { const c = circD(0, 0, 32, 26); return { fill: [c], ink: [c, circD(0, 0, 24, 22), "M 8 -10 Q 0 -16 -8 -10 Q -11 -2 0 0 Q 11 2 8 10 Q 0 16 -8 10 M 0 -18 L 0 18"] }; },
  clock: () => { const c = circD(0, 0, 34, 28); return { fill: [c], ink: [c, "M 0 -20 L 0 0 L 14 9", "M 0 -34 L 0 -28 M 34 0 L 28 0 M 0 34 L 0 28 M -34 0 L -28 0"] }; },
  chart: () => { const b = [R4(-28, 8, 13, 26), R4(-9, -10, 13, 44), R4(10, -28, 13, 62)]; return { fill: b, ink: ["M -36 -38 L -36 34 L 38 34", ...b] }; },
  bug: () => { const b = circD(0, 6, 20, 22); return { fill: [b], ink: [b, circD(0, -20, 9, 14), "M 0 -12 L 0 26", "M -20 0 L -34 -8 M -20 10 L -36 10 M -18 20 L -32 30 M 20 0 L 34 -8 M 20 10 L 36 10 M 18 20 L 32 30", "M -4 -28 L -12 -38 M 4 -28 L 12 -38"] }; },
  bulb: () => { const c = circD(0, -8, 22, 24); return { fill: [c], ink: [c, "M -9 13 L -9 26 L 9 26 L 9 13 M -7 32 L 7 32"] }; },
  plug: () => { const b = rectD(-20, -20, 40, 26, 6); return { fill: [b], ink: ["M -10 -36 L -10 -20 M 10 -36 L 10 -20", b, "M 0 6 Q 0 30 26 34"] }; },
  wifi: () => ({ fill: [], ink: ["M -32 -8 Q 0 -36 32 -8", "M -21 5 Q 0 -14 21 5", "M -10 18 Q 0 9 10 18", circD(0, 29, 4, 10)] }),
};
const backOut = q => 1 + 2.70158 * Math.pow(q - 1, 3) + 1.70158 * Math.pow(q - 1, 2);   // overshoots a little, then settles

// props: title, items [{obj, label, word}] (1–4), flow (arrows + moving dot between items, default true), move {obj, from, to, word}, caption
function objects(g, p) {
  const title = titleBlock(g, p);
  const items = (p.items || []).slice(0, 4), n = items.length;
  const top = p.title ? 205 : 150, bottom = BRAND.safe.bottom - (p.caption ? 70 : 30), mid = (top + bottom) / 2, gap = (bottom - top - 150) / 3;
  const spots = { 1: [[CX, mid - 25, 2.7]], 2: [[145, mid - 10, 1.85], [395, mid - 10, 1.85]],
    3: [[145, top + 85, 1.65], [395, mid, 1.65], [145, bottom - 105, 1.65]],
    4: [[145, top + 70, 1.4], [395, top + 70 + gap, 1.4], [145, top + 70 + 2 * gap, 1.4], [395, top + 70 + 3 * gap, 1.4]] }[n] || [];
  let after = 0.4;
  const cue = (word, k) => {
    const hit = word && (p._words || []).find(x => x.t >= after - 0.05 && x.w === normWord(String(word).split(/\s+/)[0]));
    const t = Math.max(after, hit ? hit.t - 0.1 : 0.5 + k * 1.2); after = t + 0.45; return t;
  };
  const build = (name, parent, s) => {
    const o = (OBJECTS[name] || OBJECTS.package)(), og = el("g", {}, parent);
    return { og, fills: o.fill.map(d => el("path", { d, fill: ACCENT, "fill-opacity": 0.28, opacity: 0 }, og)), ink: o.ink.map(d => ink(d, og, INK, 2.6 / s)) };
  };
  const R = items.map((it, k) => {
    const [x, y, s] = spots[k], o = build(it.obj, g, s), t = cue(it.word || it.label || it.obj, k);
    const label = it.label ? handText(it.label, x, y + 52 * s + 26, n === 1 ? 34 : 27, g, INK, "", 230) : null;
    let arrow = null, dot = null, a = null, b = null;
    if (k && p.flow !== false) {
      const [px, py, ps] = spots[k - 1], ang = Math.atan2(y - py, x - px);
      a = [px + Math.cos(ang) * (52 * ps + 8), py + Math.sin(ang) * (52 * ps + 8)]; b = [x - Math.cos(ang) * (52 * s + 12), y - Math.sin(ang) * (52 * s + 12)];
      arrow = ink(arrowD(a[0], a[1], b[0], b[1]), g, INK, 2.2); dot = el("circle", { r: 5.5, fill: ACCENT, opacity: 0 }, g);
    }
    return { ...o, x, y, s, t, label, arrow, dot, a, b };
  });
  const mv = p.move && R[p.move.from] && R[p.move.to] ? { ...build(p.move.obj || items[p.move.from]?.obj, g, 0.5), t: 0 } : null;
  if (mv) mv.t = cue(p.move.word, n);
  const cap = p.caption ? handText(p.caption, CX, bottom + 52, 28, g) : null;
  const end = Math.max(1.2, ...R.map(r => r.t + 0.9), mv ? mv.t + 1.3 : 0), len = end + (cap ? 1.0 : 0.2);
  const capAt = p.dur ? Math.min(end, Math.max(0.5, p.dur - 1.3)) : end;   // the caption is always fully written before the cut
  return { len: p.dur ? Math.min(len, p.dur - 0.4) : len, run: u => {      // never sped up: objects stay on their words
    title(u);
    R.forEach((r, k) => {
      const q = prog(u, r.t, r.t + 0.45), pop = q <= 0 ? 0 : backOut(q), bob = q >= 1 ? Math.sin((u - r.t) * 2.2 + k) * 2.5 : 0;
      r.og.setAttribute("transform", `translate(${r.x} ${(r.y + bob).toFixed(1)}) scale(${(r.s * pop).toFixed(3)})`);
      r.ink.forEach(d => draw(d, prog(u, r.t, r.t + 0.5))); r.fills.forEach(f => show(f, prog(u, r.t + 0.25, r.t + 0.55)));
      if (r.label) write(r.label, prog(u, r.t + 0.25, r.t + 0.7));
      if (r.arrow) {
        draw(r.arrow, prog(u, r.t - 0.3, r.t));
        const ph = u - r.t - 0.5, f = (ph % 1.5) / 1.5;                     // a dot keeps flowing along the arrow
        show(r.dot, ph > 0 ? pulse(f) : 0);
        if (ph > 0) { r.dot.setAttribute("cx", lerp(r.a[0], r.b[0], f).toFixed(1)); r.dot.setAttribute("cy", lerp(r.a[1], r.b[1], f).toFixed(1)); }
      }
    });
    if (mv) {
      const A = R[p.move.from], B = R[p.move.to], q = ease(prog(u, mv.t, mv.t + 1.0)), on = u >= mv.t;
      const x = lerp(A.x, B.x, q), y = lerp(A.y, B.y, q) - 40 * pulse(q) - 30 * A.s;   // hops over, lands on top
      mv.og.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${on ? 0.5 : 0})`);
      mv.ink.forEach(d => draw(d, on ? 1 : 0)); mv.fills.forEach(f => show(f, on ? 1 : 0));
    }
    if (cap) write(cap, prog(u, capAt, capAt + 0.8));
  } };
}

// ---------- clip scenes: pre-rendered frames from <day>/art/<key> (render.js sets p._art) ----------
// _art = { frames: "art/<key>/f", n, fps } for a clip, or { still: "art/<key>/still.png" } for a still only.
function clipPlayer(g, art, x, y, w, h, fit = "xMidYMid slice") {
  const img = el("image", { x, y, width: w, height: h, preserveAspectRatio: fit, opacity: 0 }, g);
  let cur = "";
  return (u, o = 1, zoom = 1) => {
    if (!art) return show(img, 0);
    const url = art.n ? `${art.frames}${String(Math.min(art.n, 1 + Math.floor(Math.max(0, u) * art.fps))).padStart(4, "0")}.jpg` : art.still;
    if (url !== cur) { cur = url; img.setAttribute("href", url); if (img.decode) PENDING.push(img.decode().catch(() => {})); }
    show(img, o); scaleAt(img, zoom, x + w / 2, y + h / 2);
  };
}
function clipPlaceholder(g, lines, top) {               // shown until the clip is made: what it will be, in the look's colours
  const box = ink(rectD(40, top, 460, 330, 18), g, MUTED, 1.4);
  box.style.strokeDasharray = "0.02 0.015";
  const L = lines.map((s, i) => handText(s, CX, top + 95 + i * 52, i ? S.small : S.body, g, i ? MUTED : INK, "", 420));
  return u => { draw(box, prog(u, 0, 0.6)); L.forEach((l, i) => write(l, prog(u, 0.3 + i * 0.2, 0.9 + i * 0.2))); };
}

// ---------- clawd: Clawd (Claude Animation Base) acting the line, painted by lib/clawd.js ----------
// props: action, from, to, prop, hat, setting (the painting has no words; captions run below)
function clawdScene(g, p) {
  const top = 150, size = 500;
  if (!p._art) return { len: 2, run: clipPlaceholder(g, [`Clawd: ${p.action}`, `${p.from} → ${p.to}${p.prop ? " · " + p.prop : ""}`, "painted when you render (or ↻ Paint)"], 230) };
  const cp = `clawd${++CLIPS}`, c = el("clipPath", { id: cp }, g); el("rect", { x: 20, y: top, width: size, height: size, rx: 22 }, c);
  const pic = el("g", { "clip-path": `url(#${cp})` }, g), play = clipPlayer(pic, p._art, 20, top, size, size);
  const frame = ink(rectD(20, top, size, size, 22), g, INK, BRAND.stroke * 1.3);
  return { len: Math.max(1, (p._art.n || 0) / (p._art.fps || 24)), run: u => { play(u, prog(u, 0, 0.2)); draw(frame, prog(u, 0, 0.5)); } };
}

// ---------- broll: a full-screen paper-collage clip (Collage B-roll, made with Gemini by py/broll.py) ----------
// props: metaphor, objects, color. A still (no clip yet) slowly pushes in.
function broll(g, p) {
  if (!p._art) return { len: 2, run: clipPlaceholder(g, ["B-roll: " + (p.objects || []).slice(0, 3).join(", "), String(p.metaphor || "").slice(0, 46), String(p.metaphor || "").slice(46, 92)].filter(Boolean), 250) };
  const play = clipPlayer(g, p._art, 0, 0, 540, 960);
  return { len: p._art.n ? p._art.n / p._art.fps : 2, run: u => play(u, 1, p._art.n ? 1 : 1 + 0.06 * Math.min(1, u / Math.max(1, p.dur || 5))) };
}

const COMPONENTS = {
  hello: (g, p) => wave(g, p.text || "HELLO GUYS!", p.sub),
  bye: (g, p) => wave(g, p.text || "BYE GUYS!", p.sub ?? "See you in the next video"),
  hook,
  list: (g, p) => rows(g, p, p.marker || "number"),
  checklist: (g, p) => rows(g, p, "tick"),
  flow, terminal, compare, takeaway, cta, statement, chart, story, image, objects, clawd: clawdScene, broll,
};
