const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables with precedence
const envFile = process.env.PRISMA_ENV_FILE;
if (envFile && fs.existsSync(envFile)) {
    console.log(`Loading env from PRISMA_ENV_FILE: ${envFile}`);
    dotenv.config({ path: envFile });
} else if (process.env.DATABASE_URL) {
    // If DATABASE_URL is already provided (typical for prod/CI), don't load local dev env files.
    console.log('DATABASE_URL is already set; skipping dotenv file loading');
} else {
    const devLocal = path.join(process.cwd(), ".env.development.local");
    if (fs.existsSync(devLocal)) {
        console.log(`Loading env from .env.development.local`);
        dotenv.config({ path: devLocal });
    } else {
        dotenv.config();
    }
}

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const GEMINI_MODELS = [
    { name: 'gemini-2.0-flash-exp', displayName: 'Gemini 2.0 Flash (Experimental)' },
    { name: 'gemini-2.5-flash-lite', displayName: 'Gemini 2.5 Flash Lite' },
    { name: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
    { name: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash' },
    { name: 'gemini-1.5-flash-8b', displayName: 'Gemini 1.5 Flash 8B' },
    { name: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro' },
];

const OPENAI_MODELS = [
    { name: 'gpt-4o', displayName: 'GPT-4o' },
    { name: 'gpt-4o-mini', displayName: 'GPT-4o Mini' },
    { name: 'gpt-4-turbo', displayName: 'GPT-4 Turbo' },
    { name: 'gpt-4', displayName: 'GPT-4' },
    { name: 'gpt-3.5-turbo', displayName: 'GPT-3.5 Turbo' },
    { name: 'o1', displayName: 'O1' },
    { name: 'o1-mini', displayName: 'O1 Mini' },
    // Newer families / common additions (keep disabled by default until you confirm access)
    { name: 'gpt-5', displayName: 'GPT-5', enabled: false },
    { name: 'gpt-5.2', displayName: 'GPT-5.2', enabled: false },
    { name: 'gpt-5-mini', displayName: 'GPT-5 Mini', enabled: false },
    { name: 'gpt-5-nano', displayName: 'GPT-5 Nano', enabled: false },
    { name: 'gpt-4.1', displayName: 'GPT-4.1', enabled: false },
    { name: 'gpt-4.1-mini', displayName: 'GPT-4.1 Mini', enabled: false },
    { name: 'gpt-4.1-nano', displayName: 'GPT-4.1 Nano', enabled: false },
    { name: 'o3-mini', displayName: 'O3 Mini', enabled: false },
];

async function seedModels() {
    console.log('Starting model seeding...');

    try {
        // Seed Gemini models
        for (const model of GEMINI_MODELS) {
            await prisma.model.upsert({
                where: {
                    provider_name: {
                        provider: 'gemini',
                        name: model.name,
                    },
                },
                update: {
                    displayName: model.displayName,
                },
                create: {
                    provider: 'gemini',
                    name: model.name,
                    displayName: model.displayName,
                    enabled: true,
                    isGlobal: true,
                },
            });
            console.log(`✓ Seeded Gemini model: ${model.displayName}`);
        }

        // Seed OpenAI models
        for (const model of OPENAI_MODELS) {
            await prisma.model.upsert({
                where: {
                    provider_name: {
                        provider: 'openai',
                        name: model.name,
                    },
                },
                update: {
                    displayName: model.displayName,
                    ...(model.enabled !== undefined ? { enabled: model.enabled } : {}),
                },
                create: {
                    provider: 'openai',
                    name: model.name,
                    displayName: model.displayName,
                    enabled: model.enabled ?? true,
                    isGlobal: true,
                },
            });
            console.log(`✓ Seeded OpenAI model: ${model.displayName}`);
        }

        console.log('\n✅ Model seeding completed successfully!');
        console.log(`Total models seeded: ${GEMINI_MODELS.length + OPENAI_MODELS.length}`);
    } catch (error) {
        console.error('❌ Error seeding models:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

seedModels()
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
