import axios from "axios";
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
    const res = await axios.get(`${HF_PREDICT_SPACE_URL}/health`, { timeout: 5000 });
    return res.data;
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
 *   3. Panggil HF Prediction Space via REST API
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
      const res = await axios.get(`${HF_PREDICT_SPACE_URL}/health`, { timeout: 5000 });
      health = res.data;
    } catch (err) {
      result.message = "Prediction service tidak tersedia (HF Space offline)";
      return result;
    }

    if (!health || !health.model_loaded) {
      result.message = "Model prediksi belum di-training";
      return result;
    }

    // Level 2: Cek data historis dari cache
    const features = await getMLFeaturesFromCache(mesinId, 30);
    if (features.length < 7) {
      result.message = `Data historis belum cukup (${features.length}/7 hari minimal)`;
      return result;
    }

    // Hitung rata-rata 7 data terakhir sebagai proxy fitur target
    const recentFeatures = features.slice(-7);
    const avgAvail = recentFeatures.reduce((s, f) => s + Number(f.availability || 0), 0) / recentFeatures.length;
    const avgPerf = recentFeatures.reduce((s, f) => s + Number(f.performance || 0), 0) / recentFeatures.length;
    const avgQual = recentFeatures.reduce((s, f) => s + Number(f.quality || 0), 0) / recentFeatures.length;
    const avgDown = recentFeatures.reduce((s, f) => s + Number(f.downtimeDuration || 0), 0) / recentFeatures.length;

    const targetDate = new Date(tanggal);
    const hour = targetDate.getHours() || 8; 
    let day = targetDate.getDay();
    if (day === 0) day = 7; // Sesuaikan mapping day jika diperlukan
    const isHoliday = (day === 6 || day === 7) ? 1 : 0;

    const modelFeatures = [avgAvail, avgPerf, avgQual, avgDown, hour, day, isHoliday];

    // Level 3: Panggil Prediction via REST API
    try {
      const predictResult = await axios.post(`${HF_PREDICT_SPACE_URL}/predict`, {
        mesinId: Number(mesinId),
        features: modelFeatures,
        totalOk: 0,
        timestamp: targetDate.toISOString()
      }, {
        timeout: HF_PREDICT_TIMEOUT_MS,
      });

      const predictionData = predictResult.data;
      if (predictionData && predictionData.predicted_totalOk !== undefined) {
        result.available = true;
        result.predicted_qty = predictionData.predicted_totalOk;
        result.confidence = predictionData.confidence || null;
        result.message = "Prediksi berhasil";
      } else {
        result.message = "Response dari prediction service tidak valid";
      }
    } catch (error) {
      result.message = "Gagal menghubungi endpoint /predict";
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