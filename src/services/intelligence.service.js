import { PrismaClient } from "@prisma/client";
import axios from "axios";
import config from "../config/config.js";
import ApiError from "../utils/ApiError.js";
import predictionService from "./prediction.service.js";
import { Server } from "socket.io";
import { getIo } from "../config/socket.js";

const prisma = new PrismaClient();

/**
 * Service untuk mengelola Intelligence (AI) yang diproxy ke FastAPI.
 */

// Helper: Setup axios instance for FastAPI
const fastApiClient = axios.create({
  baseURL: config.hfPredictSpaceUrl || "http://localhost:5000",
  timeout: parseInt(config.hfPredictTimeoutMs || "30000", 10),
});

/**
 * Mendapatkan data dashboard Intelligence gabungan untuk satu mesin
 * @param {number} mesinId 
 * @returns {Promise<Object>}
 */
const getIntelligenceDashboard = async (mesinId) => {
  const [healthScore, clustering, prediction] = await Promise.all([
    prisma.machineHealthScore.findFirst({
      where: { mesinId },
      orderBy: { tanggal: "desc" },
    }),
    prisma.machineClustering.findFirst({
      where: { mesinId },
      orderBy: { clusterDate: "desc" },
    }),
    prisma.productionPrediction.findFirst({
      where: { mesinId },
      orderBy: { predictionDate: "desc" },
    }),
  ]);

  return {
    mesinId,
    healthScore: healthScore || null,
    clustering: clustering ? { ...clustering, tanggal: clustering.clusterDate } : null,
    prediction: prediction ? { ...prediction, tanggal: prediction.predictionDate, predictedOk: prediction.predictedGoodPcs } : null,
  };
};

/**
 * Mendapatkan data dashboard Intelligence untuk SEMUA mesin (untuk tabel frontend)
 * @returns {Promise<Array>}
 */
const getAllDashboards = async (page = 1, limit = 10) => {
  const skip = (page - 1) * limit;
  const totalItems = await prisma.mesin.count();

  const machines = await prisma.mesin.findMany({
    select: { id: true, namaMesin: true },
    skip: skip,
    take: limit,
  });

  const dashboards = await Promise.all(
    machines.map(async (m) => {
      const data = await getIntelligenceDashboard(m.id);
      return { ...data, mesinNama: m.namaMesin };
    })
  );
  
  return {
    data: dashboards,
    pagination: {
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
      currentPage: page,
      pageSize: limit
    }
  };
};

/**
 * Memanggil FastAPI untuk melakukan re-clustering semua mesin,
 * dan menyimpan hasilnya (cache) ke database.
 * @returns {Promise<Array>} Array data cluster terbaru
 */
const refreshClusters = async () => {
  try {
    // 1. Call FastAPI to get Clusters
    const response = await fastApiClient.post("/cluster");
    const clustersData = response.data?.clusters || [];
    const tanggalSekarang = new Date();

    if (!clustersData.length) {
      throw new Error("No cluster data returned from AI Service");
    }

    // Prepare Bulk Arrays
    const clusterRecords = [];
    const healthRecords = [];
    const predictionRequests = [];
    const predictionRecords = [];

    const futureDate = new Date();
    futureDate.setHours(futureDate.getHours() + 8); // Prediksi untuk shift depan

    for (const data of clustersData) {
      const mesinId = data.mesinId;

      // A. Siapkan data Cluster
      clusterRecords.push({
        mesinId,
        clusterDate: tanggalSekarang,
        clusterNumber: data.clusterNumber || 0,
        clusterLabel: data.clusterLabel,
        avgAvailability: data.avgAvailability || 0,
        avgPerformance: data.avgPerformance || 0,
        avgQuality: data.avgQuality || 0,
        avgOee: data.avgOee || 0,
      });

      // B. Hitung Health Score secara lokal agar tidak spam HTTP request (Sangat Cepat)
      const score = ((data.avgAvailability || 0) + (data.avgPerformance || 0) + (data.avgQuality || 0)) / 3.0;
      let status = "Critical";
      if (score > 80) status = "Excellent";
      else if (score > 60) status = "Warning";

      healthRecords.push({
        mesinId,
        tanggal: tanggalSekarang,
        score: parseFloat(score),
        status: status,
        availability: data.avgAvailability || 0,
        performance: data.avgPerformance || 0,
        quality: data.avgQuality || 0,
      });

      // C. Kumpulkan Cache Histori untuk Batch Prediction
      const featuresData = await predictionService.getMLFeaturesFromCache(mesinId, 30);
      if (featuresData && featuresData.length >= 7) {
        const recent = featuresData.slice(-7);
        const avgAvail = recent.reduce((s, f) => s + Number(f.availability || 0), 0) / recent.length;
        const avgPerf = recent.reduce((s, f) => s + Number(f.performance || 0), 0) / recent.length;
        const avgQual = recent.reduce((s, f) => s + Number(f.quality || 0), 0) / recent.length;
        const avgDown = recent.reduce((s, f) => s + Number(f.downtimeDuration || 0), 0) / recent.length;
        
        let day = futureDate.getDay() || 7;
        const isHoliday = (day === 6 || day === 7) ? 1 : 0;
        const modelFeats = [avgAvail, avgPerf, avgQual, avgDown, futureDate.getHours() || 8, day, isHoliday];

        predictionRequests.push({
          mesinId,
          features: modelFeats,
          timestamp: futureDate.toISOString()
        });
      }
    }

    // 2. Call FastAPI Batch Prediction (1 HTTP Request untuk semua mesin)
    if (predictionRequests.length > 0) {
      try {
        const batchResponse = await fastApiClient.post("/predict_batch", {
          requests: predictionRequests
        });
        const batchResults = batchResponse.data?.results || [];

        for (const res of batchResults) {
          if (res.predicted_totalOk !== undefined) {
            // Cocokkan fitur untuk log
            const req = predictionRequests.find(r => r.mesinId === res.mesinId);
            if (req) {
              predictionRecords.push({
                mesinId: res.mesinId,
                shiftId: 1, // dummy
                predictionDate: futureDate,
                predictedGoodPcs: Math.round(parseFloat(res.predicted_totalOk)),
                predictedTotalProd: 0,
                predictionAccuracy: res.confidence || 0,
                lastAvailability: req.features[0] || 0,
                lastPerformance: req.features[1] || 0,
                lastQuality: req.features[2] || 0,
                lastDowntime: req.features[3] || 0,
              });
            }
          }
        }
      } catch (e) {
        console.log(`Failed to execute batch prediction: ${e.message}`);
      }
    }

    // 3. Eksekusi DB Bulk Inserts menggunakan Prisma Transaction (Super Cepat)
    await prisma.$transaction([
      prisma.machineClustering.createMany({ data: clusterRecords }),
      prisma.machineHealthScore.createMany({ data: healthRecords }),
      predictionRecords.length > 0 
        ? prisma.productionPrediction.createMany({ data: predictionRecords }) 
        : prisma.$queryRaw`SELECT 1` // dummy execution if empty
    ]);

    // Broadcast update via Socket.IO
    try {
      const io = getIo();
      if (io) {
        io.emit("clusters_updated", { timestamp: tanggalSekarang, count: clusterRecords.length });
        io.emit("health_scores_updated", { count: healthRecords.length });
      }
    } catch (e) {
      console.log("Socket IO not initialized yet.");
    }

    return clusterRecords;
  } catch (error) {
    throw new ApiError(500, `Failed to refresh clusters from AI Service: ${error.message}`);
  }
};

