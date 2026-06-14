// GET /api/me
// Returns the currently logged-in user (or null) based on the session cookie.

import { getSessionUser, json } from "../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  const user = await getSessionUser(request, env);
  return json({ user: user || null });
}
