-- CreateEnum
CREATE TYPE "StatutDonnees" AS ENUM ('CONFIRME', 'A_CONFIRMER');

-- CreateEnum
CREATE TYPE "ModeAdmission" AS ENUM ('CONCOURS', 'ETUDE_DOSSIER', 'ENTRETIEN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Cycle" ADD VALUE 'BSC';
ALTER TYPE "Cycle" ADD VALUE 'BBA';
ALTER TYPE "Cycle" ADD VALUE 'BENG';

-- AlterTable
ALTER TABLE "Ecole" ADD COLUMN     "campusId" TEXT;

-- AlterTable
ALTER TABLE "Filiere" ADD COLUMN     "credits" INTEGER,
ADD COLUMN     "diplomeRequis" TEXT,
ADD COLUMN     "fraisCandidatureEtranger" DECIMAL(65,30),
ADD COLUMN     "fraisCandidatureNational" DECIMAL(65,30),
ADD COLUMN     "modeAdmission" "ModeAdmission",
ADD COLUMN     "niveauEntree" TEXT,
ADD COLUMN     "piecesRequises" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "statutDonnees" "StatutDonnees" NOT NULL DEFAULT 'A_CONFIRMER',
ALTER COLUMN "regime" DROP NOT NULL,
ALTER COLUMN "langue" DROP NOT NULL,
ALTER COLUMN "dureeAnnees" DROP NOT NULL,
ALTER COLUMN "tutelle" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Campus" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "code" TEXT,
    "adresse" TEXT,
    "description" TEXT,
    "statutDonnees" "StatutDonnees" NOT NULL DEFAULT 'A_CONFIRMER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Campus_tenantId_nom_key" ON "Campus"("tenantId", "nom");

-- AddForeignKey
ALTER TABLE "Ecole" ADD CONSTRAINT "Ecole_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campus" ADD CONSTRAINT "Campus_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

