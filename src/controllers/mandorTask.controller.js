import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import { responseApiSuccess } from "../utils/responseApi.js";
import mandorTaskService from "../services/mandorTask.service.js";

const createTask = catchAsync(async (req, res) => {
  const supervisorId = req.user.id;
  const foto = req.file ? req.file.path : null;
  const result = await mandorTaskService.createTask({
    ...req.body,
    supervisorId,
    foto,
  });
  responseApiSuccess(
    res,
    "Success create mandor task",
    result,
    httpStatus.CREATED,
  );
});

const getMyTasks = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const role = req.user.role;

  let result;
  if (role === "MANDOR") {
    result = await mandorTaskService.getTasksForMandor(userId);
  } else {
    result = await mandorTaskService.getTasksForSupervisor(userId);
  }

  responseApiSuccess(res, "Success get mandor tasks", result);
});

const updateStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { status, catatan } = req.body;
  const foto = req.file ? req.file.path : null;
  const result = await mandorTaskService.updateTaskStatus(parseInt(id), {
    status,
    catatan,
    foto,
  });
  responseApiSuccess(res, "Success update mandor task status", result);
});

const deleteTask = catchAsync(async (req, res) => {
  const { id } = req.params;
  await mandorTaskService.deleteTask(parseInt(id));
  responseApiSuccess(res, "Success delete mandor task", null);
});

export default {
  createTask,
  getMyTasks,
  updateStatus,
  deleteTask,
};
