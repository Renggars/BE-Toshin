import jenisPekerjaanService from "../services/jenisPekerjaan.service.js";
import {
  responseApiSuccess,
  responseApiFailed,
  responseApiCreateSuccess,
} from "../utils/responseApi.js";

const createJenisPekerjaan = async (req, res) => {
  try {
    const result = await jenisPekerjaanService.createJenisPekerjaan(req.body);
    responseApiCreateSuccess(res, "Success create jenis pekerjaan", result);
  } catch (err) {
    responseApiFailed(res, `Failed create jenis pekerjaan: ${err.message}`);
  }
};

const getJenisPekerjaanList = async (req, res) => {
  try {
    const result = await jenisPekerjaanService.queryJenisPekerjaan();
    responseApiSuccess(res, "Success get jenis pekerjaan list", result);
  } catch (err) {
    responseApiFailed(res, `Failed get jenis pekerjaan list: ${err.message}`);
  }
};

const getJenisPekerjaan = async (req, res) => {
  try {
    const result = await jenisPekerjaanService.getJenisPekerjaanById(
      parseInt(req.params.jenisPekerjaanId),
    );
    responseApiSuccess(res, "Success get jenis pekerjaan", result);
  } catch (err) {
    responseApiFailed(res, `Failed get jenis pekerjaan: ${err.message}`);
  }
};

const updateJenisPekerjaan = async (req, res) => {
  try {
    const result = await jenisPekerjaanService.updateJenisPekerjaanById(
      parseInt(req.params.jenisPekerjaanId),
      req.body,
    );
    responseApiSuccess(res, "Success update jenis pekerjaan", result);
  } catch (err) {
    responseApiFailed(res, `Failed update jenis pekerjaan: ${err.message}`);
  }
};

const deleteJenisPekerjaan = async (req, res) => {
  try {
    const result = await jenisPekerjaanService.deleteJenisPekerjaanById(
      parseInt(req.params.jenisPekerjaanId),
    );
    responseApiSuccess(res, "Success delete jenis pekerjaan", result);
  } catch (err) {
    responseApiFailed(res, `Failed delete jenis pekerjaan: ${err.message}`);
  }
};

export default {
  createJenisPekerjaan,
  getJenisPekerjaanList,
  getJenisPekerjaan,
  updateJenisPekerjaan,
  deleteJenisPekerjaan,
};
