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
  // Cek apakah noReg sudah terdaftar
  const existingUserByNoReg = await userService.getUserByNoReg(req.body.noReg);
  if (existingUserByNoReg) {
    throw new ApiError(httpStatus.BAD_REQUEST, "No Registrasi sudah terdaftar");
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

  // Deteksi metode login: NFC atau NoReg
  if (req.body.uidNfc) {
    // Login dengan NFC
    user = await authService.loginWithNfc(req.body.uidNfc, req);
  } else if (req.body.noReg && req.body.password) {
    // Login dengan NoReg & Password
    user = await authService.loginWithNoReg(req.body.noReg, req.body.password, req);
  } else {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Harus menyertakan uidNfc atau (noReg dan password)",
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
      if (process.env.NODE_ENV !== "test") {
        console.error("Error fetching dashboard data during login:", error.message);
      }
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
