/**
 * k6/tests/smoke.js
 * SMOKE TEST — Validasi cepat sistem (Auth Only).
 */
import { sleep } from "k6";
import { DEFAULT_THRESHOLDS } from "../config.js";
import { login } from "../utils/auth.js";
import { TEST_USERS, randomItem } from "../utils/data.js";

export const options = {
  vus: 2,
  duration: "10s",
  thresholds: DEFAULT_THRESHOLDS,
};

export default function () {
  const user = randomItem(TEST_USERS);
  login(user);

  sleep(1);
}
