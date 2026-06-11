// =============================================
// SPEEDMC NEWS POSTS
// To add a new post, copy a block below and
// paste it at the TOP of the posts array.
// Tags: update, patch, event, news
// Servers: lifesteal, oneblock, prison, network
//
// The "body" field supports simple markdown:
//   ## Heading
//   **bold text**
//   `inline code`
//   - list item
//   ---   (divider)
//   (blank line = new paragraph)
// =============================================

const posts = [
  {
    title: "Lifesteal Season 3 — Major Update",
    description: "Season 3 brings a full reset, new mechanics, custom bosses, and a reworked heart economy. Read the full changelog below.",
    tag: "update",
    server: "lifesteal",
    author: "flawo_o",
    date: "June 11, 2026",
    body: `## What's New
**Full season reset** — all progress, hearts, and inventories have been wiped. Fresh start for everyone.

## Heart Economy Changes
- Starting hearts increased from 10 to 12
- Max hearts cap raised to 30
- Heart drops on PvP kill now guaranteed (no longer random)
- Revive hearts now craftable with a new recipe

## Custom Bosses
SpeedBosses v2 is live with 3 new encounters:

- **The Warden of Chains** — spawns in the deep cave biome every 6 hours
- **Blood Golem** — summoned by killing 50 players in one session
- **Ender Tyrant** — end-game raid boss, requires a 4-player party

## Bug Fixes
---
- Fixed heart dupe exploit via ender chest stacking
- Fixed minion pathfinding breaking near chunk borders
- Fixed SpeedJail not releasing players after sentence expiry
- Performance improvements to the combat logger

**Need help? Join our Discord:** discord.gg/speedmc`
  },
  {
    title: "Network Maintenance — June 12",
    description: "Brief downtime scheduled for proxy and backend upgrades. Expected 20-30 minutes.",
    tag: "news",
    server: "network",
    author: "flawo_o",
    date: "June 11, 2026",
    body: `## Schedule
Maintenance will begin **June 12 at 3:00 AM EST** and is expected to last 20–30 minutes.

## What's being updated
- Velocity proxy upgraded to latest build
- Paper 1.21.8 backend patches applied
- Cloudflare routing rules updated for lower ping to EU players

The server will be inaccessible during this window. We'll post in Discord when it's back up.`
  },
  {
    title: "Welcome to SpeedMC Updates",
    description: "This is where we post all server updates, patches, events and news. Stay tuned for more!",
    tag: "news",
    server: "network",
    author: "flawo_o",
    date: "June 11, 2026"
  }
];
