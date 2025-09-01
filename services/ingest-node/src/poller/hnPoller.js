// hn-poller.js (efficient once-a-day polling + metrics)
// Public API preserved: module.exports = { startHNPoller }
// DB + Redis writes preserved. Only polling quantity/quality + metrics added.

const config = require("../config");
const { enqueueToScraper, getRedis } = require("../queue");
const { createLogger } = require("../utils/logger");
const { upsertStory, createArticleForStory } = require("../controllers/ingest");

const HN_API = "https://hacker-news.firebaseio.com/v0";

// Back-compat key (kept updated for observability)
const LAST_ID_KEY = "hn:poller:last_id";

// Seen set for dedupe (sorted set score = first-seen ts)
const SEEN_ZSET_KEY = "hn:poller:seen";
const SEEN_TTL_SECONDS = 7 * 24 * 3600;

// Lists to snapshot + per-list caps
const LISTS = [
  { name: "topstories", cap: 500 },
  { name: "beststories", cap: 500 },
  { name: "newstories", cap: 500 },
  { name: "askstories", cap: 200 },
  { name: "showstories", cap: 200 },
  { name: "jobstories", cap: 200 },
];

// Window & quality thresholds
const WINDOW_SECONDS = parseInt(
  process.env.HN_WINDOW_SECONDS || String(36 * 3600),
  10
);
const MIN_SCORE = parseInt(process.env.HN_MIN_SCORE || "50", 10);
const MIN_COMMENTS = parseInt(process.env.HN_MIN_COMMENTS || "20", 10);

// Networking
const MAX_CONCURRENCY = parseInt(process.env.HN_FETCH_CONCURRENCY || "24", 10);
const MAX_FETCH_RETRIES = 2;
const FETCH_TIMEOUT_MS = parseInt(
  process.env.HN_FETCH_TIMEOUT_MS || "15000",
  10
);

let timer = null;
const log = createLogger("hn-poller");

/** ---------------------------------------------------------------------- */
/** Metrics (counters + timings in Redis)                                  */
/** ---------------------------------------------------------------------- */

