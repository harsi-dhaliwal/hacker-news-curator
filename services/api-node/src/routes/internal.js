const { Router } = require("express");
const { reindex } = require("../controllers/internal");

const router = Router();

router.post("/_internal/reindex", reindex);

module.exports = router;

