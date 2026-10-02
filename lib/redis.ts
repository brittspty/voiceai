import Redis from "ioredis";

export function createRedis() {
  const url = process.env.REDIS_URL || "redis://127.0.0.1:6379";
  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    enableOfflineQueue: false,
    connectTimeout: 2000,
  });
  client.on("error", () => {
    /* The queue falls back to Postgres polling when Redis is down. */
  });
  return client;
}

export async function redisPush(key: string, value: string) {
  const client = createRedis();
  try {
    await client.connect();
    await client.lpush(key, value);
  } catch {
    /* Postgres remains the source of truth. */
  } finally {
    client.disconnect();
  }
}
