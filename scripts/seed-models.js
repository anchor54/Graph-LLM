const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables with precedence
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
                },
                create: {
                    provider: 'openai',
                    name: model.name,
                    displayName: model.displayName,
                    enabled: true,
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
