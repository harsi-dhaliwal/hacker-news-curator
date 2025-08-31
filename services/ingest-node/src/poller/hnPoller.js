const config = require("../config");
const { enqueue, getRedis } = require("../queue");
const { createLogger } = require("../utils/logger");
const { upsertStory, createArticleForStory } = require("../controllers/ingest");

const HN_API = "https://hacker-news.firebaseio.com/v0";
const LAST_ID_KEY = "hn:poller:last_id";

let timer = null;
let lastId = null;
const log = createLogger("hn-poller");

async function fetchJSON(url) {
  log.info("fetching url", { url });
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
  if (process.env.LOG_LEVEL === "debug") {
    console.log(
      `[hn-poller] processing story ${item.id}: ${item.title || "(no title)"}`
    );
  }
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
    if (process.env.LOG_LEVEL === "debug") {
      console.log(
        `[hn-poller] enqueued summarize/embed/tag for story ${story_id} (ask HN)`
      );
    }
  } else if (item.url) {
    const job_key = `FETCH_ARTICLE:${story_id}`;
    await enqueue(
      "FETCH_ARTICLE",
      { job_key, story_id, article_id: null, attempt: 1 },
      job_key
    );
    if (process.env.LOG_LEVEL === "debug") {
      console.log(
        `[hn-poller] enqueued fetch for story ${story_id} -> ${item.url}`
      );
    }
  }
}

async function tick() {
  try {
    if (lastId === null) {
      const stored = await getRedis().get(LAST_ID_KEY);
      if (stored) {
        lastId = parseInt(stored, 10);
      } else {
        lastId = await fetchJSON(`${HN_API}/maxitem.json`);
        await getRedis().set(LAST_ID_KEY, String(lastId));
        log.debug("initialized", { lastId });
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
      await getRedis().set(LAST_ID_KEY, String(lastId));
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
    log.error("tick error", { error: e.message });
  }
}

function startHNPoller() {
  const interval = config.pollIntervalSec;

  if (!interval || interval <= 0) {
    log.info("disabled");
    return; // disabled by default
  }
  clearInterval(timer);
  timer = setInterval(tick, interval * 1000);
  timer.unref?.();
  log.info("started", { intervalSec: interval });
}

module.exports = { startHNPoller };
