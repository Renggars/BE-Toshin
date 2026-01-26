import express from "express";
import authRoute from "./auth.route.js";
import userRoute from "./user.route.js";
import rencanaProduksiRoute from "./rencanaProduksi.route.js";

const router = express.Router();

const defaultRoutes = [
  {
    path: "/auth",
    route: authRoute,
  },
  {
    path: "/user",
    route: userRoute,
  },
  {
    path: "/rencana-produksi",
    route: rencanaProduksiRoute,
  },
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

export default router;
