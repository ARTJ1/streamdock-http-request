const http = require('http');
const https = require('https');
const { URL } = require('url');
const { Plugins, Actions, log } = require('./utils/plugin');
const { LiveHub, normalizeBase, DEFAULT_BASE, httpGetJSON } = require('./live');

const plugin = new Plugins();
const liveHub = new LiveHub(plugin);

const DEFAULTS = {
  url: 'http://127.0.0.1:19123/api/win',
  method: 'GET',
  headers: '',
  body: '',
  contentType: 'application/json',
  showStatus: true,
  timeout: 5000,
  preset: 'win',
  liveDisplay: 'auto'
};

const PRESET_PATHS = {
  win: '/api/win',
  win_down: '/api/win/down',
  loss: '/api/loss',
  loss_down: '/api/loss/down',
  rank_up: '/api/rank/up',
  rank_down: '/api/rank/down',
  rank: '/api/deck/state',
  reset: '/api/reset',
  game_next: '/api/game/next',
  mode_next: '/api/mode/next',
  role_next: '/api/role/next',
  show: '/api/show',
  rank_up_tank: '/api/rank/up?role=tank',
  rank_up_support: '/api/rank/up?role=support',
  rank_up_damage: '/api/rank/up?role=damage',
  rank_down_tank: '/api/rank/down?role=tank',
  rank_down_support: '/api/rank/down?role=support',
  rank_down_damage: '/api/rank/down?role=damage'
};

function parseHeaders(raw, contentType, hasBody) {
  const headers = {};
  if (raw && String(raw).trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        Object.assign(headers, parsed);
      }
    } catch (err) {
      throw new Error('Invalid headers JSON');
    }
  }
  if (hasBody && contentType && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
    headers['Content-Type'] = contentType;
  }
  return headers;
}

function sendHttpRequest(settings) {
  const method = String(settings.method || 'GET').toUpperCase();
  const urlString = String(settings.url || '').trim();
  if (!urlString) {
    return Promise.reject(new Error('URL is empty'));
  }

  const parsed = new URL(urlString);
  const timeoutMs = Math.max(500, Number(settings.timeout) || 5000);
  const bodyAllowed = !['GET', 'HEAD'].includes(method);
  const body = bodyAllowed && settings.body ? String(settings.body) : null;
  const headers = parseHeaders(settings.headers, settings.contentType, Boolean(body));

  if (body) {
    headers['Content-Length'] = Buffer.byteLength(body);
  }

  const lib = parsed.protocol === 'https:' ? https : http;
  const options = {
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.pathname + parsed.search,
    method,
    headers,
    timeout: timeoutMs
  };

  return new Promise((resolve, reject) => {
    const req = lib.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({
          statusCode: res.statusCode || 0,
          body: text
        });
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error(`Timeout after ${timeoutMs}ms`));
    });
    req.on('error', reject);

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function tryApplySnapshotBody(body, baseUrl) {
  if (!body) return false;
  try {
    const parsed = JSON.parse(body);
    // Mutation endpoints return Snapshot { state, settings, view }
    if (parsed?.view) {
      const deck = parsed.deck || {
        wins: parsed.view.wins,
        losses: parsed.view.losses,
        rank: parsed.view.rank,
        rankLabel: parsed.deck?.rankLabel || '',
        rankImageUrl: '',
        role: parsed.view.role,
        game: parsed.view.game,
        mode: parsed.view.mode,
        skinId: parsed.settings?.skinId
      };
      // Prefer full deck refresh for rank labels/images
      liveHub.poll();
      return true;
    }
    // /api/deck/state itself
    if (parsed?.rankLabel != null || (parsed?.wins != null && parsed?.losses != null && parsed?.rank != null && !parsed.state)) {
      liveHub.onDeck({
        ...parsed,
        rankImageUrl: parsed.rankImageUrl,
        roleImageUrl: parsed.roleImageUrl
      });
      return true;
    }
  } catch {
    /* not JSON */
  }
  void baseUrl;
  return false;
}

const _lastPress = new Map(); // context -> ts — avoid double fire from keyDown+keyUp

