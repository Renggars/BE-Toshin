import bcrypt from "bcryptjs";
import userService from "./user.service.js";
import attendanceService from "./attendance.service.js";
import ApiError from "../utils/ApiError.js";
import httpStatus from "http-status";

/**
 * Login dengan NFC UID
 * @param {string} uid_nfc
 * @returns {Promise<User>}
 */
const loginWithNfc = async (uidNfc, req) => {
  const user = await userService.getUserByNfc(uidNfc);

  if (!user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Kartu akses tidak dikenal");
  }

  if (user.status === "suspended") {
    throw new ApiError(httpStatus.FORBIDDEN, "Akun Anda sedang ditangguhkan");
  }

  await attendanceService.clockIn(user, req);

  // Return fresh user data to include updated points
  return userService.getUserByNfc(uidNfc);
};

/**
 * Login dengan No Registrasi & Password
 * @param {string} noReg
 * @param {string} password
 * @returns {Promise<User>}
 */
const loginWithNoReg = async (noReg, password, req) => {
  const user = await userService.getUserByNoReg(noReg);

  if (!user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "No Registrasi atau password salah");
  }

  const isPasswordMatch = await bcrypt.compare(password, user.password);
  if (!isPasswordMatch) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "No Registrasi atau password salah");
  }

  if (user.status === "suspended") {
    throw new ApiError(httpStatus.FORBIDDEN, "Akun Anda sedang ditangguhkan");
  }

  await attendanceService.clockIn(user, req);

  // Return fresh user data to include updated points
  return userService.getUserByNoReg(noReg);
};

export default {
  loginWithNfc,
  loginWithNoReg,
};
