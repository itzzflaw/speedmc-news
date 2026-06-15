// =============================================
// Single self-contained Worker entry point.
// All auth/RBAC/audit-log logic and API route handlers live in this one
// file — no imports from /functions, avoiding esbuild resolution issues
// when bundling alongside assets.directory = ".".
// =============================================

const SESSION_COOKIE = "staff_session";
const SESSION_DAYS = 7;

const ROLE_PAGES = {
  owner:     ["dashboard", "tickets", "punishments", "logs", "players", "staff", "server-status", "settings"],
  manager:   ["dashboard", "tickets", "punishments", "logs", "players", "staff", "server-status", "settings"],
  admin:     ["dashboard", "tickets", "punishments", "logs", "players", "staff", "server-status"],
  moderator: ["dashboard", "tickets", "punishments", "players", "server-status"],
  helper:    ["dashboard", "tickets", "players"]
};

function canAccess(role, page) {
  return (ROLE_PAGES[role] || []).includes(page);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

// ───────── Password hashing (PBKDF2 via Web Crypto) ─────────
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    key,
    256
  );
  const hashHex = [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, "0")).join("");
  const saltHex = [...salt].map(b => b.toString(16).padStart(2, "0")).join("");
  return `${saltHex}:${hashHex}`;
}

async function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(":");
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    key,
    256
  );
  const computedHex = [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, "0")).join("");
  return computedHex === hashHex;
}

function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

// ───────── Sessions ─────────
async function createSession(env, userId) {
  const token = generateToken();
  const now = Date.now();
  const expires = now + SESSION_DAYS * 24 * 60 * 60 * 1000;

  await env.DB.prepare("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(token, userId, now, expires).run();

  await env.DB.prepare("UPDATE users SET last_seen = ? WHERE id = ?").bind(now, userId).run();

  return { token, expires };
}

function sessionCookie(token) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}

async function getSessionUser(request, env, ctx) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;

  const session = await env.DB.prepare("SELECT * FROM sessions WHERE token = ?").bind(token).first();
  if (!session || session.expires_at < Date.now()) return null;

  const user = await env.DB.prepare(
    "SELECT id, username, email, role, discord_id, avatar_url, active, last_seen, created_at FROM users WHERE id = ?"
  ).bind(session.user_id).first();

  if (!user || !user.active) return null;

  const update = env.DB.prepare("UPDATE users SET last_seen = ? WHERE id = ?").bind(Date.now(), user.id).run().catch(() => {});
  if (ctx && ctx.waitUntil) ctx.waitUntil(update);

  return user;
}

async function requirePage(request, env, page, ctx) {
  const user = await getSessionUser(request, env, ctx);
  if (!user) return null;
  if (page && !canAccess(user.role, page)) return null;
  return user;
}

// ───────── Audit log ─────────
async function logAction(env, staffId, actionType, target = null, metadata = null) {
  await env.DB.prepare(
    "INSERT INTO staff_actions (staff_id, action_type, target, metadata, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(staffId, actionType, target, metadata ? JSON.stringify(metadata) : null, Date.now()).run();
}

// ───────── Route handlers ─────────

async function handleSetupGet({ env }) {
  const { count } = await env.DB.prepare("SELECT COUNT(*) as count FROM users").first();
  return json({ needsSetup: count === 0 });
}

async function handleSetupPost({ request, env }) {
  const { count } = await env.DB.prepare("SELECT COUNT(*) as count FROM users").first();
  if (count > 0) {
    return json({ error: "Setup already complete. Create staff accounts from the Staff page instead." }, 403);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const username = (body.username || "").trim();
  const password = body.password || "";
  const email = (body.email || "").trim() || null;

  if (username.length < 3) return json({ error: "Username must be at least 3 characters." }, 400);
  if (password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);

  const passwordHash = await hashPassword(password);
  const now = Date.now();

  const result = await env.DB.prepare(
    "INSERT INTO users (username, email, password_hash, role, created_at) VALUES (?, ?, ?, 'owner', ?)"
  ).bind(username, email, passwordHash, now).run();

  await logAction(env, result.meta.last_row_id, "account_created", username, { role: "owner", via: "setup" });

  return json({ ok: true });
}

async function handleLogin({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const username = (body.username || "").trim();
  const password = body.password || "";

  if (!username || !password) {
    return json({ error: "Username and password are required." }, 400);
  }

  const user = await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
  if (!user || !user.active) {
    return json({ error: "Invalid username or password." }, 401);
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return json({ error: "Invalid username or password." }, 401);
  }

  const session = await createSession(env, user.id);
  await logAction(env, user.id, "login", user.username);

  return new Response(JSON.stringify({ ok: true, role: user.role }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": sessionCookie(session.token)
    }
  });
}

async function handleLogout({ request, env }) {
  const token = getCookie(request, SESSION_COOKIE);
  if (token) {
    await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": clearSessionCookie()
    }
  });
}

