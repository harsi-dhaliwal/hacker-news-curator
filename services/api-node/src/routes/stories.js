const { Router } = require("express");
const { listStories, getStoryById } = require("../controllers/stories");

const router = Router();

router.get("/stories", listStories);
router.get("/stories/:id", getStoryById);

module.exports = router;

