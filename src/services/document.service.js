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
  const { judul, deskripsi, kategoriId, mesinId, produkId, noSeri } = body;

  const kategoriDb = await prisma.kategoriDokumen.findUnique({
    where: { id: Number(kategoriId) },
  });
  if (!kategoriDb) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Kategori dokumen tidak ditemukan");
  }
  const kategoriName = kategoriDb.nama;

  // Auto-generate judul final: KATEGORI-NOSERI-JUDUL_ASLI
  const judulFinal = `${kategoriName}-${noSeri}-${judul}`;

  const doc = await prisma.document.create({
    data: {
      judul: judulFinal,
      deskripsi: deskripsi || null,
      kategoriId: Number(kategoriId),
      namaFile: file.originalname,
      pathFile: file.path.replace(/\\/g, "/"), // Normalize Windows backslash
      ukuranByte: file.size,
      mimeType: file.mimetype,
      uploadedById,
      mesinId: mesinId ? Number(mesinId) : null,
      produkId: produkId ? Number(produkId) : null,
      noSeri: noSeri || null,
      createdAt: nowWIB(),
      updatedAt: nowWIB(),
    },
    include: {
      uploadedBy: { select: { id: true, nama: true, role: true } },
      mesin: { select: { id: true, namaMesin: true } },
      produk: { select: { id: true, namaProduk: true } },
      kategori: { select: { id: true, nama: true } },
    },
  });

  return {
    ...doc,
    kategori: doc.kategori ? doc.kategori.nama : null,
    kategoriId: doc.kategori ? doc.kategori.id : null,
  };
};

/**
 * Get paginated & searchable document list
 * @param {Object} query - { search, kategoriId, page, limit, sortBy, sortOrder }
 */
const getDocuments = async (query) => {
  const {
    search = "",
    kategoriId,
    mesinId,
    produkId,
    noSeri,
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
    ...(kategoriId && { kategoriId: Number(kategoriId) }),
    ...(mesinId && { mesinId: Number(mesinId) }),
    ...(produkId && { produkId: Number(produkId) }),
    ...(noSeri && { noSeri }),
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
        namaFile: true,
        ukuranByte: true,
        noSeri: true,
        createdAt: true,
        updatedAt: true,
        uploadedBy: { select: { id: true, nama: true, role: true } },
        mesin: { select: { id: true, namaMesin: true } },
        produk: { select: { id: true, namaProduk: true } },
        kategori: { select: { id: true, nama: true } },
      },
    }),
    prisma.document.count({ where }),
  ]);

  const mappedData = data.map((doc) => ({
    ...doc,
    kategori: doc.kategori ? doc.kategori.nama : null,
    kategoriId: doc.kategori ? doc.kategori.id : null,
  }));

  return {
    data: mappedData,
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
    include: {
      uploadedBy: { select: { id: true, nama: true, role: true } },
      mesin: { select: { id: true, namaMesin: true } },
      produk: { select: { id: true, namaProduk: true } },
      kategori: { select: { id: true, nama: true } },
    },
  });
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, "Dokumen tidak ditemukan");

  return {
    ...doc,
    kategori: doc.kategori ? doc.kategori.nama : null,
    kategoriId: doc.kategori ? doc.kategori.id : null,
  };
};

/**
 * Update document metadata; optionally replace the PDF file
 */
const updateDocument = async (id, body, file) => {
  const existing = await prisma.document.findUnique({
    where: { id: Number(id) },
  });
  if (!existing) {
    if (file) fs.unlink(file.path, () => { });
    throw new ApiError(httpStatus.NOT_FOUND, "Dokumen tidak ditemukan");
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
      ...(body.kategoriId !== undefined && { kategoriId: body.kategoriId ? Number(body.kategoriId) : null }),
      ...(body.mesinId !== undefined && { mesinId: body.mesinId ? Number(body.mesinId) : null }),
      ...(body.produkId !== undefined && { produkId: body.produkId ? Number(body.produkId) : null }),
      ...(body.noSeri !== undefined && { noSeri: body.noSeri || null }),
      ...fileData,
      updatedAt: nowWIB(),
    },
    include: {
      uploadedBy: { select: { id: true, nama: true, role: true } },
      mesin: { select: { id: true, namaMesin: true } },
      produk: { select: { id: true, namaProduk: true } },
      kategori: { select: { id: true, nama: true } },
    },
  });

  // Hapus file lama jika file baru diupload
  if (file && existing.pathFile) {
    fs.unlink(existing.pathFile, () => { });
  }

  return {
    ...updated,
    kategori: updated.kategori ? updated.kategori.nama : null,
    kategoriId: updated.kategori ? updated.kategori.id : null,
  };
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
    fs.unlink(existing.pathFile, () => { });
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

// --- KategoriDokumen CRUD ---
const getKategoriDokumens = async () => {
  return prisma.kategoriDokumen.findMany({
    orderBy: { nama: "asc" }
  });
};


const createKategoriDokumen = async (data) => {
  return prisma.kategoriDokumen.create({ data });
};

const updateKategoriDokumen = async (id, data) => {
  return prisma.kategoriDokumen.update({ where: { id: Number(id) }, data });
};

const deleteKategoriDokumen = async (id) => {
  return prisma.kategoriDokumen.delete({ where: { id: Number(id) } });
};

export default {
  createDocument,
  getDocuments,
  getDocumentById,
  updateDocument,
  deleteDocument,
  getDocumentFilePath,
  getKategoriDokumens,
  createKategoriDokumen,
  updateKategoriDokumen,
  deleteKategoriDokumen,
};
