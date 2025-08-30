const express = require("express");
const routes = require("./routes");

const app = express();
app.use(express.json());

// Mount routes
app.use(routes);

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "internal_error" });
});

module.exports = app;

