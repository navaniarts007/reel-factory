// ============ LOOKS ============
// One entry per look a skill can use (skills/<id>/skill.json lists its looks). A look overrides parts of BRAND
// (brand.js); anything it leaves out keeps the whiteboard value. render.js merges the look in before the engine loads.
//   colors      paper, ink, accent, bad, muted (same meaning as brand.js)
//   fonts       hand (all text), mono (code); google = Google Fonts families to load
//   weight      font weight for text; wobble = hand-drawn jitter (1 = marker, 0 = clean vector lines)
//   texture     background: grain | halftone | grid | dots | none; overlay: scanlines; glow = soft phosphor glow
//   captions    caption bar colours
// Palettes for hyperframes-* and lemo-* follow the frame presets / STYLE.md of those skills; onetake-* are our own.
const THEMES = {
  whiteboard: { name: "Whiteboard (white paper, charcoal marker, purple)" },

  // ---- HyperFrames frame presets
  "hf-cobalt": { name: "Cobalt grid", colors: { paper: "#F0EBDE", ink: "#1F2BE0", accent: "#5560E5", bad: "#C8363A", muted: "#6A6FA8" },
    fonts: { hand: '"Newsreader", Georgia, serif', mono: '"DM Mono", Consolas, monospace', google: ["Newsreader:wght@500;700", "DM+Mono:wght@500"] },
    weight: 600, wobble: 0, stroke: 1.6, texture: { kind: "grid", color: "#1F2BE0", opacity: 0.07, size: 27 },
    captions: { bg: "#1F2BE0", text: "#F0EBDE", now: "#FFFFFF", next: "#A9AEEF" } },
  "hf-editorial": { name: "Code editorial", colors: { paper: "#FAF9F5", ink: "#141413", accent: "#CC785C", bad: "#B5432F", muted: "#6B6A63" },
    fonts: { hand: '"Inter", Arial, sans-serif', mono: '"JetBrains Mono", Consolas, monospace', google: ["Inter:wght@500;700", "JetBrains+Mono:wght@500"] },
    weight: 600, wobble: 0, stroke: 1.6, texture: { kind: "none" },
    captions: { bg: "#181715", text: "#FAF9F5", now: "#E9A98F", next: "#8E8C85" } },
  "hf-poster": { name: "Bold poster", colors: { paper: "#FFFFFF", ink: "#1C1410", accent: "#D8000F", bad: "#8A0A0A", muted: "#6E625A" },
    fonts: { hand: '"Space Grotesk", Arial, sans-serif', mono: '"Space Mono", Consolas, monospace', google: ["Space+Grotesk:wght@500;700", "Space+Mono:wght@700"] },
    weight: 700, wobble: 0, stroke: 2.4, texture: { kind: "none" },
    captions: { bg: "#D8000F", text: "#FFFFFF", now: "#FFE3B0", next: "#FFB3B8" } },

  // ---- Lemo Opuscar styles (tech-friendly ones)
  "lemo-blueprint": { name: "Blueprint", colors: { paper: "#1D3F80", ink: "#E7F0F9", accent: "#8FC1F2", bad: "#FF8A7A", muted: "#A9C3E4" },
    fonts: { hand: '"Architects Daughter", cursive', mono: '"Share Tech Mono", Consolas, monospace', google: ["Architects+Daughter", "Share+Tech+Mono"] },
    wobble: 0.35, stroke: 1.5, texture: { kind: "grid", color: "#E7F0F9", opacity: 0.13, size: 18 },
    captions: { bg: "#0F2350", text: "#E7F0F9", now: "#FFFFFF", next: "#7FA2CF" } },
  "lemo-swiss": { name: "Swiss motion graphics", colors: { paper: "#EAE9E5", ink: "#111111", accent: "#E30613", bad: "#E30613", muted: "#5E5E5B" },
    fonts: { hand: '"Archivo", Arial, sans-serif', mono: '"IBM Plex Mono", Consolas, monospace', google: ["Archivo:wght@500;800", "IBM+Plex+Mono:wght@600"] },
    weight: 800, wobble: 0, stroke: 2.2, texture: { kind: "none" },
    captions: { bg: "#111111", text: "#FFFFFF", now: "#FF5A63", next: "#8E8E8E" } },
  "lemo-keynote": { name: "Dark tech keynote", colors: { paper: "#0B0B0F", ink: "#F5F5F7", accent: "#8B7CFF", bad: "#FF7A1A", muted: "#8A8A93" },
    fonts: { hand: '"Inter", Arial, sans-serif', mono: '"JetBrains Mono", Consolas, monospace', google: ["Inter:wght@500;700", "JetBrains+Mono:wght@500"] },
    weight: 600, wobble: 0, stroke: 1.4, texture: { kind: "dots", color: "#F5F5F7", opacity: 0.05, size: 24 },
    captions: { bg: "#1D1D24", text: "#F5F5F7", now: "#B7AEFF", next: "#6F6F78" } },
  "lemo-crt": { name: "ASCII / CRT terminal", colors: { paper: "#120C05", ink: "#FFB000", accent: "#FFD780", bad: "#FF5A36", muted: "#A66F00" },
    fonts: { hand: '"VT323", monospace', mono: '"VT323", monospace', google: ["VT323"] },
    wobble: 0, stroke: 1.6, size: { title: 46, big: 60, body: 30, small: 23, code: 20 },
    texture: { kind: "none", overlay: "scanlines", color: "#000000", opacity: 0.28 }, glow: true,
    captions: { bg: "#2A1B05", text: "#FFB000", now: "#FFE7B0", next: "#7A5200" } },
  "lemo-riso": { name: "Risograph print", colors: { paper: "#F4EEE2", ink: "#3D5588", accent: "#FF665E", bad: "#C0392B", muted: "#7B86A6" },
    fonts: { hand: '"Bricolage Grotesque", Arial, sans-serif', mono: '"Space Mono", Consolas, monospace', google: ["Bricolage+Grotesque:wght@600;800", "Space+Mono:wght@700"] },
    weight: 700, wobble: 0.6, stroke: 2.2, texture: { kind: "grain", opacity: 0.16 },
    captions: { bg: "#3D5588", text: "#F4EEE2", now: "#FFB3AE", next: "#9FAACB" } },
  "lemo-dossier": { name: "Halftone dossier", colors: { paper: "#F2E8D0", ink: "#1E1A16", accent: "#E4572E", bad: "#B22A12", muted: "#6D6253" },
    fonts: { hand: '"Rubik", Arial, sans-serif', mono: '"Courier Prime", Consolas, monospace', google: ["Rubik:wght@500;700", "Courier+Prime:wght@700"] },
    weight: 700, wobble: 0.5, stroke: 2.6, texture: { kind: "halftone", color: "#1E1A16", opacity: 0.1, size: 7 },
    captions: { bg: "#1E1A16", text: "#F2E8D0", now: "#FFA684", next: "#8A7E6B" } },
  "lemo-pictogram": { name: "Pictogram motion", colors: { paper: "#263D8C", ink: "#FFF6E5", accent: "#FFB703", bad: "#FF6B5A", muted: "#AEB9E3" },
    fonts: { hand: '"Inter Tight", Arial, sans-serif', mono: '"DM Mono", Consolas, monospace', google: ["Inter+Tight:wght@600;900", "DM+Mono:wght@500"] },
    weight: 800, wobble: 0, stroke: 2.6, texture: { kind: "dots", color: "#FFF6E5", opacity: 0.08, size: 30 },
    captions: { bg: "#FFB703", text: "#1B2A63", now: "#FFFFFF", next: "#6B5310" } },
  "lemo-whiteboard": { name: "Whiteboard (Lemo colours)", colors: { paper: "#FBFAF7", ink: "#23262C", accent: "#2A5CB3", bad: "#C8363A", muted: "#6B6F78" },
    fonts: { hand: '"Architects Daughter", cursive', google: ["Architects+Daughter"] }, wobble: 1, texture: { kind: "grain", opacity: 0.06 },
    captions: { bg: "#FBFAF7", text: "#23262C", now: "#2A5CB3", next: "#A3A6AD" } },

  // ---- OneTake (our own palettes; the camera is what makes it OneTake)
  "onetake-paper": { name: "Paper", colors: { paper: "#F5F3EE", ink: "#161616", accent: "#3B5BDB", bad: "#D9480F", muted: "#6F6C66" },
    fonts: { hand: '"Manrope", Arial, sans-serif', mono: '"JetBrains Mono", Consolas, monospace', google: ["Manrope:wght@600;800", "JetBrains+Mono:wght@500"] },
    weight: 700, wobble: 0, stroke: 1.8, texture: { kind: "dots", color: "#161616", opacity: 0.12, size: 22 } },
  "onetake-dusk": { name: "Dusk", colors: { paper: "#1E2233", ink: "#F1EDE4", accent: "#F2A65A", bad: "#FF7B72", muted: "#9AA0B8" },
    fonts: { hand: '"Manrope", Arial, sans-serif', mono: '"JetBrains Mono", Consolas, monospace', google: ["Manrope:wght@600;800", "JetBrains+Mono:wght@500"] },
    weight: 700, wobble: 0, stroke: 1.8, texture: { kind: "dots", color: "#F1EDE4", opacity: 0.1, size: 22 },
    captions: { bg: "#F1EDE4", text: "#1E2233", now: "#C46A12", next: "#8C8C99" } },
  "onetake-ember": { name: "Ember", colors: { paper: "#1A1414", ink: "#F5E9DA", accent: "#FF6B3D", bad: "#FF4D4D", muted: "#A08C80" },
    fonts: { hand: '"Manrope", Arial, sans-serif', mono: '"JetBrains Mono", Consolas, monospace', google: ["Manrope:wght@600;800", "JetBrains+Mono:wght@500"] },
    weight: 700, wobble: 0, stroke: 1.8, texture: { kind: "dots", color: "#F5E9DA", opacity: 0.09, size: 22 },
    captions: { bg: "#F5E9DA", text: "#1A1414", now: "#D9431A", next: "#9C8A7E" } },

  // ---- Collage B-roll: flat colour field, halftone, cream paper cards
  "collage-orange": { name: "Collage, burnt orange", colors: { paper: "#E2622B", ink: "#1C1714", accent: "#F4EEE2", bad: "#5A0E0E", muted: "#4A2A1A" },
    fonts: { hand: '"Archivo Black", Arial, sans-serif', mono: '"Courier Prime", Consolas, monospace', google: ["Archivo+Black", "Courier+Prime:wght@700"] },
    weight: 400, wobble: 0.4, stroke: 2.4, texture: { kind: "halftone", color: "#1C1714", opacity: 0.13, size: 6 },
    captions: { bg: "#1C1714", text: "#F4EEE2", now: "#FFC9A8", next: "#8D7C70" } },
  "collage-purple": { name: "Collage, deep purple", colors: { paper: "#4B2E83", ink: "#F4EEE2", accent: "#F6C343", bad: "#FF7A6B", muted: "#C9B8EA" },
    fonts: { hand: '"Archivo Black", Arial, sans-serif', mono: '"Courier Prime", Consolas, monospace', google: ["Archivo+Black", "Courier+Prime:wght@700"] },
    weight: 400, wobble: 0.4, stroke: 2.4, texture: { kind: "halftone", color: "#F4EEE2", opacity: 0.1, size: 6 },
    captions: { bg: "#F4EEE2", text: "#2B1A4D", now: "#8A5A00", next: "#9D93B3" } },
  "collage-teal": { name: "Collage, teal", colors: { paper: "#127C7A", ink: "#F4EEE2", accent: "#F6C343", bad: "#FF8A6B", muted: "#BFE3DF" },
    fonts: { hand: '"Archivo Black", Arial, sans-serif', mono: '"Courier Prime", Consolas, monospace', google: ["Archivo+Black", "Courier+Prime:wght@700"] },
    weight: 400, wobble: 0.4, stroke: 2.4, texture: { kind: "halftone", color: "#F4EEE2", opacity: 0.1, size: 6 },
    captions: { bg: "#F4EEE2", text: "#0C4A49", now: "#8A5A00", next: "#8FB3B0" } },

  // ---- Claude Animation Base: warm paper, painted feel
  "clawd-paper": { name: "Painted paper", colors: { paper: "#F3EBDD", ink: "#3B2F2A", accent: "#D97757", bad: "#B5432F", muted: "#8A7A6E" },
    fonts: { hand: '"Patrick Hand", cursive', google: ["Patrick+Hand"] }, wobble: 1.5, stroke: 2.3,
    texture: { kind: "grain", opacity: 0.12 },
    captions: { bg: "#3B2F2A", text: "#F3EBDD", now: "#F2B39B", next: "#9A8B80" } },
};
if (typeof module !== "undefined") module.exports = THEMES;
