const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables with precedence to match prisma.config.ts
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
        // Fallback to default .env
        dotenv.config();
    }
}

// Check if the environment variable RESET_DB is set to 'true'
if (process.env.RESET_DB === 'true') {
  console.log('RESET_DB is set to true. Resetting database...');
  try {
    // Run the prisma migrate reset command (guarded against remote DBs)
    execSync('node scripts/prisma-safe.js migrate reset --force', { stdio: 'inherit' });
    console.log('Database reset successfully.');
  } catch (error) {
    console.error('Failed to reset database.');
    process.exit(1);
  }
} else {
  console.log('RESET_DB is not set to true. Skipping database reset.');
}
