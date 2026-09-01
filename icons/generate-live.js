/**
 * Stream Dock LIVE icon pack — C4 Neon Edge
 * Output: preview-live/<skin-id>/*.png + _sheet.png
 * Does NOT touch classic preview/ pack.
 *
 * Polish one skin at a time:
 *   node generate-live.js default
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const vm = require('vm');

const SIZE = 144;
const OUT = path.join(__dirname, 'preview-live');
const ROLE_ASSETS = path.resolve(
  __dirname,
  '../../OBS-Stream-Widget-Statistics-v2/web/overlay/assets/roles'
);

function parseColor(c) {
  if (!c) return { r: 18, g: 22, b: 28, a: 1 };
  if (c.startsWith('#')) {
    let h = c.slice(1);
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
  }
  const m = String(c).match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
  if (!m) return { r: 18, g: 22, b: 28, a: 1 };
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] != null ? +m[4] : 1 };
}

function blend(fg, bg) {
  const a = fg.a == null ? 1 : fg.a;
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
    a: 1
  };
}

function hex(c) {
  return '#' + [c.r, c.g, c.b].map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('');
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

function rgba(hexOrCss, a) {
  const c = parseColor(hexOrCss);
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}

function loadWidgetSkins() {
  const candidates = [
    path.join(__dirname, '..', '..', 'OBS-Stream-Widget-Statistics-v2', 'web', 'admin', 'skins.js'),
    'G:/OBS-Stream-Widget-Statistics-v2/web/admin/skins.js'
  ];
  let code;
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      code = fs.readFileSync(p, 'utf8');
      break;
    }
  }
  if (!code) throw new Error('skins.js not found');
  const sandbox = { window: {} };
  vm.runInNewContext(code, sandbox, { filename: 'skins.js' });
  const list = sandbox.window.WIDGET_SKINS;
  if (!Array.isArray(list) || !list.length) throw new Error('WIDGET_SKINS empty');
  return list;
}

function skinToTheme(skin) {
  const s = skin.settings;
  const black = { r: 0, g: 0, b: 0, a: 1 };
  const bg = blend(parseColor(s.bgColor), black);
  const sep = parseColor(s.separatorColor);
  const ring = blend(sep, bg);
  const fg = parseColor(s.iconColor);
  const muted = mix(fg, bg, 0.55);
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
    muted: hex(muted)
  };
}

const trophyPath =
  'M552 64H448V24c0-13.3-10.7-24-24-24H152c-13.3 0-24 10.7-24 24v40H24C10.7 64 0 74.7 0 88v56c0 35.7 22.5 72.4 61.9 100.7 31.5 22.7 69.8 37.1 110 41.7C203.3 338.5 240 360 240 360v72h-48c-35.3 0-64 20.7-64 56v12c0 6.6 5.4 12 12 12h296c6.6 0 12-5.4 12-12v-12c0-35.3-28.7-56-64-56h-48v-72s36.7-21.5 68.1-73.6c40.3-4.6 78.6-19 110-41.7 39.3-28.3 61.9-65 61.9-100.7V88c0-13.3-10.7-24-24-24zM99.3 192.8C74.9 175.2 64 155.6 64 144v-16h64.2c1 32.6 5.8 61.2 12.8 86.2-15.1-5.2-29.2-12.4-41.7-21.4zM512 144c0 16.1-17.7 36.1-35.3 48.8-12.5 9-26.7 16.2-41.8 21.4 7-25 11.8-53.6 12.8-86.2H512v16z';
const skullPath =
  'M256 0C114.6 0 0 100.3 0 224c0 70.1 36.9 132.6 94.5 173.7 9.6 6.9 15.2 18.1 13.5 29.9l-9.4 66.2c-1.4 9.6 6 18.2 15.7 18.2H192v-56c0-4.4 3.6-8 8-8h16c4.4 0 8 3.6 8 8v56h64v-56c0-4.4 3.6-8 8-8h16c4.4 0 8 3.6 8 8v56h77.7c9.7 0 17.1-8.6 15.7-18.2l-9.4-66.2c-1.7-11.7 3.8-23 13.5-29.9C475.1 356.6 512 294.1 512 224 512 100.3 397.4 0 256 0zm-96 320c-35.3 0-64-28.7-64-64s28.7-64 64-64 64 28.7 64 64-28.7 64-64 64zm192 0c-35.3 0-64-28.7-64-64s28.7-64 64-64 64 28.7 64 64-28.7 64-64 64z';

const CHEV_UP = `<path d="M0 5 L14 22 L9 22 L0 11 L-9 22 L-14 22 Z"/>`;
const CHEV_DOWN = `<path d="M0 22 L-14 5 L-9 5 L0 16 L9 5 L14 5 Z"/>`;

function frame(t, accent, inner) {
  const color = accent === 'win' ? t.win : accent === 'loss' ? t.loss : t.fg;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0%" stop-color="${t.bg2}"/>
      <stop offset="100%" stop-color="${t.bg}"/>
    </linearGradient>
    <radialGradient id="wash" cx="42%" cy="40%" r="60%">
      <stop offset="0%" stop-color="${rgba(color, 0.32)}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${rgba(color, 0.12)}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" rx="22" ry="22" fill="url(#bg)"/>
  <rect width="${SIZE}" height="${SIZE}" rx="22" ry="22" fill="url(#wash)"/>
  <rect x="5.5" y="5.5" width="133" height="133" rx="18" ry="18" fill="none" stroke="${t.ring}" stroke-width="1.5" stroke-opacity="0.9"/>
  <rect x="10" y="10" width="124" height="124" rx="15" ry="15" fill="none" stroke="${t.fg}" stroke-width="1" stroke-opacity="0.12"/>
  <rect x="12" y="24" width="3" height="96" rx="1.5" fill="${color}"/>
  ${inner}
</svg>`;
}

function eyebrow(text, color) {
  return `<text x="28" y="38" font-family="Segoe UI, Arial, sans-serif" font-size="10" font-weight="700" letter-spacing="2.6" fill="${color}">${text}</text>`;
}

function foot(text, color) {
  return `<text x="28" y="120" font-family="Segoe UI, Arial, sans-serif" font-size="9" font-weight="600" letter-spacing="1.6" fill="${color}">${text}</text>`;
}

function arrow(dir, color) {
  return `<g fill="${color}" transform="translate(118,36) scale(0.9)">${dir === 'up' ? CHEV_UP : CHEV_DOWN}</g>`;
}

function wlIcon(t, kind, dir) {
  const accent = kind === 'win' ? 'win' : 'loss';
  const color = kind === 'win' ? t.win : t.loss;
  const title = kind === 'win' ? 'WIN' : 'LOSS';
  const mark =
    kind === 'win'
      ? `<path transform="translate(58,40) scale(0.1035)" d="${trophyPath}"/>`
      : `<path transform="translate(56,38) scale(0.115)" d="${skullPath}"/>`;
  return frame(
    t,
    accent,
    `
    <g fill="${color}" opacity="0.11">${mark}</g>
    ${eyebrow(title, color)}
    ${arrow(dir, color)}
    ${foot(dir === 'up' ? 'UP' : 'DOWN', t.muted)}
    `
  );
}

function rankIcon(t, dir) {
  const accent = dir === 'up' ? 'win' : 'loss';
  const color = dir === 'up' ? t.win : t.loss;
  return frame(
    t,
    accent,
    `
    ${eyebrow('RANK', t.muted)}
    ${arrow(dir, color)}
    ${foot(dir === 'up' ? 'UP' : 'DOWN', t.muted)}
    `
  );
}

function utilIcon(t, title, body, accent = 'win') {
  const color = accent === 'fg' ? t.fg : accent === 'loss' ? t.loss : t.win;
  const label = accent === 'fg' ? t.muted : color;
  return frame(
    t,
    accent === 'fg' ? 'win' : accent,
    `
    ${eyebrow(title, label)}
    <g fill="${color}">${body}</g>
    ${foot('TAP', t.muted)}
    `
  );
}

const BODY = {
  reset: `<path stroke="none" transform="translate(40,40) scale(3.15)" d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>`,
  game: `
    <path stroke="none" fill-rule="evenodd" d="
      M 30 58 C 30 52 36 48 44 48 H 80 C 88 48 94 52 94 58 V 74
      C 94 86 84 94 72 94 C 68 94 66 90 62 90 H 58
      C 54 90 52 94 48 94 C 36 94 30 86 30 74 Z
      M 46 62 H 52 V 66 H 56 V 72 H 52 V 76 H 46 V 72 H 42 V 66 H 46 Z
      M 74 64 A 4 4 0 1 1 74 64.01 Z
      M 82 72 A 4 4 0 1 1 82 72.01 Z"/>
    <path stroke="none" d="M102 60 L122 74 L102 88 Z"/>
  `,
  mode: `<path stroke="none" d="M36 52h64v9H36V52zm0 18h64v9H36V70zm0 18h42v9H36V88z"/><circle stroke="none" cx="108" cy="56.5" r="5.5"/><circle stroke="none" cx="108" cy="74.5" r="5.5"/><circle stroke="none" cx="86" cy="92.5" r="5.5"/>`,
  show: null // built per-theme
};

function showBody(t) {
  return `
    <path d="M72 52c-20 0-36 14-42 24 6 10 22 24 42 24s36-14 42-24c-6-10-22-24-42-24z"/>
    <circle cx="72" cy="76" r="11" fill="${t.bg}"/>
    <circle cx="72" cy="76" r="6"/>
  `;
}

async function writePng(file, svg) {
  await sharp(Buffer.from(svg)).png().toFile(file);
}

async function composeRoleRank(t, dir, role, outFile) {
  const base = await sharp(Buffer.from(rankIcon(t, dir))).png().toBuffer();
  const roleFile = path.join(ROLE_ASSETS, `${role}.png`);
  if (!fs.existsSync(roleFile)) {
    await sharp(base).toFile(outFile);
    return;
  }
  const roleBuf = await sharp(roleFile)
    .resize(36, 36, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp(base)
    .composite([{ input: roleBuf, left: 54, top: 66 }])
    .png()
    .toFile(outFile);
}

async function composeRoleNext(t, outFile) {
  const color = t.fg;
  const svg = frame(
    t,
    'win',
    `
    ${eyebrow('ROLE', t.muted)}
    <g fill="none" stroke="${color}" stroke-width="2" opacity="0.35">
      <circle cx="52" cy="58" r="18"/>
      <circle cx="92" cy="58" r="18"/>
      <circle cx="72" cy="90" r="18"/>
    </g>
    ${foot('TAP', t.muted)}
    `
  );
  const base = await sharp(Buffer.from(svg)).png().toBuffer();
  const mk = (role) =>
    sharp(path.join(ROLE_ASSETS, `${role}.png`))
      .resize(26, 26, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  const [tank, support, damage] = await Promise.all([mk('tank'), mk('support'), mk('damage')]);
  await sharp(base)
    .composite([
      { input: tank, left: 39, top: 45 },
      { input: support, left: 79, top: 45 },
      { input: damage, left: 59, top: 77 }
    ])
    .png()
    .toFile(outFile);
}

function buildIconList(t) {
  return [
    { id: 'win', label: 'Win +1', svg: () => wlIcon(t, 'win', 'up') },
    { id: 'win_down', label: 'Win −1', svg: () => wlIcon(t, 'win', 'down') },
    { id: 'loss', label: 'Loss +1', svg: () => wlIcon(t, 'loss', 'up') },
    { id: 'loss_down', label: 'Loss −1', svg: () => wlIcon(t, 'loss', 'down') },
    { id: 'rank_up', label: 'Rank Up', svg: () => rankIcon(t, 'up') },
    { id: 'rank_down', label: 'Rank Down', svg: () => rankIcon(t, 'down') },
    { id: 'reset', label: 'Reset W/L', svg: () => utilIcon(t, 'RESET', BODY.reset, 'win') },
    { id: 'game_next', label: 'Game Next', svg: () => utilIcon(t, 'GAME', BODY.game, 'fg') },
    { id: 'mode_next', label: 'Mode Next', svg: () => utilIcon(t, 'MODE', BODY.mode, 'fg') },
    { id: 'role_next', label: 'Role Next', compose: 'role_next' },
    { id: 'show', label: 'Show Overlay', svg: () => utilIcon(t, 'SHOW', showBody(t), 'win') },
    { id: 'rank_up_tank', label: 'Rank↑ Tank', role: 'tank', dir: 'up' },
    { id: 'rank_up_support', label: 'Rank↑ Support', role: 'support', dir: 'up' },
    { id: 'rank_up_damage', label: 'Rank↑ Damage', role: 'damage', dir: 'up' },
    { id: 'rank_down_tank', label: 'Rank↓ Tank', role: 'tank', dir: 'down' },
    { id: 'rank_down_support', label: 'Rank↓ Support', role: 'support', dir: 'down' },
    { id: 'rank_down_damage', label: 'Rank↓ Damage', role: 'damage', dir: 'down' }
  ];
}

async function sheetFor(themeKey, t, icons) {
  // Same layout as classic preview/_sheet_*.png
  const cols = 5;
  const rows = Math.ceil(icons.length / cols);
  const gap = 16;
  const cell = SIZE + gap;
  const pad = 24;
  const header = 56;
  const w = pad * 2 + cols * cell - gap;
  const h = pad * 2 + header + rows * cell - gap;

  const tiles = await Promise.all(
    icons.map(async (ic, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const pngPath = path.join(OUT, themeKey, `${ic.id}.png`);
      const png = fs.readFileSync(pngPath);
      return {
        png,
        x: pad + col * cell,
        y: pad + header + row * cell,
        label: ic.label
      };
    })
  );

  const labelSvg = tiles
    .map(
      (tile) =>
        `<text x="${tile.x + SIZE / 2}" y="${tile.y + SIZE + 12}" text-anchor="middle" font-family="Segoe UI, Arial" font-size="11" fill="${t.muted}">${tile.label}</text>`
    )
    .join('');

  const sheetBg = parseColor(t.bg);
  await sharp({
    create: {
      width: w,
      height: h,
      channels: 4,
      background: {
        r: Math.max(0, sheetBg.r - 8),
        g: Math.max(0, sheetBg.g - 8),
        b: Math.max(0, sheetBg.b - 8),
        alpha: 1
      }
    }
  })
    .composite([
      {
        input: Buffer.from(`<svg width="${w}" height="${h}">
          <text x="${pad}" y="36" font-family="Segoe UI, Arial" font-size="22" font-weight="700" fill="${t.fg}">${t.name}</text>
          <text x="${pad}" y="52" font-family="Segoe UI, Arial" font-size="12" fill="${t.muted}">skin: ${themeKey} · LIVE C4 · AJAZZ / Stream Dock · 144×144</text>
          ${labelSvg}
        </svg>`),
        left: 0,
        top: 0
      },
      ...tiles.map((tile) => ({ input: tile.png, left: tile.x, top: tile.y }))
    ])
    .png()
    .toFile(path.join(OUT, `_sheet_${themeKey}.png`));
}

async function generateSkin(skin) {
  const t = skinToTheme(skin);
  const dir = path.join(OUT, t.id);
  fs.mkdirSync(dir, { recursive: true });

  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith('_demo') || f.includes('demo') || f === '_sheet.png') {
      fs.unlinkSync(path.join(dir, f));
    }
  }

  const pack = buildIconList(t);
  for (const item of pack) {
    const out = path.join(dir, `${item.id}.png`);
    if (item.compose === 'role_next') await composeRoleNext(t, out);
    else if (item.role) await composeRoleRank(t, item.dir, item.role, out);
    else await writePng(out, item.svg());
  }
  await sheetFor(t.id, t, pack);
  console.log(`ok ${t.id}: ${pack.length} icons`);
}

async function main() {
  const arg = (process.argv[2] || 'all').trim();
  const skins = loadWidgetSkins();
  fs.mkdirSync(OUT, { recursive: true });

  const list = arg === 'all' ? skins : skins.filter((s) => s.id === arg);
  if (!list.length) {
    console.error('Unknown skin:', arg);
    process.exit(1);
  }

  console.log(`skins: ${list.length}`);
  for (const skin of list) {
    await generateSkin(skin);
  }

  const index = list.map((s) => `- \`${s.id}\` — ${s.name}`).join('\n');
  fs.writeFileSync(
    path.join(OUT, 'README.md'),
    `# Stream Dock LIVE icons · C4 Neon Edge

Generated from widget \`skins.js\` (${list.length} skins × 17 buttons).
Classic pack in \`preview/\` is untouched.

Sheets: \`_sheet_<skin>.png\` (same layout as classic).

\`\`\`bash
node generate-live.js all
node generate-live.js default
\`\`\`

${index}
`
  );
  console.log('done →', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
