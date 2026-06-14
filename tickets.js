// POST /api/unlink-discord
// Removes the linked Discord account — only allowed if the user has another
// way to log in (email+password), so they don't lock themselves out.

import { getSessionUser, json } from "../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "You must be logged in." }, 401);

  if (!user.email || !(await hasPassword(env, user.id))) {
    return json({ error: "Set up an email + password before unlinking Discord, or you'll be locked out." }, 400);
  }

  await env.DB.prepare(
    "UPDATE users SET discord_id = NULL, discord_username = NULL, discord_avatar = NULL WHERE id = ?"
  ).bind(user.id).run();

  return json({ ok: true });
}

async function hasPassword(env, userId) {
  const row = await env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(userId).first();
  return !!(row && row.password_hash);
}
