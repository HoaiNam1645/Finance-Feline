import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const MAX_RECEIPT_FILES_PER_REQUEST = 10;
const MAX_RECEIPT_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export function mapReceiptStorageError(error: unknown) {
  if (error instanceof Error) {
    if (error.message === "RECEIPT_TOO_MANY_FILES") {
      return `Tối đa ${MAX_RECEIPT_FILES_PER_REQUEST} ảnh chứng từ mỗi lần tải`;
    }
    if (error.message === "RECEIPT_FILE_TOO_LARGE") {
      return `Ảnh chứng từ tối đa ${Math.floor(MAX_RECEIPT_FILE_SIZE_BYTES / (1024 * 1024))}MB`;
    }
    if (error.message === "RECEIPT_STORAGE_NOT_CONFIGURED") {
      return "Hệ thống lưu trữ ảnh chưa được cấu hình (thiếu biến môi trường DO_SPACES_*). Liên hệ quản trị viên.";
    }
  }
  return null;
}

function safeBaseName(input: string) {
  return input
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100);
}

function normalizeHost(input: string) {
  return input.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "").replace(/\.+$/, "");
}

function createSpacesConfig() {
  const accessKeyId = process.env.DO_SPACES_KEY ?? "";
  const secretAccessKey = process.env.DO_SPACES_SECRET ?? "";
  const endpoint = process.env.DO_SPACES_ENDPOINT ?? "";
  const bucket = process.env.DO_SPACES_BUCKET ?? "";
  const region = process.env.DO_SPACES_REGION ?? "nyc3";
  const bucket2Raw = process.env.DO_SPACES_BUCKET2 ?? "";

  if (!accessKeyId || !secretAccessKey || !endpoint || !bucket || !region) {
    throw new Error("RECEIPT_STORAGE_NOT_CONFIGURED");
  }

  const endpointUrl = endpoint.startsWith("http://") || endpoint.startsWith("https://") ? endpoint : `https://${endpoint}`;
  const endpointHost = normalizeHost(endpointUrl);
  const bucket2 = normalizeHost(bucket2Raw);
  const publicHost = bucket2
    ? bucket2.includes(".")
      ? bucket2
      : `${bucket2}.${region}.digitaloceanspaces.com`
    : `${bucket}.${region}.digitaloceanspaces.com`;

  const client = new S3Client({
    region,
    endpoint: endpointUrl,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: false,
  });

  return {
    client,
    bucket,
    endpointHost,
    publicHost,
  };
}

function makeObjectKey(fileName: string) {
  return `finance/receipts/${new Date().getUTCFullYear()}/${Date.now()}-${crypto.randomUUID()}-${safeBaseName(fileName)}`;
}

export async function saveReceiptFiles(files: File[]) {
  if (files.length === 0) {
    return [] as Array<{ filePath: string; fileName: string; mimeType: string; size: number }>;
  }
  if (files.length > MAX_RECEIPT_FILES_PER_REQUEST) {
    throw new Error("RECEIPT_TOO_MANY_FILES");
  }

  const { client, bucket, publicHost } = createSpacesConfig();

  const saved: Array<{ filePath: string; fileName: string; mimeType: string; size: number }> = [];

  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      continue;
    }
    if (file.size > MAX_RECEIPT_FILE_SIZE_BYTES) {
      throw new Error("RECEIPT_FILE_TOO_LARGE");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const finalName = file.name || "receipt.bin";
    const key = makeObjectKey(finalName);

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ACL: "public-read",
        ContentType: file.type || "application/octet-stream",
      })
    );

    saved.push({
      filePath: `https://${publicHost}/${key}`,
      fileName: finalName,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    });
  }

  return saved;
}

export async function deleteReceiptFile(filePath: string) {
  const { client, bucket, endpointHost, publicHost } = createSpacesConfig();

  let url: URL;
  try {
    url = new URL(filePath);
  } catch {
    return;
  }

  const host = normalizeHost(url.host);
  if (host !== endpointHost && host !== publicHost) {
    return;
  }

  const key = url.pathname.replace(/^\/+/, "");
  if (!key) {
    return;
  }

  await client
    .send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    )
    .catch(() => {
      // Keep DB consistent even if object is already missing on Spaces.
    });
}
