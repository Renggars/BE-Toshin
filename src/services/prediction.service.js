import { Client } from "@gradio/client";
import prisma from "../../prisma/index.js";
import config from "../config/config.js";

const HF_PREDICT_SPACE_URL = config.hfPredictSpaceUrl || "https://toshin-mlp-predictor.hf.space";
const HF_PREDICT_TIMEOUT_MS = parseInt(config.hfPredictTimeoutMs || "15000", 10);

/**
 * Health check ke Prediction Space
 * Cek apakah model sudah terload dan siap predict
 */
const checkHealth = async () => {
  try {
    const client = await Client.connect(HF_PREDICT_SPACE_URL, {
      timeout: 5000,
    });
    const result = await client.predict("/health", {});
    return result.data;
  } catch (error) {
    return { model_loaded: false, error: error.message };
  }
};

/**
 * Dapatkan fitur ML dari cache table (prediction_feature_cache)
 * Sangat cepat karena hanya baca dari tabel ringan
 */
const getMLFeaturesFromCache = async (mesinId, days = 30) => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  return prisma.predictionFeatureCache.findMany({
    where: {
      mesinId: Number(mesinId),
      tanggal: { gte: startDate },
    },
    orderBy: [{ tanggal: "asc" }, { shiftId: "asc" }],
  });
};

/**
 * Prediksi produksi untuk mesin tertentu
 * Strategi 3-tier:
 *   1. Cek health model
 *   2. Cek apakah data historis cukup (min 7 hari)
 *   3. Panggil HF Prediction Space
 */
const getPrediction = async (mesinId, shiftId, tanggal) => {
  const result = {
    available: false,
    predicted_qty: null,
    confidence: null,
    message: "",
  };

  try {
    // Level 1: Health Check
    let health;
    try {
      const client = await Client.connect(HF_PREDICT_SPACE_URL, {
        timeout: 5000,
      });
      health = await client.predict("/health", {});
    } catch (err) {
      result.message = "Prediction service tidak tersedia (HF Space offline)";
      return result;
    }

    const healthData = health.data;
    if (!healthData || !healthData.model_loaded) {
      result.message = "Model prediksi belum di-training";
      return result;
    }

    // Level 2: Cek data historis dari cache
    const features = await getMLFeaturesFromCache(mesinId, 30);
    if (features.length < 7) {
      result.message = `Data historis belum cukup (${features.length}/7 hari minimal)`;
      return result;
    }

    // Level 3: Panggil Prediction
    const client = await Client.connect(HF_PREDICT_SPACE_URL, {
      timeout: HF_PREDICT_TIMEOUT_MS,
    });

    const predictResult = await client.predict("/predict", {
      raw_features_json: JSON.stringify(features),
      target_mesin_id: Number(mesinId),
      target_shift_id: Number(shiftId || 0),
      target_tanggal: tanggal,
    });

    const predictionData = predictResult.data;
    if (predictionData && predictionData.predicted_qty !== undefined) {
      result.available = true;
      result.predicted_qty = predictionData.predicted_qty;
      result.confidence = predictionData.confidence || null;
      result.message = "Prediksi berhasil";
    } else {
      result.message = "Response dari prediction service tidak valid";
    }

    return result;
  } catch (error) {
    result.message = `Prediction error: ${error.message}`;
    return result;
  }
};

export default {
  checkHealth,
  getMLFeaturesFromCache,
  getPrediction,
};