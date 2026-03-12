/**
 * k6/utils/auth.js
 * Helper untuk login menggunakan uid_nfc.
 *
 * Response login: { data: { tokens: { access: { token: "..." } } } }
 */
import http from "k6/http";
import { check, fail } from "k6";
import { BASE_URL } from "../config.js";

/**
 * Login dengan uid_nfc dan kembalikan data auth.
 * @param {string} uid_nfc
 * @returns {object} { token, user, dashboard }
 */
export function login(uid_nfc) {
  const payload = JSON.stringify({ uid_nfc });
  const params = {
    headers: {
      "Content-Type": "application/json",
      "x-bypass-attendance": "true"
    }
  };

  const res = http.post(`${BASE_URL}/auth/login`, payload, params);

  const ok = check(res, {
    "[auth] status 200": (r) => r.status === 200,
    "[auth] ada access token": (r) => {
      try {
        const body = JSON.parse(r.body);
        return !!body.data?.tokens?.access?.token;
      } catch {
        return false;
      }
    },
  });

  if (!ok) {
    console.error(`Login gagal untuk uid_nfc=${uid_nfc}: ${res.status} - ${res.body}`);
    fail("Login gagal, test dihentikan.");
  }

  const responseBody = JSON.parse(res.body);
  return {
    token: responseBody.data.tokens.access.token,
    user: responseBody.data.user,
    dashboard: responseBody.data.dashboard
  };
}

/**
 * Buat header Authorization dari token.
 * @param {string} token
 * @returns {object} params object (headers)
 */
export function authHeaders(token) {
  return {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  };
}
