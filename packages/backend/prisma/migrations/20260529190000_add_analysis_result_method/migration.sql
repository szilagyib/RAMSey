-- DropIndex
DROP INDEX "analysis_results_diagramId_contentHash_key";

-- AlterTable
ALTER TABLE "analysis_results" ADD COLUMN     "method" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "analysis_results_diagramId_contentHash_method_key" ON "analysis_results"("diagramId", "contentHash", "method");
