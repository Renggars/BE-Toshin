// src/validations/document.validation.js
import Joi from "joi";

const createDocument = {
  body: Joi.object().keys({
    judul: Joi.string().trim().min(3).max(255).required().messages({
      "string.min": "Judul minimal 3 karakter",
      "string.max": "Judul maksimal 255 karakter",
      "any.required": "Judul wajib diisi",
    }),
    deskripsi: Joi.string().trim().max(1000).allow("", null).optional(),
    kategori: Joi.string().trim().max(100).required().messages({
      "any.required": "Kategori wajib diisi",
    }),
    mesinId: Joi.number().integer().allow(null).optional(),
    produkId: Joi.number().integer().allow(null).optional(),
    noSeri: Joi.string().trim().max(100).required().messages({
      "any.required": "Nomor Seri wajib diisi",
    }),
  }),
  file: Joi.object()
    .keys({
      mimetype: Joi.string().valid("application/pdf").required(),
      size: Joi.number()
        .max(10 * 1024 * 1024)
        .required(),
    })
    .unknown(true)
    .required()
    .messages({
      "any.required": "File PDF wajib dilampirkan",
    }),
};

const updateDocument = {
  params: Joi.object().keys({
    id: Joi.number().integer().positive().required(),
  }),
  body: Joi.object()
    .keys({
      judul: Joi.string().trim().min(3).max(255).optional(),
      deskripsi: Joi.string().trim().max(1000).allow("", null).optional(),
      kategori: Joi.string().trim().max(100).allow("", null).optional(),
      mesinId: Joi.number().integer().allow(null).optional(),
      produkId: Joi.number().integer().allow(null).optional(),
      noSeri: Joi.string().trim().max(100).allow("", null).optional(),
    })
    .min(1)
    .messages({
      "object.min": "Minimal satu field harus diisi untuk update",
    }),
  file: Joi.object()
    .keys({
      mimetype: Joi.string().valid("application/pdf").required(),
      size: Joi.number()
        .max(10 * 1024 * 1024)
        .required(),
    })
    .unknown(true)
    .optional(),
};

const getDocuments = {
  query: Joi.object().keys({
    search: Joi.string().trim().max(255).allow("", null).optional(),
    kategori: Joi.string().trim().max(100).allow("", null).optional(),
    mesinId: Joi.number().integer().allow("", null).optional(),
    produkId: Joi.number().integer().allow("", null).optional(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sortBy: Joi.string()
      .valid("judul", "createdAt", "kategori")
      .default("createdAt"),
    sortOrder: Joi.string().valid("asc", "desc").default("desc"),
  }),
};

const documentId = {
  params: Joi.object().keys({
    id: Joi.number().integer().positive().required(),
  }),
};

export default {
  createDocument,
  updateDocument,
  getDocuments,
  documentId,
};
