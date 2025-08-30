const config = require("../config");
const { query } = require("../db");
const { enqueue } = require("../queue");

let timer = null;

async function tick() {
  // Placeholder: integrate Hacker News API calls here to fetch updates.
  // For each new/updated item, upsert into `story` and enqueue jobs as needed.
  // This stub just logs; real implementation would use fetch() to HN endpoints.
  if (process.env.LOG_LEVEL === "debug") {
    console.log("[hn-poller] tick");
  }
  // Example idea: refresh recent HN stats for near-term stories
  try {
    await query("SELECT 1");
  } catch (e) {
    // swallow; health endpoint surfaces DB issues
  }
}

function startHNPoller() {
  const interval = config.pollIntervalSec;
  if (!interval || interval <= 0) return; // disabled by default
  clearInterval(timer);
  timer = setInterval(tick, interval * 1000);
  timer.unref?.();
  console.log(`[hn-poller] started with ${interval}s interval`);
}

module.exports = { startHNPoller };

