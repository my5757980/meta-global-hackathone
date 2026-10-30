/**
 * Our own vector car illustrations (no third-party photos needed): side, front, rear and interior views
 * for each body type, coloured with the car's paint. Deterministic, cacheable, a few KB each.
 */
type View = "side" | "front" | "rear" | "interior";

interface SideShape {
  body: string;
  windows: string[];
  wheels: [number, number];
  r: number;
  ground: number;
  extra?: (c: Palette) => string;
  lightFront: [number, number];
  lightRear: [number, number];
  doorX: number[];
}

interface Palette {
  paint: string;
  dark: string;
  light: string;
}

const SHAPES: Record<string, SideShape> = {
  Sedan: {
    body: "M110,330 L110,290 Q115,262 150,255 L255,245 Q300,195 360,185 L500,182 Q545,186 580,240 L660,250 Q690,256 692,290 L692,330 Q690,342 675,342 L125,342 Q110,342 110,330 Z",
    windows: ["M282,243 Q316,204 362,197 L438,196 L438,243 Z", "M450,196 L497,195 Q528,199 553,241 L450,243 Z"],
    wheels: [205, 592], r: 44, ground: 342, lightFront: [114, 282], lightRear: [684, 270], doorX: [444, 300],
  },
  Hatchback: {
    body: "M130,334 L130,286 Q134,262 165,255 L262,245 Q302,190 352,182 L560,180 Q600,184 616,232 L640,264 Q650,276 650,300 L650,334 Q648,344 636,344 L142,344 Q130,344 130,334 Z",
    windows: ["M285,243 Q314,197 355,193 L440,192 L440,243 Z", "M452,192 L556,191 Q586,196 600,236 L452,243 Z"],
    wheels: [218, 566], r: 42, ground: 344, lightFront: [134, 282], lightRear: [642, 272], doorX: [446, 310],
  },
  Wagon: {
    body: "M110,332 L110,288 Q114,262 150,255 L250,246 Q295,196 350,186 L640,184 Q674,188 684,240 L690,290 L690,332 Q688,344 674,344 L124,344 Q110,344 110,332 Z",
    windows: ["M276,244 Q312,200 352,196 L430,195 L430,244 Z", "M442,195 L548,194 L548,244 L442,244 Z", "M560,194 L634,194 Q658,198 668,240 L560,244 Z"],
    wheels: [205, 598], r: 43, ground: 344, lightFront: [114, 282], lightRear: [684, 262], doorX: [436, 300, 554],
  },
  Coupe: {
    body: "M110,330 L110,293 Q116,268 160,262 L282,252 Q332,206 392,198 L500,198 Q560,205 602,250 L672,262 Q696,268 696,296 L696,330 Q694,342 680,342 L124,342 Q110,342 110,330 Z",
    windows: ["M300,251 Q342,210 394,205 L470,205 L470,251 Z", "M482,205 L500,205 Q548,210 576,249 L482,251 Z"],
    wheels: [208, 598], r: 44, ground: 342, lightFront: [114, 286], lightRear: [688, 276], doorX: [476],
  },
  SUV: {
    body: "M105,335 L105,270 Q108,245 140,238 L230,230 Q262,168 302,160 L560,158 Q602,160 626,206 L668,226 Q695,236 696,272 L696,335 Q694,349 680,349 L120,349 Q105,349 105,335 Z",
    windows: ["M248,228 Q274,177 304,172 L410,171 L410,228 Z", "M422,171 L555,170 Q585,173 606,215 L606,228 L422,228 Z"],
    wheels: [212, 592], r: 50, ground: 349, lightFront: [110, 262], lightRear: [688, 250], doorX: [416, 280],
  },
  Pickup: {
    body: "M95,335 L95,268 Q98,250 130,244 L240,236 Q270,180 305,172 L450,170 Q470,172 480,200 L486,236 L700,236 Q712,238 712,255 L712,335 Q710,347 698,347 L108,347 Q95,347 95,335 Z",
    windows: ["M256,234 Q281,187 308,183 L370,182 L370,234 Z", "M382,182 L447,181 Q461,184 469,210 L473,234 L382,234 Z"],
    wheels: [205, 602], r: 48, ground: 347, lightFront: [100, 262], lightRear: [706, 258], doorX: [376],
    extra: (c) => `<path d="M486,236 L486,300" stroke="${c.dark}" stroke-width="3"/><path d="M492,244 L704,244" stroke="${c.dark}" stroke-width="2" opacity=".5"/>`,
  },
  Van: {
    body: "M100,340 L100,192 Q102,160 140,155 L660,152 Q700,154 702,190 L702,340 Q700,351 688,351 L112,351 Q100,351 100,340 Z",
    windows: ["M108,226 L112,177 Q116,166 140,165 L232,164 L232,226 Z", "M246,164 L420,163 L420,224 L246,224 Z", "M434,163 L640,162 L640,224 L434,224 Z"],
    wheels: [200, 602], r: 44, ground: 351, lightFront: [104, 268], lightRear: [696, 250], doorX: [238, 428],
  },
  Minivan: {
    body: "M100,338 L100,262 Q104,240 136,232 L200,226 Q236,170 282,160 L630,155 Q676,158 690,202 L700,262 Q704,282 702,338 Q700,350 688,350 L112,350 Q100,350 100,338 Z",
    windows: ["M216,224 Q246,178 284,171 L380,169 L380,224 Z", "M392,169 L520,167 L520,224 L392,224 Z", "M532,167 L628,166 Q660,170 672,214 L532,224 Z"],
    wheels: [205, 598], r: 44, ground: 350, lightFront: [105, 262], lightRear: [694, 250], doorX: [386, 526],
  },
  Truck: {
    body: "M90,340 L90,186 Q92,160 122,157 L292,157 Q308,159 309,184 L309,340 Z",
    windows: ["M98,232 L102,180 Q106,169 126,168 L224,168 L224,232 Z", "M236,168 L296,168 L298,232 L236,232 Z"],
    wheels: [182, 612], r: 44, ground: 352, lightFront: [94, 282], lightRear: [712, 290], doorX: [230],
    extra: (c) =>
      `<rect x="312" y="268" width="412" height="34" rx="4" fill="${c.paint}" stroke="${c.dark}" stroke-width="2"/>` +
      `<rect x="312" y="300" width="412" height="12" fill="#2a2d33"/>` +
      `<path d="M300,330 L724,330" stroke="#2a2d33" stroke-width="10"/>`,
  },
};

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

