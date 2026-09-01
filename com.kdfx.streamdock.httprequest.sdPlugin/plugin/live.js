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

  const url = String(settings.url || '').toLowerCase();
  if (url.includes('/api/win')) return 'wins';
  if (url.includes('/api/loss')) return 'losses';
  if (url.includes('/api/rank')) return 'rank';
  if (url.includes('/api/role')) return 'role';
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
    this.imageCache = new Map(); // url -> dataUrl
    this.applying = false;
  }

  setGlobal(globalSettings = {}) {
    // Default off so existing installs keep fire-and-forget behavior until enabled.
    const enabled = Boolean(globalSettings.liveMode);
    const base = normalizeBase(globalSettings.baseUrl || DEFAULT_BASE);
    const changed = enabled !== this.enabled || base !== this.baseUrl;
    this.enabled = enabled;
    this.baseUrl = base;
    if (changed) {
      this.restart();
    } else {
      this.ensureRunning();
    }
    this.broadcastStatus();
  }

  register(context, settings) {
    this.buttons.set(context, settings || {});
    this.ensureRunning();
    if (this.lastDeck) {
      this.applyOne(context, settings || {}, this.lastDeck);
    }
    this.broadcastStatus();
  }

  unregister(context) {
    this.buttons.delete(context);
    if (this.buttons.size === 0) {
      this.stop();
    }
    this.broadcastStatus();
  }

  updateSettings(context, settings) {
    if (!this.buttons.has(context)) return;
    this.buttons.set(context, settings || {});
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
          // If WS deck lacks rankLabel (old server), refresh via HTTP
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
    if (!this.enabled || this.buttons.size === 0) return;
    try {
      const deck = await httpGetJSON(`${this.baseUrl}/api/deck/state`);
      deck.rankImageUrl = absURL(this.baseUrl, deck.rankImageUrl);
      deck.roleImageUrl = absURL(this.baseUrl, deck.roleImageUrl);
      this.onDeck(deck);
      if (!this.connected) {
        // HTTP works even if WS is down
        this.broadcastStatus();
      }
    } catch (err) {
      log.error('LiveHub poll failed', err.message || err);
      this.broadcastStatus();
    }
  }

  onDeck(deck) {
    this.lastDeck = deck;
    for (const [context, settings] of this.buttons.entries()) {
      this.applyOne(context, settings, deck);
    }
  }

  applyOne(context, settings, deck) {
    if (!this.enabled) return;
    const display = inferDisplay(settings);
    if (display === 'none') return;

    if (display === 'wins') {
      this.plugin.setTitle(context, String(deck.wins ?? 0));
      return;
    }
    if (display === 'losses') {
      this.plugin.setTitle(context, String(deck.losses ?? 0));
      return;
    }
    if (display === 'rank') {
      const label = deck.rankShort || deck.rankLabel || String(deck.rank ?? '');
      this.plugin.setTitle(context, label);
      // Rank is short text on C4 live pack — do not replace button art with rank PNG
      return;
    }
    if (display === 'role') {
      const role = String(deck.role || '').toUpperCase() || 'ROLE';
      this.plugin.setTitle(context, role);
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
