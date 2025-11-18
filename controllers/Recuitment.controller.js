const fs = require("fs");
const Recruitment = require("../models/Recuitment.modal");
const { uploadToCloudinary } = require("../utils/cloudinary");
const { sendHrEmail } = require("../middlewares/hrEmail");
const HrRemarks = require("../models/HrRemarks");
const PDFDocument = require("pdfkit");
const axios = require("axios");
const path = require("path");
const QRCode = require("qrcode");

exports.createApplication = async (req, res) => {
  try {
    const photoFile = req.files?.photo?.[0] || null;
    const resumeFile = req.files?.resume?.[0] || null;
    const photoLink = photoFile ? await uploadToCloudinary(photoFile.path, "photos") : null;
    const resumeLink = resumeFile ? await uploadToCloudinary(resumeFile.path, "resumes") : null;

    const parseJSON = (field, fallback = []) => {
      try {
        if (field === undefined || field === null || field === "") return fallback;
        if (typeof field === "string") return JSON.parse(field);
        return field;
      } catch (e) {
        if (typeof field === "string" && field.includes(",")) {
          return field.split(",").map((s) => s.trim()).filter(Boolean);
        }
        return fallback;
      }
    };

    const rawReferences = parseJSON(req.body.references, []);
    const references = Array.isArray(rawReferences)
      ? rawReferences.map((r) => ({
          name: r?.name || r?.fullName || "",
          designation: r?.designation || r?.title || "",
          contact: r?.contact || r?.contactNumber || r?.phone || "",
        }))
      : [];

    const socialMedia = (() => {
      const sm = parseJSON(req.body.socialMedia, {});
      if (typeof sm === "string") return { linkedin: sm };
      return sm || {};
    })();

    let languagesKnown = parseJSON(req.body.languagesKnown, []);
    if (!Array.isArray(languagesKnown) && typeof languagesKnown === "string") {
      languagesKnown = languagesKnown.split(",").map((s) => s.trim()).filter(Boolean);
    }

    const educationQualifications = parseJSON(req.body.educationQualifications, []);
    const workExperience = parseJSON(req.body.workExperience, []);
    let educationCategory = {};
    try {
      educationCategory = parseJSON(req.body.educationCategory, {});
    } catch (e) {
      educationCategory = {};
    }

    const applicationData = {
      applicationType: req.body.applicationType,
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
      region: req.body.region,
      countryName: req.body.countryName,
      languagesKnown,
      physicalDisability: (req.body.physicalDisability === true) || (String(req.body.physicalDisability).toLowerCase() === "true") || (req.body.physicalDisability === "on"),
      disabilityPercentage: (req.body.disabilityPercentage !== undefined && req.body.disabilityPercentage !== "") ? Math.max(0, Math.min(100, Number(req.body.disabilityPercentage) || 0)) : undefined,
      maritalStatus: req.body.maritalStatus,
      spouseName: req.body.spouseName,
      children: req.body.children ? parseInt(req.body.children, 10) || 0 : 0,
      address: req.body.address,
      addressPincode: req.body.addressPincode,
      permanentAddress: req.body.permanentAddress,
      permanentAddressPincode: req.body.permanentAddressPincode,
      mobileNumber: req.body.mobileNumber,
      emergencyMobileNumber: req.body.emergencyMobileNumber,
      email: req.body.email,
      areaOfInterest: req.body.areaOfInterest,
      experienceType: req.body.experienceType || "",
      educationQualifications,
      totalWorkExperience: req.body.totalWorkExperience ? parseFloat(req.body.totalWorkExperience) || 0 : 0,
      workExperience: Array.isArray(workExperience) ? workExperience.map((w) => ({ ...w, startDate: w?.startDate ? new Date(w.startDate) : undefined, endDate: w?.endDate ? new Date(w.endDate) : undefined })) : [],
      socialMedia,
      references,
      expectedSalary: req.body.expectedSalary,
    };

    if (String(req.body.applicationType || "").toLowerCase() === "college" && educationCategory && educationCategory.collegeType && educationCategory.details) {
      applicationData.educationCategory = educationCategory;
    }

    const savedApp = await Recruitment.create(applicationData);

    // Emails
    try {
      const hrMessage = `<h2>New Job Application Received</h2><p><b>Name:</b> ${savedApp.fullName}</p><p><b>Email:</b> ${savedApp.email}</p><p><b>Resume:</b> <a href="${savedApp.resumeLink}">View Resume</a></p>`;
      await sendHrEmail({ to: "hitkarinisabhahr@gmail.com", subject: `📩 New Application - ${savedApp.fullName}`, message: hrMessage });
    } catch (e) { console.error("⚠️ Failed to send HR email:", e?.message || e); }
    try {
      if (savedApp.email) {
        const candidateMessage = `<h2>Dear ${savedApp.fullName},</h2><p>Thank you for applying for the position of <b>${savedApp.applyingFor || "N/A"}</b> at Hitkarini Sabha.</p><p>We have successfully received your application.</p>`;
        await sendHrEmail({ to: savedApp.email, subject: "✅ Your Application Has Been Received", message: candidateMessage });
      }
    } catch (e) { console.error("⚠️ Failed to send Candidate email:", e?.message || e); }

    res.status(200).json({ message: "Application submitted successfully", data: savedApp });
  } catch (error) {
    console.error("Error removing duplicates:", error);
    res.status(500).json({ success: false, message: "Failed to remove duplicates" });
  }
};

