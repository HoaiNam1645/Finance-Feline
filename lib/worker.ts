import { Worker } from "bullmq";
import { env } from "@/lib/env";
import { notifyPurchaseRequestSubmitted, startTelegramPolling } from "@/lib/telegram";

const notificationWorker = new Worker(
  "notifications",
  async (job) => {
    console.log("[notification job]", job.name, job.data);
    if (job.name === "request-submitted" && typeof job.data?.requestId === "string") {
      await notifyPurchaseRequestSubmitted(job.data.requestId);
    }
  },
  { connection: { url: env.redisUrl } }
);

const reportWorker = new Worker(
  "reports",
  async (job) => {
    console.log("[report job]", job.name, job.data);
  },
  { connection: { url: env.redisUrl } }
);

notificationWorker.on("failed", (job, error) => {
  console.error("Notification job failed", job?.id, error);
});

reportWorker.on("failed", (job, error) => {
  console.error("Report job failed", job?.id, error);
});

startTelegramPolling();

console.log("Workers started");
