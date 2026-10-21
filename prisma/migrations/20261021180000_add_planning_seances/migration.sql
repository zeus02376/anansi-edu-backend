-- CreateEnum
CREATE TYPE "TypeSeance" AS ENUM ('CM', 'TD', 'TP', 'EXAMEN', 'RESIT');

-- CreateEnum
CREATE TYPE "Rythme" AS ENUM ('JOUR', 'SOIR');

-- CreateEnum
CREATE TYPE "StatutSeance" AS ENUM ('BROUILLON', 'PUBLIEE');

-- CreateTable
CREATE TABLE "Salle" (
    "id" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT,
    "type" TEXT,
    "capacite" INTEGER,

    CONSTRAINT "Salle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Seance" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "heureDebut" INTEGER NOT NULL,
    "heureFin" INTEGER NOT NULL,
    "type" "TypeSeance" NOT NULL,
    "enseignantId" TEXT,
    "salleId" TEXT,
    "rythme" "Rythme" NOT NULL DEFAULT 'JOUR',
    "statut" "StatutSeance" NOT NULL DEFAULT 'BROUILLON',
    "annuleLe" TIMESTAMP(3),
    "motifAnnulation" TEXT,
    "serieId" TEXT,
    "creePar" TEXT NOT NULL,
    "sourceExterneId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Seance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeanceMatiere" (
    "seanceId" TEXT NOT NULL,
    "matiereId" TEXT NOT NULL,

    CONSTRAINT "SeanceMatiere_pkey" PRIMARY KEY ("seanceId","matiereId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Salle_campusId_code_key" ON "Salle"("campusId", "code");

-- CreateIndex
CREATE INDEX "Seance_date_idx" ON "Seance"("date");

-- CreateIndex
CREATE INDEX "Seance_enseignantId_date_idx" ON "Seance"("enseignantId", "date");

-- CreateIndex
CREATE INDEX "Seance_salleId_date_idx" ON "Seance"("salleId", "date");

-- CreateIndex
CREATE INDEX "Seance_serieId_idx" ON "Seance"("serieId");

-- CreateIndex
CREATE INDEX "SeanceMatiere_matiereId_idx" ON "SeanceMatiere"("matiereId");

-- AddForeignKey
ALTER TABLE "Salle" ADD CONSTRAINT "Salle_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seance" ADD CONSTRAINT "Seance_enseignantId_fkey" FOREIGN KEY ("enseignantId") REFERENCES "Enseignant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seance" ADD CONSTRAINT "Seance_salleId_fkey" FOREIGN KEY ("salleId") REFERENCES "Salle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeanceMatiere" ADD CONSTRAINT "SeanceMatiere_seanceId_fkey" FOREIGN KEY ("seanceId") REFERENCES "Seance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeanceMatiere" ADD CONSTRAINT "SeanceMatiere_matiereId_fkey" FOREIGN KEY ("matiereId") REFERENCES "Matiere"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Intervalle horaire valide (minutes depuis minuit) et capacité positive
ALTER TABLE "Seance" ADD CONSTRAINT "Seance_heures_valides"
  CHECK ("heureDebut" >= 0 AND "heureFin" <= 1440 AND "heureDebut" < "heureFin");
ALTER TABLE "Salle" ADD CONSTRAINT "Salle_capacite_positive"
  CHECK ("capacite" IS NULL OR "capacite" > 0);
-- Une séance annulée porte son motif, une séance active n'en porte pas
ALTER TABLE "Seance" ADD CONSTRAINT "Seance_annulation_coherente"
  CHECK (("annuleLe" IS NULL) = ("motifAnnulation" IS NULL));
