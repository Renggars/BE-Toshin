import { createClient } from "redis";
import config from "../config/config.js";
import logger from "../config/logger.js";

const client = createClient({
  url: config.redis.url,
});

client.on("error", (err) => logger.error("Redis Client Error", err));

const connectRedis = async () => {
  if (!config.redis.enabled) {
    logger.info("[Redis] Redis is disabled, skipping connection.");
    return;
  }
  if (!client.isOpen) {
    await client.connect();
    logger.info("[Redis] Connected to Redis");
  }
};

const set = async (key, value, expirationSeconds = 3600) => {
  if (!config.redis.enabled) return;
  try {
    await connectRedis();
    const stringValue =
      typeof value === "string" ? value : JSON.stringify(value);
    await client.set(key, stringValue, {
      EX: expirationSeconds,
    });
  } catch (error) {
    logger.error(`[Redis] Error setting key ${key}:`, error);
  }
};

const get = async (key) => {
  if (!config.redis.enabled) return null;
  try {
    await connectRedis();
    const value = await client.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch (e) {
      return value;
    }
  } catch (error) {
    logger.error(`[Redis] Error getting key ${key}:`, error);
    return null;
  }
};

const del = async (key) => {
  if (!config.redis.enabled) return;
  try {
    await connectRedis();
    await client.del(key);
  } catch (error) {
    logger.error(`[Redis] Error deleting key ${key}:`, error);
  }
};

const delByPattern = async (pattern) => {
  if (!config.redis.enabled) return;
  try {
    await connectRedis();
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(keys);
    }
  } catch (error) {
    logger.error(`[Redis] Error deleting pattern ${pattern}:`, error);
  }
};

export default {
  client,
  connectRedis,
  set,
  get,
  del,
  delByPattern,
};
