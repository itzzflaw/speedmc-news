// GET /api/auth/discord-login
// Redirects to Discord's OAuth consent screen.
//
// Requires these Pages environment variables:
//   DISCORD_CLIENT_ID
//   DISCORD_CLIENT_SECRET   (secret)
//   DISCORD_REDIRECT_URI    e.g. https://ascendmc.club/api/auth/discord-callback
//
// If the visitor already has a session (they're logged in via email), this
// will LINK Discord to their existing account instead of creating a new one.

import { generateToken } from "../../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_REDIRECT_URI) {
    return new Response("Discord login is not configured yet.", { status: 500 });
  }

  const state = generateToken().slice(0, 32);

  const url = new URL("https://discord.com/api/oauth2/authorize");
  url.searchParams.set("client_id", env.DISCORD_CLIENT_ID);
  url.searchParams.set("redirect_uri", env.DISCORD_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "identify email");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "consent");

  return new Response(null, {
    status: 302,
    headers: {
      "Location": url.toString(),
      "Set-Cookie": `discord_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
    }
  });
}
