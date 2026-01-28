import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import authService from "../services/auth.service.js";
import userService from "../services/user.service.js";
import tokenService from "../services/token.service.js";
import ApiError from "../utils/ApiError.js";
import rencanaProduksiService from "../services/rencanaProduksi.service.js";

const register = catchAsync(async (req, res) => {
  // Cek apakah kartu NFC sudah terdaftar (jika ada)
  if (req.body.uid_nfc) {
    const existingUserByNfc = await userService.getUserByNfc(req.body.uid_nfc);
    if (existingUserByNfc) {
      throw new ApiError(httpStatus.BAD_REQUEST, "Kartu NFC sudah terdaftar");
    }
  }

  // Cek apakah email sudah terdaftar
  const existingUserByEmail = await userService.getUserByEmail(req.body.email);
  if (existingUserByEmail) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Email sudah terdaftar");
  }

  const user = await userService.createUser(req.body);

  // Hapus password dari response
  delete user.password;

  res.status(httpStatus.CREATED).send({
    message: "Registrasi berhasil",
    data: { user },
  });
});

const login = catchAsync(async (req, res) => {
  let user;

  // Deteksi metode login: NFC atau Email
  if (req.body.uid_nfc) {
    // Login dengan NFC
    user = await authService.loginWithNfc(req.body.uid_nfc);
  } else if (req.body.email && req.body.password) {
    // Login dengan Email & Password
    user = await authService.loginWithEmail(req.body.email, req.body.password);
  } else {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Harus menyertakan uid_nfc atau (email dan password)",
    );
  }

  // Generate JWT tokens
  const tokens = await tokenService.generateAuthTokens(user);

  let dashboardData = null;

  if (user.role === "OPERATOR") {
    const today = new Date().toISOString().split("T")[0];
    dashboardData = await rencanaProduksiService.getRencanaProduksiHarian(
      user.id,
      today,
    );
  }

  // Hapus password dari response (jika ada)
  delete user.password;

  res.send({
    message: "Login success",
    data: {
      user,
      tokens,
      dashboard: dashboardData,
    },
  });
});

export default {
  register,
  login,
};