// Excel Import Function (robust + detailed reporting)
exports.uploadExcel = async (req, res) => {
  const fs = require("fs");
  try {
    if (!req.file || !req.file.path) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const xlsx = require('xlsx');
    const workbook = xlsx.readFile(req.file.path);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];

    // Read rows with default values to avoid undefined
    let jsonData = xlsx.utils.sheet_to_json(worksheet, { defval: "" });

    // Normalize keys: trim & lowercase
    jsonData = jsonData.map(row => {
      const normalized = {};
      Object.keys(row).forEach(k => {
        if (typeof k === "string") {
          const nk = k.trim().replace(/\uFEFF/g, ""); // remove BOM if present
          normalized[nk.toLowerCase()] = row[k];
        } else {
          normalized[String(k).toLowerCase()] = row[k];
        }
      });
      return normalized;
    });

    // helper to try many possible header variants
    const getField = (row, variants = []) => {
      for (const v of variants) {
        const key = v.toLowerCase().trim();
        if (row.hasOwnProperty(key) && row[key] !== undefined && row[key] !== "") return row[key];
      }
      // also attempt exact numeric/parenthesized variants present in sheet
      for (const k of Object.keys(row)) {
        for (const v of variants) {
          if (k.includes(v.toLowerCase().trim())) return row[k];
        }
      }
      return "";
    };

    // header variants for common columns in your sheet
    const NAME_VARIANTS = ['(4) applicant full name', 'applicant full name', 'full name', 'name', 'applicant name'];
    const EMAIL_VARIANTS = ['(11) email id', 'email id', 'email address', 'email'];
    const MOBILE_VARIANTS = ['(12) mobile number', 'mobile number', 'mobile', 'phone', 'contact', 'contact number'];
    const DOB_VARIANTS = ['(6) date of birth', 'date of birth', 'dob', 'birthdate'];
    const ADDR_VARIANTS = ['(13) address', 'address', '(20) address with pin code', 'address with pin code'];
    const PIN_VARIANTS = ['(14) pincode', 'pincode', 'zip', 'zip code'];
    const HIGHEST_QUAL_VARIANTS = ['(10) graduation with specialization subject', '(15) highest qualification', 'highest qualification', 'qualification'];
    const INSTITUTION_VARIANTS = ['(17) name of institution', 'name of institution', 'institution'];
    const YOP_VARIANTS = ['(16) year of passing', 'year of passing', 'yop', 'passing year'];
    const APPLY_FOR_VARIANTS = ['(1) apply for', 'apply for'];
    const CATEGORY_VARIANTS = ['(2) category of appointment', 'category of appointment'];

    // simple email regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const accepted = [];
    const rejected = [];
    const seen = new Set(); // to dedupe within uploaded file

    // helper: convert Excel serial or string to Date
    const parseExcelDate = (value) => {
      if (!value && value !== 0) return null;
      if (typeof value === "number") {
        const jsDate = new Date((value - 25569) * 86400 * 1000);
        return isNaN(jsDate.getTime()) ? null : jsDate;
      }
      const jsDate = new Date(value);
      return isNaN(jsDate.getTime()) ? null : jsDate;
    };

    // helper: map qualification string to schema enum
    const mapQualificationLevel = (qualification) => {
      if (!qualification) return null;
      const q = String(qualification).toLowerCase();
      if (q.includes('phd') || q.includes('doctor')) return 'PhD';
      if (q.includes('m.') || q.includes('master') || q.includes('pg')) return 'Post Graduation';
      if (q.includes('b.') || q.includes('bsc') || q.includes('ba') || q.includes('b.com') || q.includes('b.ed') || q.includes('graduation')) return 'Graduation';
      if (q.includes('12') || q.includes('xii') || q.includes('higher secondary')) return '12th';
      if (q.includes('10') || q.includes('x ')) return '10th';
      return 'Graduation';
    };

    jsonData.forEach((rawRow, idx) => {
      // read raw values using variants
      const rawName = getField(rawRow, NAME_VARIANTS);
      const rawEmail = getField(rawRow, EMAIL_VARIANTS);
      const rawMobile = getField(rawRow, MOBILE_VARIANTS);
      const rawDob = getField(rawRow, DOB_VARIANTS);
      const rawAddress = getField(rawRow, ADDR_VARIANTS);
      const rawPin = getField(rawRow, PIN_VARIANTS);
      const rawQual = getField(rawRow, HIGHEST_QUAL_VARIANTS);
      const rawInst = getField(rawRow, INSTITUTION_VARIANTS);
      const rawYop = getField(rawRow, YOP_VARIANTS);
      const rawApplyFor = getField(rawRow, APPLY_FOR_VARIANTS);
      const rawCategory = getField(rawRow, CATEGORY_VARIANTS);

      // normalize strings
      const fullName = String(rawName || "").trim() || null;
      const email = String(rawEmail || "").trim() || "";
      // mobile may be numeric in Excel -> coerce to string and remove .0 if any
      let mobile = rawMobile === null || rawMobile === undefined ? "" : String(rawMobile).trim();
      // Excel sometimes returns floats like "9876543210.0"
      if (mobile.endsWith(".0")) mobile = mobile.replace(/\.0+$/, "");
      mobile = mobile.replace(/\s+/g, "");

      // reasons array for rejection tracing
      const reasons = [];
      if (!fullName) reasons.push("missing name");
      if (!email) reasons.push("missing email");
      else if (!emailRegex.test(email)) reasons.push("invalid email");
      const dobDate = parseExcelDate(rawDob);
      if (!mobile) reasons.push("missing mobile");
      if (!dobDate) reasons.push("missing dob");

      // dedupe key
      const dedupeKey = `${(email || "").toLowerCase()}|${mobile || ""}`;
      if (seen.has(dedupeKey)) reasons.push("duplicate in uploaded file");

      if (reasons.length > 0) {
        rejected.push({ row: idx + 2, // +2 approx: header + 1
                         raw: rawRow,
                         reasons });
        return;
      }

      // mark seen
      seen.add(dedupeKey);

      // map applicationType from "apply for" column
      let applicationType = "college";
      const applyForLc = String(rawApplyFor || "").toLowerCase();
      if (applyForLc.includes("school")) applicationType = "school";
      else if (applyForLc.includes("college")) applicationType = "college";
      else if (applyForLc) applicationType = "others/administration";

      // map applyingFor (Teaching / Non Teaching / Admin)
      let applyingFor = null;
      const catLc = String(rawCategory || "").toLowerCase();
      if (catLc.includes("non") && catLc.includes("teach")) applyingFor = "Non Teaching";
      else if (catLc.includes("teach")) applyingFor = "Teaching";
      else if (catLc.includes("admin")) applyingFor = "Admin";

      // build application object similar to your schema
      const application = {
        fullName,
        applyingFor,
        gender: getField(rawRow, ['(7) gender', 'gender']) || null,
        dateOfBirth: dobDate,
        maritalStatus: getField(rawRow, ['(8) marital status', 'marital status']) || null,
        nationality: getField(rawRow, ['(10) nationality', 'nationality']) || null,
        religion: getField(rawRow, ['religion']) || "",
        email,
        mobileNumber: mobile,
        address: rawAddress || null,
        addressPincode: rawPin || null,
        applicationType,
        educationQualifications: [],
        workExperience: [{
          institutionName: getField(rawRow, ['(19) employer name', 'employer name', 'employer']) || "",
          designation: getField(rawRow, ['(20) designation', 'designation', 'role']) || "",
          startDate: parseExcelDate(getField(rawRow, ['(21) start date', 'start date'])),
          endDate: parseExcelDate(getField(rawRow, ['(22) end date', 'end date']))
        }]
      };

      const qualLevel = mapQualificationLevel(rawQual);
      if (qualLevel) {
        application.educationQualifications.push({
          level: qualLevel,
          institutionName: rawInst || "",
          yearOfPassing: rawYop ? (Number(rawYop) || rawYop) : ""
        });
      }

      accepted.push({ row: idx + 2, application });
    });

    if (accepted.length === 0) {
      // remove uploaded file
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res.status(400).json({
        success: false,
        message: "No valid applications found in the file",
        totalRows: jsonData.length,
        rejectedCount: rejected.length,
        rejectedSample: rejected.slice(0, 10)
      });
    }

    // prepare documents to insert and remove duplicates again (safe)
    const docsToInsert = [];
    const insertSeen = new Set();
    accepted.forEach(a => {
      const key = `${a.application.email.toLowerCase()}|${a.application.mobileNumber}`;
      if (!insertSeen.has(key)) {
        insertSeen.add(key);
        docsToInsert.push(a.application);
      }
    });

    // Insert to DB
    let insertResult;
    try {
      insertResult = await Recruitment.insertMany(docsToInsert, { ordered: false });
    } catch (err) {
      // some drivers return error with result property, some throw BulkWriteError
      if (err && err.result && err.result.insertedCount !== undefined) {
        insertResult = err.result;
      } else if (Array.isArray(err.insertedDocs)) {
        insertResult = err.insertedDocs;
      } else {
        // fallback: try to compute length from what was inserted if available
        insertResult = [];
      }
    }

    const insertedCount = Array.isArray(insertResult) ? insertResult.length : (insertResult.insertedCount || 0);

    // remove uploaded file
    try { fs.unlinkSync(req.file.path); } catch (e) {}

    return res.status(201).json({
      success: true,
      message: "Excel processed",
      totalRows: jsonData.length,
      accepted: docsToInsert.length,
      insertedCount,
      rejectedCount: rejected.length,
      rejectedSample: rejected.slice(0, 10),
      acceptedSample: docsToInsert.slice(0, 10)
    });

  } catch (err) {
    // cleanup file on server error
    try { if (req.file && req.file.path) fs.unlinkSync(req.file.path); } catch (e) {}
    console.error("Error processing Excel:", err);
    return res.status(500).json({ success: false, message: "Error processing file", error: err.message || String(err) });
  }
};



