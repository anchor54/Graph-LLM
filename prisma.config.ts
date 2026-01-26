import { defineConfig } from "prisma/config";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// Load environment variables with precedence:
// 1. PRISMA_ENV_FILE (explicit override)
// 2. .env.development.local (local dev)
// 3. .env (default/prod)

const envFile = process.env.PRISMA_ENV_FILE;
if (envFile && fs.existsSync(envFile)) {
    console.log(`Loading env from PRISMA_ENV_FILE: ${envFile}`);
    dotenv.config({ path: envFile });
} else {
    const devLocal = path.join(process.cwd(), ".env.development.local");
    if (fs.existsSync(devLocal)) {
        console.log(`Loading env from .env.development.local`);
        dotenv.config({ path: devLocal });
    } else {
        // Fallback to default .env loading
        dotenv.config();
    }
}

export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
        path: "prisma/migrations",
    },
    datasource: {
        url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
    },
});
