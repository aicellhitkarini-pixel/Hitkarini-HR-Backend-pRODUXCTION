const fs = require("fs");
const Recruitment = require("../models/Recuitment.modal");
const { uploadToCloudinary } = require("../utils/cloudinary");
const {sendHrEmail} = require("../middlewares/hrEmail");
const HrRemarks = require("../models/HrRemarks");
const PDFDocument = require("pdfkit");
const axios = require("axios");
const path = require("path");
const transporter = require("../middlewares/hrEmail");

exports.createApplication = async (req, res) => {
  try {
    const photoFile = req.files?.photo?.[0] || null;
    const resumeFile = req.files?.resume?.[0] || null;

    // Upload files to Cloudinary (if provided)
    const photoLink = photoFile
      ? await uploadToCloudinary(photoFile.path, "photos")
      : null;
    const resumeLink = resumeFile
      ? await uploadToCloudinary(resumeFile.path, "resumes")
      : null;

    // Clean up local temp files if they exist
    const tryUnlink = (p) => {
      try {
        if (p && typeof p === 'string' && fs.existsSync(p)) {
          fs.unlinkSync(p);
        }
      } catch (e) {
        console.warn('Unable to remove temp file', p, e.message);
      }
    };
    tryUnlink(photoFile?.path);
    tryUnlink(resumeFile?.path);

    // Improved safe parser: handle already-parsed objects or JSON strings
    const parseJSON = (field, fallback = []) => {
      try {
        if (field === undefined || field === null || field === "") return fallback;
        if (typeof field === "string") return JSON.parse(field);
        return field;
      } catch (e) {
        // If it's a comma-separated string, return array
        if (typeof field === "string" && field.includes(",")) {
          return field.split(",").map((s) => s.trim()).filter(Boolean);
        }
        return fallback;
      }
    };

    // Normalize references: support both `contact` and `contactNumber` from frontend
    const rawReferences = parseJSON(req.body.references, []);
    const references = Array.isArray(rawReferences)
      ? rawReferences.map((r) => ({
          name: r?.name || r?.fullName || "",
          designation: r?.designation || r?.title || "",
          contact: r?.contact || r?.contactNumber || r?.phone || "",
        }))
      : [];

    // Social media may be stringified or object
    const socialMedia = (() => {
      const sm = parseJSON(req.body.socialMedia, {});
      if (typeof sm === "string") return { linkedin: sm };
      return sm || {};
    })();

    // Languages
    let languagesKnown = parseJSON(req.body.languagesKnown, []);
    if (!Array.isArray(languagesKnown) && typeof languagesKnown === "string") {
      languagesKnown = languagesKnown.split(",").map((s) => s.trim()).filter(Boolean);
    }

    // Education qualifications and work experience
    const educationQualifications = parseJSON(req.body.educationQualifications, []);
    const workExperience = parseJSON(req.body.workExperience, []);

    // Education category
    let educationCategory = {};
    try {
      educationCategory = parseJSON(req.body.educationCategory, {});
    } catch (e) {
      educationCategory = {};
    }

    // Normalize enums using schema enum values (fuzzy matching)
    const allowedDetails = Recruitment.schema.path('educationCategory.details')?.enumValues || [];
    const allowedExpected = Recruitment.schema.path('expectedSalary')?.enumValues || [];

    const sanitize = (s) => (String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ''));

    const fuzzyFind = (input, candidates) => {
      if (!input) return null;
      const inS = sanitize(input);
      // exact match first
      const exact = candidates.find((c) => String(c) === String(input));
      if (exact) return exact;
      // sanitized exact
      const sMatch = candidates.find((c) => sanitize(c) === inS);
      if (sMatch) return sMatch;
      // inclusion matches
      const includeMatch = candidates.find((c) => sanitize(c).includes(inS) || inS.includes(sanitize(c)));
      if (includeMatch) return includeMatch;
      // partial token match
      const tokens = inS.split(/\s+/).filter(Boolean);
      for (const t of tokens) {
        const tk = candidates.find((c) => sanitize(c).includes(t));
        if (tk) return tk;
      }
      return null;
    };

    // Try to normalize incoming educationCategory.details to one of the allowed enum values
    if (educationCategory && educationCategory.details) {
      const normalized = fuzzyFind(educationCategory.details, allowedDetails);
      if (normalized) educationCategory.details = normalized;
      else if (allowedDetails.includes('Other')) educationCategory.details = 'Other';
    }

    // Normalize expectedSalary if possible (frontend sometimes sends school-range values)
    if (req.body.expectedSalary) {
      const normExp = fuzzyFind(req.body.expectedSalary, allowedExpected);
      if (normExp) {
        // Overwrite later when building applicationData
      }
    }

  // Coerce numeric/boolean values
  const physicalDisability = (req.body.physicalDisability === true) || (String(req.body.physicalDisability).toLowerCase() === "true") || (req.body.physicalDisability === "on");
  const children = req.body.children ? parseInt(req.body.children, 10) || 0 : 0;
  const totalWorkExperience = req.body.totalWorkExperience ? parseFloat(req.body.totalWorkExperience) || 0 : 0;

    // Prepare normalized workExperience (dates, numbers)
    const normalizedWorkExperience = Array.isArray(workExperience)
      ? workExperience.map((w) => ({
          ...w,
          startDate: w?.startDate ? new Date(w.startDate) : undefined,
          endDate: w?.endDate ? new Date(w.endDate) : undefined,
          netMonthlySalary: w?.netMonthlySalary ? Number(w.netMonthlySalary) : w?.netMonthlySalary,
        }))
      : [];

    // Normalize expected salary once
    const rawExpected = req.body.expectedSalary;
    const normalizedExpectedSalary = (() => {
      if (!rawExpected) return undefined;
      const mapped = fuzzyFind(rawExpected, allowedExpected);
      if (mapped) return mapped;
      const numeric = String(rawExpected).match(/\d+/g)?.map(Number) || [];
      if (numeric.length) {
        const avg = numeric.reduce((a, b) => a + b, 0) / numeric.length;
        if (avg <= 300000) return "Up to 3 LPA";
        if (avg <= 700000) return "4 - 7 LPA";
        if (avg <= 1100000) return "8 - 11 LPA";
        if (avg <= 1500000) return "12 - 15 LPA";
        if (avg <= 2000000) return "16 - 20 LPA";
        if (avg <= 2500000) return "21 - 25 LPA";
        return "25 LPA Above";
      }
      return rawExpected;
    })();

    // Construct application data (cleaned, no duplicate keys)
    const applicationData = {
      photoLink,
      resumeLink,

      applyingFor: req.body.applyingFor,
      subjectOrDepartment: req.body.subjectOrDepartment,

      fullName: req.body.fullName,
      fatherName: req.body.fatherName,
      fatherOccupation: req.body.fatherOccupation,
      motherName: req.body.motherName,
      motherOccupation: req.body.motherOccupation,
      dateOfBirth: req.body.dateOfBirth ? new Date(req.body.dateOfBirth) : undefined,
      gender: req.body.gender,
      bloodGroup: req.body.bloodGroup,
      category: req.body.category,
      religion: req.body.religion,
      nationality: req.body.nationality,
      languagesKnown,

      physicalDisability,
      maritalStatus: req.body.maritalStatus,
      spouseName: req.body.spouseName,
      children,

      address: req.body.address,
      addressPincode: req.body.addressPincode,
      permanentAddress: req.body.permanentAddress,
      permanentAddressPincode: req.body.permanentAddressPincode,

      mobileNumber: req.body.mobileNumber,
      emergencyMobileNumber: req.body.emergencyMobileNumber,
      email: req.body.email,

      areaOfInterest: req.body.areaOfInterest,

      educationQualifications,
      educationCategory: educationCategory || {},

      totalWorkExperience,
      workExperience: normalizedWorkExperience,

      socialMedia,
      references,

      expectedSalary: normalizedExpectedSalary,
    };

    // Debug: log applicationData keys (avoid logging full files)
    try {
      console.log('Saving applicationData (keys):', Object.keys(applicationData));
    } catch (e) {
      console.warn('Could not log applicationData keys', e.message);
    }

    // Save to DB
    let savedApp;
    try {
      savedApp = await Recruitment.create(applicationData);
    } catch (err) {
      // If Mongoose validation error, return 400 with field errors and log helpful debug info
      if (err && err.name === "ValidationError") {
        const errors = Object.keys(err.errors).reduce((acc, key) => {
          acc[key] = err.errors[key].message;
          return acc;
        }, {});
        console.warn('Validation failed for applicationData:', errors);
        // Also log the problematic values for easier debugging (non-sensitive)
        try {
          const dbg = {};
          Object.keys(errors).forEach((k) => {
            dbg[k] = applicationData[k];
          });
          console.warn('Problematic values:', dbg);
        } catch (e) {
          console.warn('Failed to collect problematic values', e.message);
        }
        return res.status(400).json({ message: 'Validation error', errors });
      }
      throw err;
    }

    // ------------------ 📧 HR Email ------------------
    const hrMessage = `
      <h2>New Job Application Received</h2>
      <p><b>Name:</b> ${savedApp.fullName}</p>
      <p><b>Email:</b> ${savedApp.email}</p>
      <p><b>Mobile:</b> ${savedApp.mobileNumber || "-"}</p>
      <p><b>Position Applied:</b> ${savedApp.applyingFor || "-"}</p>
      <p><b>Resume:</b> <a href="${savedApp.resumeLink}" target="_blank">View Resume</a></p>
      <p><b>Photo:</b> <a href="${savedApp.photoLink}" target="_blank">View Photo</a></p>
    `;

    await sendHrEmail({
      to: "hitkarinisabhahr@gmail.com",
      subject: `📩 New Application - ${savedApp.fullName}`,
      message: hrMessage,
    });

    // ------------------ 📧 Candidate Email ------------------
    const candidateMessage = `
      <h2>Dear ${savedApp.fullName},</h2>
      <p>Thank you for applying for the position of <b>${savedApp.applyingFor || "N/A"}</b> at Hitkarini Sabha.</p>
      <p>We have successfully received your application. Our HR team will review your details and get back to you shortly.</p>
      <br/>
      <p>Best regards,</p>
      <p><b>HR Team</b></p>
    `;

    await sendHrEmail({
      to: savedApp.email,
      subject: "✅ Your Application Has Been Received",
      message: candidateMessage,
    });

    console.log("✅ Emails sent: HR + Candidate");

    res.status(201).json({
      message: "Application submitted successfully and emails sent",
      data: savedApp,
    });
  } catch (error) {
    console.error("❌ Error while saving application:", error);
    res.status(500).json({
      message: "Error while saving application",
      error: error.message,
    });
  }
};