function pad2(n) {
  return n < 10 ? `0${n}` : `${n}`;
}
function isoDate(d = new Date()) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(
    d.getUTCDate()
  )}`;
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function createRunMetrics() {
  const start = Date.now();
  const counters = {
    candidates: 0,
    unseen: 0,
    fetched: 0,
    keepers: 0,
    processed: 0,
    updates_considered: 0,
    updates_unseen: 0,
    updates_processed: 0,
    fetch_errors: 0,
    list_errors: 0,
    update_errors: 0,
    tick_errors: 0,
  };
  const timings = {
    list_ms: 0,
    dedupe_ms: 0,
    fetch_ms: 0,
    filter_ms: 0,
    process_ms: 0,
    updates_ms: 0,
    total_ms: 0,
  };

  function end() {
    timings.total_ms = Date.now() - start;
  }

  return { counters, timings, end };
}

async function flushMetricsToRedis(run) {
  const r = getRedis();
  const day = isoDate(); // UTC day buckets
  const countersKey = `hn:metrics:${day}:counters`;
  const timingsKey = `hn:metrics:${day}:timings`;

  // INCRBY for counters, HINCRBYFLOAT for timings (ms totals)
  const pipe = r.pipeline();
  for (const [k, v] of Object.entries(run.counters)) {
    pipe.hincrby(countersKey, k, v);
  }
  for (const [k, v] of Object.entries(run.timings)) {
    pipe.hincrbyfloat(timingsKey, k, v);
  }

  // Last-run snapshot (overwrites)
  const lastRunKey = "hn:metrics:last_run";
  pipe.hset(lastRunKey, {
    at_iso: new Date().toISOString(),
    ...Object.fromEntries(
      Object.entries(run.counters).map(([k, v]) => [`c_${k}`, v])
    ),
    ...Object.fromEntries(
      Object.entries(run.timings).map(([k, v]) => [`t_${k}`, v])
    ),
  });

  // TTLs optional; keep a week
  pipe.expire(countersKey, 8 * 24 * 3600);
  pipe.expire(timingsKey, 8 * 24 * 3600);
  pipe.exec().catch(() => {});
}

/** ---------------------------------------------------------------------- */
/** HTTP helpers                                                           */
/** ---------------------------------------------------------------------- */

async function fetchJSON(url, attempt = 0) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    log.debug("fetching url", { url });
    const res = await fetch(url, {
      headers: {
        "Accept-Encoding": "gzip",
        "User-Agent": "HN-Daily-Poller/1.0",
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`request failed ${res.status}`);
    return await res.json();
  } catch (err) {
    if (attempt < MAX_FETCH_RETRIES) {
      const backoff = 300 * (attempt + 1);
      await new Promise((r) => setTimeout(r, backoff));
      return fetchJSON(url, attempt + 1);
    }
    throw err;
  } finally {
    clearTimeout(t);
  }
}

async function getList(name) {
  return (await fetchJSON(`${HN_API}/${name}.json`)) || [];
}
async function getItem(id) {
  return (await fetchJSON(`${HN_API}/item/${id}.json`)) || null;
}

/** ---------------------------------------------------------------------- */
/** Queue/DB logic (unchanged)                                             */
/** ---------------------------------------------------------------------- */

async function enqueueArticlePipeline(story_id, article_id) {
  const { enqueue } = require("../queue");
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
    const story = {
      id: story_id,
      hn_id: item.id,
      source: "hn",
      title: item.title,
      url: item.url,
      domain: null,
      author: item.by || null,
      created_at: new Date(item.time * 1000).toISOString(),
    };
    const trace_id = await enqueueToScraper(story);
    if (process.env.LOG_LEVEL === "debug") {
      console.log(
        `[hn-poller] enqueued to scraper for story ${story_id} -> ${item.url} (trace: ${trace_id})`
      );
    }
  }
}

/** ---------------------------------------------------------------------- */
/** Redis state helpers                                                    */
/** ---------------------------------------------------------------------- */

async function markSeen(id) {
  const ts = nowSec();
  const r = getRedis();
  await r.zadd(SEEN_ZSET_KEY, ts, String(id));
  await r.zremrangebyscore(SEEN_ZSET_KEY, 0, ts - SEEN_TTL_SECONDS);
}
async function isSeen(id) {
  const r = getRedis();
  const score = await r.zscore(SEEN_ZSET_KEY, String(id));
  return score !== null && score !== undefined;
}

/** ---------------------------------------------------------------------- */
/** Concurrency helper                                                     */
/** ---------------------------------------------------------------------- */

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let i = 0,
    active = 0;
  let resolveAll, rejectAll;
  const done = new Promise((res, rej) => {
    resolveAll = res;
    rejectAll = rej;
  });

  const next = () => {
    while (active < limit && i < items.length) {
      const idx = i++;
      active++;
      Promise.resolve(worker(items[idx], idx))
        .then((r) => {
          results[idx] = r;
        })
        .catch(rejectAll)
        .finally(() => {
          active--;
          if (
            results.length === items.length &&
            active === 0 &&
            i >= items.length
          ) {
            resolveAll(results);
          } else {
            next();
          }
        });
    }
  };

  next();
  return done;
}

/** ---------------------------------------------------------------------- */
/** Candidate selection & filtering                                        */
/** ---------------------------------------------------------------------- */

function goodByHeuristics(it, cutoff) {
  if (!it || it.type !== "story") return false;
  if (it.dead || it.deleted) return false;
  const t = it.time || 0;
  if (t < cutoff) return false;
  const score = it.score || 0;
  const comments = it.descendants || 0;
  return score >= MIN_SCORE || comments >= MIN_COMMENTS;
}

async function collectCandidateIds(metrics) {
  const idSet = new Set();
  for (const { name, cap } of LISTS) {
    const t0 = Date.now();
    try {
      const ids = await getList(name);
      for (const id of ids.slice(0, cap)) idSet.add(id);
    } catch (e) {
      metrics.counters.list_errors += 1;
      log.error("list fetch failed", { list: name, error: e.message });
    } finally {
      metrics.timings.list_ms += Date.now() - t0;
    }
  }
  return Array.from(idSet);
}

/** ---------------------------------------------------------------------- */
/** Main tick                                                              */
/** ---------------------------------------------------------------------- */

async function tick() {
  const redis = getRedis();
  const run = createRunMetrics();
  const cutoff = nowSec() - WINDOW_SECONDS;

  try {
    // Maintain LAST_ID_KEY for back-compat visibility
    try {
      const maxId = await fetchJSON(`${HN_API}/maxitem.json`);
      await redis.set(LAST_ID_KEY, String(maxId));
    } catch (e) {
      log.debug("maxitem fetch failed", { error: e.message });
    }

    // 1) Snapshot curated lists
    const tListStart = Date.now();
    const candidates = await collectCandidateIds(run);
    run.timings.list_ms += Date.now() - tListStart;
    run.counters.candidates = candidates.length;

    // 2) Seen filter (pipeline for speed)
    const tDedupeStart = Date.now();
    const pipeline = redis.pipeline();
    candidates.forEach((id) => pipeline.zscore(SEEN_ZSET_KEY, String(id)));
    const pipeRes = await pipeline.exec();

    const unseen = [];
    pipeRes.forEach(([, score], idx) => {
      if (score === null || score === undefined) unseen.push(candidates[idx]);
    });
    run.timings.dedupe_ms += Date.now() - tDedupeStart;
    run.counters.unseen = unseen.length;

    // 3) Fetch items concurrently
    const tFetchStart = Date.now();
    const fetched = await mapLimit(unseen, MAX_CONCURRENCY, async (id) => {
      try {
        return await getItem(id);
      } catch (e) {
        run.counters.fetch_errors += 1;
        return null;
      }
    });
    run.timings.fetch_ms += Date.now() - tFetchStart;
    run.counters.fetched = fetched.filter(Boolean).length;

    // 4) Quality filter
    const tFilterStart = Date.now();
    const keepers = fetched.filter((it) => goodByHeuristics(it, cutoff));
    run.timings.filter_ms += Date.now() - tFilterStart;
    run.counters.keepers = keepers.length;

    // 5) Process keepers
    const tProcessStart = Date.now();
    for (const it of keepers) {
      await processItem(it);
      await markSeen(it.id);
      run.counters.processed += 1;
    }
    run.timings.process_ms += Date.now() - tProcessStart;

    // 6) Consider updates (small slice)
    const tUpdatesStart = Date.now();
    try {
      const updates = await fetchJSON(`${HN_API}/updates.json`);
      if (Array.isArray(updates.items)) {
        const updateIds = updates.items.slice(-200);
        run.counters.updates_considered = updateIds.length;

        const upPipe = redis.pipeline();
        updateIds.forEach((id) => upPipe.zscore(SEEN_ZSET_KEY, String(id)));
        const upRes = await upPipe.exec();

        const updateUnseen = [];
        upRes.forEach(([, score], idx) => {
          if (score === null || score === undefined)
            updateUnseen.push(updateIds[idx]);
        });
        run.counters.updates_unseen = updateUnseen.length;

        const updatedItems = await mapLimit(
          updateUnseen,
          MAX_CONCURRENCY,
          async (id) => {
            try {
              return await getItem(id);
            } catch (e) {
              run.counters.fetch_errors += 1;
              return null;
            }
          }
        );

        const updatedKeepers = updatedItems.filter((it) =>
          goodByHeuristics(it, cutoff)
        );
        for (const it of updatedKeepers) {
          await processItem(it);
          await markSeen(it.id);
          run.counters.updates_processed += 1;
        }
      }
    } catch (e) {
      run.counters.update_errors += 1;
      log.debug("updates fetch failed", { error: e.message });
    } finally {
      run.timings.updates_ms += Date.now() - tUpdatesStart;
    }

    run.end();

    // Log summary
    log.info("tick complete", {
      candidates: run.counters.candidates,
      unseen: run.counters.unseen,
      fetched_ok: run.counters.fetched,
      keepers: run.counters.keepers,
      processed: run.counters.processed,
      updates_considered: run.counters.updates_considered,
      updates_unseen: run.counters.updates_unseen,
      updates_processed: run.counters.updates_processed,
      errors: {
        list: run.counters.list_errors,
        fetch: run.counters.fetch_errors,
        update: run.counters.update_errors,
      },
      timings_ms: run.timings,
    });

    // Persist metrics
    await flushMetricsToRedis(run);
  } catch (e) {
    run.counters.tick_errors += 1;
    run.end();
    log.error("tick error", {
      error: e.message,
      timings_ms: run.timings,
      counters: run.counters,
    });
    // best-effort persist error metrics too
    await flushMetricsToRedis(run).catch(() => {});
  }
}

/** ---------------------------------------------------------------------- */
/** Public API                                                             */
/** ---------------------------------------------------------------------- */

function startHNPoller() {
  // Explicitly disabled to avoid loops; use runTopAndNewOnce instead.
  runTopAndNewOnce();
  return;
}

module.exports = { startHNPoller };

/** ---------------------------------------------------------------------- */
/** One-shot: Top + New only                                               */
/** ---------------------------------------------------------------------- */

async function fetchIds(endpoint) {
  const ids = await fetchJSON(`${HN_API}/${endpoint}.json`).catch(() => []);
  return Array.isArray(ids) ? ids : [];
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

async function runTopAndNewOnce() {
  const topLimit = parseInt(process.env.HN_TOP_LIMIT || "200", 10);
  const newLimit = parseInt(process.env.HN_NEW_LIMIT || "200", 10);
  const concurrency = parseInt(
    process.env.HN_FETCH_CONCURRENCY || String(MAX_CONCURRENCY),
    10
  );

  log.info("oneshot.start", { topLimit, newLimit, concurrency });

  // Collect IDs
  const [topIds, newIds] = await Promise.all([
    fetchIds("topstories"),
    fetchIds("newstories"),
  ]);
  const ids = uniq([
    ...topIds.slice(0, topLimit),
    ...newIds.slice(0, newLimit),
  ]);

  // Fetch items
  const items = await mapLimit(ids, concurrency, async (id) => {
    try {
      return await getItem(id);
    } catch (_) {
      return null;
    }
  });

  // Filter by heuristics
  const cutoff = nowSec() - WINDOW_SECONDS;
  const keepers = items.filter((it) => goodByHeuristics(it, cutoff));

  // Process keepers (sequential to avoid DB saturation)
  let processed = 0;
  for (const it of keepers) {
    await processItem(it);
    await markSeen(it.id);
    processed++;
  }

  log.info("oneshot.done", {
    candidates: ids.length,
    keepers: keepers.length,
    processed,
  });
}

module.exports.runTopAndNewOnce = runTopAndNewOnce;
