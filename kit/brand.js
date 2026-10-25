// ============ BRAND FILE ============
// Change a value here and every video updates. Coordinates are in a 540 x 960 canvas (rendered at 1080 x 1920).
const BRAND = {
  colors: {
    paper: "#FFFFFF",     // background
    ink: "#2B2B2B",       // marker lines and text
    accent: "#8B7BB8",    // muted purple: highlights, ticks, underlines
    bad: "#C9605A",       // muted red: errors, crosses, "don't"
    muted: "#6B6B66",     // secondary text
  },
  fonts: {
    hand: '"Patrick Hand", "Comic Sans MS", "Segoe Print", cursive',   // labels and titles
    mono: '"Courier New", Consolas, monospace',                         // commands and code
    googleFont: "Patrick+Hand",                                         // loaded from Google Fonts
  },
  size: { title: 40, big: 52, body: 25, small: 19, code: 15 },
  stroke: 1.9,                       // marker thickness
  safe: { top: 110, bottom: 715 },   // keep content between these y values (caption bar below, app UI covers the rest)
  captions: {                        // burned-in caption bar (py/captions.py makes the word times)
    y: 762, size: 32,              // bar centre and text size, above the Instagram/YouTube bottom overlay
    bg: "#1C1C1C", text: "#FFFFFF",  // charcoal-black bar, white words
    now: "#CDBFF5",                  // the word being spoken: a light tint of the accent, readable on black
    next: "#8E8E8E",                 // words still to come
  },
  fps: 60,
};
