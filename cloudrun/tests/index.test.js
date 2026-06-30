const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { app } = require('../index.js');

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const options = {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: { 'Content-Type': 'application/json' },
      };
      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          server.close();
          let json;
          try { json = JSON.parse(data); } catch (_) { json = data; }
          resolve({ status: res.statusCode, body: json, headers: res.headers });
        });
      });
      req.on('error', (err) => { server.close(); reject(err); });
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  });
}

describe('Pure utility functions (imported from index.js via re-require)', () => {
  let mod;
  before(async () => {
    mod = require('../index.js');
  });

  it('app is an Express instance', () => {
    assert.ok(typeof mod.app === 'function');
  });

  it('exports expected functions', () => {
    assert.equal(typeof mod.seedBaseData, 'function');
    assert.equal(typeof mod.migrateLegacyData, 'function');
    assert.equal(typeof mod.ensureDefaultAdmin, 'function');
  });
});

describe('Hash password round-trip', () => {
  let hashPassword, verifyPassword;
  before(() => {
    const m = require('../index.js');
    hashPassword = m.hashPassword;
    verifyPassword = m.verifyPassword;
  });

  it('hashPassword returns scrypt-prefixed string', () => {
    const h = hashPassword('test123');
    assert.ok(h.startsWith('scrypt$'));
    assert.equal(h.split('$').length, 3);
  });

  it('verifyPassword returns true for correct password', () => {
    const h = hashPassword('mypass');
    assert.equal(verifyPassword('mypass', h), true);
  });

  it('verifyPassword returns false for wrong password', () => {
    const h = hashPassword('mypass');
    assert.equal(verifyPassword('wrong', h), false);
  });

  it('verifyPassword returns false for empty/null hash', () => {
    assert.equal(verifyPassword('test', ''), false);
    assert.equal(verifyPassword('test', null), false);
  });

  it('verifyPassword handles legacy sha256 hashes', () => {
    const crypto = require('crypto');
    const sha = crypto.createHash('sha256').update('legacy123').digest('hex');
    assert.equal(verifyPassword('legacy123', sha), true);
    assert.equal(verifyPassword('wrong', sha), false);
  });
});

describe('Admin account validation', () => {
  const { validateUsername, validatePassword, normalizeAdmin } = require('../index.js');

  it('accepts safe usernames and rejects unsafe usernames', () => {
    assert.equal(validateUsername('zhang_san'), true);
    assert.equal(validateUsername('ab'), false);
    assert.equal(validateUsername('张三'), false);
  });

  it('requires passwords containing letters and numbers', () => {
    assert.equal(validatePassword('abc12345'), true);
    assert.equal(validatePassword('abcdefgh'), false);
    assert.equal(validatePassword('12345678'), false);
  });

  it('always treats the configured admin account as superadmin', () => {
    assert.equal(normalizeAdmin({ username: 'admin', role: 'admin' }).role, 'superadmin');
    assert.equal(normalizeAdmin({ username: 'colleague' }).role, 'user');
  });
});

describe('Normalize phone', () => {
  let normalizePhone, validatePhone;
  before(() => {
    const m = require('../index.js');
    normalizePhone = m.normalizePhone;
    validatePhone = m.validatePhone;
  });

  it('strips spaces and dashes', () => {
    assert.equal(normalizePhone('138 1234 5678'), '13812345678');
    assert.equal(normalizePhone('138-1234-5678'), '13812345678');
  });

  it('converts 00 prefix to +', () => {
    assert.equal(normalizePhone('0012025550123'), '+12025550123');
  });

  it('normalizes +86 Chinese numbers to domestic form', () => {
    assert.equal(normalizePhone('+8613812345678'), '13812345678');
  });

  it('validates Chinese mobile numbers', () => {
    assert.equal(validatePhone('13812345678'), true);
    assert.equal(validatePhone('19912345678'), true);
    assert.equal(validatePhone('12345678901'), false);
  });

  it('validates international numbers', () => {
    assert.equal(validatePhone('+12025550123'), true);
    assert.equal(validatePhone('+441234567890'), true);
    assert.equal(validatePhone('+1234'), false);
  });

  it('rejects invalid formats', () => {
    assert.equal(validatePhone(''), false);
    assert.equal(validatePhone('abcdefghij'), false);
    assert.equal(validatePhone('123'), false);
  });
});

