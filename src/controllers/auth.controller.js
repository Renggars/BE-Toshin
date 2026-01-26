import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import authService from "../services/auth.service.js";
import userService from "../services/user.service.js";
import tokenService from "../services/token.service.js";
import ApiError from "../utils/ApiError.js";
import rencanaProduksiService from "../services/rencanaProduksi.service.js";

const register = catchAsync(async (req, res) => {
  // Cek apakah kartu sudah terdaftar
  const existingUser = await userService.getUserByNfc(req.body.uid_nfc);
  if (existingUser) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Kartu NFC sudah terdaftar");
  }

  const user = await userService.createUser(req.body);
  res.status(httpStatus.CREATED).send({
    message: "Registrasi berhasil",
    data: { user },
  });
});

const login = catchAsync(async (req, res) => {
  const { uid_nfc } = req.body;

  // Verifikasi user via service
  const user = await authService.loginWithNfc(uid_nfc);

  // Generate JWT tokens
  const tokens = await tokenService.generateAuthTokens(user);

  let dashboardData = null;

  if (user.role === "OPERATOR") {
    const today = new Date().toISOString().split("T")[0];
    const rp = await rencanaProduksiService.getRencanaProduksiHarian(
      user.id,
      today,
    );

    if (rp) {
      dashboardData = {
        rencana_kerja: {
          mesin: rp.mesin.nama_mesin,
          produk: rp.produk.nama_produk,
          shift: `${rp.shift.nama_shift} (${rp.shift.jam_masuk} - ${rp.shift.jam_keluar})`,

          // Target dari Master Data (Sebelum lembur)
          target_regular: rp.target.total_target,

          lembur: rp.is_lembur ? "Ya" : "Tidak",
          target_lembur: rp.target_lembur || 0,

          total_target: rp.target.total_target + (rp.target_lembur || 0),

          jenis_pekerjaan: rp.target.jenis_pekerjaan.nama_pekerjaan,
          catatan_produksi: rp.keterangan || "Tidak ada catatan untuk hari ini",
        },
      };
    }
  }

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
