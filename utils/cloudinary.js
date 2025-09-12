const cloudinary = require("cloudinary");
const fs = require("fs");
require("dotenv").config();

cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadToCloudinary = (filePath, folder = "resumes") => {
  return new Promise((resolve, reject) => {
    cloudinary.v2.uploader.upload(
      filePath,
      { folder, resource_type: "raw" }, // raw = for docs
      (error, result) => {
        if (error) {
          // Cleanup local file on failure as well
          fs.unlink(filePath, (err) => {
            if (err) console.error("Failed to delete local file after upload error:", err);
          });
          return reject(error);
        }
        // Delete local file after successful upload
        fs.unlink(filePath, (err) => {
          if (err) console.error("Failed to delete local file:", err);
        });
        resolve(result.secure_url);
      }
    );
  });
};

module.exports = { uploadToCloudinary };