function palette(paint: string): Palette {
  return { paint, dark: shade(paint, -0.28), light: shade(paint, 0.18) };
}

function wheel(cx: number, cy: number, r: number): string {
  const spokes = Array.from({ length: 5 }, (_, i) => {
    const a = (i * 72 * Math.PI) / 180;
    return `<line x1="${cx}" y1="${cy}" x2="${(cx + Math.cos(a) * r * 0.55).toFixed(1)}" y2="${(cy + Math.sin(a) * r * 0.55).toFixed(1)}" stroke="#8d939b" stroke-width="5" stroke-linecap="round"/>`;
  }).join("");
  return (
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#17181b"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r * 0.62}" fill="#cfd4da"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r * 0.62}" fill="url(#rim)"/>` +
    spokes +
    `<circle cx="${cx}" cy="${cy}" r="${r * 0.14}" fill="#5f656c"/>`
  );
}

const defs = (c: Palette) => `
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3f6fa"/><stop offset=".72" stop-color="#e6ebf1"/><stop offset="1" stop-color="#d7dee6"/></linearGradient>
  <linearGradient id="paint" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.light}"/><stop offset=".55" stop-color="${c.paint}"/><stop offset="1" stop-color="${c.dark}"/></linearGradient>
  <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3c4a5a"/><stop offset=".5" stop-color="#1f2a36"/><stop offset="1" stop-color="#465566"/></linearGradient>
  <radialGradient id="rim" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#f2f4f6"/><stop offset="1" stop-color="#9aa1a9"/></radialGradient>
  <radialGradient id="shadow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".32"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
</defs>`;

