const router = require("express").Router();
const auth = require("../middleware/auth");
const controller = require("../controllers/CallController");

router.post("/", auth, controller.start);
router.get("/", auth, controller.list);
router.post("/:callId/respond", auth, controller.respond);
router.post("/:callId/end", auth, controller.end);

module.exports = router;
