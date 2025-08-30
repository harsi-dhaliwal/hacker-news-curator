-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;      -- pgvector
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- fuzzy domain/title
CREATE EXTENSION IF NOT EXISTS unaccent;    -- better full-text
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- Embedding models registry (switch model/dims safely)
CREATE TABLE embedding_model (
  key         text PRIMARY KEY,            -- e.g. 'text-embed-3-small'
  dimensions  int  NOT NULL,               -- e.g. 1536
  provider    text NOT NULL,               -- 'openai' | 'voyage' | 'local'
  created_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO embedding_model(key,dimensions,provider)
VALUES ('default', 1536, 'openai')
ON CONFLICT DO NOTHING;

-- Core story metadata (one row per HN post or source)
CREATE TABLE story (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  source           text NOT NULL CHECK (source IN ('hn','blog','lobsters','devto')),
  hn_id            int UNIQUE,                      -- nullable if not HN
  title            text NOT NULL,
  url              text,                             -- original link (nullable for Ask HN)
  domain           text,
  author           text,
  points           int,
  comments_count   int,
  created_at       timestamptz NOT NULL,            -- item creation time (from HN)
  fetched_at       timestamptz NOT NULL DEFAULT now(),
  -- link to normalized content (shared across posts)
  article_id       uuid NULL
);
-- We add the FK after 'article' is created (see below)
CREATE INDEX story_created_at_idx ON story(created_at DESC);
CREATE INDEX story_points_idx     ON story(points DESC NULLS LAST);
CREATE INDEX story_comments_idx   ON story(comments_count DESC NULLS LAST);
CREATE INDEX story_domain_trgm_idx ON story USING gin (domain gin_trgm_ops);

-- Normalized content (dedup by content_hash)
-- Many stories may reference the SAME article (via story.article_id)
CREATE TABLE article (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  language      text NOT NULL DEFAULT 'en',
  html          text,                   -- optional raw HTML
  text          text NOT NULL,          -- cleaned main content or Ask HN text
  word_count    int  NOT NULL,
  content_hash  text NOT NULL,          -- hash of cleaned text (and canonical URL if you want)
  CONSTRAINT article_content_hash_unique UNIQUE (content_hash)
);

-- Now add FK from story to article
ALTER TABLE story
  ADD CONSTRAINT story_article_fk
  FOREIGN KEY (article_id) REFERENCES article(id) ON DELETE SET NULL;

CREATE INDEX story_article_idx ON story(article_id);

-- Summaries (per-article, multiple models/langs)
CREATE TABLE summary (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  article_id  uuid NOT NULL REFERENCES article(id) ON DELETE CASCADE,
  model       text NOT NULL,                 -- e.g. 'gpt-4.1'
  lang        text NOT NULL DEFAULT 'en',
  summary     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX summary_article_idx ON summary(article_id);

-- Embeddings (per-article per model_key)
CREATE TABLE embedding (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  article_id  uuid NOT NULL REFERENCES article(id) ON DELETE CASCADE,
  model_key   text NOT NULL REFERENCES embedding_model(key),
  vector      vector(1536) NOT NULL,               -- dims must match embedding_model
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT embedding_article_model_unique UNIQUE (article_id, model_key)
);
-- ANN index (IVFFLAT needs ANALYZE after bulk load)
CREATE INDEX embedding_ivfflat_idx
  ON embedding USING ivfflat (vector vector_l2_ops) WITH (lists = 100);

-- Tags / Topics vocab
CREATE TABLE tag (
  id    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug  text UNIQUE NOT NULL,
  name  text NOT NULL,
  kind  text NOT NULL DEFAULT 'tech' CHECK (kind IN ('topic','tech','meta'))
);

CREATE TABLE topic (
  id    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug  text UNIQUE NOT NULL,
  name  text NOT NULL
);

-- M2M
CREATE TABLE story_tag (
  story_id uuid NOT NULL REFERENCES story(id) ON DELETE CASCADE,
  tag_id   uuid NOT NULL REFERENCES tag(id)   ON DELETE CASCADE,
  PRIMARY KEY (story_id, tag_id)
);
CREATE TABLE story_topic (
  story_id uuid NOT NULL REFERENCES story(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES topic(id) ON DELETE CASCADE,
  PRIMARY KEY (story_id, topic_id)
);

-- Ranking signals per story (denormalized)
CREATE TABLE rank_signals (
  story_id     uuid PRIMARY KEY REFERENCES story(id) ON DELETE CASCADE,
  hot_score    double precision NOT NULL DEFAULT 0,
  decay_ts     timestamptz NOT NULL DEFAULT now(),
  click_count  int,
  dwell_ms_avg int,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Lexical search over normalized text
ALTER TABLE article ADD COLUMN IF NOT EXISTS tsv tsvector;
CREATE INDEX article_tsv_idx ON article USING gin(tsv);

CREATE OR REPLACE FUNCTION article_tsv_update() RETURNS trigger AS $$
BEGIN
  NEW.tsv :=
    to_tsvector('simple', unaccent(coalesce(NEW.text,'')));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS article_tsv_trg ON article;
CREATE TRIGGER article_tsv_trg
BEFORE INSERT OR UPDATE OF text
ON article FOR EACH ROW EXECUTE FUNCTION article_tsv_update();

-- Helpful view for feeds
CREATE OR REPLACE VIEW story_list AS
SELECT
  s.id, s.source, s.hn_id, s.title, s.url, s.domain, s.author,
  s.points, s.comments_count, s.created_at, s.fetched_at,
  s.article_id,
  rs.hot_score
FROM story s
LEFT JOIN rank_signals rs ON rs.story_id = s.id;

-- Optional: seed some vocab
INSERT INTO tag(slug,name,kind)
VALUES ('ai','AI','tech'), ('security','Security','tech'), ('show','Show HN','meta')
ON CONFLICT DO NOTHING;

INSERT INTO topic(slug,name)
VALUES ('startups','Startups'), ('programming','Programming')
ON CONFLICT DO NOTHING;

-- Optional: hot score helper (you can tune τ)
CREATE OR REPLACE FUNCTION compute_hot_score(_points int, _comments int, _age_hours double precision)
RETURNS double precision AS $$
  SELECT (ln((_points+1)) * 0.7 + ln((_comments+1)) * 0.3) * exp(-_age_hours / 60.0);
$$ LANGUAGE sql IMMUTABLE;

-- Notes:
-- 1) For bulk embedding loads, run: ANALYZE embedding;
-- 2) Ask HN/Jobs: create an article row with text = item.text and link story.article_id to it.
-- 3) Dedupe: compute content_hash over cleaned text (and canonical URL if desired).
