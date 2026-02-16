import passport from "passport";
import httpStatus from "http-status";
import ApiError from "../utils/ApiError.js";

// Modifikasi verifyCallback untuk menerima requiredRoles
const verifyCallback =
  (req, resolve, reject, requiredRoles) => async (err, user, info) => {
    if (err || info || !user) {
      return reject(
        new ApiError(httpStatus.UNAUTHORIZED, "Please authenticate"),
      );
    }

    req.user = user;

    // Cek apakah ada role yang dibutuhkan
    if (requiredRoles.length) {
      const userRole = user.role; // Asumsi field di DB adalah 'role'
      const hasRequiredRole = requiredRoles.includes(userRole);

      if (!hasRequiredRole) {
        return reject(
          new ApiError(
            httpStatus.FORBIDDEN,
            "Forbidden: You do not have the required role",
          ),
        );
      }
    }

    resolve();
  };

// Update auth untuk menerima parameter roles
const auth =
  (...requiredRoles) =>
  async (req, res, next) => {
    return new Promise((resolve, reject) => {
      passport.authenticate(
        "jwt",
        { session: false },
        verifyCallback(req, resolve, reject, requiredRoles), // Teruskan roles ke sini
      )(req, res, next);
    })
      .then(() => next())
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

export { auth, authOptional };
