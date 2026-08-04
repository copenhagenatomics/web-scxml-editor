const test = require('node:test');
const assert = require('node:assert/strict');

process.env.ALLOWED_ORIGIN = 'http://localhost:3000';

const app = require('../index.js');

const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
const GITHUB_DEVICE_TOKEN_URL = 'https://github.com/login/oauth/access_token';

// Intercept only the outbound call to the given GitHub URL; let any other
// fetch (e.g. the test client hitting our own local server) pass through to
// the real global fetch.
function mockGithubResponse(url, status, payload) {
  const realFetch = global.fetch;
  global.fetch = async (reqUrl, opts) => {
    if (typeof reqUrl === 'string' && reqUrl === url) {
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => payload,
      };
    }
    return realFetch(reqUrl, opts);
  };
  return () => {
    global.fetch = realFetch;
  };
}

function mockGithubNetworkFailure(url) {
  const realFetch = global.fetch;
  global.fetch = async (reqUrl, opts) => {
    if (typeof reqUrl === 'string' && reqUrl === url) {
      throw new Error('getaddrinfo ENOTFOUND github.com');
    }
    return realFetch(reqUrl, opts);
  };
  return () => {
    global.fetch = realFetch;
  };
}

function mockGithubUnparseableResponse(url) {
  const realFetch = global.fetch;
  global.fetch = async (reqUrl, opts) => {
    if (typeof reqUrl === 'string' && reqUrl === url) {
      return {
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('not json');
        },
      };
    }
    return realFetch(reqUrl, opts);
  };
  return () => {
    global.fetch = realFetch;
  };
}

async function withServer(fn) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('GET /healthz returns 200 with status ok', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/healthz`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { status: 'ok' });
  });
});

test('POST /api/github/device/code relays the request body to GitHub and passes through its response', async () => {
  const restore = mockGithubResponse(GITHUB_DEVICE_CODE_URL, 200, {
    device_code: 'dc-1',
    user_code: 'ABCD-1234',
    verification_uri: 'https://github.com/login/device',
    expires_in: 900,
    interval: 5,
  });
  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/github/device/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: 'client-1', scope: 'repo' }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.deepEqual(body, {
        device_code: 'dc-1',
        user_code: 'ABCD-1234',
        verification_uri: 'https://github.com/login/device',
        expires_in: 900,
        interval: 5,
      });
    });
  } finally {
    restore();
  }
});

test('POST /api/github/device/code passes through a GitHub error with the same status', async () => {
  const restore = mockGithubResponse(GITHUB_DEVICE_CODE_URL, 404, { error: 'Not Found' });
  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/github/device/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: 'bad-client', scope: 'repo' }),
      });
      assert.equal(res.status, 404);
      const body = await res.json();
      assert.deepEqual(body, { error: 'Not Found' });
    });
  } finally {
    restore();
  }
});

test('POST /api/github/device/token relays authorization_pending verbatim', async () => {
  const restore = mockGithubResponse(GITHUB_DEVICE_TOKEN_URL, 200, { error: 'authorization_pending' });
  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/github/device/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: 'client-1',
          device_code: 'dc-1',
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.deepEqual(body, { error: 'authorization_pending' });
    });
  } finally {
    restore();
  }
});

test('POST /api/github/device/token relays a successful access token', async () => {
  const restore = mockGithubResponse(GITHUB_DEVICE_TOKEN_URL, 200, {
    access_token: 'gho_abc123',
    token_type: 'bearer',
    scope: 'repo',
  });
  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/github/device/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: 'client-1',
          device_code: 'dc-1',
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.deepEqual(body, {
        access_token: 'gho_abc123',
        token_type: 'bearer',
        scope: 'repo',
      });
    });
  } finally {
    restore();
  }
});

test('POST /api/github/device/code returns 502 when GitHub cannot be reached', async () => {
  const restore = mockGithubNetworkFailure(GITHUB_DEVICE_CODE_URL);
  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/github/device/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: 'client-1', scope: 'repo' }),
      });
      assert.equal(res.status, 502);
      const body = await res.json();
      assert.equal(body.error, 'upstream_request_failed');
    });
  } finally {
    restore();
  }
});

test('POST /api/github/device/token returns 502 when GitHub returns an unparseable body', async () => {
  const restore = mockGithubUnparseableResponse(GITHUB_DEVICE_TOKEN_URL);
  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/github/device/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: 'client-1',
          device_code: 'dc-1',
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      });
      assert.equal(res.status, 502);
      const body = await res.json();
      assert.equal(body.error, 'upstream_invalid_response');
    });
  } finally {
    restore();
  }
});

test('POST /api/github/device/code returns a generic 400 (no stack trace) for malformed JSON body', async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/github/device/code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad json',
    });
    assert.equal(res.status, 400);
    const contentType = res.headers.get('content-type') || '';
    assert.ok(contentType.includes('application/json'), `expected JSON response, got content-type: ${contentType}`);
    const body = await res.json();
    assert.deepEqual(body, {
      error: 'internal_error',
      error_description: 'Unexpected server error.',
    });
    const rawText = JSON.stringify(body);
    assert.ok(!rawText.includes('at parse'), 'response must not contain a stack trace');
    assert.ok(!rawText.toLowerCase().includes('.js:'), 'response must not reference internal file paths');
  });
});
