import jwt from "jsonwebtoken";
import prisma from "../../prisma/index.js";
import { tokenTypes } from "../config/tokens.js";

// Manual status code

/**
 * Tambah waktu ke tanggal sekarang
 * @param {number} value - jumlah waktu
 * @param {'minutes' | 'days'} unit - satuan waktu
 * @returns {Date}
 */
const addTime = (value, unit) => {
  const now = new Date();
  if (unit === "minutes") {
    return new Date(now.getTime() + value * 60 * 1000);
  }
  if (unit === "days") {
    return new Date(now.getTime() + value * 24 * 60 * 60 * 1000);
  }
  throw new Error("Unsupported time unit");
};

/**
 * Generate JWT token
 */
const generateToken = (
  userId,
  role,
  expires,
  type,
  secret = process.env.JWT_SECRET
) => {
  const payload = {
    sub: userId,
    role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(expires.getTime() / 1000),
    type,
  };
  return jwt.sign(payload, secret);
};

/**
 * Verifikasi token
 */
const verifyToken = async (token, type) => {
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  const tokenDoc = await prisma.token.findFirst({
    where: {
      token,
      type,
      userId: payload.sub,
      blacklisted: false,
    },
  });

  if (!tokenDoc) {
    throw new Error("Token not found");
  }
  return tokenDoc;
};

/**
 * Generate access & refresh tokens
 */
const generateAuthTokens = async (user) => {
  const accessTokenExpires = addTime(
    parseInt(process.env.JWT_ACCESS_EXPIRATION_MINUTES || "30"),
    "minutes"
  );
  const accessToken = generateToken(
    user.id,
    user.role,
    accessTokenExpires,
    tokenTypes.ACCESS
  );

  const refreshTokenExpires = addTime(
    parseInt(process.env.JWT_REFRESH_EXPIRATION_DAYS || "30"),
    "days"
  );
  const refreshToken = generateToken(
    user.id,
    user.role,
    refreshTokenExpires,
    tokenTypes.REFRESH
  );

  return {
    access: {
      token: accessToken,
      expires: accessTokenExpires,
    },
    refresh: {
      token: refreshToken,
      expires: refreshTokenExpires,
    },
  };
};

export default { generateToken, verifyToken, generateAuthTokens };
