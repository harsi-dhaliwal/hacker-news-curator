async function reindex(req, res) {
  // Accepts { story_id: uuid | null }, noop stub for now
  res.status(202).json({ accepted: true });
}

module.exports = { reindex };

