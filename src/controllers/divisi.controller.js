import divisiService from "../services/divisi.service.js";
import {
  responseApiSuccess,
  responseApiFailed,
  responseApiCreateSuccess,
} from "../utils/responseApi.js";

const createDivisi = async (req, res) => {
  try {
    const result = await divisiService.createDivisi(req.body);
    responseApiCreateSuccess(res, "Success create divisi", result);
  } catch (err) {
    responseApiFailed(res, `Failed create divisi: ${err.message}`);
  }
};

const getDivisiList = async (req, res) => {
  try {
    const result = await divisiService.queryDivisi();
    responseApiSuccess(res, "Success get divisi list", result);
  } catch (err) {
    responseApiFailed(res, `Failed get divisi list: ${err.message}`);
  }
};

const getDivisi = async (req, res) => {
  try {
    const result = await divisiService.getDivisiById(
      parseInt(req.params.divisiId),
    );
    responseApiSuccess(res, "Success get divisi", result);
  } catch (err) {
    responseApiFailed(res, `Failed get divisi: ${err.message}`);
  }
};

const updateDivisi = async (req, res) => {
  try {
    const result = await divisiService.updateDivisiById(
      parseInt(req.params.divisiId),
      req.body,
    );
    responseApiSuccess(res, "Success update divisi", result);
  } catch (err) {
    responseApiFailed(res, `Failed update divisi: ${err.message}`);
  }
};

const deleteDivisi = async (req, res) => {
  try {
    const result = await divisiService.deleteDivisiById(
      parseInt(req.params.divisiId),
    );
    responseApiSuccess(res, "Success delete divisi", result);
  } catch (err) {
    responseApiFailed(res, `Failed delete divisi: ${err.message}`);
  }
};

export default {
  createDivisi,
  getDivisiList,
  getDivisi,
  updateDivisi,
  deleteDivisi,
};
