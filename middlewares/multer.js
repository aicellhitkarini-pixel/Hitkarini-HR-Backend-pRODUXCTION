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
    const allowedExt = [".pdf", ".doc", ".docx", ".png", ".jpg", ".jpeg"];
    const allowedMime = [
      // documents
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      // images
      "image/png",
      "image/jpeg",
    ];

    const isExtOk = allowedExt.includes(ext);
    const isMimeOk = allowedMime.includes(file.mimetype);

    if (!isExtOk || !isMimeOk) {
      return cb(new Error("Invalid file type. Allowed: PDF, DOC, DOCX, PNG, JPG, JPEG"));
    }
    cb(null, true);
  },
});

module.exports = { upload };
