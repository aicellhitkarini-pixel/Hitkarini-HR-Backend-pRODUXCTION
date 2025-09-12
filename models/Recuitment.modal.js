const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema(
  {
    photoLink: { type: String },
    resumeLink: { type: String },

    applyingFor: {
      type: String,
      enum: ["Teaching", "Non Teaching", "Admin"],
      required: true,
    },
    subjectOrDepartment: { type: String },

    fullName: { type: String},
    fatherName: { type: String },
    fatherOccupation: { type: String },
    motherName: { type: String },
    motherOccupation: { type: String },

    dateOfBirth: { type: Date, required: true },
    gender: { type: String, enum: ["Male", "Female"], },
    bloodGroup: { type: String },

    category: { type: String, enum: ["General", "OBC", "SC", "ST"], },
    religion: { type: String },
    nationality: { type: String },
    languagesKnown: [{ type: String }],

    physicalDisability: { type: Boolean, default: false },
    maritalStatus: { type: String, enum: ["Married", "Unmarried"], default: "Unmarried" },
    spouseName: { type: String },
    children: { type: Number, default: 0 },

    address: { type: String },
    addressPincode: { type: String },
    permanentAddress: { type: String },
    permanentAddressPincode: { type: String },

    mobileNumber: { type: String },
    emergencyMobileNumber: { type: String },
    email: { type: String },

    areaOfInterest: { type: String },

    educationQualifications: [
      {
        level: {
          type: String,
          enum: ["10th", "12th", "Graduation", "Post Graduation", "PhD"],
          required: true,
        },
        examType: { type: String, enum: ["Regular", "Correspondence", "Private"]},
        medium: { type: String, enum: ["Hindi", "English"]},
        subject: { type: String},
        boardOrUniversity: { type: String},
        institutionName: { type: String},
        yearOfPassing: { type: Number },
        percentageOrCGPA: { type: String },
      },
    ],

    totalWorkExperience: { type: Number, default: 0 },
    workExperience: [
      {
        serialNo: { type: Number },
        institutionName: { type: String},
        designation: { type: String},
        startDate: { type: Date},
        endDate: { type: Date },
        netMonthlySalary: { type: Number },
        reasonOfLeaving: { type: String },
      },
    ],

    socialMedia: {
      linkedin: { type: String },
      facebook: { type: String },
      instagram: { type: String },
    },

    references: [
      {
        name: { type: String},
        designation: { type: String},
        contact: { type: String},
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Recruitment", applicationSchema);
