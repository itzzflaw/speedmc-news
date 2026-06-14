// =============================================
// Minimal Source RCON client for Cloudflare Pages Functions.
// Used to run staff commands (ban/kick/mute/etc) on your
// Minecraft server exactly as if typed in-game.
//
// Requires RCON enabled on the target server:
//   server.properties:
//     enable-rcon=true
//     rcon.port=25575
//     rcon.password=<something-strong>
//
// And these set as Pages environment variables / secrets:
//   RCON_HOST, RCON_PORT, RCON_PASSWORD
// =============================================

import { connect } from "cloudflare:sockets";

const TYPE_AUTH = 3;
const TYPE_AUTH_RESPONSE = 2;
const TYPE_EXEC = 2;
const TYPE_RESPONSE = 0;

function encodePacket(id, type, body) {
  const bodyBytes = new TextEncoder().encode(body);
  const size = 4 + 4 + bodyBytes.length + 2; // id + type + body + 2 null terminators
  const buf = new ArrayBuffer(4 + size);
  const view = new DataView(buf);
  view.setInt32(0, size, true);
  view.setInt32(4, id, true);
  view.setInt32(8, type, true);
  new Uint8Array(buf, 12, bodyBytes.length).set(bodyBytes);
  return new Uint8Array(buf);
}

function concat(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

async function readPacket(reader, leftover) {
  let buf = leftover || new Uint8Array(0);
  while (buf.length < 4) {
    const { value, done } = await reader.read();
    if (done) throw new Error("RCON connection closed unexpectedly.");
    buf = concat(buf, value);
  }
  const size = new DataView(buf.buffer, buf.byteOffset, 4).getInt32(0, true);
  while (buf.length < 4 + size) {
    const { value, done } = await reader.read();
    if (done) throw new Error("RCON connection closed unexpectedly.");
    buf = concat(buf, value);
  }
  const view = new DataView(buf.buffer, buf.byteOffset, 4 + size);
  const id = view.getInt32(4, true);
  const type = view.getInt32(8, true);
  const bodyBytes = buf.slice(12, 4 + size - 2);
  const body = new TextDecoder().decode(bodyBytes);
  return { id, type, body, leftover: buf.slice(4 + size) };
}

function stripColorCodes(text) {
  return text.replace(/§[0-9a-fk-or]/gi, "");
}

// Runs a single command over RCON and returns its console output (color codes stripped).
export async function rconExec(host, port, password, command) {
  const socket = connect({ hostname: host, port: Number(port) });
  await socket.opened;

  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();

  try {
    await writer.write(encodePacket(1, TYPE_AUTH, password));
    let pkt = await readPacket(reader);
    if (pkt.type === TYPE_RESPONSE) {
      pkt = await readPacket(reader, pkt.leftover);
    }
    if (pkt.type !== TYPE_AUTH_RESPONSE || pkt.id === -1) {
      throw new Error("RCON authentication failed — check RCON_PASSWORD.");
    }

    await writer.write(encodePacket(2, TYPE_EXEC, command));
    const result = await readPacket(reader, pkt.leftover);
    return stripColorCodes(result.body).trim();
  } finally {
    try { await writer.close(); } catch {}
    try { await reader.cancel(); } catch {}
    try { socket.close(); } catch {}
  }
}

// Reads RCON connection details from environment, throwing a helpful error if missing.
export function getRconConfig(env) {
  if (!env.RCON_HOST || !env.RCON_PORT || !env.RCON_PASSWORD) {
    throw new Error(
      "RCON is not configured yet. Set RCON_HOST, RCON_PORT, and RCON_PASSWORD " +
      "as environment variables on your Pages project — see README-DASHBOARD.md."
    );
  }
  return { host: env.RCON_HOST, port: env.RCON_PORT, password: env.RCON_PASSWORD };
}
