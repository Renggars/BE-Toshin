import express from "express";
import { auth } from "../middlewares/auth.js";
import validate from "../middlewares/validate.js";
import userValidation from "../validations/user.validation.js";
import userController from "../controllers/user.controller.js";

const router = express.Router();

router.route("/").get(auth("HR", "ADMIN", "SUPERVISOR"), userController.getUsers);


router
  .route("/:userId")
  .get(
    auth("HR"),
    validate(userValidation.getUser),
    userController.getUser,
  )
  .put(
    auth("HR"),
    validate(userValidation.updateUser),
    userController.updateUser,
  );

router.put(
  "/:userId/deactivate",
  auth("HR"),
  validate(userValidation.deactivateUser),
  userController.deactivateUser,
);

export default router;
