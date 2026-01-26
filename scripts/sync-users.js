const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

// Load environment variables
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

async function syncUsers() {
    console.log('🔄 Syncing auth.users to public.User...');
    try {
        // 1. Confirm any unconfirmed users
        await pool.query(
            `UPDATE auth.users 
             SET email_confirmed_at = NOW(), updated_at = NOW() 
             WHERE email_confirmed_at IS NULL`
        );

        // 2. Insert missing users into public.User
        // Cast auth.users.id to text to match public.User.id (if it's a string)
        const result = await pool.query(`
            INSERT INTO public."User" (id, email, "createdAt")
            SELECT id::text, email, created_at
            FROM auth.users
            WHERE NOT EXISTS (
                SELECT 1 FROM public."User" WHERE id = auth.users.id::text
            )
            RETURNING email;
        `);
        
        if (result.rowCount > 0) {
            console.log('✅ Successfully synced the following users to public.User:');
            result.rows.forEach(row => console.log(`   - ${row.email}`));
        } else {
            console.log('ℹ️  All auth users are already in public.User.');
        }

    } catch (error) {
        console.error('❌ Error syncing users:', error);
    } finally {
        await pool.end();
    }
}

syncUsers();
