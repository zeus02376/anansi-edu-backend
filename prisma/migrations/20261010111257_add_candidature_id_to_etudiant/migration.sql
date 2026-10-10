-- AlterTable
ALTER TABLE "Etudiant" ADD COLUMN     "candidatureId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Etudiant_candidatureId_key" ON "Etudiant"("candidatureId");

-- AddForeignKey
ALTER TABLE "Etudiant" ADD CONSTRAINT "Etudiant_candidatureId_fkey" FOREIGN KEY ("candidatureId") REFERENCES "Candidature"("id") ON DELETE SET NULL ON UPDATE CASCADE;

