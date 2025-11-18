  const mongoose = require("mongoose");

  const applicationSchema = new mongoose.Schema(
    {
      photoLink: { type: String },
      resumeLink: { type: String },

      // Frontend flag to distinguish School vs College flows
      applicationType: { type: String, enum: ["school", "college", "others/administration"] },

      applyingFor: {
        type: String,
        enum: ["Teaching", "Non Teaching", "Admin"],
        required: true,
      },
      subjectOrDepartment: { type: String },

      fullName: { type: String },
      fatherName: { type: String },
      fatherOccupation: { type: String },
      motherName: { type: String },
      motherOccupation: { type: String },

      dateOfBirth: { type: Date, required: true },
      gender: { type: String, enum: ["Male", "Female"] },
      bloodGroup: { type: String },

      category: { type: String, enum: ["General", "OBC", "SC", "ST"] },
      religion: { type: String },
      nationality: { type: String },
      // For Indians we capture region/state; for foreigners we may capture countryName
      region: { type: String },
      countryName: { type: String },
      languagesKnown: [{ type: String }],

      physicalDisability: { type: Boolean, default: false },
      disabilityPercentage: { type: Number, min: 0, max: 100 },
      maritalStatus: {
        type: String,
        enum: ["Married", "Unmarried", "Divorced", "Widow", "Widower"],
        default: "Unmarried",
      },
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

      // Frontend experience type selector
      experienceType: { type: String, enum: ["fresher", "experienced", ""], default: "" },

      // 📘 Education Qualifications (10th, 12th, Graduation...)
      educationQualifications: [
        {
          level: {
            type: String,
            enum: ["10th", "12th", "Graduation", "Post Graduation", "PhD"],
            required: true,
          },
          examType: {
            type: String,
            enum: ["Regular", "Correspondence", "Private"],
          },
          medium: { type: String, enum: ["Hindi", "English"] },
          subject: { type: String },
          boardOrUniversity: { type: String },
          institutionName: { type: String },
          yearOfPassing: { type: Number },
          percentageOrCGPA: { type: String },
        },
      ],

      // 📘 Advanced Education Category Selection
      educationCategory: {
        // Tier selection visible in frontend (optional)
        category: { type: String, enum: ["Tier 1", "Tier 2", "Tier 3", "Tier 4"] },
        categoryRemark: { type: String }, // only when category = "Other"

        collegeType: {
          type: String,
          enum: [
            "Engineering",
            "Dental",
            "Nursing",
            "Law",
            "Pharmacy",
            "Education",
            "Commerce",
            "Arts",
            "Science",
            "Management",
            "Other",
          ],
          required: function() {
            try {
              const parentDoc = typeof this.parent === 'function' ? this.parent() : this;
              return parentDoc && parentDoc.applicationType === "college";
            } catch (e) { return false; }
          },
        },
        collegeRemark: { type: String }, // only when collegeType = "Other"

        details: {
          type: String,
          enum: [
            // Engineering
            "IITs",
            "IISc",
            "IIIT-H",
            "NITs (Top 10)",
            "NIRF Top 30",
            "Govt Regional Engineering Colleges",
            "NBA/NAAC A/A+",
            "NAAC Accredited Institutions",
            "Others (non-accredited or low-ranked)",

            // Dental
            "AIIMS",
            "PGI",
            "NIRF Top 10 Dental Colleges",
            "Govt Dental Colleges",
            "NAAC A/A+",
            "Private Dental Colleges (NAAC B+ or above)",
            "Others (non-accredited or low-ranked)",

            // Nursing
            "Nationally Prestigious Institutions",
            "Government & Accredited Institutions",
            "Private Colleges with Accreditation",
            "Others / Non-accredited Institutions",

            // Law
            "National Law Universities (NLUs)",
            "NIRF Top 10 Law Colleges",
            "Govt Law Colleges",
            "Private Law Colleges (NAAC B+)",
            "Others (non-accredited or low-ranked)",

            // Pharmacy
            "NIPERs",
            "State Govt Pharmacy Colleges",
            "PCI approved",
            "PCI recognized private universities (NAAC B+)",
            "Others / Non-accredited Institutions",

            // Education / Commerce / Arts / Science / Management
            "Central Universities",
            "NIRF Top 30",
            "NAAC A++",
            "State Universities",
            "NAAC A/A+",
            "Autonomous Colleges (NAAC B+)",
            "Others (non-accredited or low-ranked)",

            "Other",
          ],
          required: function() {
            try {
              const parentDoc = typeof this.parent === 'function' ? this.parent() : this;
              return parentDoc && parentDoc.applicationType === "college";
            } catch (e) { return false; }
          },
        },
        detailsRemark: { type: String }, // only when details = "Other"
      },

      // 📘 Work Experience
      totalWorkExperience: { type: Number, default: 0 },
      workExperience: [
        {
          serialNo: { type: Number },
          institutionName: { type: String },
          designation: { type: String },
          startDate: { type: Date },
          endDate: { type: Date },
          netMonthlySalary: { type: Number },
          reasonOfLeaving: { type: String },
        },
      ],

      // 📘 Social Media
      socialMedia: {
        linkedin: { type: String },
        facebook: { type: String },
        instagram: { type: String },
      },

      // 📘 References
      references: [
        {
          name: { type: String },
          designation: { type: String },
          contact: { type: String },
        },
      ],

      // 📘 Expected Salary
      expectedSalary: {
        type: String,
        enum: [
          "Up to 3 LPA",
          "4 - 7 LPA",
          "8 - 11 LPA",
          "12 - 15 LPA",
          "16 - 20 LPA",
          "21 - 25 LPA",
          "25 LPA Above",
        ],
      },
    },
    { timestamps: true }
  );

  module.exports = mongoose.model("Recruitment", applicationSchema);
