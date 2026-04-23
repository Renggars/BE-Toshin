// src/controllers/document.controller.js
import httpStatus from "http-status";
import catchAsync from "../utils/catchAsync.js";
import documentService from "../services/document.service.js";

/** POST /documents - Upload dokumen PDF baru */
const createDocument = catchAsync(async (req, res) => {
  const doc = await documentService.createDocument(
    req.body,
    req.file,
    req.user.id,
  );
  res.status(httpStatus.CREATED).send({
    status: true,
    message: "Dokumen berhasil diupload",
    data: doc,
  });
});

/** GET /documents - List dengan search & pagination */
const getDocuments = catchAsync(async (req, res) => {
  const result = await documentService.getDocuments(req.query);
  res.send({ status: true, ...result });
});

/** GET /documents/:id - Detail dokumen */
const getDocumentById = catchAsync(async (req, res) => {
  const doc = await documentService.getDocumentById(req.params.id);
  res.send({ status: true, data: doc });
});

/** GET /documents/:id/download - Stream/download file PDF */
const downloadDocument = catchAsync(async (req, res) => {
  const { absPath, namaFile, mimeType } = await documentService.getDocumentFilePath(
    req.params.id,
  );

  // Role check: Only ADMIN and SUPERVISOR can download (attachment)
  // Others are forced to preview (inline)
  const canDownload = ["ADMIN", "SUPERVISOR"].includes(req.user.role);
  const isInline = req.query.inline === "true" || !canDownload;

  const disposition = isInline
    ? `inline; filename="${encodeURIComponent(namaFile)}"`
    : `attachment; filename="${encodeURIComponent(namaFile)}"`;

  res.setHeader("Content-Type", mimeType);
  res.setHeader("Content-Disposition", disposition);
  res.sendFile(absPath);
});

/** PATCH /documents/:id - Update metadata & opsional ganti file */
const updateDocument = catchAsync(async (req, res) => {
  const doc = await documentService.updateDocument(
    req.params.id,
    req.body,
    req.file || null,
  );
  res.send({
    status: true,
    message: "Dokumen berhasil diperbarui",
    data: doc,
  });
});

/** DELETE /documents/:id - Hapus dokumen & file fisik */
const deleteDocument = catchAsync(async (req, res) => {
  const deleted = await documentService.deleteDocument(req.params.id);
  res.send({
    status: true,
    message: `Dokumen "${deleted.judul}" berhasil dihapus`,
  });
});

export default {
  createDocument,
  getDocuments,
  getDocumentById,
  downloadDocument,
  updateDocument,
  deleteDocument,
};
