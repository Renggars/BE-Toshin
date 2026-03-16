import express from "express";
import { auth } from "../middlewares/auth.js";
import validate from "../middlewares/validate.js";
import userValidation from "../validations/user.validation.js";
import userController from "../controllers/user.controller.js";

const router = express.Router();

router.route("/").get(auth("SUPERVISOR", "ADMIN"), userController.getUsers);

router.get(
  "/searchByEmail",
  auth("SUPERVISOR", "ADMIN"),
  validate(userValidation.getUserByEmail),
  userController.getUserByEmail,
);

router.get("/nfc/:uid", userController.getUserByNfc);

router
  .route("/:userId")
  .get(
    auth("SUPERVISOR", "ADMIN"),
    validate(userValidation.getUser),
    userController.getUser,
  )
  .put(
    auth("SUPERVISOR", "ADMIN"),
    validate(userValidation.updateUser),
    userController.updateUser,
  );

router.put(
  "/:userId/deactivate",
  auth("SUPERVISOR", "ADMIN"),
  validate(userValidation.deactivateUser),
  userController.deactivateUser,
);

export default router;
