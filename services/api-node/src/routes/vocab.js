const { Router } = require("express");
const { listTags, listTopics } = require("../controllers/vocab");

const router = Router();

router.get("/tags", listTags);
router.get("/topics", listTopics);

module.exports = router;

