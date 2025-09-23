const express = require("express");
const router = express.Router();
const {
  createApplication,getApplications,getApplicationCounts,sendEmail,generateApplicationPDF,getApplicationWithStatus
} = require("../controllers/Recuitment.controller.js");
const { upload } = require("../middlewares/multer.js");

// Expecting fields: resume and photo
router.post(
  "/addApplication",
  upload.fields([
    { name: "resume", maxCount: 1 },
    { name: "photo", maxCount: 1 },
  ]),
  createApplication
);

router.get("/getApplications", getApplications);
router.get("/get/count", getApplicationCounts)
router.post("/sendemail",sendEmail);
router.get("/application/:id", generateApplicationPDF);
router.get("/applications/:id", getApplicationWithStatus);



module.exports = router;
