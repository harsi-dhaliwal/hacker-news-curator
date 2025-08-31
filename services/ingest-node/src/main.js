const { createLogger } = require("./utils/logger");
const { initApp } = require("./app");
const app = require("./app");
const log = createLogger("main");

const port = process.env.PORT || 3001;
if (require.main === module) {
  initApp()
    .then(() => {
      app.listen(port, () => {
        log.info("listening", { port: Number(port) });
      });
    })
    .catch((err) => {
      log.error("startup failed", { error: err.message });
      // Ensure non-zero exit so orchestrators know it failed
      process.exit(1);
    });
}

module.exports = app;