/**
 * Memanggil FastAPI untuk menghitung Health Score (Fuzzy Logic) untuk satu mesin
 * @param {number} mesinId 
 * @param {Object} oeeData { availability, performance, quality }
 * @returns {Promise<Object>}
 */
const updateHealthScoreForMesin = async (mesinId, oeeData) => {
  try {
    // 1. Call FastAPI
    const response = await fastApiClient.post("/health", {
      mesinId,
      availability: oeeData.availability,
      performance: oeeData.performance,
      quality: oeeData.quality
    });

    // Asumsi response: { score: 85.5, status: "Warning" }
    const { score, status } = response.data;
    const tanggalSekarang = new Date();

    // 2. Cache hasil di Database
    const savedHealth = await prisma.machineHealthScore.create({
      data: {
        mesinId,
        tanggal: tanggalSekarang,
        score: parseFloat(score),
        status: status, // "Excellent", "Warning", "Critical"
        availability: oeeData.availability || 0,
        performance: oeeData.performance || 0,
        quality: oeeData.quality || 0,
      },
    });

    // 3. Buat notifikasi jika Critical
    if (status === "Critical") {
      // Dapatkan shift aktif
      const activeShift = await prisma.shift.findFirst({
         where: { /* logika shift aktif, misalnya waktu saat ini */ }
      });
      
      if (activeShift) {
        await prisma.notification.create({
          data: {
            mesinId,
            shiftId: activeShift.id,
            tipe: "HEALTH_ALERT",
            pesan: `Health Score mesin menurun drastis (${score}%). Perlu pengecekan maintenance.`,
            status: "UNREAD",
            tanggal: tanggalSekarang
          }
        });
      }
    }

    // Broadcast update
    try {
      const io = getIo();
      if (io) {
        io.emit(`health_updated_${mesinId}`, savedHealth);
      }
    } catch (e) {
      console.log("Socket IO not initialized yet.");
    }

    return savedHealth;
  } catch (error) {
    throw new ApiError(500, `Failed to update health score from AI Service: ${error.message}`);
  }
};

/**
 * Memanggil FastAPI untuk melakukan inferensi prediksi (XGBoost)
 * @param {number} mesinId
 * @param {Array} features 
 * @param {number} totalOk
 * @param {Date} targetDate
 * @returns {Promise<Object>}
 */
const requestPrediction = async (mesinId, shiftId, features, totalOk, totalOutput, targetDate) => {
    try {
      const response = await fastApiClient.post("/predict", {
          mesinId,
          features,
          totalOk,
          timestamp: targetDate.toISOString()
      });

      // Asumsi response: { predicted_totalOk: 1200 }
      const predictedOk = response.data?.predicted_totalOk;
      if (predictedOk === undefined) {
         return { status: 'collecting', message: response.data?.message || 'buffer not full yet' };
      }

      // Cache prediksi
      const savedPrediction = await prisma.productionPrediction.create({
          data: {
              mesinId,
              shiftId,
              predictionDate: targetDate,
              predictedGoodPcs: Math.round(parseFloat(predictedOk)),
              predictedTotalProd: totalOutput,
              predictionAccuracy: response.data?.confidence || 0, // Jika ada
              lastAvailability: features[0] || 0,
              lastPerformance: features[1] || 0,
              lastQuality: features[2] || 0,
              lastDowntime: features[3] || 0,
          }
      });

      return savedPrediction;
    } catch (error) {
        throw new ApiError(500, `Failed to request prediction from AI Service: ${error.message}`);
    }
}

export const intelligenceService = {
  getIntelligenceDashboard,
  getAllDashboards,
  refreshClusters,
  updateHealthScoreForMesin,
  requestPrediction
};
