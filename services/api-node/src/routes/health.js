const { Router } = require("express");
const { healthz } = require("../controllers/health");

const router = Router();

router.get("/healthz", healthz);

module.exports = router;

