import {
  initDB,
  insertSummary,
  upsertTagSlug,
  upsertTopicSlug,
  linkStoryTag,
  linkStoryTopic,
} from "./db.js";
import { initQueue, popOne, peekTail } from "./queue.js";
import { slugify, isObject } from "./utils.js";

const REDIS_URL = process.env.REDIS_URL;
const DATABASE_URL = process.env.DATABASE_URL;
const INPUT_QUEUE = process.env.SUMMARIZER_OUT_QUEUE || "summarizer:out";

async function processOne(msg) {
  // Expect SummarizerOut shape from summarizer-py/app/schemas.py
  if (!isObject(msg)) return { status: "skip", reason: "not_object" };
  const {
    story_id,
    article_id,
    model,
    lang,
    summary,
    classification,
    ui,
    timestamps,
  } = msg;
  if (!article_id || !summary || !model)
    return { status: "skip", reason: "missing_fields" };

  const sId = await insertSummary(
    article_id,
    model,
    lang || "en",
    summary,
    classification || null,
    ui || null,
    (timestamps && timestamps.summarized_at) || null
  );

  // Optional tags/topics linkage
  const tags = (classification?.tags || []).filter(Boolean).slice(0, 10);
  for (const t of tags) {
    const slug = slugify(t);
    if (!slug) continue;
    const tagId = await upsertTagSlug(slug, t, "tech");
    if (story_id && tagId) await linkStoryTag(story_id, tagId);
  }

  const topics = (classification?.topics || []).filter(Boolean).slice(0, 10);
  for (const tp of topics) {
    const slug = slugify(tp);
    if (!slug) continue;
    const topicId = await upsertTopicSlug(slug, tp);
    if (story_id && topicId) await linkStoryTopic(story_id, topicId);
  }

  return { status: "ok", summary_id: sId };
}

async function main() {
  try {
    initDB(DATABASE_URL);
    initQueue(REDIS_URL);

    const args = new Set(process.argv.slice(2));
    const peekOnly = args.has("--peek") || process.env.PEEK_ONLY === "1";

    if (peekOnly) {
      // Do not remove from the list; process the last element only
      const raw = await peekTail(INPUT_QUEUE);
      if (!raw) {
        console.log(
          JSON.stringify({
            level: "info",
            component: "persist",
            msg: "peek_empty",
            meta: { queue: INPUT_QUEUE },
          })
        );
        process.exit(0);
      }
      try {
        const msg = JSON.parse(raw);
        console.log(
          JSON.stringify({
            level: "info",
            component: "persist",
            msg: "peek_received",
            meta: { msg },
          })
        );
        const res = await processOne(msg);
        console.log(
          JSON.stringify({
            level: "info",
            component: "persist",
            msg: "peek_processed",
            meta: { res },
          })
        );
        process.exit(0);
      } catch (err) {
        console.error(
          JSON.stringify({
            level: "error",
            component: "persist",
            msg: "peek_failed",
            meta: { error: err.message, raw },
          })
        );
        process.exit(1);
      }
    } else {
      let processed = 0;
      while (true) {
        const raw = await popOne(INPUT_QUEUE);
        if (!raw) break; // drained
        try {
          const msg = JSON.parse(raw);
          const res = await processOne(msg);
          console.log(
            JSON.stringify({
              level: "info",
              component: "persist",
              msg: "processed",
              meta: { res },
            })
          );
          processed++;
        } catch (err) {
          console.error(
            JSON.stringify({
              level: "error",
              component: "persist",
              msg: "process_failed",
              meta: { error: err.message, raw },
            })
          );
        }
      }
      console.log(
        JSON.stringify({
          level: "info",
          component: "persist",
          msg: "drained",
          meta: { processed },
        })
      );
    }
    process.exit(0);
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        component: "persist",
        msg: "startup_failed",
        meta: { error: err.message },
      })
    );
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
