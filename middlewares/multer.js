const multer = require("multer");
const path = require("path");

// Temporary storage on disk
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"), // temp folder
  filename: (req, file, cb) => {
    cb(null, Date.now() + "_" + file.originalname);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExt = [".pdf", ".doc", ".docx", ".png", ".jpg", ".jpeg", ".xlsx", ".xls"];
    const allowedMime = [
      // documents
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      // images
      "image/png",
      "image/jpeg",
      // excel
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel"
    ];

    const isExtOk = allowedExt.includes(ext);
    const isMimeOk = allowedMime.includes(file.mimetype);

    if (!isExtOk || !isMimeOk) {
      return cb(new Error("Invalid file type. Allowed: PDF, DOC, DOCX, PNG, JPG, JPEG, XLSX, XLS"));
    }
    cb(null, true);
  },
});

// Special uploader for Excel files
const excelUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for Excel files
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExt = [".xlsx", ".xls"];
    const allowedMime = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel"
    ];

    const isExtOk = allowedExt.includes(ext);
    const isMimeOk = allowedMime.includes(file.mimetype);

    if (!isExtOk || !isMimeOk) {
      return cb(new Error("Invalid file type. Only Excel files are allowed"));
    }
    cb(null, true);
  },
});

module.exports = { upload, excelUpload };
