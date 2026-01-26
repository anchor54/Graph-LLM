const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

// Load environment variables (same logic as other scripts)
const envFile = process.env.PRISMA_ENV_FILE;
if (envFile && fs.existsSync(envFile)) {
    dotenv.config({ path: envFile });
} else {
    const devLocal = path.join(process.cwd(), ".env.development.local");
    if (fs.existsSync(devLocal)) {
        dotenv.config({ path: devLocal });
    } else {
        dotenv.config();
    }
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
}

const pool = new Pool({ connectionString });

async function confirmAllUsers() {
    console.log('🔄 Checking for unconfirmed users...');
    try {
        // Update auth.users table directly
        const result = await pool.query(
            `UPDATE auth.users 
             SET email_confirmed_at = NOW(), updated_at = NOW(), last_sign_in_at = NOW() 
             WHERE email_confirmed_at IS NULL 
             RETURNING email`
        );
        
        if (result.rowCount > 0) {
            console.log('✅ Successfully confirmed the following users:');
            result.rows.forEach(row => console.log(`   - ${row.email}`));
        } else {
            console.log('ℹ️  No unconfirmed users found.');
        }
    } catch (error) {
        console.error('❌ Error confirming users:', error);
    } finally {
        await pool.end();
    }
}

confirmAllUsers();
