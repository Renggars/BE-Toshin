// src/controllers/auth.controller.js

import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import authService from "../services/auth.service.js";
import userService from "../services/user.service.js";
import tokenService from "../services/token.service.js";
import ApiError from "../utils/ApiError.js";
import rencanaProduksiService from "../services/rencanaProduksi.service.js";
import moment from "moment";

const register = catchAsync(async (req, res) => {
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
    console.log(req.body.uid_nfc)
    user = await authService.loginWithNfc(req.body.uid_nfc, req);
  } else if (req.body.email && req.body.password) {
    // Login dengan Email & Password
    user = await authService.loginWithEmail(req.body.email, req.body.password, req);
  } else {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Harus menyertakan uid_nfc atau (email dan password)",
    );
  }

  // Generate JWT tokens
  const tokens = await tokenService.generateAuthTokens(user);

  let dashboardData = null;

  if (user.role === "PRODUKSI") {
    try {
      const today = moment().format("YYYY-MM-DD");
      dashboardData = await rencanaProduksiService.getRencanaProduksiHarian(
        user.id,
        today,
      );
    } catch (error) {
      // Jika gagal mengambil dashboard, biarkan null agar login tetap berhasil
      console.error("Error fetching dashboard data during login:", error.message);
    }
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
