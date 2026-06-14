// POST /api/unlink-minecraft
// Removes the linked Minecraft account from the current user.

import { getSessionUser, json } from "../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "You must be logged in." }, 401);

  await env.DB.prepare("UPDATE users SET mc_username = NULL, mc_uuid = NULL, mc_verified = 0 WHERE id = ?")
    .bind(user.id).run();

  return json({ ok: true });
}
