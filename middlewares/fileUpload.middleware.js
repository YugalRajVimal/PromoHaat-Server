import multer from "multer";
import fs from "fs";
import path from "path";

// Configure disk storage with extended support for user KYC document uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = "./Uploads/"; // Default fallback

    // Therapist-specific upload directory (retained from original)
    const therapistFileFields = [
      "aadhaarFront",
      "aadhaarBack",
      "photo",
      "resume",
      "certificate",
    ];

    // --- KYC upload routes for user KYC documents ---
    // See: user.controller.js completeKYC and user.routes.js for fieldnames
    const userKYCFields = [
      "aadharFrontFile",
      "aadharBackFile",
      "panFile",
    ];

    // Directory for user KYC documents
    if (
      userKYCFields.includes(file.fieldname) &&
      req.method === "POST" &&
      req.originalUrl &&
      (
        req.originalUrl === "/api/user/kyc/upload" ||
        req.originalUrl.endsWith("/user/kyc/upload")
      )
    ) {
      uploadPath = "./Uploads/UserKYC";
    }
    // Therapist document upload directory
    else if (
      therapistFileFields.includes(file.fieldname) &&
      req.method === "POST" &&
      req.originalUrl &&
      (
        req.originalUrl === "/api/admin/therapist" ||
        req.originalUrl.endsWith("/admin/therapist")
      )
    ) {
      uploadPath = "./Uploads/Therapist";
    }
    // Excel files
    else if (file.fieldname === "excelFile") {
      uploadPath = "./Uploads/ExcelFiles";
    }

    // Ensure folder exists
    fs.mkdirSync(uploadPath, { recursive: true });

    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Create unique filename
    const timestamp = Date.now();
    const cleanName =
      file.originalname
        .replace(/\s+/g, "_")                 // Replace spaces
        .replace(/[^a-zA-Z0-9_.-]/g, "");     // Remove unsafe chars
    cb(null, `${timestamp}-${cleanName}`);
  },
});

// File filter for common field types (Excel, images)
const fileFilter = (req, file, cb) => {
  // Excel files
  if (
    file.fieldname === "excelFile" &&
    !file.originalname.match(/\.(xls|xlsx)$/i)
  ) {
    return cb(new Error("Only Excel files are allowed!"), false);
  }

  // KYC document files: Accept images only
  const kycFieldNames = [
    "aadharFrontFile",
    "aadharBackFile",
    "panFile",
  ];
  if (
    kycFieldNames.includes(file.fieldname) &&
    !file.mimetype.match(/^image\/(jpeg|png|jpg)$/)
  ) {
    return cb(new Error("Only JPEG or PNG images allowed for KYC documents!"), false);
  }

  // Therapist files (allow PDF for resume/certificate, else image)
  if (
    ["resume", "certificate"].includes(file.fieldname) &&
    !file.mimetype.match(/(pdf|msword|officedocument)/i) &&
    !file.mimetype.match(/^image\//)
  ) {
    return cb(new Error("Certificate and resume must be image or PDF/Doc files!"), false);
  }

  cb(null, true);
};

// Multer middleware export
export const upload = multer({
  storage,
  fileFilter,
});
