// POST /api/staff/ticket-reply
// Body: { channel_id, message }
// Staff-only. Posts a message to a ticket's Discord channel, prefixed with
// the staff member's name so it's clear it came from the dashboard.

import { requireStaff, json } from "../../_lib/auth.js";
import { discordFetch, isKnownTicketChannel } from "../../_lib/discord.js";

export async function onRequestPost({ request, env }) {
  const staff = await requireStaff(request, env);
  if (!staff) return json({ error: "Staff access required." }, 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const channelId = (body.channel_id || "").trim();
  const message = (body.message || "").trim();

  if (!channelId) return json({ error: "Missing channel_id." }, 400);
  if (!message) return json({ error: "Message cannot be empty." }, 400);
  if (message.length > 1800) return json({ error: "Message is too long." }, 400);

  if (!(await isKnownTicketChannel(env, channelId))) {
    return json({ error: "Unknown ticket channel." }, 404);
  }

  const staffName = staff.discord_username || staff.email || `Staff #${staff.id}`;
  const content = `**${staffName} (via dashboard):**\n${message}`;

  let res;
  try {
    res = await discordFetch(env, `/channels/${channelId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content })
    });
  } catch (err) {
    return json({ error: err.message }, 501);
  }

  if (!res.ok) {
    const errText = await res.text();
    return json({ error: `Discord returned ${res.status}: ${errText}` }, 502);
  }

  return json({ ok: true });
}
