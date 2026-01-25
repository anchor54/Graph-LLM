-- AlterTable
ALTER TABLE "Node" ADD COLUMN     "classification" TEXT,
ADD COLUMN     "collapsed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isLowSignal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "topics" JSONB;
