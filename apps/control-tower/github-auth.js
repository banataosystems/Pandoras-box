const OAUTH_VERIFIER_KEY = 'mcpmaster-github-oauth-verifier';
const OAUTH_COOKIE_NAME = 'mcpmaster_github_pkce';
const OAUTH_MAX_AGE_MS = 10 * 60 * 1000;
const CALLBACK_MARKER = 'github';

let configPromise = null;
let callbackPromise = null;

function encodeBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function createVerifier() {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return encodeBase64Url(bytes);
}

async function createChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return encodeBase64Url(new Uint8Array(digest));
}

function parseVerifierRecord(raw) {
  try {
    const record = JSON.parse(raw || '');
    const verifier = typeof record?.verifier === 'string' ? record.verifier : '';
    const createdAt = Number(record?.createdAt);
    if (verifier.length < 43 || verifier.length > 128) return '';
    if (!Number.isFinite(createdAt) || Date.now() - createdAt > OAUTH_MAX_AGE_MS || createdAt > Date.now() + 30_000) return '';
    return verifier;
  } catch {
    return '';
  }
}

function cookieValue(name) {
  const prefix = `${encodeURIComponent(name)}=`;
  for (const part of document.cookie.split(';')) {
    const value = part.trim();
    if (value.startsWith(prefix)) return decodeURIComponent(value.slice(prefix.length));
  }
  return '';
}

function storeVerifier(verifier) {
  const record = JSON.stringify({ verifier, createdAt: Date.now() });
  let stored = false;
  try {
    sessionStorage.setItem(OAUTH_VERIFIER_KEY, record);
    stored = sessionStorage.getItem(OAUTH_VERIFIER_KEY) === record;
  } catch {
    // The secure same-site cookie below is the mobile-browser fallback.
  }
  document.cookie = `${encodeURIComponent(OAUTH_COOKIE_NAME)}=${encodeURIComponent(record)}; Max-Age=600; Path=/; SameSite=Lax; Secure`;
  stored = stored || cookieValue(OAUTH_COOKIE_NAME) === record;
  if (!stored) throw new Error('This browser blocked the temporary GitHub sign-in verifier. Allow cookies for MCPMaster and try again.');
}

function readVerifier() {
  let record = '';
  try {
    record = sessionStorage.getItem(OAUTH_VERIFIER_KEY) || '';
  } catch {
    // Fall back to the short-lived same-site cookie.
  }
  return parseVerifierRecord(record) || parseVerifierRecord(cookieValue(OAUTH_COOKIE_NAME));
}

function clearTemporaryState() {
  try {
    sessionStorage.removeItem(OAUTH_VERIFIER_KEY);
  } catch {
    // Cookie cleanup still runs below.
  }
  document.cookie = `${encodeURIComponent(OAUTH_COOKIE_NAME)}=; Max-Age=0; Path=/; SameSite=Lax; Secure`;
}

function cleanCallbackUrl() {
  const url = new URL(window.location.href);
  ['code', 'error', 'error_code', 'error_description', 'oauth_callback'].forEach((key) => {
    url.searchParams.delete(key);
  });
  const query = url.searchParams.toString();
  window.history.replaceState({}, document.title, `${url.pathname}${query ? `?${query}` : ''}${url.hash}`);
}

async function loadConfig() {
  if (!configPromise) {
    configPromise = fetch('/api/operator/auth/config', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    }).then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || payload?.error || 'Unable to load Supabase Auth configuration');
      if (!payload.supabaseUrl || !payload.supabasePublishableKey) throw new Error('Supabase Auth configuration is incomplete');
      return payload;
    });
  }
  return configPromise;
}

async function beginGitHubSignIn() {
  clearTemporaryState();
  const config = await loadConfig();
  const verifier = createVerifier();
  const challenge = await createChallenge(verifier);
  storeVerifier(verifier);

  const redirectTo = new URL('/', window.location.origin);
  redirectTo.searchParams.set('oauth_callback', CALLBACK_MARKER);

  const authorizationUrl = new URL('/auth/v1/authorize', config.supabaseUrl);
  authorizationUrl.searchParams.set('provider', 'github');
  authorizationUrl.searchParams.set('redirect_to', redirectTo.toString());
  authorizationUrl.searchParams.set('code_challenge', challenge);
  authorizationUrl.searchParams.set('code_challenge_method', 's256');
  window.location.assign(authorizationUrl.toString());
}

async function exchangeCodeForSession(code, verifier) {
  const config = await loadConfig();
  const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=pkce`, {
    method: 'POST',
    redirect: 'error',
    headers: {
      apikey: config.supabasePublishableKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.msg || payload?.message || payload?.error_description || 'GitHub authentication could not be completed');
  }
  if (typeof payload?.access_token !== 'string' || payload.access_token.length < 20) {
    throw new Error('Supabase did not return an authenticated session');
  }
  return payload;
}

async function consumeCallback() {
  const url = new URL(window.location.href);
  const callbackMarker = url.searchParams.get('oauth_callback');
  const code = url.searchParams.get('code');
  const providerError = url.searchParams.get('error_description') || url.searchParams.get('error');

  if (callbackMarker !== CALLBACK_MARKER && !code && !providerError) return null;

  try {
    if (providerError) throw new Error(providerError);
    if (!code) throw new Error('GitHub authentication returned without an authorization code');
    const verifier = readVerifier();
    if (!verifier) {
      throw new Error('GitHub sign-in could not be resumed on this browser. Tap Continue with GitHub again.');
    }
    return await exchangeCodeForSession(code, verifier);
  } finally {
    cleanCallbackUrl();
    clearTemporaryState();
  }
}

function showButtonError(button, message) {
  button.disabled = false;
  button.textContent = 'Continue with GitHub';
  const overlay = button.closest('#operator-auth-overlay');
  const alert = overlay?.querySelector('[data-auth-error]');
  if (alert) {
    alert.hidden = false;
    alert.querySelector('strong').textContent = 'GitHub sign-in failed';
    alert.querySelector('p').textContent = message;
  }
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-github-signin]');
  if (!button) return;
  event.preventDefault();
  if (button.disabled) return;
  button.disabled = true;
  button.textContent = 'Opening GitHub…';
  try {
    await beginGitHubSignIn();
  } catch (error) {
    showButtonError(button, error?.message || 'Unable to start GitHub sign-in');
  }
});

window.MCPMasterGitHubAuth = Object.freeze({
  begin: beginGitHubSignIn,
  consumeCallback() {
    if (!callbackPromise) callbackPromise = consumeCallback();
    return callbackPromise;
  },
  clearTemporaryState,
});
