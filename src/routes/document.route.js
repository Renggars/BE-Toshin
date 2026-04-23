// src/routes/document.route.js
import express from "express";
import documentController from "../controllers/document.controller.js";
import { auth } from "../middlewares/auth.js";
import validate from "../middlewares/validate.js";
import documentValidation from "../validations/document.validation.js";
import uploadPdf from "../utils/uploadPdf.js";

const router = express.Router();

// Role yang bisa membaca dokumen (semua authenticated user)
const allRoles = auth();

// Role yang bisa mengelola (upload, edit, delete) dokumen
const adminOrSupervisor = auth("ADMIN", "SUPERVISOR");

/**
 * GET  /documents          - List dokumen dengan search & pagination
 * POST /documents          - Upload dokumen PDF baru
 */
router
  .route("/")
  .get(allRoles, validate(documentValidation.getDocuments), documentController.getDocuments)
  .post(
    adminOrSupervisor,
    uploadPdf.single("file"),
    validate(documentValidation.createDocument),
    documentController.createDocument,
  );

/**
 * GET    /documents/:id          - Detail dokumen
 * PATCH  /documents/:id          - Update metadata / ganti file
 * DELETE /documents/:id          - Hapus dokumen
 */
router
  .route("/:id")
  .get(allRoles, validate(documentValidation.documentId), documentController.getDocumentById)
  .patch(
    adminOrSupervisor,
    uploadPdf.single("file"),
    validate(documentValidation.updateDocument),
    documentController.updateDocument,
  )
  .delete(
    adminOrSupervisor,
    validate(documentValidation.documentId),
    documentController.deleteDocument,
  );

/**
 * GET /documents/:id/download?inline=true  - Download atau preview PDF
 */
router.get(
  "/:id/download",
  allRoles,
  validate(documentValidation.documentId),
  documentController.downloadDocument,
);

export default router;
