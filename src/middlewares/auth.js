import passport from "passport";
import httpStatus from "http-status";
import ApiError from "../utils/ApiError.js";

const verifyCallback = (req, resolve, reject) => async (err, user, info) => {
  if (err || info || !user) {
    return reject(new ApiError(httpStatus.UNAUTHORIZED, "Please authenticate"));
  }
  req.user = user;
  resolve();
};

const auth = () => async (req, res, next) => {
  return new Promise((resolve, reject) => {
    passport.authenticate(
      "jwt",
      { session: false },
      verifyCallback(req, resolve, reject),
    )(req, res, next);
  })
    .then(() => next())
    .catch((err) => next(err));
};

const authAdmin = () => async (req, res, next) => {
  return new Promise((resolve, reject) => {
    passport.authenticate(
      "jwt",
      { session: false },
      verifyCallback(req, resolve, reject),
    )(req, res, next);
  })
    .then(() => {
      if (req.user.role === "SUPERVISOR") {
        next();
      } else {
        throw new ApiError(httpStatus.FORBIDDEN, "Acces Denied");
      }
    })
    .catch((err) => next(err));
};

const authOptional = () => async (req, res, next) => {
  return new Promise((resolve, reject) => {
    passport.authenticate("jwt", { session: false }, (err, user, info) => {
      if (user) {
        req.user = user;
      }

      resolve();
    })(req, res, next);
  })
    .then(() => next())
    .catch((err) => next(err));
};

export { auth, authAdmin, authOptional };