async function handleMe({ request, env, ctx }) {
  const user = await getSessionUser(request, env, ctx);
  if (!user) return json({ user: null });

  return json({
    user,
    pages: ROLE_PAGES[user.role] || []
  });
}

const ACTION_LABELS = {
  login: "logged in",
  account_created: "created an account",
  ticket_reply: "replied to a ticket",
  ticket_claim: "claimed a ticket",
  ticket_unclaim: "unclaimed a ticket",
  ticket_close: "closed a ticket",
  punishment_issue: "issued a punishment",
  punishment_revoke: "revoked a punishment",
  note_add: "added a player note"
};

async function handleActivity({ request, env, ctx }) {
  const user = await requirePage(request, env, "dashboard", ctx);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { results } = await env.DB.prepare(`
    SELECT a.id, a.action_type, a.target, a.metadata, a.created_at, u.username, u.avatar_url
    FROM staff_actions a
    JOIN users u ON u.id = a.staff_id
    ORDER BY a.created_at DESC
    LIMIT 30
  `).all();

  const items = results.map(r => ({
    id: r.id,
    username: r.username,
    avatar_url: r.avatar_url,
    action_type: r.action_type,
    label: ACTION_LABELS[r.action_type] || r.action_type.replace(/_/g, " "),
    target: r.target,
    metadata: r.metadata ? JSON.parse(r.metadata) : null,
    created_at: r.created_at
  }));

  return json({ activity: items });
}

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

async function handleOnlineStaff({ request, env, ctx }) {
  const user = await requirePage(request, env, "dashboard", ctx);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const cutoff = Date.now() - ONLINE_WINDOW_MS;
  const { results } = await env.DB.prepare(
    "SELECT id, username, role, avatar_url, last_seen FROM users WHERE last_seen > ? ORDER BY last_seen DESC"
  ).bind(cutoff).all();

  return json({ online: results, count: results.length });
}

// ───────── Discord REST helpers (for ticket messages/replies) ─────────

const DISCORD_API = "https://discord.com/api/v10";

