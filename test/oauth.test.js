'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/harness');

const TOKEN_URL = 'https://api.x.com/2/oauth2/token';
const ME_URL = 'https://api.x.com/2/users/me';

function jsonRes(obj, ok = true) {
  return { ok, status: ok ? 200 : 401, json: async () => obj };
}

function router(routes) {
  return async (url, init) => {
    for (const key of Object.keys(routes)) {
      if (String(url).startsWith(key)) { return routes[key](url, init); }
    }
    return Promise.reject(new Error('no route for ' + url));
  };
}

test('full callback success: exchange, users/me with Bearer auth, profile applied', async () => {
  const calls = [];
  const app = loadApp({
    location: { search: '?code=thecode&state=st123' },
    sessionStorage: (() => {
      const s = new (require('./helpers/harness').MemoryStorage)();
      s.setItem('2views_pkce', JSON.stringify({ verifier: 'the-verifier', state: 'st123' }));
      return s;
    })(),
    fetch: router({
      [TOKEN_URL]: async (url, init) => {
        assert.equal(new URLSearchParams(init.body).get('grant_type'), 'authorization_code');
        assert.equal(new URLSearchParams(init.body).get('code_verifier'), 'the-verifier');
        assert.equal(new URLSearchParams(init.body).get('client_id'), app.V2.config.X_OAUTH.clientId);
        calls.push('token');
        return jsonRes({ access_token: 'AT1', refresh_token: 'RT1', expires_in: 7200 });
      },
      [ME_URL]: async (url, init) => {
        calls.push('me');
        calls.push(init.headers['Authorization']);
        return jsonRes({ data: {
          id: '42', name: 'Ada Lovelace', username: 'ada',
          profile_image_url_https: 'https://pbs/x/img_normal.png'
        } });
      }
    })
  });
  const ok = await app.V2.oauth.handleCallbackIfPresent();
  assert.equal(ok, true);
  assert.deepEqual(calls, ['token', 'me', 'Bearer AT1'], 'X API requires the Bearer scheme');
  assert.deepEqual(app.V2.store.state.profile, {
    demo: false, name: 'Ada Lovelace', handle: '@ada', xid: '42',
    avatar: 'https://pbs/x/img_400x400.png'
  });
  const sess = JSON.parse(app.localStorage.getItem('2views_x_session'));
  assert.equal(sess.access, 'AT1');
  assert.equal(sess.refresh, 'RT1');
  assert.ok(sess.exp > Date.now());
  assert.equal(app.toasts[0], 'Signed in as @ada');
});

test('callback with an error param reports cancellation and keeps state untouched', async () => {
  const app = loadApp({ location: { search: '?error=access_denied' } });
  app.w.fetch = () => Promise.reject(new Error('must not fetch'));
  const ok = await app.V2.oauth.handleCallbackIfPresent();
  assert.equal(ok, false);
  assert.match(app.toasts[0], /cancelled/);
  assert.equal(app.localStorage.getItem('2views_x_session'), null);
});

test('callback with mismatched state refuses to exchange', async () => {
  const app = loadApp({
    location: { search: '?code=x&state=wrong' },
    sessionStorage: (() => {
      const s = new (require('./helpers/harness').MemoryStorage)();
      s.setItem('2views_pkce', JSON.stringify({ verifier: 'v', state: 'right' }));
      return s;
    })(),
    fetch: () => Promise.reject(new Error('must not fetch'))
  });
  const ok = await app.V2.oauth.handleCallbackIfPresent();
  assert.equal(ok, false);
  assert.match(app.toasts[0], /state mismatch/);
});

test('token exchange failure falls back to the demo profile', async () => {
  const app = loadApp({
    location: { search: '?code=x&state=s' },
    sessionStorage: (() => {
      const s = new (require('./helpers/harness').MemoryStorage)();
      s.setItem('2views_pkce', JSON.stringify({ verifier: 'v', state: 's' }));
      return s;
    })(),
    fetch: router({ [TOKEN_URL]: () => jsonRes({ error: 'bad' }, false) })
  });
  const ok = await app.V2.oauth.handleCallbackIfPresent();
  assert.equal(ok, false);
  assert.match(app.toasts[0], /X sign-in failed/);
  assert.equal(app.V2.store.state.profile.demo, true);
});

