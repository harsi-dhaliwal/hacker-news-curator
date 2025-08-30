function mapStoryBase(row) {
  return {
    id: row.id,
    source: row.source,
    hn_id: row.hn_id,
    title: row.title,
    url: row.url,
    domain: row.domain,
    author: row.author,
    points: row.points,
    comments_count: row.comments_count,
    created_at: row.created_at?.toISOString?.() || row.created_at,
    fetched_at: row.fetched_at?.toISOString?.() || row.fetched_at,
    tags: row.tags || [],
    topics: row.topics || [],
  };
}

module.exports = { mapStoryBase };