exports.getApplications = async (req, res) => {
  try {
    let { page = 1, limit = 10, ...queryFilters } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);
    const filters = {};
    for (const key in queryFilters) {
      if (queryFilters[key]) {
        if (["fullName", "email", "mobileNumber"].includes(key)) {
          filters[key] = { $regex: queryFilters[key], $options: "i" };
        } else {
          filters[key] = queryFilters[key];
        }
      }
    }

    const total = await Recruitment.countDocuments(filters);
    const data = await Recruitment.find(filters).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit);
    
    const appIds = data.map((d) => d._id);
    const remarks = await HrRemarks.find({ applicationId: { $in: appIds } }).lean();
    const statusMap = new Map(remarks.map(r => [String(r.applicationId), { status: r.latestStatus || r.status, statusUpdatedAt: r.latestStatusAt }]));

    const dataWithStatus = data.map((doc) => {
      const obj = doc.toObject();
      const statusInfo = statusMap.get(String(doc._id));
      return { ...obj, status: statusInfo?.status || "Pending", statusUpdatedAt: statusInfo?.statusUpdatedAt || null };
    });

    res.status(200).json({ page, limit, total, totalPages: Math.ceil(total / limit), data: dataWithStatus });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching applications", error: error.message });
  }
};

exports.getApplicationCounts = async (req, res) => {
    try {
        const counts = await Recruitment.aggregate([ { $group: { _id: "$applyingFor", count: { $sum: 1 } } } ]);
        const result = { Teaching: 0, "Non Teaching": 0, Admin: 0, total: 0 };
        counts.forEach(item => { result[item._id] = item.count; result.total += item.count; });
        res.status(200).json({ message: "Application counts fetched successfully", data: result });
    } catch (error) {
        res.status(500).json({ message: "Error fetching application counts", error: error.message });
    }
};