function sideView(body: string, c: Palette, mirror: boolean): string {
  const s = SHAPES[body] ?? SHAPES.Sedan!;
  const [w1, w2] = s.wheels;
  const inner =
    `<ellipse cx="400" cy="${s.ground + 6}" rx="330" ry="22" fill="url(#shadow)"/>` +
    (s.extra ? s.extra(c) : "") +
    `<path d="${s.body}" fill="url(#paint)" stroke="${c.dark}" stroke-width="2.5" stroke-linejoin="round"/>` +
    s.windows.map((w) => `<path d="${w}" fill="url(#glass)" stroke="${shade(c.paint, -0.4)}" stroke-width="2"/>`).join("") +
    s.windows.map((w) => `<path d="${w}" fill="#fff" opacity=".07"/>`).join("") +
    s.doorX.map((x) => `<line x1="${x}" y1="${s.ground - 112}" x2="${x}" y2="${s.ground - 14}" stroke="${c.dark}" stroke-width="2" opacity=".55"/>`).join("") +
    s.doorX.map((x) => `<rect x="${x + 16}" y="${s.ground - 78}" width="26" height="6" rx="3" fill="${c.dark}" opacity=".6"/>`).join("") +
    `<path d="M120,${s.ground - 58} L686,${s.ground - 58}" stroke="#fff" stroke-width="3" opacity=".22"/>` +
    `<rect x="${s.lightFront[0]}" y="${s.lightFront[1]}" width="22" height="12" rx="4" fill="#fff7d6" stroke="${c.dark}" stroke-width="1.5"/>` +
    `<rect x="${s.lightRear[0] - 14}" y="${s.lightRear[1]}" width="16" height="14" rx="3" fill="#c81e2b"/>` +
    `<circle cx="${w1}" cy="${s.ground}" r="${s.r + 7}" fill="#22252a" opacity=".85"/>` +
    `<circle cx="${w2}" cy="${s.ground}" r="${s.r + 7}" fill="#22252a" opacity=".85"/>` +
    wheel(w1, s.ground, s.r) +
    wheel(w2, s.ground, s.r);
  const g = mirror ? `<g transform="translate(800,0) scale(-1,1)">${inner}</g>` : inner;
  return `<rect width="800" height="450" fill="url(#bg)"/><rect y="372" width="800" height="78" fill="#cfd7e0" opacity=".55"/>${g}`;
}

