const mongoose = require("mongoose");

const mailHistorySchema = new mongoose.Schema(
  {
    to: { type: String, required: true }, // recipient email
    subject: { type: String, required: true },
    body: { type: String, required: true },
    sentAt: { type: Date, default: Date.now },
  },
  { _id: false } // optional: don't create _id for each mail
);

const hrRemarksSchema = new mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Recruitment",
      required: true,
    },
    status: {
      type: String,
      enum: ["Selected", "Rejected", "Pending" ,"Interview"],
      default: "Pending",
    },
    // Denormalized latest status for quick reads
    latestStatus: {
      type: String,
      enum: ["Selected", "Rejected", "Pending", "Interview"],
      default: "Pending",
    },
    latestStatusAt: { type: Date },
    mailHistory: {
      Selected: [mailHistorySchema],
      Rejected: [mailHistorySchema],
      Interview: [mailHistorySchema],
    },
    remarks: { type: String }, 
  },
  { timestamps: true }
);

module.exports = mongoose.model("HrRemarks", hrRemarksSchema);
