// =============================================
// link-server.js
//
// Small standalone HTTP service that the website calls to check whether
// a Discord account has a verified Minecraft account via your in-game
// /link system (stored in MongoDB).
//
// Run this on a host that can reach your MongoDB (the one at 172.18.0.1
// in your plugin config — likely the same Docker host as your Paper/Velocity
// servers).
//
// ── SETUP ──
//   npm install mongodb
//
// Environment variables:
//   MONGO_URI           your mongodb:// connection string
//   MONGO_DB_NAME       database name (e.g. "SpeedMC")
//   LINK_LOOKUP_SECRET  shared secret — must match the value set on
//                        Cloudflare Pages as LINK_LOOKUP_SECRET
//   PORT                defaults to 8787
//
// ── ⚠ ONE THING I NEED FROM YOU ──
// I don't know the collection/field names your /link plugin uses to store
// the Discord <-> Minecraft mapping. Fill in the TODO block in
// `lookupLink()` below — it just needs to return { uuid, username } or null.
// Send me the collection name + field names and I'll fill this in for you.
// =============================================

const http = require("http");
const { MongoClient } = require("mongodb");

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "SpeedMC";
const LINK_LOOKUP_SECRET = process.env.LINK_LOOKUP_SECRET;
const PORT = process.env.PORT || 8787;

if (!MONGO_URI || !LINK_LOOKUP_SECRET) {
  console.error("Set MONGO_URI and LINK_LOOKUP_SECRET before starting link-server.");
  process.exit(1);
}

let db;

async function connect() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db(MONGO_DB_NAME);
  console.log(`[link-server] Connected to MongoDB (${MONGO_DB_NAME})`);
}

// ── TODO: fill this in with your actual collection/field names ──
async function lookupLink(discordId) {
  // Example shape — adjust collection name and field names to match
  // whatever your /link command writes to MongoDB:
  //
  // const doc = await db.collection("links").findOne({ discordId });
  // if (!doc) return null;
  // return { uuid: doc.minecraftUuid, username: doc.minecraftUsername };

  throw new Error("lookupLink() is not configured yet — see TODO in link-server.js");
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname !== "/link-status") {
    res.writeHead(404).end();
    return;
  }

  if (req.headers["x-link-secret"] !== LINK_LOOKUP_SECRET) {
    res.writeHead(401, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  const discordId = url.searchParams.get("discord_id");
  if (!discordId) {
    res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Missing discord_id" }));
    return;
  }

  try {
    const link = await lookupLink(discordId);
    if (!link) {
      res.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Not linked" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(link));
  } catch (err) {
    console.error("[link-server]", err);
    res.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Internal error" }));
  }
});

connect().then(() => {
  server.listen(PORT, () => console.log(`[link-server] Listening on :${PORT}`));
}).catch(err => {
  console.error("[link-server] Failed to connect to MongoDB:", err);
  process.exit(1);
});
