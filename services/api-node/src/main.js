const app = require("./app");

const port = process.env.PORT || 4000;
if (require.main === module) {
  app.listen(port, () => console.log(`api-node listening on ${port}`));
}

module.exports = app;
