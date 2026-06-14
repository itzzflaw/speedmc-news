// POST /api/staff/tickets-sync
// Called by the ticket bot every ~minute with a full snapshot of currently
// open tickets. Authenticated with a shared secret (NOT a user session).
//
// Body: { tickets: [{ id, channel_id, channel_name, type, discord_id,
//                      discord_username, guild_id, created_at, updated_at }] }
//
// Behavior: marks every existing row as closed, then re-opens/inserts the
// tickets in this snapshot. This means a ticket that no longer appears
// (closed or its channel was deleted) automatically falls out of the list.

import { json } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  const secret = request.headers.get("X-Sync-Secret");
  if (!env.TICKET_SYNC_SECRET || secret !== env.TICKET_SYNC_SECRET) {
    return json({ error: "Unauthorized." }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const tickets = Array.isArray(body.tickets) ? body.tickets : [];
  const now = Date.now();

  // Mark everything closed first — anything in this snapshot will be
  // re-opened below. Anything missing from the snapshot stays closed.
  await env.DB.prepare("UPDATE tickets SET open = 0 WHERE open = 1").run();

  for (const t of tickets) {
    if (!t.channel_id || !t.channel_name) continue;

    await env.DB.prepare(`
      INSERT INTO tickets (id, channel_id, channel_name, type, discord_id, discord_username, guild_id, open, created_at, updated_at, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
      ON CONFLICT(channel_id) DO UPDATE SET
        channel_name = excluded.channel_name,
        type = excluded.type,
        discord_id = excluded.discord_id,
        discord_username = excluded.discord_username,
        guild_id = excluded.guild_id,
        open = 1,
        updated_at = excluded.updated_at,
        synced_at = excluded.synced_at
    `).bind(
      t.id || null,
      t.channel_id,
      t.channel_name,
      t.type || "ticket",
      t.discord_id || "",
      t.discord_username || null,
      t.guild_id || null,
      t.created_at || now,
      t.updated_at || now,
      now
    ).run();
  }

  return json({ ok: true, synced: tickets.length });
}