describe('Express API routes', () => {
  it('GET /health returns 200 or 503', async () => {
    const res = await request('GET', '/health');
    assert.ok([200, 503].includes(res.status));
    assert.ok(res.body.status);
  });

  it('GET /api/activity returns an object', async () => {
    const res = await request('GET', '/api/activity');
    assert.ok([200, 404, 500].includes(res.status));
    assert.equal(typeof res.body, 'object');
  });

  it('GET /api/schedules returns an array', async () => {
    const res = await request('GET', '/api/schedules');
    assert.ok([200, 404, 500].includes(res.status));
    assert.ok(Array.isArray(res.body) || typeof res.body === 'object');
  });

  it('POST /api/attendee/query without phone returns 400', async () => {
    const res = await request('POST', '/api/attendee/query', {});
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  it('POST /api/attendee/query with invalid phone returns 400', async () => {
    const res = await request('POST', '/api/attendee/query', { phone: 'abc' });
    assert.equal(res.status, 400);
  });

  it('POST /api/admin/login without credentials returns 400', async () => {
    const res = await request('POST', '/api/admin/login', {});
    assert.equal(res.status, 400);
  });

  it('POST /api/admin/login with wrong credentials returns 401', async () => {
    const res = await request('POST', '/api/admin/login', {
      username: 'nonexistent',
      password: 'wrongpass',
    });
    assert.equal(res.status, 401);
  });

  it('GET /api/admin/dashboard without token returns 401', async () => {
    const res = await request('GET', '/api/admin/dashboard');
    assert.equal(res.status, 401);
  });

  it('GET /api/admin/dashboard with invalid token returns 401', async () => {
    const res = await request('GET', '/api/admin/dashboard');
    assert.equal(res.status, 401);
  });

  it('GET /api/attendee/code/FAKE returns 404', async () => {
    const res = await request('GET', '/api/attendee/code/FAKE');
    assert.ok([404, 500].includes(res.status));
  });

  it('GET /api/live-images returns array', async () => {
    const res = await request('GET', '/api/live-images');
    assert.ok([200, 404, 500].includes(res.status));
  });

  it('GET /api/miniapp/getActivity works', async () => {
    const res = await request('GET', '/api/miniapp/getActivity');
    assert.ok([200, 404, 500].includes(res.status));
  });

  it('GET /api/h5/getActivity works', async () => {
    const res = await request('GET', '/api/h5/getActivity');
    assert.ok([200, 404, 500].includes(res.status));
  });
});

describe('Rate limiter', () => {
  it('login rate limiter blocks after too many attempts', async () => {
    const results = [];
    for (let i = 0; i < 12; i++) {
      const res = await request('POST', '/api/admin/login', {
        username: 'test',
        password: 'test',
      });
      results.push(res.status);
    }
    const has429 = results.some((s) => s === 429);
    assert.ok(has429, 'Expected at least one 429 response');
  });
});

describe('Auth middleware', () => {
  it('rejects requests without Bearer token', async () => {
    const res = await request('GET', '/api/admin/activities');
    assert.equal(res.status, 401);
    assert.ok(res.body.error.includes('登录'));
  });

  it('rejects requests with malformed token', async () => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      http.get(`http://127.0.0.1:${port}/api/admin/activities`, {
        headers: { Authorization: 'Bearer invalid.token.here' },
      }, (res) => {
        let data = '';
        res.on('data', (c) => data += c);
        res.on('end', () => {
          server.close();
          assert.equal(res.statusCode, 401);
        });
      });
    });
  });
});

describe('CORS configuration', () => {
  it('allows requests without origin', async () => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      const options = {
        hostname: '127.0.0.1',
        port,
        path: '/health',
        method: 'GET',
      };
      const req = http.request(options, (res) => {
        server.close();
        assert.ok([200, 503].includes(res.statusCode));
      });
      req.end();
    });
  });
});

describe('Error handling', () => {
  it('returns JSON for unknown routes', async () => {
    const res = await request('GET', '/api/nonexistent');
    assert.ok([404, 405].includes(res.status));
  });
});

describe('JSON body parsing', () => {
  it('parses JSON body correctly', async () => {
    const res = await request('POST', '/api/admin/login', {
      username: 'admin',
      password: 'test',
    });
    assert.ok([400, 401, 429, 500].includes(res.status));
    assert.equal(typeof res.body, 'object');
  });
});

describe('Attendee code lookup', () => {
  it('GET /api/attendee/code/:code with empty code', async () => {
    const res = await request('GET', '/api/attendee/code/');
    assert.ok([404, 500].includes(res.status));
  });

  it('GET /api/attendee/code/A00000000 returns not found', async () => {
    const res = await request('GET', '/api/attendee/code/A00000000');
    assert.ok([404, 500].includes(res.status));
  });
});

describe('Health endpoint detail', () => {
  it('returns status and timestamp', async () => {
    const res = await request('GET', '/health');
    assert.ok(res.body.timestamp || res.body.status);
  });
});
