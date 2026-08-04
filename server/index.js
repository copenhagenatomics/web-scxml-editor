require('dotenv').config();

const express = require('express');
const cors = require('cors');

const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
const GITHUB_DEVICE_TOKEN_URL = 'https://github.com/login/oauth/access_token';

const REQUIRED_ENV_VARS = ['ALLOWED_ORIGIN'];

function assertRequiredEnvVars(env) {
  const missing = REQUIRED_ENV_VARS.filter((name) => !env[name]);
  if (missing.length > 0) {
    console.error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Copy .env.example to .env and fill in the values.'
    );
    process.exit(1);
  }
}

// Only enforced when actually running the server (see require.main guard below),
// so requiring this module in tests with a partial env doesn't exit the process.
if (require.main === module) {
  assertRequiredEnvVars(process.env);
}

const app = express();

app.use(express.json());
app.use(cors({ origin: process.env.ALLOWED_ORIGIN }));

app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

/**
 * Both GitHub Device Flow endpoints don't send CORS headers, so a browser
 * can't call them directly - this is a dumb same-origin relay that forwards
 * the request body to `githubUrl` and returns GitHub's JSON response
 * verbatim (status + body). Device Flow needs no client_secret (confirmed
 * against GitHub's own docs), so unlike the Authorization Code Flow this
 * replaced, this relay never handles or stores any secret - it's purely a
 * CORS workaround, and all the OAuth semantics (interpreting error codes,
 * polling/backoff) live entirely in the browser-side `oauth.ts`.
 */
function relayToGithub(githubUrl) {
  return async (req, res) => {
    let githubResponse;
    try {
      githubResponse = await fetch(githubUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(req.body || {}),
      });
    } catch (err) {
      return res.status(502).json({
        error: 'upstream_request_failed',
        error_description: 'Could not reach GitHub.',
      });
    }

    let data;
    try {
      data = await githubResponse.json();
    } catch (err) {
      return res.status(502).json({
        error: 'upstream_invalid_response',
        error_description: 'GitHub returned a response that could not be parsed as JSON.',
      });
    }

    return res.status(githubResponse.status).json(data);
  };
}

app.post('/api/github/device/code', relayToGithub(GITHUB_DEVICE_CODE_URL));
app.post('/api/github/device/token', relayToGithub(GITHUB_DEVICE_TOKEN_URL));

// Final error handler: catches anything unhandled above (e.g. malformed JSON
// bodies thrown by express.json()) and returns a generic error instead of
// letting Express's default handler leak a stack trace / file paths to the
// client.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({
    error: 'internal_error',
    error_description: 'Unexpected server error.',
  });
});

const PORT = process.env.PORT || 4000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`scxml-github-auth-server listening on port ${PORT}`);
  });
}

module.exports = app;