exports.sendEmail = async (req, res) => {
    try {
        const { applicationId, to, subject, message, status } = req.body;
        const effectiveStatus = ["Selected", "Rejected", "Interview"].includes(status) ? status : "Interview";
        await sendHrEmail({ to, subject, message });
        let hrRemark = await HrRemarks.findOneAndUpdate(
            { applicationId },
            { 
                $push: { [`mailHistory.${effectiveStatus}`]: { to, subject, body: message, sentAt: new Date() } },
                $set: { status: effectiveStatus, latestStatus: effectiveStatus, latestStatusAt: new Date() }
            },
            { upsert: true, new: true }
        );
        res.status(200).json({ message: "Email sent and stored successfully", hrRemark });
    } catch (err) {
        res.status(500).json({ message: "Failed to send email", error: err.message });
    }
};

exports.getApplicationWithStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const application = await Recruitment.findById(id);
    if (!application) return res.status(404).json({ message: "Application not found" });
    const hrRemark = await HrRemarks.findOne({ applicationId: id }).lean();
    const status = hrRemark?.latestStatus || hrRemark?.status || "Pending";
    const statusUpdatedAt = hrRemark?.latestStatusAt || null;
    res.status(200).json({ message: "Application fetched successfully", data: { ...application.toObject(), status, statusUpdatedAt } });
  } catch (err) {
    res.status(500).json({ message: "Error fetching application", error: err.message });
  }
};

