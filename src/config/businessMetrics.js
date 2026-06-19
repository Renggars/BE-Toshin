import client from "prom-client";

// --- Authentication Metrics ---
export const businessLoginTotal = new client.Counter({
  name: "business_login_total",
  help: "Total number of login attempts",
  labelNames: ["status"], // success, failed
});

// --- Task/Activity Metrics ---
export const businessTaskCreatedTotal = new client.Counter({
  name: "business_task_created_total",
  help: "Total number of business tasks created (Andon/LRP)",
  labelNames: ["type"], // andon_call, andon_event, lrp_input
});

export const businessTaskResolvedTotal = new client.Counter({
  name: "business_task_resolved_total",
  help: "Total number of business tasks completed/resolved",
  labelNames: ["type"], // andon_event, lrp_input
});

// --- Communication Metrics ---
export const businessBroadcastTotal = new client.Counter({
  name: "business_broadcast_total",
  help: "Total number of business-level broadcasts sent",
  labelNames: ["event"],
});
