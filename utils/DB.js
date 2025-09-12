const mongoose = require("mongoose");

const connectDB = async (URL) => {
  try {
    await mongoose.connect(URL, {});
    console.log("MongoDB Connected Successfully");
  } catch (error) {
    console.error("MongoDB Connection Error:", error);
    process.exit(1); // Exit process with failure
  }
};

module.exports = connectDB;