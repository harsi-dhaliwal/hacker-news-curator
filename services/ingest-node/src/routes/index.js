const { Router } = require("express");
const health = require("./health");
const ingest = require("./ingest");

const router = Router();

router.use(health);
router.use(ingest);

module.exports = router;