exports.getApplications = async (req, res) => {
  try {
    let { page = 1, limit = 10, applyingFor, gender, maritalStatus, areaOfInterest, minExperience, maxExperience } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);

    const filters = {};

    if (applyingFor) filters.applyingFor = applyingFor;
    if (gender) filters.gender = gender;
    if (maritalStatus) filters.maritalStatus = maritalStatus;
    if (areaOfInterest) filters.areaOfInterest = { $regex: areaOfInterest, $options: "i" };
    if (minExperience || maxExperience) filters.totalWorkExperience = {};
    if (minExperience) filters.totalWorkExperience.$gte = parseFloat(minExperience);
    if (maxExperience) filters.totalWorkExperience.$lte = parseFloat(maxExperience);

    const total = await Recruitment.countDocuments(filters);
    const data = await Recruitment.find(filters)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.status(200).json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching applications", error: error.message });
  }
};

exports.getApplicationCounts = async (req, res) => {
  try {
    // Use MongoDB aggregation to count per category
    const counts = await Recruitment.aggregate([
      {
        $group: {
          _id: "$applyingFor",
          count: { $sum: 1 },
        },
      },
    ]);

    // Convert to key-value format
    const result = {
      Teaching: 0,
      "Non Teaching": 0,
      Admin: 0,
      total: 0,
    };

    counts.forEach(item => {
      result[item._id] = item.count;
      result.total += item.count;
    });

    res.status(200).json({
      message: "Application counts fetched successfully",
      data: result,
    });
  } catch (error) {
    console.error("❌ Error fetching application counts:", error);
    res.status(500).json({
      message: "Error fetching application counts",
      error: error.message,
    });
  }
};

