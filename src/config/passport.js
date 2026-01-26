import { Strategy as JwtStrategy, ExtractJwt } from "passport-jwt";
import { tokenTypes } from "./tokens.js";
import prisma from "../../prisma/index.js";

const jwtOptions = {
  secretOrKey: process.env.JWT_SECRET,
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
};

const jwtVerify = async (payload, done) => {
  try {
    if (payload.type !== tokenTypes.ACCESS) {
      throw new Error("Invalid token type");
    }
    const user = await prisma.user.findFirst({ where: { id: payload.sub } });
    if (!user) {
      return done(null, false);
    }
    done(null, user);
  } catch (error) {
    console.error("JWT Verify error:", error.message);
    done(error, false);
  }
};

export default new JwtStrategy(jwtOptions, jwtVerify);
