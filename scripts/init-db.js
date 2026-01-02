const { execSync } = require('child_process');

// Check if the environment variable RESET_DB is set to 'true'
if (process.env.RESET_DB === 'true') {
  console.log('RESET_DB is set to true. Resetting database...');
  try {
    // Run the prisma migrate reset command
    execSync('npx prisma migrate reset --force', { stdio: 'inherit' });
    console.log('Database reset successfully.');
  } catch (error) {
    console.error('Failed to reset database.');
    process.exit(1);
  }
} else {
  console.log('RESET_DB is not set to true. Skipping database reset.');
}

