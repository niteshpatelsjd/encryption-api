const router = require("express").Router();
const auth = require("../middleware/auth");
const controller = require("../controllers/AttachmentController");

router.post("/", auth, controller.initialize);
router.post("/:attachmentId/complete", auth, controller.complete);
router.get("/:attachmentId/download-url", auth, controller.download);
router.delete("/:attachmentId", auth, controller.remove);

module.exports = router;