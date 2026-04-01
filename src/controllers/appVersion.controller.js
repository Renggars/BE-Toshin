import fs from "fs/promises";
import path from "path";
import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import ApiError from "../utils/ApiError.js";

const VERSION_FILE_PATH = path.join(
  process.cwd(),
  "storage",
  "app-version.json",
);

const getAppVersion = catchAsync(async (req, res) => {
  try {
    const data = await fs.readFile(VERSION_FILE_PATH, "utf-8");
    const versionInfo = JSON.parse(data);
    res.status(httpStatus.OK).send(versionInfo);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        "File versi aplikasi tidak ditemukan",
      );
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      "Gagal membaca data versi aplikasi",
    );
  }
});

export default {
  getAppVersion,
};
