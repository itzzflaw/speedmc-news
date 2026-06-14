// =============================================
// Shared auth helpers for SpeedMC account system.
// Used by /functions/api/*.js — not a route itself.
// =============================================

const PBKDF2_ITERATIONS = 100000;
const SESSION_DAYS = 30;

function toHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16);
  return arr;
}

async function pbkdf2(password, salt, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return new Uint8Array(bits);
}

// Returns a string like "100000:<salt-hex>:<hash-hex>" — safe to store in D1.
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `${PBKDF2_ITERATIONS}:${toHex(salt)}:${toHex(hash)}`;
}

export async function verifyPassword(password, stored) {
  const [iterStr, saltHex, hashHex] = stored.split(':');
  const iterations = parseInt(iterStr, 10);
  const salt = fromHex(saltHex);
  const hash = await pbkdf2(password, salt, iterations);
  return toHex(hash) === hashHex;
}

export function generateToken() {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

export async function createSession(env, userId) {
  const token = generateToken();
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  await env.DB.prepare(
    "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)"
  ).bind(token, userId, expiresAt).run();
  return { token, expiresAt };
}

export function sessionCookie(token) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  return `session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return `session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function getSessionUser(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/session=([a-f0-9]+)/);
  if (!match) return null;
  const token = match[1];

  const session = await env.DB.prepare(
    "SELECT user_id, expires_at FROM sessions WHERE token = ?"
  ).bind(token).first();
  if (!session || session.expires_at < Date.now()) return null;

  const user = await env.DB.prepare(
    "SELECT id, email, discord_id, discord_username, discord_avatar, mc_username, mc_uuid, mc_verified, role, created_at FROM users WHERE id = ?"
  ).bind(session.user_id).first();
  return user;
}

// Roles other than "member" are considered staff.
export async function requireStaff(request, env) {
  const user = await getSessionUser(request, env);
  if (!user || user.role === 'member') return null;
  return user;
}

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders }
  });
}