async function runRequest(context, settings) {
  const now = Date.now();
  const prev = _lastPress.get(context) || 0;
  if (now - prev < 350) return false;
  _lastPress.set(context, now);

  const cfg = Object.assign({}, DEFAULTS, settings || {});
  // Display-only rank button: refresh live state, don't mutate
  if (cfg.preset === 'rank' || String(cfg.url || '').includes('/api/deck/state')) {
    try {
      await liveHub.poll();
      if (cfg.showStatus) plugin.showOk(context);
      plugin.sendToPropertyInspector({
        type: 'result',
        ok: true,
        statusCode: 200,
        body: liveHub.lastDeck ? JSON.stringify(liveHub.lastDeck).slice(0, 500) : 'refreshed'
      });
      liveHub.broadcastStatus();
      return true;
    } catch (err) {
      if (cfg.showStatus !== false) plugin.showAlert(context);
      plugin.sendToPropertyInspector({
        type: 'result',
        ok: false,
        statusCode: 0,
        body: String(err.message || err)
      });
      return false;
    }
  }

  try {
    const result = await sendHttpRequest(cfg);
    const ok = result.statusCode >= 200 && result.statusCode < 300;
    log.info(`${cfg.method} ${cfg.url} -> ${result.statusCode}`);
    if (cfg.showStatus) {
      if (ok) plugin.showOk(context);
      else plugin.showAlert(context);
    }
    if (ok) {
      const applied = tryApplySnapshotBody(result.body, liveHub.baseUrl);
      if (!applied && liveHub.enabled) {
        // WS may already push; poll as backup
        liveHub.poll();
      }
    }
    plugin.sendToPropertyInspector({
      type: 'result',
      ok,
      statusCode: result.statusCode,
      body: result.body?.slice(0, 500) || ''
    });
    liveHub.broadcastStatus();
    return ok;
  } catch (err) {
    log.error(`${cfg.method} ${cfg.url} failed:`, err.message || err);
    if (cfg.showStatus !== false) {
      plugin.showAlert(context);
    }
    plugin.sendToPropertyInspector({
      type: 'result',
      ok: false,
      statusCode: 0,
      body: String(err.message || err)
    });
    return false;
  }
}

function applyGlobalFromPlugins() {
  const g = Plugins.globalSettings || {};
  liveHub.setGlobal({
    liveMode: Boolean(g.liveMode),
    baseUrl: g.baseUrl || DEFAULT_BASE
  });
}

// Hook global settings updates
const _origMessage = plugin.ws?.on;
plugin.didReceiveGlobalSettings = function didReceiveGlobalSettings() {
  applyGlobalFromPlugins();
};

plugin.request = new Actions({
  default: { ...DEFAULTS },

  _willAppear({ context, payload }) {
    const settings = this.data[context] || DEFAULTS;
    if (!settings.url) {
      plugin.setSettings(context, { ...DEFAULTS });
      this.data[context] = { ...DEFAULTS };
    }
    applyGlobalFromPlugins();
    liveHub.register(context, this.data[context]);
  },

  _willDisappear({ context }) {
    liveHub.unregister(context);
  },

  _didReceiveSettings({ context }) {
    liveHub.updateSettings(context, this.data[context]);
  },

  async keyDown({ context }) {
    await runRequest(context, this.data[context]);
  },

  // Some Stream Dock builds deliver presses as keyUp only.
  async keyUp({ context }) {
    await runRequest(context, this.data[context]);
  },

  async sendToPlugin({ context, payload }) {
    if (payload?.type === 'test') {
      await runRequest(context, this.data[context]);
      return;
    }
    if (payload?.type === 'setLiveGlobal') {
      const next = {
        ...(Plugins.globalSettings || {}),
        liveMode: Boolean(payload.liveMode),
        baseUrl: normalizeBase(payload.baseUrl || DEFAULT_BASE)
      };
      plugin.setGlobalSettings(next);
      liveHub.setGlobal(next);
      liveHub.broadcastStatus();
      return;
    }
    if (payload?.type === 'getLiveStatus') {
      applyGlobalFromPlugins();
      liveHub.broadcastStatus();
      return;
    }
    if (payload?.type === 'refreshLive') {
      await liveHub.poll();
      liveHub.broadcastStatus();
    }
  }
});

// Ensure we react when SDK pushes global settings (Plugins constructor already assigns)
const prevHandler = null;
setTimeout(() => {
  applyGlobalFromPlugins();
  // Discover runtime port if default fails later via poll errors
  httpGetJSON(`${DEFAULT_BASE}/api/runtime`).then((rt) => {
    if (rt?.baseUrl && !(Plugins.globalSettings || {}).baseUrl) {
      const next = { ...(Plugins.globalSettings || {}), baseUrl: rt.baseUrl };
      // Don't force-write; only seed in-memory for live hub if live already on
      if (liveHub.enabled) {
        liveHub.setGlobal({ liveMode: true, baseUrl: rt.baseUrl });
      }
      void next;
    }
  }).catch(() => {});
}, 500);
