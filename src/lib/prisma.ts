import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const prismaClientSingleton = () => {
    // Uses the transaction pooler for the application connection
    const connectionString = process.env.DATABASE_URL
    const pool = new Pool({ connectionString })
    const adapter = new PrismaPg(pool)
    return new PrismaClient({ adapter })
}

declare global {
    // Use a new key to force re-instantiation after schema changes
    var prisma_v2: undefined | ReturnType<typeof prismaClientSingleton>
}

const prisma = globalThis.prisma_v2 ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prisma_v2 = prisma
