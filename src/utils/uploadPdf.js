// src/utils/uploadPdf.js
import path from "path";
import fs from "fs";
import multer from "multer";
import ApiError from "./ApiError.js";
import httpStatus from "http-status";

const UPLOAD_DIR = "public/uploads/documents";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `doc-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === "application/pdf") {
    cb(null, true);
  } else {
    cb(
      new ApiError(
        httpStatus.UNPROCESSABLE_ENTITY,
        "Hanya file PDF yang diperbolehkan",
      ),
      false,
    );
  }
};

const uploadPdf = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  },
  fileFilter,
});

export default uploadPdf;
