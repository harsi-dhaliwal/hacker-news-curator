const { Router } = require("express");
const { postIngest } = require("../controllers/ingest");

const router = Router();

// Optional API: accept HN item or generic URL
router.post("/ingest", postIngest);

module.exports = router;

