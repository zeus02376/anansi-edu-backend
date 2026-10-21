-- CreateEnum
CREATE TYPE "ActionPublication" AS ENUM ('PUBLICATION', 'DEPUBLICATION');

-- AlterTable
ALTER TABLE "Etudiant" ADD COLUMN     "matriculeIuc" TEXT;

-- CreateTable
CREATE TABLE "EvaluationHistorique" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "action" "ActionPublication" NOT NULL,
    "motif" TEXT,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationHistorique_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvaluationHistorique_evaluationId_date_idx" ON "EvaluationHistorique"("evaluationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Etudiant_matriculeIuc_key" ON "Etudiant"("matriculeIuc");

-- AddForeignKey
ALTER TABLE "EvaluationHistorique" ADD CONSTRAINT "EvaluationHistorique_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

