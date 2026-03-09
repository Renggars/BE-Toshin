// utils/upload.js
import path from "path";
import fs from "fs";
import multer from "multer";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let dir = "public/uploads/user-profiles";
    if (req.baseUrl.includes("/poin") || req.path.includes("/poin")) {
      dir = "public/uploads/poin-images";
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
    fileSize: 1 * 1024 * 1024, // Batasi maksimal 1MB
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
