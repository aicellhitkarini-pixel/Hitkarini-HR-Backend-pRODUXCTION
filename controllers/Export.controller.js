const Recruitment = require("../models/Recuitment.modal");
const HrRemarks = require("../models/HrRemarks");
const ExcelJS = require("exceljs");

function buildFiltersFromQuery(query) {
  const { page, limit, q, minExperience, maxExperience, ...rest } = query || {};
  const filters = {};
  for (const key in rest) {
    const val = rest[key];
    if (val === undefined || val === null || val === "") continue;
    if (["fullName", "email", "mobileNumber"].includes(key)) {
      filters[key] = { $regex: val, $options: "i" };
    } else {
      // Normalize certain fields to match DB values
      if (key === 'applicationType' && typeof val === 'string') {
        filters[key] = val.toLowerCase();
      } else {
        filters[key] = val;
      }
    }
  }
  if (minExperience || maxExperience) {
    filters.totalWorkExperience = {};
    if (minExperience) filters.totalWorkExperience.$gte = Number(minExperience) || 0;
    if (maxExperience) filters.totalWorkExperience.$lte = Number(maxExperience) || 0;
  }
  if (q) {
    const regex = { $regex: q, $options: "i" };
    filters.$or = [{ fullName: regex }, { email: regex }, { mobileNumber: regex }];
  }
  return filters;
}

async function fetchWithStatus(filters) {
  const data = await Recruitment.find(filters).sort({ createdAt: -1 }).lean();
  const appIds = data.map((d) => d._id);
  const remarks = await HrRemarks.find({ applicationId: { $in: appIds } }).lean();
  const statusMap = new Map(
    remarks.map((r) => [String(r.applicationId), { status: r.latestStatus || r.status, statusUpdatedAt: r.latestStatusAt }])
  );
  return data.map((doc) => ({
    ...doc,
    status: statusMap.get(String(doc._id))?.status || "Pending",
    statusUpdatedAt: statusMap.get(String(doc._id))?.statusUpdatedAt || null,
  }));
}

function writeCommonColumns(worksheet) {
  worksheet.columns = [
    { header: "Full Name", key: "fullName", width: 24 },
    { header: "Father Name", key: "fatherName", width: 20 },
    { header: "Mother Name", key: "motherName", width: 20 },
    { header: "DOB", key: "dateOfBirth", width: 16 },
    { header: "Gender", key: "gender", width: 10 },
    { header: "Blood Group", key: "bloodGroup", width: 12 },
    { header: "Category", key: "category", width: 12 },
    { header: "Religion", key: "religion", width: 14 },
    { header: "Nationality", key: "nationality", width: 14 },
    { header: "Region/State", key: "region", width: 16 },
    { header: "Country", key: "countryName", width: 16 },
    { header: "Email", key: "email", width: 28 },
    { header: "Mobile", key: "mobileNumber", width: 16 },
    { header: "Emergency Mobile", key: "emergencyMobileNumber", width: 18 },
    { header: "Address", key: "address", width: 30 },
    { header: "Address Pincode", key: "addressPincode", width: 14 },
    { header: "Permanent Address", key: "permanentAddress", width: 30 },
    { header: "Permanent Pincode", key: "permanentAddressPincode", width: 16 },
    { header: "Applying For", key: "applyingFor", width: 18 },
    { header: "Application Type", key: "applicationType", width: 14 },
    { header: "Subject/Department", key: "subjectOrDepartment", width: 22 },
    { header: "Area Of Interest", key: "areaOfInterest", width: 20 },
    { header: "Experience Type", key: "experienceType", width: 14 },
    { header: "Experience (yrs)", key: "totalWorkExperience", width: 18 },
    { header: "Expected Salary", key: "expectedSalary", width: 18 },
    { header: "Languages Known", key: "languagesKnown", width: 22 },
    { header: "LinkedIn", key: "linkedin", width: 28 },
    { header: "Facebook", key: "facebook", width: 28 },
    { header: "Instagram", key: "instagram", width: 28 },
    { header: "Status", key: "status", width: 14 },
    { header: "Status Updated At", key: "statusUpdatedAt", width: 22 },
    { header: "Applied On", key: "createdAt", width: 20 },
  ];
}

function mapRow(app) {
  return {
    fullName: app.fullName || "",
    fatherName: app.fatherName || "",
    motherName: app.motherName || "",
    dateOfBirth: app.dateOfBirth ? new Date(app.dateOfBirth).toLocaleDateString() : "",
    gender: app.gender || "",
    bloodGroup: app.bloodGroup || "",
    category: app.category || "",
    religion: app.religion || "",
    nationality: app.nationality || "",
    region: app.region || "",
    countryName: app.countryName || "",
    email: app.email || "",
    mobileNumber: app.mobileNumber || "",
    emergencyMobileNumber: app.emergencyMobileNumber || "",
    address: app.address || "",
    addressPincode: app.addressPincode || "",
    permanentAddress: app.permanentAddress || "",
    permanentAddressPincode: app.permanentAddressPincode || "",
    applyingFor: app.applyingFor || "",
    applicationType: app.applicationType || "",
    subjectOrDepartment: app.subjectOrDepartment || "",
    areaOfInterest: app.areaOfInterest || "",
    experienceType: app.experienceType || "",
    totalWorkExperience: app.totalWorkExperience ?? "",
    expectedSalary: app.expectedSalary || "",
    languagesKnown: Array.isArray(app.languagesKnown) ? app.languagesKnown.join(", ") : "",
    linkedin: app?.socialMedia?.linkedin || "",
    facebook: app?.socialMedia?.facebook || "",
    instagram: app?.socialMedia?.instagram || "",
    status: app.status || "Pending",
    statusUpdatedAt: app.statusUpdatedAt ? new Date(app.statusUpdatedAt).toLocaleString() : "",
    createdAt: app.createdAt ? new Date(app.createdAt).toLocaleString() : "",
  };
}

