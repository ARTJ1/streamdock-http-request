const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const vm = require('vm');

const SIZE = 144;
const OUT = path.join(__dirname, 'preview');
const SKINS_JS = 'G:/OBS-Stream-Widget-Statistics-v2/web/admin/skins.js';

function parseColor(c) {
  if (!c) return { r: 18, g: 22, b: 28, a: 1 };
  if (c.startsWith('#')) {
    let h = c.slice(1);
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: 1
    };
  }
  const m = String(c).match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
  if (!m) return { r: 18, g: 22, b: 28, a: 1 };
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] != null ? +m[4] : 1 };
}

function blend(fg, bg) {
  const a = fg.a;
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
    a: 1
  };
}

function hex(c) {
  return (
    '#' +
    [c.r, c.g, c.b]
      .map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0'))
      .join('')
  );
}

function mix(a, b, t) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
    a: 1
  };
}

function lum(c) {
  return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
}

function loadWidgetSkins() {
  const code = fs.readFileSync(SKINS_JS, 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(code, sandbox, { filename: 'skins.js' });
  const list = sandbox.window.WIDGET_SKINS;
  if (!Array.isArray(list) || !list.length) {
    throw new Error('WIDGET_SKINS not found in ' + SKINS_JS);
  }
  return list;
}

function skinToTheme(skin) {
  const s = skin.settings;
  const black = { r: 0, g: 0, b: 0, a: 1 };
  const bg = blend(parseColor(s.bgColor), black);
  const sep = parseColor(s.separatorColor);
  const ring = blend(sep, bg);
  const fg = parseColor(s.iconColor);
  const muted = mix(fg, bg, 0.45);
  const bg2 = mix(bg, black, lum(bg) > 0.55 ? 0.12 : 0.35);
  return {
    id: skin.id,
    name: skin.name,
    bg: hex(bg),
    bg2: hex(bg2),
    ring: hex(ring),
    fg: hex(fg),
    win: s.winsColor,
    loss: s.lossesColor,
    accent: s.winsColor,
    muted: hex(muted)
  };
}

const THEMES = Object.fromEntries(loadWidgetSkins().map((skin) => [skin.id, skinToTheme(skin)]));

const GLYPHS = {
  trophy: `<path transform="translate(36,34) scale(0.125)" d="M552 64H448V24c0-13.3-10.7-24-24-24H152c-13.3 0-24 10.7-24 24v40H24C10.7 64 0 74.7 0 88v56c0 35.7 22.5 72.4 61.9 100.7 31.5 22.7 69.8 37.1 110 41.7C203.3 338.5 240 360 240 360v72h-48c-35.3 0-64 20.7-64 56v12c0 6.6 5.4 12 12 12h296c6.6 0 12-5.4 12-12v-12c0-35.3-28.7-56-64-56h-48v-72s36.7-21.5 68.1-73.6c40.3-4.6 78.6-19 110-41.7 39.3-28.3 61.9-65 61.9-100.7V88c0-13.3-10.7-24-24-24zM99.3 192.8C74.9 175.2 64 155.6 64 144v-16h64.2c1 32.6 5.8 61.2 12.8 86.2-15.1-5.2-29.2-12.4-41.7-21.4zM512 144c0 16.1-17.7 36.1-35.3 48.8-12.5 9-26.7 16.2-41.8 21.4 7-25 11.8-53.6 12.8-86.2H512v16z"/>`,
  skull: `<path transform="translate(34,34) scale(0.145)" d="M256 0C114.6 0 0 100.3 0 224c0 70.1 36.9 132.6 94.5 173.7 9.6 6.9 15.2 18.1 13.5 29.9l-9.4 66.2c-1.4 9.6 6 18.2 15.7 18.2H192v-56c0-4.4 3.6-8 8-8h16c4.4 0 8 3.6 8 8v56h64v-56c0-4.4 3.6-8 8-8h16c4.4 0 8 3.6 8 8v56h77.7c9.7 0 17.1-8.6 15.7-18.2l-9.4-66.2c-1.7-11.7 3.8-23 13.5-29.9C475.1 356.6 512 294.1 512 224 512 100.3 397.4 0 256 0zm-96 320c-35.3 0-64-28.7-64-64s28.7-64 64-64 64 28.7 64 64-28.7 64-64 64zm192 0c-35.3 0-64-28.7-64-64s28.7-64 64-64 64 28.7 64 64-28.7 64-64 64z"/>`,
  chevronUp: `<path d="M72 42 L108 86 L96 86 L72 60 L48 86 L36 86 Z"/>`,
  chevronDown: `<path d="M72 102 L36 58 L48 58 L72 84 L96 58 L108 58 Z"/>`,
  // Classic single refresh (Material-style) — one clockwise arrow, no dual cycle
  reset: `<path stroke="none" transform="translate(28,16) scale(3.7)" d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>`,
  game: `
    <path stroke="none" d="
      M 30 58 C 30 52 36 48 44 48 H 80 C 88 48 94 52 94 58 V 74
      C 94 86 84 94 72 94 C 68 94 66 90 62 90 H 58
      C 54 90 52 94 48 94 C 36 94 30 86 30 74 Z
      M 46 62 H 52 V 66 H 56 V 72 H 52 V 76 H 46 V 72 H 42 V 66 H 46 Z
      M 74 64 A 4 4 0 1 1 74 64.01 Z
      M 82 72 A 4 4 0 1 1 82 72.01 Z
    " fill-rule="evenodd"/>
    <path stroke="none" d="M108 56 L130 74 L108 92 Z"/>
  `,
  mode: `<path stroke="none" d="M36 48h72v10H36V48zm0 20h72v10H36V68zm0 20h48v10H36V88z"/><circle stroke="none" cx="100" cy="53" r="6"/><circle stroke="none" cx="100" cy="73" r="6"/><circle stroke="none" cx="92" cy="93" r="6"/>`,
  role: `<circle cx="72" cy="72" r="16" fill="none"/>`,
  tank: `<path d="M72 40 L96 48 L96 72 C96 88 84 100 72 108 C60 100 48 88 48 72 L48 48 Z"/>`,
  support: `<path d="M66 48h12v18h18v12H78v18H66V78H48V66h18V48z"/>`,
  damage: `<path d="M52 44h8v56h-8V44zm16 0h8v56h-8V44zm16 0h8v56h-8V44z"/>`,
  show: `<path d="M72 46c-22 0-40 16-46 26 6 10 24 26 46 26s40-16 46-26c-6-10-24-26-46-26zm0 14a12 12 0 1 1 0 24 12 12 0 0 1 0-24z"/>`
};

function frame(t, inner) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${t.bg}" stop-opacity="1"/>
      <stop offset="100%" stop-color="${t.bg2 || t.bg}" stop-opacity="1"/>
    </linearGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" rx="22" ry="22" fill="url(#g)"/>
  <rect x="6" y="6" width="132" height="132" rx="18" ry="18" fill="none" stroke="${t.ring}" stroke-width="2"/>
  ${inner}
</svg>`;
}

function caption(t, text, y = 118) {
  return `<text x="72" y="${y}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="700" letter-spacing="1.5" fill="${t.muted}">${text}</text>`;
}

function icon(t, color, glyph, opts = {}) {
  const { label, labelY, shiftY = 0 } = opts;
  let body = '';
  if (label && labelY != null && labelY < 50) {
    body += caption(t, label, labelY);
  }
  body += `<g fill="${color}" stroke="${color}" transform="translate(0,${shiftY})">${GLYPHS[glyph]}</g>`;
  if (label && (labelY == null || labelY >= 50)) {
    body += caption(t, label, labelY ?? 118);
  }
  return frame(t, body);
}

function rankIcon(t, dir, role, opts = {}) {
  const arrow = dir === 'up' ? GLYPHS.chevronUp : GLYPHS.chevronDown;
  const arrowColor = dir === 'up' ? t.win : t.loss;
  const arrowShift = opts.arrowShift ?? (role ? -18 : -8);
  let body = `<g fill="${arrowColor}" transform="translate(0,${arrowShift})">${arrow}</g>`;
  if (role) {
    body += `<g fill="${t.fg}" opacity="0.95" transform="translate(36,62) scale(0.55)">${GLYPHS[role]}</g>`;
  } else if (!opts.hideCaption) {
    body += caption(t, 'RANK', 118);
  }
  return frame(t, body);
}

const ROLE_PNG = {
  tank: 'G:/OBS-Stream-Widget-Statistics-v2/web/overlay/assets/roles/tank.png',
  support: 'G:/OBS-Stream-Widget-Statistics-v2/web/overlay/assets/roles/support.png',
  damage: 'G:/OBS-Stream-Widget-Statistics-v2/web/overlay/assets/roles/damage.png'
};

async function composeRoleRank(theme, dir, role, outFile) {
  const arrowShift = dir === 'up' ? -18 : 22;
  const baseSvg = rankIcon(theme, dir, null, { arrowShift, hideCaption: true });
  const arrowOnly = await sharp(Buffer.from(baseSvg)).png().toBuffer();
  const roleSrc = await sharp(ROLE_PNG[role])
    .resize(52, 52, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const roleTop = dir === 'up' ? 78 : 28;
  await sharp(arrowOnly)
    .composite([{ input: roleSrc, left: 46, top: roleTop }])
    .png()
    .toFile(outFile);
}

async function composeRoleNext(theme, outFile) {
  // Pyramid: tank + support on top, damage below
  const color = theme.fg;
  const r = 17;
  const topY = 42;
  const botY = 78;
  const c1 = 46; // tank top-left
  const c2 = 98; // support top-right
  const c3 = 72; // damage bottom-center
  const svg = frame(
    theme,
    `
    ${caption(theme, 'ROLE', 118)}
    <g fill="none" stroke="${color}" stroke-width="2.4">
      <circle cx="${c1}" cy="${topY}" r="${r}"/>
      <circle cx="${c2}" cy="${topY}" r="${r}"/>
      <circle cx="${c3}" cy="${botY}" r="${r}"/>
    </g>
    <g fill="${color}" stroke="none">
      <path d="M${c1} ${topY - 8}
        L${c1 + 6.5} ${topY - 5}
        L${c1 + 6.5} ${topY + 2}
        C${c1 + 6.5} ${topY + 7} ${c1} ${topY + 10} ${c1} ${topY + 10}
        C${c1} ${topY + 10} ${c1 - 6.5} ${topY + 7} ${c1 - 6.5} ${topY + 2}
        L${c1 - 6.5} ${topY - 5} Z"/>
      <path d="M${c2 - 2} ${topY - 8} h4 v6.5 h6.5 v4 H${c2 + 2} V${topY + 8} h-4 v-6.5 H${c2 - 8.5} v-4 H${c2 - 2} Z"/>
      <path d="M${c3 - 7} ${botY - 8} h3.5 v16 H${c3 - 7} Z
               M${c3 - 1.75} ${botY - 8} h3.5 v16 H${c3 - 1.75} Z
               M${c3 + 3.5} ${botY - 8} h3.5 v16 H${c3 + 3.5} Z"/>
    </g>
    `
  );
  await writePng(outFile, svg);
}

const ICONS = [
  { id: 'win', label: 'Win +1', build: (t) => icon(t, t.win, 'trophy', { label: 'WIN', shiftY: -6 }) },
  { id: 'loss', label: 'Loss +1', build: (t) => icon(t, t.loss, 'skull', { label: 'LOSS', shiftY: -6 }) },
  { id: 'rank_up', label: 'Rank Up', build: (t) => rankIcon(t, 'up') },
  { id: 'rank_down', label: 'Rank Down', build: (t) => rankIcon(t, 'down') },
  { id: 'reset', label: 'Reset W/L', build: (t) => icon(t, t.accent, 'reset', { label: 'RESET', shiftY: -4 }) },
  { id: 'game_next', label: 'Game Next', build: (t) => icon(t, t.fg, 'game', { label: 'GAME', labelY: 34, shiftY: 10 }) },
  { id: 'mode_next', label: 'Mode Next', build: (t) => icon(t, t.fg, 'mode', { label: 'MODE', labelY: 34, shiftY: 8 }) },
  { id: 'role_next', label: 'Role Next', compose: 'role_next' },
  { id: 'rank_up_tank', label: 'Rank↑ Tank', role: 'tank', dir: 'up' },
  { id: 'rank_up_support', label: 'Rank↑ Support', role: 'support', dir: 'up' },
  { id: 'rank_up_damage', label: 'Rank↑ Damage', role: 'damage', dir: 'up' },
  { id: 'rank_down_tank', label: 'Rank↓ Tank', role: 'tank', dir: 'down' },
  { id: 'rank_down_support', label: 'Rank↓ Support', role: 'support', dir: 'down' },
  { id: 'rank_down_damage', label: 'Rank↓ Damage', role: 'damage', dir: 'down' },
  { id: 'show', label: 'Show Overlay', build: (t) => icon(t, t.accent, 'show', { label: 'SHOW', shiftY: -4 }) }
];

async function writePng(file, svg) {
  await sharp(Buffer.from(svg)).png().toFile(file);
}

async function sheet(themeKey, theme) {
  const cols = 5;
  const rows = Math.ceil(ICONS.length / cols);
  const gap = 16;
  const cell = SIZE + gap;
  const pad = 24;
  const header = 56;
  const w = pad * 2 + cols * cell - gap;
  const h = pad * 2 + header + rows * cell - gap;

  const tiles = await Promise.all(
    ICONS.map(async (ic, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const pngPath = path.join(OUT, themeKey, `${ic.id}.png`);
      const png = fs.readFileSync(pngPath);
      const x = pad + col * cell;
      const y = pad + header + row * cell;
      return { png, x, y, label: ic.label };
    })
  );

  const labelSvg = tiles
    .map(
      (t) =>
        `<text x="${t.x + SIZE / 2}" y="${t.y + SIZE + 12}" text-anchor="middle" font-family="Segoe UI, Arial" font-size="11" fill="${theme.muted}">${t.label}</text>`
    )
    .join('');

  const composites = tiles.map((t) => ({ input: t.png, left: t.x, top: t.y }));
  const sheetBg = parseColor(theme.bg);

  await sharp({
    create: {
      width: w,
      height: h,
      channels: 4,
      background: { r: Math.max(0, sheetBg.r - 8), g: Math.max(0, sheetBg.g - 8), b: Math.max(0, sheetBg.b - 8), alpha: 1 }
    }
  })
    .composite([
      {
        input: Buffer.from(`<svg width="${w}" height="${h}">
          <text x="${pad}" y="36" font-family="Segoe UI, Arial" font-size="22" font-weight="700" fill="${theme.fg}">${theme.name}</text>
          <text x="${pad}" y="52" font-family="Segoe UI, Arial" font-size="12" fill="${theme.muted}">skin: ${themeKey} · AJAZZ / Stream Dock · 144×144</text>
          ${labelSvg}
        </svg>`),
        left: 0,
        top: 0
      },
      ...composites
    ])
    .png()
    .toFile(path.join(OUT, `_sheet_${themeKey}.png`));
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  // Drop old hand-picked neon/cyber folders if present
  for (const legacy of ['neon', 'cyber']) {
    const p = path.join(OUT, legacy);
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
    const sheet = path.join(OUT, `_sheet_${legacy}.png`);
    if (fs.existsSync(sheet)) fs.unlinkSync(sheet);
  }

  const themeKeys = Object.keys(THEMES);
  console.log(`skins: ${themeKeys.length}`);

  for (const [key, theme] of Object.entries(THEMES)) {
    const dir = path.join(OUT, key);
    fs.mkdirSync(dir, { recursive: true });
    for (const ic of ICONS) {
      const pngPath = path.join(dir, `${ic.id}.png`);
      if (ic.role) {
        await composeRoleRank(theme, ic.dir, ic.role, pngPath);
      } else if (ic.compose === 'role_next') {
        await composeRoleNext(theme, pngPath);
      } else {
        const svg = ic.build(theme);
        await writePng(pngPath, svg);
      }
    }
    await sheet(key, theme);
    console.log(`skin ${key}: ${ICONS.length} icons`);
  }

  const index = themeKeys
    .map((id) => `- \`${id}\` — ${THEMES[id].name}`)
    .join('\n');
  fs.writeFileSync(
    path.join(OUT, 'README.md'),
    `# Stream Dock icons · widget skins\n\nGenerated from \`web/admin/skins.js\` (${themeKeys.length} skins × ${ICONS.length} buttons).\n\n${index}\n`
  );
  console.log('done ->', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
