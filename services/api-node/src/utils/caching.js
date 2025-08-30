const crypto = require("node:crypto");

const TTL = {
  FEED: 60,
  SEARCH: 60,
};

function etag(body) {
  const json = typeof body === "string" ? body : JSON.stringify(body);
  return crypto.createHash("sha1").update(json).digest("hex");
}

function sendCachedJSON(res, body, ttlSeconds) {
  const tag = etag(body);
  res.set("ETag", tag);
  res.set("Cache-Control", `public, max-age=${ttlSeconds}`);
  res.json(body);
}

module.exports = { TTL, sendCachedJSON };
