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

    // Upload files to Cloudinary
    const photoLink = photoFile
      ? await uploadToCloudinary(photoFile.path, "photos")
      : null;
    const resumeLink = resumeFile
      ? await uploadToCloudinary(resumeFile.path, "resumes")
      : null;

    // Safe JSON parser
    const parseJSON = (field, fallback = []) => {
      try {
        return JSON.parse(field || JSON.stringify(fallback));
      } catch {
        return fallback;
      }
    };

    // Construct application data
    const applicationData = {
      // Cloudinary links
      photoLink,
      resumeLink,

      // Job Info
      applyingFor: req.body.applyingFor,
      subjectOrDepartment: req.body.subjectOrDepartment,

      // Personal Info
      fullName: req.body.fullName,
      fatherName: req.body.fatherName,
      fatherOccupation: req.body.fatherOccupation,
      motherName: req.body.motherName,
      motherOccupation: req.body.motherOccupation,
      dateOfBirth: req.body.dateOfBirth,
      gender: req.body.gender,
      bloodGroup: req.body.bloodGroup,
      category: req.body.category,
      religion: req.body.religion,
      nationality: req.body.nationality,
      languagesKnown: parseJSON(req.body.languagesKnown, []),

      physicalDisability: req.body.physicalDisability === "true",
      maritalStatus: req.body.maritalStatus,
      spouseName: req.body.spouseName,
      children: req.body.children || 0,

      // Address
      address: req.body.address,
      addressPincode: req.body.addressPincode,
      permanentAddress: req.body.permanentAddress,
      permanentAddressPincode: req.body.permanentAddressPincode,

      // Contact Info
      mobileNumber: req.body.mobileNumber,
      emergencyMobileNumber: req.body.emergencyMobileNumber,
      email: req.body.email,

      // Interests
      areaOfInterest: req.body.areaOfInterest,

      // Education
      educationQualifications: parseJSON(
        req.body.educationQualifications,
        []
      ),
      educationCategory: (() => {
        try {
          return JSON.parse(req.body.educationCategory || "{}");
        } catch {
          return {};
        }
      })(),

      // Work Experience
      totalWorkExperience: req.body.totalWorkExperience || 0,
      workExperience: parseJSON(req.body.workExperience, []),

      // Social Media
      socialMedia: (() => {
        try {
          return JSON.parse(req.body.socialMedia || "{}");
        } catch {
          return {};
        }
      })(),

      // References
      references: parseJSON(req.body.references, []),

      // Salary Expectation
      expectedSalary: req.body.expectedSalary,
    };

    // Save to DB
    const savedApp = await Recruitment.create(applicationData);

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
      to: "vishvesh.r@iitgjobs.com",
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