async function discordFetch(env, path, options = {}) {
  if (!env.DISCORD_BOT_TOKEN) {
    throw new Error("DISCORD_BOT_TOKEN is not configured for this Worker yet.");
  }

  return fetch(`${DISCORD_API}${path}`, {
    ...options,
    headers: {
      "Authorization": `Bot ${env.DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
}

async function isKnownTicketChannel(env, channelId) {
  const row = await env.DB.prepare("SELECT 1 FROM tickets WHERE channel_id = ?").bind(channelId).first();
  return !!row;
}

// ───────── Tickets ─────────

const VALID_TICKET_STATUSES = new Set(["open", "claimed", "closed"]);

// GET /api/tickets — list tickets, open/claimed first.
async function handleTicketsList({ request, env, ctx }) {
  const user = await requirePage(request, env, "tickets", ctx);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { results } = await env.DB.prepare(`
    SELECT t.*, u.username AS claimed_by_username
    FROM tickets t
    LEFT JOIN users u ON u.id = t.claimed_by
    ORDER BY
      CASE t.status WHEN 'open' THEN 0 WHEN 'claimed' THEN 1 ELSE 2 END,
      t.created_at DESC
    LIMIT 200
  `).all();

  return json({ tickets: results || [] });
}

// POST /api/tickets-sync — called by the Discord bot with a snapshot of
// currently open ticket channels. Authenticated with a shared secret.
//
// Body: { tickets: [{ channel_id, channel_name, type?, priority?,
//                      discord_id, discord_username, guild_id,
//                      created_at?, updated_at? }] }
async function handleTicketsSync({ request, env }) {
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
  const seenChannels = tickets.map(t => t.channel_id).filter(Boolean);

  // Anything not in this snapshot and not already closed gets closed —
  // it means the channel was deleted/closed on Discord's side.
  if (seenChannels.length > 0) {
    const placeholders = seenChannels.map(() => "?").join(",");
    await env.DB.prepare(
      `UPDATE tickets SET status = 'closed' WHERE status != 'closed' AND channel_id NOT IN (${placeholders})`
    ).bind(...seenChannels).run();
  } else {
    await env.DB.prepare("UPDATE tickets SET status = 'closed' WHERE status != 'closed'").run();
  }

  for (const t of tickets) {
    if (!t.channel_id || !t.channel_name) continue;

    await env.DB.prepare(`
      INSERT INTO tickets (channel_id, channel_name, type, priority, status, discord_id, discord_username, guild_id, created_at, updated_at, synced_at)
      VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)
      ON CONFLICT(channel_id) DO UPDATE SET
        channel_name = excluded.channel_name,
        type = excluded.type,
        discord_id = excluded.discord_id,
        discord_username = excluded.discord_username,
        guild_id = excluded.guild_id,
        updated_at = excluded.updated_at,
        synced_at = excluded.synced_at,
        status = CASE WHEN tickets.status = 'closed' THEN 'open' ELSE tickets.status END
    `).bind(
      t.channel_id,
      t.channel_name,
      t.type || "general",
      t.priority || "medium",
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

// POST /api/tickets/status — claim, unclaim, close, or reopen a ticket.
// Body: { channel_id, status }  where status is open | claimed | closed
async function handleTicketStatus({ request, env, ctx }) {
  const user = await requirePage(request, env, "tickets", ctx);
  if (!user) return json({ error: "Unauthorized" }, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const channelId = (body.channel_id || "").trim();
  const status = (body.status || "").trim();

  if (!channelId) return json({ error: "Missing channel_id." }, 400);
  if (!VALID_TICKET_STATUSES.has(status)) return json({ error: "Invalid status." }, 400);

  const ticket = await env.DB.prepare("SELECT * FROM tickets WHERE channel_id = ?").bind(channelId).first();
  if (!ticket) return json({ error: "Unknown ticket." }, 404);

  const now = Date.now();
  let claimedBy = ticket.claimed_by;
  let actionType;

  if (status === "claimed") {
    claimedBy = user.id;
    actionType = "ticket_claim";
  } else if (status === "open") {
    claimedBy = null;
    actionType = "ticket_unclaim";
  } else {
    actionType = "ticket_close";
  }

  await env.DB.prepare(
    "UPDATE tickets SET status = ?, claimed_by = ?, updated_at = ? WHERE channel_id = ?"
  ).bind(status, claimedBy, now, channelId).run();

  await logAction(env, user.id, actionType, ticket.channel_name);

  return json({ ok: true });
}

// GET /api/ticket-messages?channel_id=...
async function handleTicketMessages({ request, env, ctx }) {
  const user = await requirePage(request, env, "tickets", ctx);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const url = new URL(request.url);
  const channelId = url.searchParams.get("channel_id");
  if (!channelId) return json({ error: "Missing channel_id." }, 400);

  if (!(await isKnownTicketChannel(env, channelId))) {
    return json({ error: "Unknown ticket channel." }, 404);
  }

  let res;
  try {
    res = await discordFetch(env, `/channels/${channelId}/messages?limit=50`);
  } catch (err) {
    return json({ error: err.message }, 501);
  }

  if (!res.ok) {
    return json({ error: `Discord returned ${res.status}.` }, 502);
  }

  const messages = await res.json();

  const trimmed = messages.reverse().map(m => ({
    id: m.id,
    author: m.author?.bot ? (m.author?.username || "Bot") : (m.member?.nick || m.author?.username || "Unknown"),
    avatar: m.author?.avatar
      ? `https://cdn.discordapp.com/avatars/${m.author.id}/${m.author.avatar}.png`
      : `https://cdn.discordapp.com/embed/avatars/0.png`,
    bot: !!m.author?.bot,
    content: m.content,
    embeds: (m.embeds || []).map(e => ({
      title: e.title || null,
      description: e.description || null
    })),
    timestamp: m.timestamp
  }));

  return json({ messages: trimmed });
}

