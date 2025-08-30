function getDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch (e) {
    return null;
  }
}

module.exports = { getDomain };

