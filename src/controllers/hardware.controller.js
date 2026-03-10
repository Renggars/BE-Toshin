import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import { responseApiSuccess } from "../utils/responseApi.js";
import tcpService from "../services/tcp.service.js";
import ApiError from "../utils/ApiError.js";


const triggerHardware = catchAsync(async (req, res) => {
    const { targetId, task, cmd } = req.body;

    const payload = { task, cmd };

    const isSent = tcpService.sendCommandToDevice(targetId, payload);

    if (!isSent) {

        throw new ApiError(
            httpStatus.SERVICE_UNAVAILABLE,
            `Hardware ${targetId} sedang offline atau tidak terhubung ke TCP Server.`
        );
    }

    responseApiSuccess(res, `Berhasil mengirim perintah ke Hardware ${targetId}`, payload, httpStatus.OK);
});

export default {
    triggerHardware,
}