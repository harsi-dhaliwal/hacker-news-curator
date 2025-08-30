const { Router } = require("express");
const health = require("./health");
const stories = require("./stories");
const search = require("./search");
const vocab = require("./vocab");
const internal = require("./internal");

const router = Router();

router.use(health);
router.use(stories);
router.use(search);
router.use(vocab);
router.use(internal);

module.exports = router;

