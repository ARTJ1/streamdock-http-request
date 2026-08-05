const http = require('http');
const https = require('https');
const { URL } = require('url');
const { Plugins, Actions, log } = require('./utils/plugin');

const plugin = new Plugins();

const DEFAULTS = {
  url: 'http://127.0.0.1:19123/api/win',
  method: 'GET',
  headers: '',
  body: '',
  contentType: 'application/json',
  showStatus: true,
  timeout: 5000
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

async function runRequest(context, settings) {
  const cfg = Object.assign({}, DEFAULTS, settings || {});
  try {
    const result = await sendHttpRequest(cfg);
    const ok = result.statusCode >= 200 && result.statusCode < 300;
    log.info(`${cfg.method} ${cfg.url} -> ${result.statusCode}`);
    if (cfg.showStatus) {
      if (ok) plugin.showOk(context);
      else plugin.showAlert(context);
    }
    plugin.sendToPropertyInspector({
      type: 'result',
      ok,
      statusCode: result.statusCode,
      body: result.body?.slice(0, 500) || ''
    });
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

plugin.request = new Actions({
  default: { ...DEFAULTS },

  _willAppear({ context }) {
    const settings = this.data[context] || DEFAULTS;
    if (!settings.url) {
      plugin.setSettings(context, { ...DEFAULTS });
      this.data[context] = { ...DEFAULTS };
    }
  },

  async keyDown({ context }) {
    await runRequest(context, this.data[context]);
  },

  async sendToPlugin({ context, payload }) {
    if (payload?.type === 'test') {
      await runRequest(context, this.data[context]);
    }
  }
});