// POST /api/ticket-reply
// Body: { channel_id, message }
async function handleTicketReply({ request, env, ctx }) {
  const user = await requirePage(request, env, "tickets", ctx);
  if (!user) return json({ error: "Unauthorized" }, 401);

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

  const ticket = await env.DB.prepare("SELECT * FROM tickets WHERE channel_id = ?").bind(channelId).first();
  if (!ticket) return json({ error: "Unknown ticket channel." }, 404);

  const content = `**${user.username} (via staff panel):**\n${message}`;

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

  await logAction(env, user.id, "ticket_reply", ticket.channel_name);

  return json({ ok: true });
}

// ───────── Server status ─────────

// A server's `updated_at` (from the bot's MySQL row) must be this recent
// for it to be considered online — protects against stale rows if a
// Minecraft server crashes without updating its status row.
const SERVER_OFFLINE_THRESHOLD_MS = 30 * 1000;

// POST /api/server-status-sync — called periodically by the Discord bot
// with a snapshot of the server_status table it already maintains.
// Authenticated with the same shared secret as ticket sync.
//
// Body: { servers: [{ name, status, players, max_players, tps, updated_at }] }
async function handleServerStatusSync({ request, env }) {
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

  const servers = Array.isArray(body.servers) ? body.servers : [];
  const now = Date.now();

  for (const s of servers) {
    if (!s.name) continue;

    await env.DB.prepare(`
      INSERT INTO server_status (server_name, status, players_online, max_players, tps, updated_at, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(server_name) DO UPDATE SET
        status = excluded.status,
        players_online = excluded.players_online,
        max_players = excluded.max_players,
        tps = excluded.tps,
        updated_at = excluded.updated_at,
        synced_at = excluded.synced_at
    `).bind(
      s.name,
      s.status || "OFFLINE",
      s.players || 0,
      s.max_players || 0,
      s.tps || 0,
      s.updated_at || now,
      now
    ).run();
  }

  return json({ ok: true, synced: servers.length });
}

// GET /api/server-status
async function handleServerStatusList({ request, env, ctx }) {
  const user = await requirePage(request, env, "dashboard", ctx);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { results } = await env.DB.prepare(
    "SELECT * FROM server_status ORDER BY server_name ASC"
  ).all();

  const now = Date.now();
  const servers = (results || []).map(r => ({
    name: r.server_name,
    online: r.status === "ONLINE" && (now - r.updated_at) <= SERVER_OFFLINE_THRESHOLD_MS,
    players: r.players_online,
    max_players: r.max_players,
    tps: r.tps,
    updated_at: r.updated_at,
    synced_at: r.synced_at
  }));

  const totalPlayers = servers.filter(s => s.online).reduce((sum, s) => sum + s.players, 0);
  const onlineCount = servers.filter(s => s.online).length;

  return json({
    servers,
    total_players: totalPlayers,
    online_count: onlineCount,
    total_count: servers.length
  });
}

// ───────── Router ─────────

const routes = {
  "GET /api/setup": handleSetupGet,
  "POST /api/setup": handleSetupPost,
  "POST /api/login": handleLogin,
  "POST /api/logout": handleLogout,
  "GET /api/me": handleMe,
  "GET /api/activity": handleActivity,
  "GET /api/online-staff": handleOnlineStaff,
  "GET /api/tickets": handleTicketsList,
  "POST /api/tickets-sync": handleTicketsSync,
  "POST /api/tickets/status": handleTicketStatus,
  "GET /api/ticket-messages": handleTicketMessages,
  "POST /api/ticket-reply": handleTicketReply,
  "POST /api/server-status-sync": handleServerStatusSync,
  "GET /api/server-status": handleServerStatusList
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const key = `${request.method} ${url.pathname}`;
    const handler = routes[key];

    if (handler) {
      return handler({ request, env, ctx });
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "Not found" }, 404);
    }

    return env.ASSETS.fetch(request);
  }
};
