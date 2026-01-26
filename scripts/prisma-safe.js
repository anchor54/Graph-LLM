/* eslint-disable no-console */
/**
 * Safety wrapper around Prisma CLI to reduce the chance of accidentally running
 * migrations against a remote/prod database from a local shell.
 *
 * Usage:
 *   node scripts/prisma-safe.js migrate reset --force
 *   node scripts/prisma-safe.js migrate dev
 *
 * Override (use with care):
 *   ALLOW_REMOTE_DB=true node scripts/prisma-safe.js migrate deploy
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

function loadEnvLikePrismaConfig() {
  const envFile = process.env.PRISMA_ENV_FILE;
  if (envFile && fs.existsSync(envFile)) {
    dotenv.config({ path: envFile });
    return;
  }

  const devLocal = path.join(process.cwd(), ".env.development.local");
  if (fs.existsSync(devLocal)) {
    dotenv.config({ path: devLocal });
    return;
  }

  dotenv.config();
}

function getDbUrl() {
  return process.env.DIRECT_URL || process.env.DATABASE_URL || "";
}

function isLocalHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function isLikelyRemoteDbUrl(dbUrl) {
  try {
    const u = new URL(dbUrl);
    return !isLocalHostname(u.hostname);
  } catch {
    // If it's not a valid URL, don't block; Prisma will error anyway.
    return false;
  }
}

function shouldGuard(args) {
  // Guard potentially schema-changing commands.
  // We intentionally do NOT guard `generate` and `studio`.
  const joined = args.join(" ");
  return (
    joined.startsWith("migrate ") ||
    joined === "migrate" ||
    joined.startsWith("db push") ||
    joined.startsWith("db pull") ||
    joined.startsWith("db execute")
  );
}

loadEnvLikePrismaConfig();

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("No Prisma args provided. Example: node scripts/prisma-safe.js migrate reset --force");
  process.exit(1);
}

const dbUrl = getDbUrl();
const allowRemote = process.env.ALLOW_REMOTE_DB === "true";

if (!allowRemote && shouldGuard(args) && dbUrl && isLikelyRemoteDbUrl(dbUrl)) {
  let host = "unknown-host";
  try {
    host = new URL(dbUrl).hostname;
  } catch {
    // ignore
  }
  console.error(
    [
      "Refusing to run Prisma command against a non-local database host.",
      `Detected host: ${host}`,
      "",
      `Command: prisma ${args.join(" ")}`,
      "",
      "If you really intend to run this against a remote DB, set:",
      "  ALLOW_REMOTE_DB=true",
    ].join("\n")
  );
  process.exit(2);
}

execSync(`npx prisma ${args.map((a) => JSON.stringify(a)).join(" ")}`, { stdio: "inherit" });

