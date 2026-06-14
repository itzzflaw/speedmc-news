// =============================================
// Thin wrapper around Discord's REST API, used for the ticket reply panel.
//
// Requires a Pages environment variable:
//   DISCORD_BOT_TOKEN — your bot's token (use the ROTATED one, not the
//                        one that was in Settings/conf.json)
// =============================================

const DISCORD_API = "https://discord.com/api/v10";

export async function discordFetch(env, path, options = {}) {
  if (!env.DISCORD_BOT_TOKEN) {
    throw new Error("DISCORD_BOT_TOKEN is not configured — see README-TICKET-REPLY.md.");
  }

  const res = await fetch(`${DISCORD_API}${path}`, {
    ...options,
    headers: {
      "Authorization": `Bot ${env.DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  return res;
}

// Confirms a channel_id corresponds to a ticket we know about, so staff
// can only message ticket channels through this panel — not arbitrary
// channels in your server.
export async function isKnownTicketChannel(env, channelId) {
  const row = await env.DB.prepare("SELECT 1 FROM tickets WHERE channel_id = ?").bind(channelId).first();
  return !!row;
}
