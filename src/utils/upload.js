// utils/upload.js
import path from "path";
import fs from "fs";
import multer from "multer";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let dir = "public/uploads/user-profiles";
    if (req.baseUrl.includes("/poin") || req.path.includes("/poin")) {
      dir = "public/uploads/poin-images";
    } else if (req.baseUrl.includes("/mandor-tasks") || req.path.includes("/mandor-tasks")) {
      dir = "public/uploads/mandor-tasks";
    } else if (req.baseUrl.includes("/settings") || req.path.includes("/settings")) {
      dir = "public/uploads/system-settings";
    }
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`,
    );
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // Batasi maksimal 5MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Hanya file gambar yang diperbolehkan!"), false);
    }
  },
});

export default upload;
