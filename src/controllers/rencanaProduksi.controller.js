// src/controllers/rencanaProduksi.controller.js

import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import rencanaProduksiService from "../services/rencanaProduksi.service.js";

const createRencanaProduksi = catchAsync(async (req, res) => {
  const data = await rencanaProduksiService.createRencanaProduksi(req.body);

  res.status(httpStatus.CREATED).json({
    status: true,
    message: "Rencana produksi berhasil dibuat",
    data,
  });
});

export default {
  createRencanaProduksi,
};
