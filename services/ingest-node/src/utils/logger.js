const config = require("../config");

const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const currentLevel = LEVELS[config.logLevel] ?? LEVELS.info;

function base(fields = {}) {
  return {
    level: config.logLevel,
    ...fields,
  };
}

function fmt(level, component, msg, meta) {
  const time = new Date().toISOString();
  const payload = base({ time, level, component, msg });
  if (meta && Object.keys(meta).length) payload.meta = meta;
  return JSON.stringify(payload);
}

function createLogger(component = "app") {
  const should = (lvl) => (LEVELS[lvl] ?? 99) <= currentLevel;
  return {
    child: (childComponent) => createLogger(childComponent || component),
    error: (msg, meta = {}) => should("error") && console.error(fmt("error", component, msg, meta)),
    warn: (msg, meta = {}) => should("warn") && console.warn(fmt("warn", component, msg, meta)),
    info: (msg, meta = {}) => should("info") && console.log(fmt("info", component, msg, meta)),
    debug: (msg, meta = {}) => should("debug") && console.log(fmt("debug", component, msg, meta)),
  };
}

module.exports = { createLogger };

