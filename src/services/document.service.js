// src/services/document.service.js
import fs from "fs";
import path from "path";
import httpStatus from "http-status";
import prisma from "../../prisma/index.js";
import ApiError from "../utils/ApiError.js";
import { nowWIB } from "../utils/dateWIB.js";

/**
 * Create a new document record after file upload
 * @param {Object} body - { judul, deskripsi, kategori }
 * @param {Object} file  - multer file object
 * @param {number} uploadedById - ID user yang upload
 * @returns {Promise<Document>}
 */
const createDocument = async (body, file, uploadedById) => {
  const { judul, deskripsi, kategori } = body;

  const existing = await prisma.document.findFirst({
    where: { judul: judul },
  });
  if (existing) {
    // Hapus file yang sudah diupload agar tidak orphan
    fs.unlink(file.path, () => {});
    throw new ApiError(
      httpStatus.CONFLICT,
      "Dokumen dengan judul ini sudah ada",
    );
  }

  return prisma.document.create({
    data: {
      judul,
      deskripsi: deskripsi || null,
      kategori: kategori || null,
      namaFile: file.originalname,
      pathFile: file.path.replace(/\\/g, "/"), // Normalize Windows backslash
      ukuranByte: file.size,
      mimeType: file.mimetype,
      uploadedById,
      createdAt: nowWIB(),
      updatedAt: nowWIB(),
    },
    include: { uploadedBy: { select: { id: true, nama: true, role: true } } },
  });
};

/**
 * Get paginated & searchable document list
 * @param {Object} query - { search, kategori, page, limit, sortBy, sortOrder }
 */
const getDocuments = async (query) => {
  const {
    search = "",
    kategori,
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = query;

  const skip = (Number(page) - 1) * Number(limit);
  const take = Number(limit);

  const where = {
    ...(search && {
      judul: { contains: search },
    }),
    ...(kategori && { kategori }),
  };

  const [data, totalItems] = await Promise.all([
    prisma.document.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      skip,
      take,
      select: {
        id: true,
        judul: true,
        deskripsi: true,
        kategori: true,
        namaFile: true,
        ukuranByte: true,
        createdAt: true,
        updatedAt: true,
        uploadedBy: { select: { id: true, nama: true, role: true } },
      },
    }),
    prisma.document.count({ where }),
  ]);

  return {
    data,
    meta: {
      totalItems,
      totalPages: Math.ceil(totalItems / take),
      currentPage: Number(page),
      perPage: take,
    },
  };
};

/**
 * Get single document by ID
 */
const getDocumentById = async (id) => {
  const doc = await prisma.document.findUnique({
    where: { id: Number(id) },
    include: { uploadedBy: { select: { id: true, nama: true, role: true } } },
  });
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, "Dokumen tidak ditemukan");
  return doc;
};

/**
 * Update document metadata; optionally replace the PDF file
 */
const updateDocument = async (id, body, file) => {
  const existing = await prisma.document.findUnique({
    where: { id: Number(id) },
  });
  if (!existing) {
    if (file) fs.unlink(file.path, () => {});
    throw new ApiError(httpStatus.NOT_FOUND, "Dokumen tidak ditemukan");
  }

  // Cek duplikat judul (exclude diri sendiri)
  if (body.judul) {
    const dup = await prisma.document.findFirst({
      where: {
        judul: body.judul,
        NOT: { id: Number(id) },
      },
    });
    if (dup) {
      if (file) fs.unlink(file.path, () => {});
      throw new ApiError(
        httpStatus.CONFLICT,
        "Dokumen dengan judul ini sudah ada",
      );
    }
  }

  const fileData = file
    ? {
        namaFile: file.originalname,
        pathFile: file.path.replace(/\\/g, "/"),
        ukuranByte: file.size,
        mimeType: file.mimetype,
      }
    : {};

  const updated = await prisma.document.update({
    where: { id: Number(id) },
    data: {
      ...(body.judul && { judul: body.judul }),
      ...(body.deskripsi !== undefined && { deskripsi: body.deskripsi || null }),
      ...(body.kategori !== undefined && { kategori: body.kategori || null }),
      ...fileData,
      updatedAt: nowWIB(),
    },
    include: { uploadedBy: { select: { id: true, nama: true, role: true } } },
  });

  // Hapus file lama jika file baru diupload
  if (file && existing.pathFile) {
    fs.unlink(existing.pathFile, () => {});
  }

  return updated;
};

/**
 * Delete document record and its physical file
 */
const deleteDocument = async (id) => {
  const existing = await prisma.document.findUnique({
    where: { id: Number(id) },
  });
  if (!existing) throw new ApiError(httpStatus.NOT_FOUND, "Dokumen tidak ditemukan");

  await prisma.document.delete({ where: { id: Number(id) } });

  // Hapus file fisik
  if (existing.pathFile && fs.existsSync(existing.pathFile)) {
    fs.unlink(existing.pathFile, () => {});
  }

  return { id: existing.id, judul: existing.judul };
};

/**
 * Get absolute file path for streaming/download
 */
const getDocumentFilePath = async (id) => {
  const doc = await prisma.document.findUnique({
    where: { id: Number(id) },
    select: { pathFile: true, namaFile: true, mimeType: true },
  });
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, "Dokumen tidak ditemukan");

  const absPath = path.resolve(doc.pathFile);
  if (!fs.existsSync(absPath)) {
    throw new ApiError(httpStatus.NOT_FOUND, "File fisik tidak ditemukan di server");
  }

  return { absPath, namaFile: doc.namaFile, mimeType: doc.mimeType };
};

export default {
  createDocument,
  getDocuments,
  getDocumentById,
  updateDocument,
  deleteDocument,
  getDocumentFilePath,
};
