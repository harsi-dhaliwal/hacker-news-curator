const config = require("../config");
const { enqueue, redis } = require("../queue");
const { upsertStory, createArticleForStory } = require("../controllers/ingest");

const HN_API = "https://hacker-news.firebaseio.com/v0";
const LAST_ID_KEY = "hn:poller:last_id";

let timer = null;
let lastId = null;

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`request failed ${res.status}`);
  return res.json();
}

async function enqueueArticlePipeline(story_id, article_id) {
  await enqueue("SUMMARIZE", {
    job_key: null,
    story_id,
    article_id,
    attempt: 1,
  });
  await enqueue("EMBED", {
    job_key: null,
    story_id,
    article_id,
    model_key: "default",
    attempt: 1,
  });
  await enqueue("TAG", { job_key: null, story_id, article_id, attempt: 1 });
}

async function processItem(item) {
  if (!item || item.type !== "story") return;
  const story_id = await upsertStory({
    source: "hn",
    hn_id: item.id,
    title: item.title,
    url: item.url || null,
    author: item.by || null,
    created_at: new Date(item.time * 1000),
    points: item.score || null,
    comments_count: item.descendants || null,
  });

  if (!item.url && item.text) {
    const article_id = await createArticleForStory({
      story_id,
      text: item.text,
    });
    await enqueueArticlePipeline(story_id, article_id);
  } else if (item.url) {
    const job_key = `FETCH_ARTICLE:${story_id}`;
    await enqueue(
      "FETCH_ARTICLE",
      { job_key, story_id, article_id: null, attempt: 1 },
      job_key
    );
  }
}

async function tick() {
  try {
    if (lastId === null) {
      const stored = await redis.get(LAST_ID_KEY);
      if (stored) {
        lastId = parseInt(stored, 10);
      } else {
        lastId = await fetchJSON(`${HN_API}/maxitem.json`);
        await redis.set(LAST_ID_KEY, String(lastId));
        if (process.env.LOG_LEVEL === "debug") {
          console.log(`[hn-poller] initialized at ${lastId}`);
        }
        return;
      }
    }

    const maxId = await fetchJSON(`${HN_API}/maxitem.json`);
    if (maxId > lastId) {
      for (let id = lastId + 1; id <= maxId; id++) {
        const item = await fetchJSON(`${HN_API}/item/${id}.json`).catch(
          () => null
        );
        await processItem(item);
      }
      lastId = maxId;
      await redis.set(LAST_ID_KEY, String(lastId));
    }

    const updates = await fetchJSON(`${HN_API}/updates.json`);
    if (Array.isArray(updates.items)) {
      for (const id of updates.items) {
        const item = await fetchJSON(`${HN_API}/item/${id}.json`).catch(
          () => null
        );
        await processItem(item);
      }
    }
  } catch (e) {
    console.error("[hn-poller] tick error", e);
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
