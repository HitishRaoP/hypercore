import { S3Client } from "@aws-sdk/client-s3";
import { env } from "./env";

export const S3 = new S3Client({
  region: "auto", // Required by SDK but not used by R2
  endpoint: `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.CLOUDFLARE_ACCESS_KEY_ID,
    secretAccessKey: env.CLOUDFLARE_SECRET_ACCESS_KEY,
  },
});
