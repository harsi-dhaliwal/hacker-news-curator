// Minimal TypeScript types mirroring contracts/openapi.yaml

export type UUID = string;

export interface Tag {
  id: UUID;
  slug: string;
  name: string;
  kind: "topic" | "tech" | "meta";
}

export interface Topic {
  id: UUID;
  slug: string;
  name: string;
}

export interface StoryBase {
  id: UUID;
  source: "hn" | "blog" | "lobsters" | "devto";
  hn_id: number | null;
  title: string;
  url: string | null;
  domain: string | null;
  author: string | null;
  points: number | null;
  comments_count: number | null;
  created_at: string; // ISO
  fetched_at: string; // ISO
  tags: Tag[];
  topics: Topic[];
  summary_snippet?: string;
  summary_quicktake?: string[];
  reading_time_min?: number;
  impact_score?: number;
  confidence?: number;
  paywall?: boolean;
  link_format?: string | null;
  class_type?: string | null;
  is_pdf?: boolean;
  // Optional: summaries embedded from list API (compact JSON from DB)
  summaries?: Array<{
    id: UUID;
    model: string;
    lang: string;
    summary: string;
    classification?: Record<string, unknown> | null;
    ui?: Record<string, unknown> | null;
  }>;
}

export interface Article {
  id: UUID;
  story_id: UUID;
  language: string;
  html: string | null;
  text: string;
  word_count: number;
  content_hash: string;
}

export interface Summary {
  id: UUID;
  story_id: UUID;
  model: string;
  lang: string;
  summary: string;
  created_at: string; // ISO
  classification?: {
    primary_category?: string;
    type?: string;
    tags?: string[];
    topics?: string[];
  };
  ui?: {
    summary_140?: string;
    quicktake?: string[];
    audience?: string[];
    impact_score?: number;
    confidence?: number;
    reading_time_min?: number;
    link_props?: { paywall?: boolean; format?: string; is_pdf?: boolean };
  };
  summarized_at?: string; // ISO
}

export interface RankSignals {
  hot_score: number;
  decay_ts: string; // ISO
  click_count: number | null;
  dwell_ms_avg: number | null;
}

export interface StoryFull extends StoryBase {
  article: Article | null;
  summaries: Summary[];
  rank_signals?: RankSignals;
}

export interface StoriesPage {
  items: StoryBase[];
  next_offset: number | null;
}

export interface SearchResultItem {
  story: StoryBase;
  score: number;
  match: "semantic" | "lexical" | "hybrid";
}

export interface SearchResults {
  items: SearchResultItem[];
}
