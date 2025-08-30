const crypto = require("crypto");

function contentHash(text, canonicalUrl = "") {
  const norm = (text || "").trim().replace(/\s+/g, " ");
  const data = canonicalUrl ? `${norm}\n${canonicalUrl}` : norm;
  return crypto.createHash("sha1").update(data).digest("hex");
}

module.exports = { contentHash };