exports.generateApplicationPDF = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: "Missing application ID" });

    const application = await Recruitment.findById(id);
    if (!application) return res.status(404).json({ message: "Application not found" });

    let derivedStatus = "Pending";
    try {
      const hrRemark = await HrRemarks.findOne({ applicationId: id }).lean();
      derivedStatus = hrRemark?.latestStatus || hrRemark?.status || "Pending";
    } catch (e) {
      console.warn("Could not derive status:", e?.message || e);
    }

    const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
    
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    const ts = Date.now();
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${(application.fullName || "Application").replace(/\s+/g, "_")}_Application_${ts}.pdf`
    );
    doc.pipe(res);

    const pageWidth = doc.page.width;
    const margin = 50;
    doc.registerFont("Regular", "Helvetica");
    doc.registerFont("Bold", "Helvetica-Bold");

    const colors = { primary: "#0f172a", muted: "#64748b", light: "#e2e8f0", tableOdd: "#ffffff", tableEven: "#f8f8f8" };
    const statusColors = { Pending: { bg: "#e0f2fe", text: "#0369a1" }, Selected: { bg: "#dcfce7", text: "#166534" }, Rejected: { bg: "#fee2e2", text: "#991b1b" }, Interview: { bg: "#fef9c3", text: "#854d0e" } };

    const renderLabelValue = (label, value, x, y, width) => {
      const labelWidth = Math.min(130, Math.floor(width * 0.45));
      doc.font("Bold").fontSize(9).fillColor(colors.primary).text(`${label}:`, x, y, { width: labelWidth });
      const finalY = doc.y;
      doc.font("Regular").fontSize(9).fillColor("black").text(value || "—", x + labelWidth + 4, y, { width: width - labelWidth - 4 });
      return Math.max(finalY, doc.y);
    };
    
    let currentY = margin;

    const drawPageBorder = () => {
      const pw = doc.page.width; const ph = doc.page.height;
      doc.rect(5, 5, pw - 10, ph - 10).lineWidth(2).strokeColor("black").stroke();
      doc.rect(10, 10, pw - 20, ph - 20).lineWidth(1).strokeColor("black").stroke();
    };

    const addHeader = () => {
      const logoPath = path.join(__dirname, "../assets/logo.png");
      if (fs.existsSync(logoPath)) doc.image(logoPath, margin, 20, { width: 50, height: 50 });
      doc.font("Bold").fontSize(16).fillColor(colors.primary).text("Hitkarini Sabha", margin + 60, 25);
      doc.font("Regular").fontSize(12).fillColor(colors.muted).text("Recruitment Application", margin + 60, 45);
      const badgeText = derivedStatus;
      const badgeWidth = doc.widthOfString(badgeText, { font: "Bold", size: 10 }) + 16;
      const badgeX = pageWidth - margin - badgeWidth;
      const sc = statusColors[derivedStatus] || statusColors.Pending;
      doc.roundedRect(badgeX, 22, badgeWidth, 18, 6).fill(sc.bg);
      doc.fillColor(sc.text).font("Bold").fontSize(10).text(badgeText, badgeX + 8, 26);
      doc.moveTo(margin, 80).lineTo(pageWidth - margin, 80).lineWidth(1).strokeColor(colors.light).stroke();
      currentY = 90;
    };

    const addFooter = () => {
      for (let i = 0; i < doc.bufferedPageRange().count; i++) {
        doc.switchToPage(i);
        drawPageBorder();
        doc.font("Regular").fontSize(8).fillColor("gray").text(`Generated on: ${new Date().toLocaleDateString()}`, margin, doc.page.height - 30).text(`Page ${i + 1} of ${doc.bufferedPageRange().count}`, 0, doc.page.height - 30, { align: "right" });
      }
    };

    doc.on('pageAdded', () => { drawPageBorder(); addHeader(); });
    drawPageBorder();
    addHeader();

    if (application.photoLink) {
      try {
        const response = await axios.get(application.photoLink, { responseType: "arraybuffer" });
        const imgBuffer = Buffer.from(response.data, "binary");
        const imgX = pageWidth - margin - 100;
        doc.roundedRect(imgX, currentY, 100, 130, 8).clip().image(imgBuffer, imgX, currentY, { width: 100, height: 130 });
        doc.roundedRect(imgX, currentY, 100, 130, 8).lineWidth(0.5).strokeColor("#cbd5e1").stroke();
      } catch (err) { console.warn("Photo load failed:", err.message); }
    }

    const colWidth = (pageWidth - 2 * margin - 20) / 2;
    const col2X = margin + colWidth + 20;
    
    doc.font("Bold").fontSize(10).fillColor(colors.primary).text("Personal Information", margin, currentY);
    doc.moveTo(margin, doc.y + 2).lineTo(margin + colWidth, doc.y + 2).strokeColor(colors.light).stroke();
    let y1 = doc.y + 4;
    y1 = renderLabelValue("Full Name", application.fullName, margin, y1, colWidth);
    y1 = renderLabelValue("Gender", application.gender, margin, y1, colWidth);
    y1 = renderLabelValue("DOB", application.dateOfBirth ? new Date(application.dateOfBirth).toLocaleDateString('en-GB') : "—", margin, y1, colWidth);
    
    doc.font("Bold").fontSize(10).fillColor(colors.primary).text("Contact Information", col2X, currentY);
    doc.moveTo(col2X, doc.y + 2).lineTo(col2X + colWidth, doc.y + 2).strokeColor(colors.light).stroke();
    let y2 = doc.y + 4;
    y2 = renderLabelValue("Email", application.email, col2X, y2, colWidth);
    y2 = renderLabelValue("Mobile", application.mobileNumber, col2X, y2, colWidth);
    y2 = renderLabelValue("Address", application.address, col2X, y2, colWidth);
    
    currentY = Math.max(y1, y2) + 15;

    const renderTable = (title, headers, colWidths, rows) => {
        if (currentY + 80 > doc.page.height - 80) doc.addPage();
        doc.font("Bold").fontSize(10).fillColor(colors.primary).text(title, margin, currentY);
        let tableY = doc.y + 4;
        const rowH = 16;
        
        let x = margin;
        headers.forEach((h, i) => { doc.rect(x, tableY, colWidths[i], rowH).fill(colors.light); doc.fillColor(colors.primary).font("Bold").fontSize(9).text(h, x + 4, tableY + 4, { width: colWidths[i] - 8 }); x += colWidths[i]; });
        tableY += rowH;
        
        rows.forEach((row, i) => {
            if (tableY + rowH > doc.page.height - 80) { doc.addPage(); tableY = currentY; }
            x = margin;
            row.forEach((cell, j) => { doc.rect(x, tableY, colWidths[j], rowH).fill(i % 2 === 0 ? colors.tableOdd : colors.tableEven).stroke(colors.light); doc.fillColor("black").font("Regular").fontSize(8).text(cell || "—", x + 4, tableY + 4, { width: colWidths[j] - 8 }); x += colWidths[j]; });
            tableY += rowH;
        });
        currentY = tableY + 15;
    };

    renderTable("Educational Qualifications", ["S.No", "Level", "Subject", "Institution", "Year"], [40, 100, 100, 200, 50], application.educationQualifications?.map((e, i) => [i + 1, e.level, e.subject, e.institutionName, e.yearOfPassing]) || []);
    renderTable("Work Experience", ["S.No", "Designation", "Company", "Start", "End"], [40, 150, 180, 80, 80], application.workExperience?.map((w, i) => [i + 1, w.designation, w.institutionName, w.startDate ? new Date(w.startDate).toLocaleDateString('en-GB') : "—", w.endDate ? new Date(w.endDate).toLocaleDateString('en-GB') : "Present"]) || []);
    
    addFooter();
    doc.end();

  } catch (err) {
    console.error("PDF generation error:", err);
    if (!res.headersSent) res.status(500).json({ message: "Error generating PDF", error: err.message });
  }
};

exports.removeDuplicates = async (req, res) => {
  try {
    const duplicates = await Recruitment.aggregate([
      { $group: { _id: { fullName: "$fullName", mobileNumber: "$mobileNumber" }, ids: { $push: "$_id" }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ]);
    let totalRemoved = 0;
    for (const dup of duplicates) {
      const [, ...remove] = dup.ids;
      const result = await Recruitment.deleteMany({ _id: { $in: remove } });
      totalRemoved += result.deletedCount;
    }
    res.status(200).json({ success: true, message: `Removed ${totalRemoved} duplicates.` });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to remove duplicates", error: error.message });
  }
};