exports.sendEmail = async (req, res) => {
  try {
    const { applicationId, to, subject, message, status } = req.body;

    // 1️⃣ Send email
    await sendHrEmail({ to, subject, message });

    // 2️⃣ Find or create HrRemarks
    let hrRemark = await HrRemarks.findOne({ applicationId });

    if (!hrRemark) {
      hrRemark = new HrRemarks({
        applicationId,
        status,
        mailHistory: {
          Selected: [],
          Rejected: [],
          Interview: [],
        },
      });
    }

    // Push to mailHistory array based on status
    hrRemark.mailHistory[status] = hrRemark.mailHistory[status] || [];
    hrRemark.mailHistory[status].push({
      to,
      subject,
      body: message,
    });

    hrRemark.status = status; // update current status
    await hrRemark.save();

    res.status(200).json({ message: "Email sent and stored successfully", hrRemark });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to send email", error: err.message });
  }
};





exports.generateApplicationPDF = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: "Missing application ID" });

    const application = await Recruitment.findById(id);
    if (!application) return res.status(404).json({ message: "Application not found" });

    const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${application.fullName.replace(/\s+/g, "_")}_Application.pdf`
    );
    doc.pipe(res);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = 50;

    doc.registerFont("Regular", "Helvetica");
    doc.registerFont("Bold", "Helvetica-Bold");

    // ------------------- Double Border -------------------
    const drawPageBorder = () => {
      doc.rect(5, 5, pageWidth - 10, pageHeight - 10).lineWidth(2).strokeColor("black").stroke();
      doc.rect(10, 10, pageWidth - 20, pageHeight - 20).lineWidth(1).strokeColor("black").stroke();
    };
    drawPageBorder();

    // ------------------- Header -------------------
    const addHeader = () => {
      const logoPath = path.join(__dirname, "../assets/logo.png");
      const logoWidth = 50;
      const logoHeight = 50;

      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, margin, 20, { width: logoWidth, height: logoHeight });
      }

      doc.font("Bold").fontSize(16).fillColor("black")
        .text("Hitkarini Sabha", margin + logoWidth + 10, 25, { align: "left" });

      doc.font("Regular").fontSize(12).fillColor("black")
        .text("Recruitment Application", margin + logoWidth + 10, 45, { align: "left" });

      doc.moveTo(margin, 80).lineTo(pageWidth - margin, 80).lineWidth(1).strokeColor("black").stroke();
    };
    addHeader();

    // ------------------- Footer -------------------
    const addFooter = () => {
      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        doc.font("Regular").fontSize(8).fillColor("gray")
          .text(`Generated on: ${new Date().toLocaleDateString()}`, margin, pageHeight - 30)
          .text(`Page ${i + 1} of ${pageCount}`, 0, pageHeight - 30, { align: "right" });
      }
    };

    let currentY = 90;

    // ------------------- Profile Photo (Passport Size) -------------------
    if (application.photoLink) {
      try {
        const response = await axios.get(application.photoLink, { responseType: "arraybuffer" });
        const imgBuffer = Buffer.from(response.data, "binary");

        const imgWidth = 100;
        const imgHeight = 130;
        const imgX = pageWidth - margin - imgWidth;
        const imgY = currentY;

        doc.save();
        doc.rect(imgX, imgY, imgWidth, imgHeight).clip();
        doc.image(imgBuffer, imgX, imgY, { width: imgWidth, height: imgHeight });
        doc.restore();
      } catch (err) {
        console.warn("⚠️ Could not load photo:", err.message);
      }
    }

    // ------------------- Two Column Section -------------------
    const renderTwoColumn = (col1Title, col1Lines, col2Title, col2Lines) => {
      const colWidth = (pageWidth - 2 * margin) / 2 - 10;
      let startY = currentY;

      // Column 1
      doc.font("Bold").fontSize(10).fillColor("black").text(col1Title, margin, startY);
      let col1Y = doc.y + 2;
      doc.moveTo(margin, col1Y).lineTo(margin + colWidth, col1Y).lineWidth(0.5).strokeColor("#999999").stroke();
      doc.font("Regular").fontSize(9).fillColor("black");
      let yOffset = col1Y + 2;
      col1Lines.forEach(line => {
        doc.text(line, margin + 2, yOffset, { width: colWidth - 4, lineGap: 1 });
        yOffset += 10;
      });

      // Column 2
      doc.font("Bold").fontSize(10).fillColor("black").text(col2Title, margin + colWidth + 20, startY);
      let col2Y = doc.y + 2;
      doc.moveTo(margin + colWidth + 20, col2Y).lineTo(margin + 2 * colWidth + 20, col2Y).lineWidth(0.5).strokeColor("#999999").stroke();
      doc.font("Regular").fontSize(9).fillColor("black");
      let yOffset2 = col2Y + 2;
      col2Lines.forEach(line => {
        doc.text(line, margin + colWidth + 22, yOffset2, { width: colWidth - 4, lineGap: 1 });
        yOffset2 += 10;
      });

      currentY = Math.max(yOffset, yOffset2) + 5;
    };

    // ------------------- Render Personal & Contact Info -------------------
    renderTwoColumn(
      "Personal Information",
      [
        `Full Name: ${application.fullName || "-"}`,
        `Applying For: ${application.applyingFor || "-"}`,
        `Subject/Department: ${application.subjectOrDepartment || "-"}`,
        `Date of Birth: ${application.dateOfBirth ? new Date(application.dateOfBirth).toLocaleDateString('en-GB') : "-"}`,
        `Gender: ${application.gender || "-"}`,
        `Blood Group: ${application.bloodGroup || "-"}`,
        `Category: ${application.category || "-"}`,
        `Marital Status: ${application.maritalStatus || "-"}` +
        (application.maritalStatus === "Married" ? `, Spouse: ${application.spouseName || "-"}, Children: ${application.children || "-"}` : "")
      ],
      "Contact Information",
      [
        `Email: ${application.email || "-"}`,
        `Mobile: ${application.mobileNumber || "-"}`,
        `Emergency Contact: ${application.emergencyMobileNumber || "-"}`,
        `Address: ${application.address || "-"}`,
        `Permanent Address: ${application.permanentAddress || "-"}`,
      ]
    );

    // ------------------- Area of Interest -------------------
    doc.font("Bold").fontSize(10).text("Area of Interest", margin, currentY);
    let yLine = doc.y + 2;
    doc.moveTo(margin, yLine).lineTo(pageWidth - margin, yLine).lineWidth(0.5).strokeColor("#999999").stroke();
    doc.font("Regular").fontSize(9).fillColor("black").text(application.areaOfInterest || "No data provided.", margin + 2, yLine + 2, { lineGap: 1 });
    currentY = doc.y + 5;

    // ------------------- Table Renderer -------------------
    const renderTable = (title, headers, rows) => {
      doc.font("Bold").fontSize(10).fillColor("black").text(title, margin, currentY);
      const tableTop = doc.y + 2;
      const colWidth = (pageWidth - 2 * margin) / headers.length;
      const rowHeight = 14;

      // Header row
      doc.fillColor("black").font("Bold");
      headers.forEach((header, i) => {
        const x = margin + i * colWidth;
        doc.rect(x, tableTop, colWidth, rowHeight).fill("#dddddd");
        doc.fillColor("black").text(header, x + 2, tableTop + 3, { width: colWidth - 4, lineGap: 1 });
      });

      let rowY = tableTop + rowHeight;

      rows.forEach((row, rowIndex) => {
        const fillColor = rowIndex % 2 === 0 ? "#ffffff" : "#f8f8f8";
        row.forEach((cell, i) => {
          const x = margin + i * colWidth;
          doc.rect(x, rowY, colWidth, rowHeight).fill(fillColor).stroke("#999999");
          doc.fillColor("black").font("Regular").fontSize(8).text(cell || "-", x + 2, rowY + 3, { width: colWidth - 4, lineGap: 1 });
        });
        rowY += rowHeight;
      });

      currentY = rowY + 5;
    };

    // ------------------- Tables -------------------
    renderTable("Educational Qualifications",
      ["S.No", "Level", "Subject", "Institution", "Board/University", "Year"],
      application.educationQualifications?.map((edu, i) => [
        (i + 1).toString(),
        edu.level,
        edu.subject,
        edu.institutionName,
        edu.boardOrUniversity,
        edu.yearOfPassing,
      ]) || [["-", "-", "-", "-", "-", "-"]]
    );

    renderTable("Work Experience",
      ["S.No", "Designation", "Company", "Start Date", "End Date"],
      application.workExperience?.map((w, i) => [
        (i + 1).toString(),
        w.designation,
        w.institutionName,
        w.startDate ? new Date(w.startDate).toLocaleDateString('en-GB') : "-",
        w.endDate ? new Date(w.endDate).toLocaleDateString('en-GB') : "Present",
      ]) || [["-", "-", "-", "-", "-"]]
    );

    renderTable("References",
      ["S.No", "Name", "Designation", "Contact"],
      application.references?.map((r, i) => [
        (i + 1).toString(),
        r.name,
        r.designation,
        r.contact
      ]) || [["-", "-", "-", "-"]]
    );

    // ------------------- Footer -------------------
    addFooter();
    doc.end();

  } catch (err) {
    console.error("❌ Error generating PDF:", err);
    if (!res.headersSent) res.status(500).json({ message: "Error generating PDF", error: err.message });
  }
};