function addDetailSheets(workbook, rows) {
  // Education sheet
  const edu = workbook.addWorksheet("Education");
  edu.columns = [
    { header: "App ID", key: "_id", width: 24 },
    { header: "Level", key: "level", width: 16 },
    { header: "Exam Type", key: "examType", width: 14 },
    { header: "Medium", key: "medium", width: 12 },
    { header: "Subject", key: "subject", width: 22 },
    { header: "Board/University", key: "boardOrUniversity", width: 26 },
    { header: "Institution", key: "institutionName", width: 26 },
    { header: "Year", key: "yearOfPassing", width: 10 },
    { header: "% / CGPA", key: "percentageOrCGPA", width: 12 },
  ];
  rows.forEach((r) => {
    (r.educationQualifications || []).forEach((e) => {
      edu.addRow({ _id: String(r._id), ...e });
    });
  });

  // Work Experience sheet
  const work = workbook.addWorksheet("WorkExperience");
  work.columns = [
    { header: "App ID", key: "_id", width: 24 },
    { header: "S.No", key: "serialNo", width: 8 },
    { header: "Company/Institution", key: "institutionName", width: 26 },
    { header: "Designation", key: "designation", width: 22 },
    { header: "Start Date", key: "startDate", width: 16 },
    { header: "End Date", key: "endDate", width: 16 },
    { header: "Net Monthly Salary", key: "netMonthlySalary", width: 18 },
    { header: "Reason of Leaving", key: "reasonOfLeaving", width: 22 },
  ];
  rows.forEach((r) => {
    (r.workExperience || []).forEach((w) => {
      work.addRow({
        _id: String(r._id),
        serialNo: w.serialNo ?? "",
        institutionName: w.institutionName || "",
        designation: w.designation || "",
        startDate: w.startDate ? new Date(w.startDate).toLocaleDateString() : "",
        endDate: w.endDate ? new Date(w.endDate).toLocaleDateString() : "Present",
        netMonthlySalary: w.netMonthlySalary ?? "",
        reasonOfLeaving: w.reasonOfLeaving || "",
      });
    });
  });

  // References sheet
  const refs = workbook.addWorksheet("References");
  refs.columns = [
    { header: "App ID", key: "_id", width: 24 },
    { header: "Name", key: "name", width: 22 },
    { header: "Designation", key: "designation", width: 22 },
    { header: "Contact", key: "contact", width: 20 },
  ];
  rows.forEach((r) => {
    (r.references || []).forEach((ref) => {
      refs.addRow({ _id: String(r._id), ...ref });
    });
  });
}

exports.exportApplicationsExcel = async (req, res) => {
  try {
    const filters = buildFiltersFromQuery(req.query);
    console.log('[Export] /export/excel filters:', JSON.stringify(filters));
    let rows = await fetchWithStatus(filters);
    console.log('[Export] /export/excel rows:', rows.length);
    if (rows.length === 0) {
      const total = await Recruitment.countDocuments({});
      if (total > 0) {
        console.log('[Export] No rows for filters, falling back to ALL export. Total docs:', total);
        rows = await fetchWithStatus({});
      }
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Applications");
    writeCommonColumns(sheet);
    sheet.addRows(rows.map(mapRow));
    addDetailSheets(workbook, rows);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    const ts = Date.now();
    res.setHeader("Content-Disposition", `attachment; filename=applications_${ts}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Excel export error:", err);
    if (!res.headersSent) res.status(500).json({ message: "Error exporting Excel", error: err.message });
  }
};

exports.exportSelectedApplicationsExcel = async (req, res) => {
  try {
    const idsParam = (req.query.ids || "").trim();
    if (!idsParam) return res.status(400).json({ message: "Missing ids parameter" });
    const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) return res.status(400).json({ message: "No valid ids provided" });

    console.log('[Export] /export/excel/selected ids:', ids.length);
    const rows = await fetchWithStatus({ _id: { $in: ids } });
    console.log('[Export] /export/excel/selected rows:', rows.length);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Applications");
    writeCommonColumns(sheet);
    sheet.addRows(rows.map(mapRow));
    addDetailSheets(workbook, rows);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    const ts = Date.now();
    res.setHeader("Content-Disposition", `attachment; filename=applications_selected_${ts}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Excel export (selected) error:", err);
    if (!res.headersSent) res.status(500).json({ message: "Error exporting selected Excel", error: err.message });
  }
};
