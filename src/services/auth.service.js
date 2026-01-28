import httpStatus from "http-status";
import bcrypt from "bcryptjs";
import userService from "./user.service.js";
import ApiError from "../utils/ApiError.js";

/**
 * Login dengan NFC UID
 * @param {string} uid_nfc
 * @returns {Promise<User>}
 */
const loginWithNfc = async (uid_nfc) => {
  const user = await userService.getUserByNfc(uid_nfc);

  if (!user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Kartu akses tidak dikenal");
  }

  if (user.status === "suspended") {
    throw new ApiError(httpStatus.FORBIDDEN, "Akun Anda sedang ditangguhkan");
  }

  return user;
};

/**
 * Login dengan Email & Password
 * @param {string} email
 * @param {string} password
 * @returns {Promise<User>}
 */
const loginWithEmail = async (email, password) => {
  const user = await userService.getUserByEmail(email);

  if (!user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Email atau password salah");
  }

  const isPasswordMatch = await bcrypt.compare(password, user.password);
  if (!isPasswordMatch) {
    throw new ApiError(httpStatus.UNAUTHORIZED, "Email atau password salah");
  }

  if (user.status === "suspended") {
    throw new ApiError(httpStatus.FORBIDDEN, "Akun Anda sedang ditangguhkan");
  }

  return user;
};

export default {
  loginWithNfc,
  loginWithEmail,
};
