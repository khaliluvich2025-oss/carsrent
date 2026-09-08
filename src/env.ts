import { z } from "zod";

/**
 * Fail fast on misconfiguration rather than discovering it at the first request.
 * Storage vars are optional so the app boots before object storage is wired up;
 * the storage module throws if it is used without them.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_URL: z.string().optional(),

  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  SESSION_IDLE_DAYS: z.coerce.number().int().positive().default(7),
  SESSION_ABSOLUTE_DAYS: z.coerce.number().int().positive().default(30),

  /**
   * "s3" or "local". Unset means: use S3 when it is fully configured, and local
   * disk otherwise in development. Local disk is refused in production.
   */
  STORAGE_DRIVER: z.enum(["s3", "local"]).optional(),

  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("auto"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET_PRIVATE: z.string().optional(),
  S3_BUCKET_PUBLIC: z.string().optional(),
  S3_PUBLIC_BASE_URL: z.string().optional(),

  APP_URL: z.string().default("http://localhost:3000"),
  APP_ROOT_DOMAIN: z.string().optional(),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === "production";