function frontRear(body: string, c: Palette, rear: boolean): string {
  const tall = ["SUV", "Van", "Minivan", "Truck", "Pickup"].includes(body);
  const top = tall ? 92 : 128;
  const bodyTop = tall ? 190 : 215;
  const width = body === "Truck" || body === "Van" ? 420 : 460;
  const x0 = 400 - width / 2;
  const x1 = 400 + width / 2;
  const glassInset = rear ? 50 : 40;
  const lights = rear
    ? `<rect x="${x0 + 18}" y="${bodyTop + 26}" width="64" height="26" rx="6" fill="#c81e2b"/><rect x="${x1 - 82}" y="${bodyTop + 26}" width="64" height="26" rx="6" fill="#c81e2b"/><rect x="${400 - 70}" y="${bodyTop + 70}" width="140" height="34" rx="4" fill="#f3f4f6" stroke="#9aa1a9"/><text x="400" y="${bodyTop + 93}" font-family="Arial" font-size="16" font-weight="700" text-anchor="middle" fill="#30343a">HK-DEMO</text>`
    : `<rect x="${x0 + 18}" y="${bodyTop + 24}" width="78" height="30" rx="10" fill="#fff7d6" stroke="${c.dark}"/><rect x="${x1 - 96}" y="${bodyTop + 24}" width="78" height="30" rx="10" fill="#fff7d6" stroke="${c.dark}"/><rect x="${400 - 92}" y="${bodyTop + 28}" width="184" height="54" rx="10" fill="#2a2e34"/><path d="M${400 - 84},${bodyTop + 44} H${400 + 84} M${400 - 84},${bodyTop + 58} H${400 + 84} M${400 - 84},${bodyTop + 72} H${400 + 84}" stroke="#5c636b" stroke-width="3"/>`;
  return (
    `<rect width="800" height="450" fill="url(#bg)"/><rect y="372" width="800" height="78" fill="#cfd7e0" opacity=".55"/>` +
    `<ellipse cx="400" cy="372" rx="270" ry="20" fill="url(#shadow)"/>` +
    `<rect x="${x0 + 22}" y="330" width="58" height="44" rx="10" fill="#17181b"/><rect x="${x1 - 80}" y="330" width="58" height="44" rx="10" fill="#17181b"/>` +
    `<path d="M${x0 + 40},${bodyTop} Q${x0 + 70},${top} ${x0 + 110},${top} L${x1 - 110},${top} Q${x1 - 70},${top} ${x1 - 40},${bodyTop} Z" fill="url(#paint)" stroke="${c.dark}" stroke-width="2.5"/>` +
    `<path d="M${x0 + 40 + glassInset},${bodyTop - 6} Q${x0 + 80},${top + 14} ${x0 + 118},${top + 14} L${x1 - 118},${top + 14} Q${x1 - 80},${top + 14} ${x1 - 40 - glassInset},${bodyTop - 6} Z" fill="url(#glass)"/>` +
    `<rect x="${x0}" y="${bodyTop}" width="${width}" height="${352 - bodyTop}" rx="34" fill="url(#paint)" stroke="${c.dark}" stroke-width="2.5"/>` +
    lights +
    `<rect x="${x0 + 30}" y="326" width="${width - 60}" height="16" rx="6" fill="${c.dark}" opacity=".7"/>`
  );
}

function interior(c: Palette): string {
  return (
    `<rect width="800" height="450" fill="#1c1f24"/>` +
    `<path d="M0,250 Q400,170 800,250 L800,450 L0,450 Z" fill="#2b2f36"/>` +
    `<path d="M40,250 Q400,185 760,250 L760,280 Q400,215 40,280 Z" fill="${c.dark}" opacity=".85"/>` +
    `<rect x="330" y="225" width="150" height="88" rx="10" fill="#0e1116" stroke="#4b5563" stroke-width="3"/>` +
    `<rect x="342" y="236" width="126" height="66" rx="6" fill="#18324d"/><path d="M352,288 L380,262 L404,280 L432,250 L458,272" stroke="#6fb3ff" stroke-width="3" fill="none"/>` +
    `<circle cx="210" cy="330" r="96" fill="none" stroke="#0b0d10" stroke-width="22"/><circle cx="210" cy="330" r="30" fill="#0b0d10"/><path d="M118,330 H302 M210,330 V426" stroke="#0b0d10" stroke-width="18"/>` +
    `<circle cx="210" cy="330" r="12" fill="#9aa1a9"/>` +
    `<rect x="560" y="300" width="170" height="120" rx="16" fill="#23272e" stroke="#3a4049"/><circle cx="645" cy="360" r="34" fill="#15181d" stroke="#59616b" stroke-width="3"/>`
  );
}

export function carSvg(opts: { body: string; color: string; view: View }): string {
  const c = palette(opts.color.startsWith("#") ? opts.color : "#9aa0a6");
  let content: string;
  switch (opts.view) {
    case "front":
      content = frontRear(opts.body, c, false);
      break;
    case "rear":
      content = frontRear(opts.body, c, true);
      break;
    case "interior":
      content = interior(c);
      break;
    default:
      content = sideView(opts.body, c, false);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450">${defs(c)}${content}</svg>`;
}

export const CAR_VIEWS: View[] = ["side", "front", "rear", "interior"];

/** URL of an illustration served by /api/media/car. */
export function carImageUrl(body: string, colorHexValue: string, view: View = "side"): string {
  return `/api/media/car?body=${encodeURIComponent(body)}&color=${encodeURIComponent(colorHexValue)}&view=${view}`;
}
