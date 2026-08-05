const $local = true;
const $back = false;
const $dom = {
  main: $('.sdpi-wrapper'),
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

const WIDGET_BASE = 'http://127.0.0.1:19123';
const PRESETS = {
  win: { url: `${WIDGET_BASE}/api/win`, method: 'GET', body: '', contentType: 'application/json' },
  loss: { url: `${WIDGET_BASE}/api/loss`, method: 'GET', body: '', contentType: 'application/json' },
  rank_up: { url: `${WIDGET_BASE}/api/rank/up`, method: 'GET', body: '', contentType: 'application/json' },
  rank_down: { url: `${WIDGET_BASE}/api/rank/down`, method: 'GET', body: '', contentType: 'application/json' },
  reset: { url: `${WIDGET_BASE}/api/reset`, method: 'GET', body: '', contentType: 'application/json' }
};

function applyToForm(settings = {}) {
  $dom.url.value = settings.url || '';
  $dom.method.value = settings.method || 'GET';
  $dom.contentType.value = settings.contentType ?? 'application/json';
  $dom.headers.value = settings.headers || '';
  $dom.body.value = settings.body || '';
  $dom.timeout.value = settings.timeout || 5000;
  $dom.showStatus.checked = settings.showStatus !== false;

  const match = Object.entries(PRESETS).find(([, p]) => p.url === $dom.url.value && p.method === $dom.method.value);
  $dom.preset.value = match ? match[0] : 'custom';
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
}

const $propEvent = {
  didReceiveSettings({ settings }) {
    applyToForm(settings || {});
  },
  sendToPropertyInspector(payload) {
    if (!payload || payload.type !== 'result') return;
    $dom.result.className = payload.ok ? 'ok' : 'err';
    $dom.result.textContent = payload.ok
      ? `OK ${payload.statusCode}\n${payload.body || ''}`
      : `FAIL ${payload.statusCode || ''}\n${payload.body || ''}`;
  }
};

$dom.preset.addEventListener('change', () => {
  const key = $dom.preset.value;
  if (key === 'custom' || !PRESETS[key]) return;
  const p = PRESETS[key];
  $dom.url.value = p.url;
  $dom.method.value = p.method;
  $dom.body.value = p.body;
  $dom.contentType.value = p.contentType;
  saveFromForm();
});

['url', 'method', 'contentType', 'headers', 'body', 'timeout'].forEach((id) => {
  $dom[id].addEventListener('change', saveFromForm);
  $dom[id].addEventListener('input', $.debounce(saveFromForm, 250));
});
$dom.showStatus.addEventListener('change', saveFromForm);

$dom.testBtn.addEventListener('click', () => {
  saveFromForm();
  $dom.result.className = '';
  $dom.result.textContent = 'Sending...';
  $websocket.sendToPlugin({ type: 'test' });
});
