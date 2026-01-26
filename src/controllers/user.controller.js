import userService from "../services/user.service.js";
import ApiError from "../utils/ApiError.js";
import httpStatus from "http-status";
import {
  responseApiSuccess,
  responseApiFailed,
  responseApiCreateSuccess,
} from "../utils/responseApi.js";

const createUser = async (req, res) => {
  try {
    const result = await userService.createUser(req.body);
    responseApiCreateSuccess(res, "Success create user", result);
  } catch (err) {
    responseApiFailed(res, `Failed create user ${err}`);
  }
};

const getUsers = async (req, res) => {
  try {
    const { page, limit, ...filter } = req.query;
    const result = await userService.queryUsers(filter, {
      page,
      limit,
    });
    responseApiSuccess(res, "Success get users", result);
  } catch (err) {
    responseApiFailed(res, `Failed get Users ${err}`);
  }
};

const getUser = async (req, res) => {
  try {
    const result = await userService.getUserById(req.params.userId);
    responseApiSuccess(res, "Success get user", result);
  } catch (err) {
    responseApiFailed(res, `Failed get user ${err}`);
  }
};

const getUserByEmail = async (req, res) => {
  try {
    const { email } = req.query;
    const result = await userService.getUserByEmail(email);
    responseApiSuccess(res, "Success get user", result);
  } catch (err) {
    responseApiFailed(res, `Failed get user ${err}`);
  }
};

const updateUser = async (req, res) => {
  try {
    const result = await userService.updateUserById(
      req.params.userId,
      req.body
    );

    responseApiSuccess(res, "Success update user", result);
  } catch (err) {
    console.log(err);
    responseApiFailed(res, `Failed update user ${err}`);
  }
};

const deleteUser = async (req, res) => {
  try {
    const result = await userService.deleteUserById(req.params.userId);
    responseApiSuccess(res, "Success delete user", result);
  } catch (err) {
    console.log(err);
    responseApiFailed(res, `Failed delete user ${err}`);
  }
};

const getCurrentUser = async (req, res) => {
  try {
    const userId = parseInt(req.user.id);
    if (!userId) {
      throw new ApiError(httpStatus.BAD_REQUEST, "User ID not found in token");
    }
    const result = await userService.getCurrentUserData(userId);
    responseApiSuccess(res, "Success get user ", result);
  } catch (err) {
    console.log(err);
    responseApiFailed(res, `Failed get user ${err}`);
  }
};

export default {
  getUsers,
  getUser,
  getUserByEmail,
  createUser,
  updateUser,
  deleteUser,
  getCurrentUser,
};
