import userService from "../services/user.service.js";
import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import ApiError from "../utils/ApiError.js";
import {
  responseApiSuccess,
  responseApiCreateSuccess,
} from "../utils/responseApi.js";

const createUser = catchAsync(async (req, res) => {
  const result = await userService.createUser(req.body);
  responseApiCreateSuccess(res, "Success create user", result);
});

const uploadPhoto = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, "File gambar harus disertakan");
  }
  const relativePath = `/uploads/user-profiles/${req.file.filename}`;
  responseApiSuccess(res, "Foto profil berhasil diunggah", {
    url: relativePath,
  });
});

const getUsers = catchAsync(async (req, res) => {
  const { page, limit, ...filter } = req.query;
  const result = await userService.queryUsers(filter);
  responseApiSuccess(res, "Success get users", result);
});

const getUser = catchAsync(async (req, res) => {
  const result = await userService.getUserById(parseInt(req.params.userId));
  responseApiSuccess(res, "Success get user", result);
});

const updateUser = catchAsync(async (req, res) => {
  const result = await userService.updateUserById(
    parseInt(req.params.userId),
    req.body,
  );
  responseApiSuccess(res, "Success update user", result);
});

const deactivateUser = catchAsync(async (req, res) => {
  const result = await userService.deactivateUserById(
    parseInt(req.params.userId),
  );
  responseApiSuccess(res, "Success deactivate user", result);
});

const getCurrentUser = catchAsync(async (req, res) => {
  const userId = parseInt(req.user.id);
  const result = await userService.getCurrentUserData(userId);
  responseApiSuccess(res, "Success get user ", result);
});

export default {
  getUsers,
  getUser,
  createUser,
  uploadPhoto,
  updateUser,
  getCurrentUser,
  deactivateUser,
};
