import { z } from "zod";

const envSchema = z.object({
  BACKEND_SERVER_URL: z.string().optional(),
  NEXT_PUBLIC_API_URL: z.string().optional(),
});

const raw = envSchema.parse({
  BACKEND_SERVER_URL: process.env.BACKEND_SERVER_URL,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
});

const FALLBACK_API_URL = "http://localhost:8080";

/** Client-safe API base URL (public env first, then server env, then local). */
const API_URL =
  raw.NEXT_PUBLIC_API_URL ?? raw.BACKEND_SERVER_URL ?? FALLBACK_API_URL;

export const env = {
  /** Server-side API base URL (falls back to the public URL). */
  BACKEND_SERVER_URL: raw.BACKEND_SERVER_URL ?? API_URL,
  API_URL,
};
