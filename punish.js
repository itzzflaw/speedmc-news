// GET /api/auth/discord-callback
// Discord redirects here after the user approves the app.
//
// - If the visitor has an existing session, Discord gets LINKED to that account.
// - Otherwise: if a user already exists with this discord_id, log in as them.
//   If not, create a new account with this discord_id.

import { getSessionUser, createSession, sessionCookie } from "../../_lib/auth.js";

function redirect(location, cookies = []) {
  const headers = new Headers();
  headers.set("Location", location);
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookie = request.headers.get("Cookie") || "";

  const stateMatch = cookie.match(/discord_oauth_state=([a-f0-9]+)/);
  const clearState = `discord_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

  if (!code || !state || !stateMatch || stateMatch[1] !== state) {
    return redirect("/login.html?error=oauth_state", [clearState]);
  }

  // Exchange the code for an access token
  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: env.DISCORD_REDIRECT_URI
    })
  });

  if (!tokenRes.ok) {
    return redirect("/login.html?error=oauth_token", [clearState]);
  }
  const tokenData = await tokenRes.json();

  // Fetch the Discord profile
  const profileRes = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });
  if (!profileRes.ok) {
    return redirect("/login.html?error=oauth_profile", [clearState]);
  }
  const discordUser = await profileRes.json();

  const username = discordUser.discriminator && discordUser.discriminator !== "0"
    ? `${discordUser.username}#${discordUser.discriminator}`
    : discordUser.username;

  const avatar = discordUser.avatar
    ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
    : null;

  const now = Date.now();

  // Is the visitor already logged in? If so, this is a "link" action.
  const existingSessionUser = await getSessionUser(request, env);

  const ownerOfDiscordId = await env.DB.prepare("SELECT id FROM users WHERE discord_id = ?")
    .bind(discordUser.id).first();

  if (existingSessionUser) {
    if (ownerOfDiscordId && ownerOfDiscordId.id !== existingSessionUser.id) {
      return redirect("/account.html?error=discord_in_use", [clearState]);
    }

    await env.DB.prepare(
      "UPDATE users SET discord_id = ?, discord_username = ?, discord_avatar = ? WHERE id = ?"
    ).bind(discordUser.id, username, avatar, existingSessionUser.id).run();

    return redirect("/account.html?linked=discord", [clearState]);
  }

  // No existing session — log in or create an account
  let userId;
  if (ownerOfDiscordId) {
    userId = ownerOfDiscordId.id;
    await env.DB.prepare(
      "UPDATE users SET discord_username = ?, discord_avatar = ? WHERE id = ?"
    ).bind(username, avatar, userId).run();
  } else {
    const result = await env.DB.prepare(
      "INSERT INTO users (email, discord_id, discord_username, discord_avatar, role, created_at) VALUES (?, ?, ?, ?, 'member', ?)"
    ).bind(discordUser.email || null, discordUser.id, username, avatar, now).run();
    userId = result.meta.last_row_id;
  }

  const session = await createSession(env, userId);

  return redirect("/account.html", [sessionCookie(session.token), clearState]);
}