test('profile lookup failure keeps the session with an @x-user placeholder', async () => {
  const app = loadApp({
    location: { search: '?code=x&state=s' },
    sessionStorage: (() => {
      const s = new (require('./helpers/harness').MemoryStorage)();
      s.setItem('2views_pkce', JSON.stringify({ verifier: 'v', state: 's' }));
      return s;
    })(),
    fetch: router({
      [TOKEN_URL]: () => jsonRes({ access_token: 'AT2', refresh_token: null, expires_in: 7200 }),
      [ME_URL]: () => jsonRes({ error: 'tier limit' }, false)
    })
  });
  const ok = await app.V2.oauth.handleCallbackIfPresent();
  assert.equal(ok, true);
  assert.equal(app.V2.store.state.profile.demo, false);
  assert.equal(app.V2.store.state.profile.handle, '@x-user');
  assert.ok(app.localStorage.getItem('2views_x_session'));
  assert.match(app.toasts[0], /Profile lookup skipped/);
});

test('refreshIfNeeded skips fresh sessions and refreshes only when expiring', async () => {
  const app = loadApp();
  const fresh = { access: 'A', refresh: 'R', exp: Date.now() + 7200000 };
  app.localStorage.setItem('2views_x_session', JSON.stringify(fresh));
  app.w.fetch = () => Promise.reject(new Error('must not fetch'));
  await app.V2.oauth.refreshIfNeeded();
  assert.ok(app.localStorage.getItem('2views_x_session'), 'fresh session untouched');

  const app2 = loadApp({ storage: app.localStorage });
  app2.localStorage.setItem('2views_x_session', JSON.stringify({ access: 'A', refresh: 'R', exp: Date.now() - 1000 }));
  let refreshed = false;
  app2.w.fetch = router({
    [TOKEN_URL]: async (url, init) => {
      assert.equal(new URLSearchParams(init.body).get('grant_type'), 'refresh_token');
      assert.equal(new URLSearchParams(init.body).get('refresh_token'), 'R');
      refreshed = true;
      return jsonRes({ access_token: 'NEW', refresh_token: 'R2', expires_in: 7200 });
    }
  });
  await app2.V2.oauth.refreshIfNeeded();
  assert.equal(refreshed, true);
  const sess = JSON.parse(app2.localStorage.getItem('2views_x_session'));
  assert.equal(sess.access, 'NEW');
  assert.equal(sess.refresh, 'R2');

  const app3 = loadApp({ storage: app2.localStorage });
  app3.localStorage.setItem('2views_x_session', JSON.stringify({ access: 'A', refresh: 'R', exp: Date.now() - 1000 }));
  app3.w.fetch = router({ [TOKEN_URL]: () => jsonRes({ error: 'nope' }, false) });
  await app3.V2.oauth.refreshIfNeeded();
  assert.equal(app3.localStorage.getItem('2views_x_session'), null, 'failed refresh clears the session');
});

test('demoProfile sanitizes name and handle', () => {
  const app = loadApp();
  app.V2.oauth.demoProfile('Jane Doe 123!');
  assert.deepEqual(app.V2.store.state.profile, {
    demo: true, name: 'Jane Doe 123!', handle: '@janedoe123',
    xid: null, avatar: null
  });
  const app2 = loadApp();
  app2.V2.oauth.demoProfile('!!!');
  assert.equal(app2.V2.store.state.profile.handle, '@you', 'empty handle falls back to you');
});

test('clientId prefers the stored per-device id over the config default', () => {
  const app = loadApp();
  assert.equal(app.V2.oauth.configured(), true, 'config ships a default client id');
  app.V2.store.state.settings.xClientId = '  custom-id  ';
  assert.equal(app.V2.oauth.clientId(), 'custom-id');
});
