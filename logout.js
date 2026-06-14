// POST /api/register
// Body: { email, password }
// Creates a new account and logs the user in (sets session cookie).

import { hashPassword, createSession, sessionCookie, json } from "../_lib/auth.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";

  if (!EMAIL_RE.test(email)) {
    return json({ error: "Enter a valid email address." }, 400);
  }
  if (password.length < 8) {
    return json({ error: "Password must be at least 8 characters." }, 400);
  }

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email).first();
  if (existing) {
    return json({ error: "An account with that email already exists." }, 409);
  }

  const passwordHash = await hashPassword(password);
  const now = Date.now();

  const result = await env.DB.prepare(
    "INSERT INTO users (email, password_hash, role, created_at) VALUES (?, ?, 'member', ?)"
  ).bind(email, passwordHash, now).run();

  const userId = result.meta.last_row_id;
  const session = await createSession(env, userId);

  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(session.token) });
}
