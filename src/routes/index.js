import express from "express";
import authRoute from "./auth.route.js";
import userRoute from "./user.route.js";
import rencanaProduksiRoute from "./rencanaProduksi.route.js";
import masterRoute from "./master.route.js";
import poinRoute from "./poin.route.js";
import andonRoute from "./andon.route.js";
import produksiRoute from "./produksi.route.js";
import oeeRoute from "./oee.route.js";
import lrpRoute from "./lrp.route.js";
import attendanceRoute from "./attendance.route.js";
import lrpDashboardRoute from "./lrpDashboard.route.js";
import divisiRoute from "./divisi.route.js";
import jenisPekerjaanRoute from "./jenisPekerjaan.route.js";
import notificationRoute from "./notification.route.js";
import hardwareRoute from "./hardware.route.js";


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
  {
    path: "/master",
    route: masterRoute,
  },
  {
    path: "/poin",
    route: poinRoute,
  },
  {
    path: "/andon",
    route: andonRoute,
  },
  {
    path: "/produksi",
    route: produksiRoute,
  },
  {
    path: "/oee",
    route: oeeRoute,
  },
  {
    path: "/lrp",
    route: lrpRoute,
  },
  {
    path: "/attendance",
    route: attendanceRoute,
  },
  {
    path: "/lrp-dashboard",
    route: lrpDashboardRoute,
  },
  {
    path: "/divisi",
    route: divisiRoute,
  },
  {
    path: "/jenis-pekerjaan",
    route: jenisPekerjaanRoute,
  },
  {
    path: "/notification",
    route: notificationRoute,
  },

  {
    path: "/hardware",
    route: hardwareRoute,
  },

];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

export default router;
