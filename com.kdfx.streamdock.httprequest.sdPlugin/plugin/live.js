const http = require('http');
const https = require('https');
const { URL } = require('url');
const { log } = require('./utils/plugin');

const DEFAULT_BASE = 'http://127.0.0.1:19123';
const POLL_MS = 2500;
const RECONNECT_MS = 1500;

function normalizeBase(raw) {
  let base = String(raw || DEFAULT_BASE).trim().replace(/\/+$/, '');
  if (!base) base = DEFAULT_BASE;
  if (!/^https?:\/\//i.test(base)) base = `http://${base}`;
  return base.replace(/\/+$/, '');
}

function httpGetJSON(urlString, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(urlString);
    } catch (err) {
      reject(err);
      return;
    }
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'GET',
        timeout: timeoutMs
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
            reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 120)}`));
            return;
          }
          try {
            resolve(JSON.parse(text));
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

function httpGetBuffer(urlString, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(urlString);
    } catch (err) {
      reject(err);
      return;
    }
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'GET',
        timeout: timeoutMs
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          resolve({
            buffer: Buffer.concat(chunks),
            contentType: res.headers['content-type'] || 'image/png'
          });
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

function absURL(base, maybeRelative) {
  if (!maybeRelative) return '';
  if (/^https?:\/\//i.test(maybeRelative) || maybeRelative.startsWith('data:')) {
    return maybeRelative;
  }
  return normalizeBase(base) + (maybeRelative.startsWith('/') ? maybeRelative : `/${maybeRelative}`);
}

function pathOf(url) {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return String(url || '').toLowerCase();
  }
}

/** Only win/loss/rank(/role) buttons get live titles — never game/mode/reset/show. */
function inferDisplay(settings = {}) {
  const explicit = String(settings.liveDisplay || 'auto').toLowerCase();
  if (explicit && explicit !== 'auto') {
    return explicit === 'off' || explicit === 'none' ? 'none' : explicit;
  }
  const preset = String(settings.preset || '').toLowerCase();
  if (preset === 'win' || preset === 'win_down') return 'wins';
  if (preset === 'loss' || preset === 'loss_down') return 'losses';
  if (preset === 'rank' || preset === 'rank_up' || preset === 'rank_down') return 'rank';
  if (preset === 'rank_up_tank' || preset === 'rank_up_support' || preset === 'rank_up_damage') return 'rank';
  if (preset === 'rank_down_tank' || preset === 'rank_down_support' || preset === 'rank_down_damage') return 'rank';
  if (preset === 'role_next') return 'role';
  if (preset && preset !== 'custom') return 'none';

  const path = pathOf(settings.url);
  if (path === '/api/win' || path === '/api/win/down') return 'wins';
  if (path === '/api/loss' || path === '/api/loss/down') return 'losses';
  if (path.startsWith('/api/rank')) return 'rank';
  if (path.startsWith('/api/role')) return 'role';
  return 'none';
}

function deckFromMessage(msg, base) {
  if (msg?.deck && typeof msg.deck === 'object' && (msg.deck.rankLabel || msg.deck.wins != null)) {
    const d = { ...msg.deck };
    d.rankImageUrl = absURL(base, d.rankImageUrl);
    d.roleImageUrl = absURL(base, d.roleImageUrl);
    return d;
  }
  const view = msg?.view || {};
  return {
    wins: view.wins || 0,
    losses: view.losses || 0,
    rank: view.rank || 0,
    rankLabel: '',
    rankImageUrl: '',
    role: view.role || '',
    roleImageUrl: '',
    game: view.game || '',
    mode: view.mode || '',
    skinId: msg?.settings?.skinId || ''
  };
}

class LiveHub {
  constructor(plugin) {
    this.plugin = plugin;
    this.buttons = new Map(); // context -> settings
    this.ws = null;
    this.pollTimer = null;
    this.reconnectTimer = null;
    this.baseUrl = DEFAULT_BASE;
    this.enabled = false;
    this.connected = false;
    this.lastDeck = null;
    this.imageCache = new Map();
    this.lastTitles = new Map(); // context -> last title string
    this._pollInFlight = false;
  }

  setGlobal(globalSettings = {}) {
    const enabled =
      globalSettings.liveMode === undefined || globalSettings.liveMode === null
        ? true
        : Boolean(globalSettings.liveMode);
    const base = normalizeBase(globalSettings.baseUrl || DEFAULT_BASE);
    const changed = enabled !== this.enabled || base !== this.baseUrl;
    const wasEnabled = this.enabled;
    this.enabled = enabled;
    this.baseUrl = base;
    if (changed) {
      this.restart();
    } else {
      this.ensureRunning();
    }
    if (!this.enabled && wasEnabled) {
      this.clearAllTitles();
    } else if (this.enabled) {
      this.poll();
    }
    this.broadcastStatus();
  }

  register(context, settings) {
    this.buttons.set(context, settings || {});
    this.ensureRunning();
    if (!this.enabled || inferDisplay(settings || {}) === 'none') {
      this.clearTitle(context);
    } else if (this.lastDeck) {
      this.applyOne(context, settings || {}, this.lastDeck);
    }
    this.broadcastStatus();
  }

  unregister(context) {
    this.buttons.delete(context);
    this.lastTitles.delete(context);
    if (this.buttons.size === 0) {
      this.stop();
    }
    this.broadcastStatus();
  }

  updateSettings(context, settings) {
    if (!this.buttons.has(context)) return;
    this.buttons.set(context, settings || {});
    if (!this.enabled || inferDisplay(settings || {}) === 'none') {
      this.clearTitle(context);
      return;
    }
    if (this.lastDeck) {
      this.applyOne(context, settings || {}, this.lastDeck);
    }
  }

  ensureRunning() {
    if (!this.enabled || this.buttons.size === 0) {
      this.stop();
      return;
    }
    if (!this.ws && !this.reconnectTimer) {
      this.connect();
    }
    if (!this.pollTimer) {
      this.pollTimer = setInterval(() => this.poll(), POLL_MS);
    }
  }

  restart() {
    this.stop();
    this.ensureRunning();
  }

  stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.removeAllListeners?.();
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    this.connected = false;
  }

  scheduleReconnect() {
    if (this.reconnectTimer || !this.enabled || this.buttons.size === 0) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_MS);
  }

  connect() {
    if (!this.enabled || this.buttons.size === 0) return;
    const Ws = require('ws');
    const base = this.baseUrl;
    let wsUrl;
    try {
      const u = new URL(base);
      u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
      u.pathname = '/ws';
      u.search = '';
      u.hash = '';
      wsUrl = u.toString();
    } catch (err) {
      log.error('LiveHub bad baseUrl', err.message || err);
      this.scheduleReconnect();
      return;
    }

    try {
      if (this.ws) {
        try {
          this.ws.close();
        } catch {
          /* ignore */
        }
      }
      const socket = new Ws(wsUrl);
      this.ws = socket;
      socket.on('open', () => {
        this.connected = true;
        log.info(`LiveHub connected ${wsUrl}`);
        this.broadcastStatus();
        this.poll();
      });
      socket.on('message', (raw) => {
        try {
          const msg = JSON.parse(String(raw));
          const deck = deckFromMessage(msg, this.baseUrl);
          if (!deck.rankLabel && deck.rank != null) {
            this.poll();
            return;
          }
          this.onDeck(deck);
        } catch (err) {
          log.error('LiveHub message parse', err.message || err);
        }
      });
      socket.on('close', () => {
        if (this.ws === socket) this.ws = null;
        this.connected = false;
        this.broadcastStatus();
        this.scheduleReconnect();
      });
      socket.on('error', (err) => {
        log.error('LiveHub ws error', err.message || err);
      });
    } catch (err) {
      log.error('LiveHub connect failed', err.message || err);
      this.scheduleReconnect();
    }
  }

  async poll() {
    if (!this.enabled || this.buttons.size === 0 || this._pollInFlight) return;
    this._pollInFlight = true;
    try {
      const deck = await httpGetJSON(`${this.baseUrl}/api/deck/state`);
      deck.rankImageUrl = absURL(this.baseUrl, deck.rankImageUrl);
      deck.roleImageUrl = absURL(this.baseUrl, deck.roleImageUrl);
      const was = this.connected;
      this.connected = true;
      this.onDeck(deck);
      if (!was) this.broadcastStatus();
    } catch (err) {
      log.error('LiveHub poll failed', err.message || err);
      if (this.connected) {
        this.connected = false;
        this.broadcastStatus();
      }
    } finally {
      this._pollInFlight = false;
    }
  }

  onDeck(deck) {
    this.lastDeck = deck;
    for (const [context, settings] of this.buttons.entries()) {
      this.applyOne(context, settings, deck);
    }
  }

  clearTitle(context) {
    if (this.lastTitles.get(context) === '') return;
    this.lastTitles.set(context, '');
    try {
      this.plugin.setTitle(context, '');
    } catch {
      /* ignore */
    }
  }

  clearAllTitles() {
    for (const context of this.buttons.keys()) {
      this.clearTitle(context);
    }
  }

  writeTitle(context, title) {
    const next = String(title ?? '');
    if (this.lastTitles.get(context) === next) return;
    this.lastTitles.set(context, next);
    this.plugin.setTitle(context, next);
  }

  applyOne(context, settings, deck) {
    if (!this.enabled) {
      this.clearTitle(context);
      return;
    }
    const display = inferDisplay(settings);
    if (display === 'none') {
      this.clearTitle(context);
      return;
    }

    if (display === 'wins') {
      this.writeTitle(context, String(deck.wins ?? 0));
      return;
    }
    if (display === 'losses') {
      this.writeTitle(context, String(deck.losses ?? 0));
      return;
    }
    if (display === 'rank') {
      const label = deck.rankShort || deck.rankLabel || String(deck.rank ?? '');
      this.writeTitle(context, label);
      return;
    }
    if (display === 'role') {
      const role = String(deck.role || '').toUpperCase() || 'ROLE';
      this.writeTitle(context, role);
    }
  }

  async setImageFromURL(context, url) {
    try {
      let dataUrl = this.imageCache.get(url);
      if (!dataUrl) {
        const { buffer, contentType } = await httpGetBuffer(url);
        const mime = String(contentType).split(';')[0] || 'image/png';
        dataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
        this.imageCache.set(url, dataUrl);
        if (this.imageCache.size > 64) {
          const first = this.imageCache.keys().next().value;
          this.imageCache.delete(first);
        }
      }
      this.plugin.setImage(context, dataUrl);
    } catch (err) {
      log.error('LiveHub setImage', err.message || err);
    }
  }

  statusPayload() {
    return {
      type: 'liveStatus',
      liveMode: this.enabled,
      baseUrl: this.baseUrl,
      connected: this.connected,
      buttons: this.buttons.size,
      deck: this.lastDeck
        ? {
            wins: this.lastDeck.wins,
            losses: this.lastDeck.losses,
            rankLabel: this.lastDeck.rankLabel,
            rankShort: this.lastDeck.rankShort,
            game: this.lastDeck.game,
            role: this.lastDeck.role
          }
        : null
    };
  }

  broadcastStatus() {
    try {
      this.plugin.sendToPropertyInspector(this.statusPayload());
    } catch {
      /* PI may be closed */
    }
  }
}

module.exports = {
  LiveHub,
  normalizeBase,
  inferDisplay,
  DEFAULT_BASE,
  httpGetJSON
};
