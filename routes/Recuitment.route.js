const express = require("express");
const router = express.Router();
const {
  createApplication,
  getApplications,
  getApplicationCounts,
  sendEmail,
  generateApplicationPDF,
  getApplicationWithStatus,
  removeDuplicates,
  uploadExcel
} = require("../controllers/Recuitment.controller.js");
const { exportApplicationsExcel, exportSelectedApplicationsExcel } = require("../controllers/Export.controller.js");
const { upload, excelUpload } = require("../middlewares/multer.js");

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

router.delete("/remove-duplicates", removeDuplicates);

// Excel operations
router.get("/export/excel", exportApplicationsExcel); // supports same query filters as list (without pagination)
router.get("/export/excel/selected", exportSelectedApplicationsExcel); // expects ids=comma,separated
router.post("/import/excel", excelUpload.single('excelFile'), uploadExcel); // Import from Excel


module.exports = router;
