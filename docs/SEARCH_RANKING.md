# Search & Ranking

## Lexical search

- `article.tsv` (`simple` + `unaccent`).
- SQL: `article.tsv @@ plainto_tsquery('simple', unaccent($q))`.
- Score: `ts_rank_cd(article.tsv, plainto_tsquery(...)) AS lex_score`.

## Semantic search

- Embed query → `$q_vec` (dims from `embedding_model`).
- ANN: `SELECT article_id, 1 - (vector <=> $q_vec) AS sem_score FROM embedding ORDER BY vector <-> $q_vec LIMIT K`.

## Hybrid

- Normalize scores to [0,1], combine: `0.6*sem + 0.4*lex` (tuneable).
- Order by hybrid score; tie-break with `rank_signals.hot_score` and recency.

## Hot score (example)

hot = (ln(points+1)*0.7 + ln(comments+1)*0.3) \* exp(-age_hours / τ)
Default `τ = 60` hours (tune).
