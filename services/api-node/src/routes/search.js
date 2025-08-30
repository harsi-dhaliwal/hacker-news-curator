const { Router } = require("express");
const { search } = require("../controllers/search");

const router = Router();

router.get("/search", search);

module.exports = router;

