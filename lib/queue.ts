import { Queue } from "bullmq";
import { env } from "@/lib/env";

export const notificationQueue = new Queue("notifications", {
  connection: { url: env.redisUrl },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: true,
  },
});

export const reportQueue = new Queue("reports", {
  connection: { url: env.redisUrl },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: true,
  },
});
