-- CreateEnum
CREATE TYPE "TypeEvaluation" AS ENUM ('DEVOIR', 'TP', 'PROJET', 'EXAMEN', 'AUTRE');

-- CreateEnum
CREATE TYPE "StatutEvaluation" AS ENUM ('BROUILLON', 'PUBLIEE');

-- CreateEnum
CREATE TYPE "EtatNote" AS ENUM ('NOTEE', 'ABSENT', 'DISPENSE');

-- CreateTable
CREATE TABLE "Evaluation" (
    "id" TEXT NOT NULL,
    "matiereId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "type" "TypeEvaluation" NOT NULL,
    "coefficient" DECIMAL(5,2) NOT NULL DEFAULT 1,
    "bareme" DECIMAL(5,2) NOT NULL DEFAULT 20,
    "date" TIMESTAMP(3),
    "statut" "StatutEvaluation" NOT NULL DEFAULT 'BROUILLON',
    "publieLe" TIMESTAMP(3),
    "publiePar" TEXT,
    "creePar" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "inscriptionId" TEXT NOT NULL,
    "valeur" DECIMAL(6,2),
    "etat" "EtatNote" NOT NULL DEFAULT 'NOTEE',
    "commentaire" TEXT,
    "saisiePar" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteHistorique" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "ancienneValeur" DECIMAL(6,2),
    "nouvelleValeur" DECIMAL(6,2),
    "ancienEtat" "EtatNote" NOT NULL,
    "nouvelEtat" "EtatNote" NOT NULL,
    "motif" TEXT NOT NULL,
    "modifiePar" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteHistorique_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Evaluation_matiereId_nom_key" ON "Evaluation"("matiereId", "nom");

-- CreateIndex
CREATE UNIQUE INDEX "Note_evaluationId_inscriptionId_key" ON "Note"("evaluationId", "inscriptionId");

-- CreateIndex
CREATE INDEX "NoteHistorique_noteId_date_idx" ON "NoteHistorique"("noteId", "date");

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_matiereId_fkey" FOREIGN KEY ("matiereId") REFERENCES "Matiere"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_inscriptionId_fkey" FOREIGN KEY ("inscriptionId") REFERENCES "Inscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteHistorique" ADD CONSTRAINT "NoteHistorique_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

