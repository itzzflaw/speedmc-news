// =============================================
// TicketSync.js
// Drop this into Src/Functions/ in your ticket bot.
//
// Sends a snapshot of currently-open tickets to the SpeedMC dashboard
// every minute, so staff can see them at /dashboard.html.
//
// Setup:
//   1. Place this file at Src/Functions/TicketSync.js
//   2. In Events/Ready.js, near the other setInterval calls, add:
//
//        const TicketSync = require("../Src/Functions/TicketSync");
//        TicketSync(client); // initial sync
//        setInterval(() => TicketSync(client), 60 * 1000); // every minute
//
//   3. Set these in your bot's environment (or Settings/conf.json, your call):
//        TICKET_SYNC_URL    = https://ascendmc.club/api/staff/tickets-sync
//        TICKET_SYNC_SECRET = <a long random string>
//
//      Add the SAME secret as an environment variable on your Cloudflare
//      Pages project as TICKET_SYNC_SECRET.
// =============================================

const fetch = require("node-fetch");

const SYNC_URL = process.env.TICKET_SYNC_URL || "https://ascendmc.club/api/staff/tickets-sync";
const SYNC_SECRET = process.env.TICKET_SYNC_SECRET || "";

// Parses "oneblock-0073" -> "oneblock", "oneblock-1-7629" -> "oneblock-1"
function parseType(channelName) {
  const lastDash = channelName.lastIndexOf("-");
  if (lastDash === -1) return channelName;
  return channelName.slice(0, lastDash);
}

async function TicketSync(client) {
  if (!SYNC_SECRET) {
    console.log("[TicketSync] TICKET_SYNC_SECRET not set — skipping sync.");
    return;
  }

  try {
    const guild = client.guilds.cache.get(client.DiscordBot.conf.Discord.server_id);
    if (!guild) return;

    const openTickets = await client.DiscordBot.db.TicketDB.findAll({ where: { open: true } });

    const payload = [];

    for (const ticket of openTickets) {
      // Skip stale DB rows whose channel no longer exists
      const channel = guild.channels.cache.get(ticket.channel_id);
      if (!channel) continue;

      let username = null;
      try {
        const user = await client.users.fetch(ticket.discord_id);
        username = user ? user.tag : null;
      } catch {
        // user may have left the server / been deleted — that's fine
      }

      payload.push({
        id: ticket.id,
        channel_id: ticket.channel_id,
        channel_name: ticket.channel_name,
        type: parseType(ticket.channel_name),
        discord_id: ticket.discord_id,
        discord_username: username,
        guild_id: guild.id,
        created_at: new Date(ticket.createdAt).getTime(),
        updated_at: new Date(ticket.updatedAt).getTime()
      });
    }

    const res = await fetch(SYNC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sync-Secret": SYNC_SECRET
      },
      body: JSON.stringify({ tickets: payload })
    });

    if (!res.ok) {
      console.log(`[TicketSync] Sync failed: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.log("[TicketSync] Error:", err);
  }
}

module.exports = TicketSync;
