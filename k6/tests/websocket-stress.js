import ws from "k6/ws";
import http from "k6/http";
import { check, sleep } from "k6";
import { login } from "../utils/auth.js";
import { TEST_USERS, randomItem } from "../utils/data.js";
import { BASE_URL } from "../config.js";

export const options = {
  scenarios: {
    // Skenario 1: Operator Connect (Ngetes Active Connections)
    operators: {
      executor: "constant-vus",
      vus: 20,
      duration: "40s",
      exec: "operatorContext",
    },
    // Skenario 2: Mandor Broadcast (Ngetes Message Throughput)
    mandor: {
      executor: "constant-vus",
      vus: 2,
      duration: "40s",
      exec: "mandorContext",
    },
  },
};

/**
 * Konteks Operator: Stay Connected via WS
 */
export function operatorContext() {
  const userId = randomItem(TEST_USERS);
  const loginRes = login(userId);
  if (!loginRes) return;

  // Socket.io Handshake biasanya butuh query params EIO & transport
  const url = BASE_URL.replace("http", "ws") + "/socket.io/?EIO=4&transport=websocket";
  
  ws.connect(url, {}, function (socket) {
    socket.on("open", () => {
      // Kirim probe packet (Socket.io protocol "2probe" atau "40" untuk namespace)
      socket.send("40"); 
    });

    socket.on("message", (data) => {
      // console.log(`Received: ${data}`);
    });

    socket.setTimeout(function () {
      socket.close();
    }, 35000);
  });
}

/**
 * Konteks Mandor: Hit Broadcast Endpoint
 */
export function mandorContext() {
  const loginRes = login("3"); 
  if (!loginRes) {
    sleep(1);
    return;
  }
  const token = loginRes.tokens.access.token;

  const params = {
    headers: { 
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
  };

  const payload = JSON.stringify({
    pesan: `Broadcast Message: ${new Date().toISOString()} - Keep Healthy!`
  });

  const res = http.post(`${BASE_URL}/announcement/broadcast`, payload, params);
  
  check(res, {
    "broadcast sent": (r) => r.status === 201 || r.status === 200,
  });

  sleep(2); // Broadcast tiap 2 detik
}
