/**
 * Vitest does not load .env, and the integration tests need real connection
 * details. Node 24 can read it natively, so no dotenv dependency is required.
 *
 * A missing .env is fine — the integration tests detect the placeholder and skip.
 */
try {
  process.loadEnvFile?.(".env");
} catch {
  // No .env present; unit tests do not need one.
}
