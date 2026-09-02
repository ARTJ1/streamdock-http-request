const $local = true;
const $back = false;
const $dom = {
  main: $('.sdpi-wrapper'),
  liveMode: $('#liveMode'),
  baseUrl: $('#baseUrl'),
  liveDisplay: $('#liveDisplay'),
  liveStatus: $('#liveStatus'),
  preset: $('#preset'),
  url: $('#url'),
  method: $('#method'),
  contentType: $('#contentType'),
  headers: $('#headers'),
  body: $('#body'),
  timeout: $('#timeout'),
  showStatus: $('#showStatus'),
  testBtn: $('#testBtn'),
  result: $('#result')
};

const DEFAULT_BASE = 'http://127.0.0.1:19123';

function presetURL(base, path) {
  return `${String(base || DEFAULT_BASE).replace(/\/+$/, '')}${path}`;
}

function buildPresets(base) {
  const b = String(base || DEFAULT_BASE).replace(/\/+$/, '') || DEFAULT_BASE;
  const get = (path) => ({ url: presetURL(b, path), method: 'GET', body: '', contentType: 'application/json' });
  return {
    win: get('/api/win'),
    win_down: get('/api/win/down'),
    loss: get('/api/loss'),
    loss_down: get('/api/loss/down'),
    rank: get('/api/deck/state'),
    rank_up: get('/api/rank/up'),
    rank_down: get('/api/rank/down'),
    reset: get('/api/reset'),
    game_next: get('/api/game/next'),
    mode_next: get('/api/mode/next'),
    role_next: get('/api/role/next'),
    show: get('/api/show'),
    rank_up_tank: get('/api/rank/up?role=tank'),
    rank_up_support: get('/api/rank/up?role=support'),
    rank_up_damage: get('/api/rank/up?role=damage'),
    rank_down_tank: get('/api/rank/down?role=tank'),
    rank_down_support: get('/api/rank/down?role=support'),
    rank_down_damage: get('/api/rank/down?role=damage')
  };
}

let PRESETS = buildPresets(DEFAULT_BASE);
let $global = { liveMode: true, baseUrl: DEFAULT_BASE };

function isLiveOn() {
  return String($dom.liveMode.value) !== '0';
}

function setLiveSelect(on) {
  $dom.liveMode.value = on ? '1' : '0';
}

function applyToForm(settings = {}) {
  $dom.url.value = settings.url || '';
  $dom.method.value = settings.method || 'GET';
  $dom.contentType.value = settings.contentType ?? 'application/json';
  $dom.headers.value = settings.headers || '';
  $dom.body.value = settings.body || '';
  $dom.timeout.value = settings.timeout || 5000;
  $dom.showStatus.checked = settings.showStatus !== false;
  $dom.liveDisplay.value = settings.liveDisplay || 'auto';

  const presetKey = settings.preset;
  if (presetKey && PRESETS[presetKey]) {
    $dom.preset.value = presetKey;
  } else {
    const match = Object.entries(PRESETS).find(([, p]) => p.url === $dom.url.value && p.method === $dom.method.value);
    $dom.preset.value = match ? match[0] : 'custom';
  }
}

function saveFromForm() {
  if (!$settings) return;
  $settings.url = $dom.url.value.trim();
  $settings.method = $dom.method.value;
  $settings.contentType = $dom.contentType.value;
  $settings.headers = $dom.headers.value;
  $settings.body = $dom.body.value;
  $settings.timeout = Number($dom.timeout.value) || 5000;
  $settings.showStatus = $dom.showStatus.checked;
  $settings.liveDisplay = $dom.liveDisplay.value || 'auto';
  $settings.preset = $dom.preset.value || 'custom';
}

function saveLiveGlobal() {
  const baseUrl = ($dom.baseUrl.value || DEFAULT_BASE).trim() || DEFAULT_BASE;
  const liveMode = isLiveOn();
  $global = { liveMode, baseUrl };
  PRESETS = buildPresets(baseUrl);
  $websocket.setGlobalSettings({ ...($global || {}), liveMode, baseUrl });
  $websocket.sendToPlugin({ type: 'setLiveGlobal', liveMode, baseUrl });
}

function renderLiveStatus(payload) {
  if (!payload) return;
  const on = Boolean(payload.liveMode);
  const connected = Boolean(payload.connected);
  const deck = payload.deck;
  let text = on ? (connected ? 'Live: connected' : 'Live: connecting…') : 'Live: OFF';
  if (on && deck) {
    text += ` · W ${deck.wins ?? 0} / L ${deck.losses ?? 0}`;
    if (deck.rankLabel) text += ` · ${deck.rankLabel}`;
  }
  $dom.liveStatus.textContent = text;
  $dom.liveStatus.className = 'live-status ' + (on && connected ? 'ok' : on ? '' : 'err');
}

const $propEvent = {
  didReceiveSettings({ settings }) {
    applyToForm(settings || {});
    $websocket.getGlobalSettings();
    $websocket.sendToPlugin({ type: 'getLiveStatus' });
  },
  didReceiveGlobalSettings(payload) {
    const settings = payload?.settings || payload || {};
    const liveMode =
      settings.liveMode === undefined || settings.liveMode === null
        ? true
        : Boolean(settings.liveMode);
    $global = {
      liveMode,
      baseUrl: settings.baseUrl || DEFAULT_BASE
    };
    setLiveSelect($global.liveMode);
    $dom.baseUrl.value = $global.baseUrl;
    PRESETS = buildPresets($global.baseUrl);
    $websocket.sendToPlugin({ type: 'getLiveStatus' });
  },
  sendToPropertyInspector(payload) {
    if (!payload) return;
    if (payload.type === 'liveStatus') {
      setLiveSelect(Boolean(payload.liveMode));
      if (payload.baseUrl) $dom.baseUrl.value = payload.baseUrl;
      renderLiveStatus(payload);
      return;
    }
    if (payload.type !== 'result') return;
    $dom.result.className = payload.ok ? 'ok' : 'err';
    $dom.result.textContent = payload.ok
      ? `OK ${payload.statusCode}\n${payload.body || ''}`
      : `FAIL ${payload.statusCode || ''}\n${payload.body || ''}`;
  }
};

$dom.preset.addEventListener('change', () => {
  const key = $dom.preset.value;
  if (key === 'custom' || !PRESETS[key]) {
    saveFromForm();
    return;
  }
  const p = PRESETS[key];
  $dom.url.value = p.url;
  $dom.method.value = p.method;
  $dom.body.value = p.body;
  $dom.contentType.value = p.contentType;
  saveFromForm();
});

['url', 'method', 'contentType', 'headers', 'body', 'timeout', 'liveDisplay'].forEach((id) => {
  $dom[id].addEventListener('change', saveFromForm);
  $dom[id].addEventListener('input', $.debounce(saveFromForm, 250));
});
$dom.showStatus.addEventListener('change', saveFromForm);

$dom.liveMode.addEventListener('change', saveLiveGlobal);
$dom.baseUrl.addEventListener('change', () => {
  saveLiveGlobal();
  const key = $dom.preset.value;
  if (key !== 'custom' && PRESETS[key]) {
    $dom.url.value = PRESETS[key].url;
    saveFromForm();
  }
});
$dom.baseUrl.addEventListener('input', $.debounce(() => {
  saveLiveGlobal();
}, 400));

$dom.testBtn.addEventListener('click', () => {
  saveFromForm();
  $dom.result.className = '';
  $dom.result.textContent = 'Sending...';
  $websocket.sendToPlugin({ type: 'test' });
});
