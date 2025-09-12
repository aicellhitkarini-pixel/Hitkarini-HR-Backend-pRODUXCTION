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
    const allowed = [".pdf", ".doc", ".docx", ".png", ".jpg", ".jpeg"];
    if (!allowed.includes(ext)) {
      return cb(new Error("Only PDF/DOC/DOCX/PNG/JPG files are allowed"));
    }
    cb(null, true);
  },
});

module.exports = { upload };
