// src/utils/uploadRelease.js
import path from "path";
import fs from "fs";
import multer from "multer";
import ApiError from "./ApiError.js";
import httpStatus from "http-status";

const UPLOAD_DIR = "storage/releases";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const platform = req.params.platform || "app";
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `toshin-${platform}-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === ".apk" || ext === ".exe") {
    cb(null, true);
  } else {
    cb(
      new ApiError(
        httpStatus.UNPROCESSABLE_ENTITY,
        "Hanya file .apk atau .exe yang diperbolehkan",
      ),
      false,
    );
  }
};

const uploadRelease = multer({
  storage,
  limits: {
    fileSize: 150 * 1024 * 1024, // 150 MB
  },
  fileFilter,
});

export default uploadRelease;
