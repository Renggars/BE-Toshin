import httpStatus from "http-status";
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

export default {
  loginWithNfc,
};
