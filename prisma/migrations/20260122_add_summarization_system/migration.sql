-- CreateTable
CREATE TABLE "NodeDelta" (
    "nodeId" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "newInformation" JSONB NOT NULL,
    "openQuestions" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "derivedFrom" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NodeDelta_pkey" PRIMARY KEY ("nodeId")
);

-- CreateTable
CREATE TABLE "BranchSummary" (
    "id" TEXT NOT NULL,
    "rootNodeId" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "coveredNodes" JSONB NOT NULL,
    "isStale" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BranchSummary_rootNodeId_isStale_idx" ON "BranchSummary"("rootNodeId", "isStale");

-- CreateIndex
CREATE UNIQUE INDEX "BranchSummary_rootNodeId_intent_key" ON "BranchSummary"("rootNodeId", "intent");

-- AddForeignKey
ALTER TABLE "NodeDelta" ADD CONSTRAINT "NodeDelta_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchSummary" ADD CONSTRAINT "BranchSummary_rootNodeId_fkey" FOREIGN KEY ("rootNodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;
