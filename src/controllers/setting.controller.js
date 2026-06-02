// src/controllers/setting.controller.js
import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import settingService from "../services/setting.service.js";
import path from "path";
import fs from "fs";

const getLoginBackground = catchAsync(async (req, res) => {
  const setting = await settingService.getSetting("login_background");
  if (!setting || !setting.value) {
    return res.status(httpStatus.NOT_FOUND).send({
      status: false,
      message: "Background login belum diatur",
    });
  }
  res.send({
    status: true,
    data: {
      url: `/settings/login-background/image`,
    },
  });
});

const getLoginBackgroundImage = catchAsync(async (req, res) => {
  const setting = await settingService.getSetting("login_background");
  if (!setting || !setting.value) {
    return res.status(httpStatus.NOT_FOUND).send("Background not found");
  }

  const absPath = path.resolve(setting.value);
  if (!fs.existsSync(absPath)) {
    return res.status(httpStatus.NOT_FOUND).send("File not found");
  }

  res.sendFile(absPath);
});

const updateLoginBackground = catchAsync(async (req, res) => {
  const setting = await settingService.updateLoginBackground(req.file);
  res.send({
    status: true,
    message: "Background login berhasil diperbarui",
    data: setting,
  });
});

export default {
  getLoginBackground,
  getLoginBackgroundImage,
  updateLoginBackground,
};
