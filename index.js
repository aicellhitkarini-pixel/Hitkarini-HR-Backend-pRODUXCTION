const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDB = require("./utils/DB.js");
const morgan = require("morgan");

dotenv.config();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());
app.use(morgan("dev"));

// Test route
app.get("/", (req, res) => {
  res.send("✅ Server is running...");
});

// Routes
app.use("/api", require("./routes/Recuitment.route.js"));

// Connect DB first, then start server
const PORT = process.env.PORT || 8000;

connectDB(process.env.MONGO_URL).then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}).catch((err) => {
  console.error("❌ Failed to connect to DB", err);
});
