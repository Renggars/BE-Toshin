import express from "express";
import { authAdmin } from "../middlewares/auth.js";
import validate from "../middlewares/validate.js";
import userValidation from "../validations/user.validation.js";
import userController from "../controllers/user.controller.js";

const router = express.Router();

router.route("/").get(authAdmin(), userController.getUsers);

router.get(
  "/searchByEmail",
  authAdmin(),
  validate(userValidation.getUserByEmail),
  userController.getUserByEmail,
);

router
  .route("/:userId")
  .get(authAdmin(), validate(userValidation.getUser), userController.getUser)
  .put(
    authAdmin(),
    validate(userValidation.updateUser),
    userController.updateUser,
  );

router.patch(
  "/:userId/deactivate",
  authAdmin(),
  validate(userValidation.deactivateUser),
  userController.deactivateUser,
);

export default router;
