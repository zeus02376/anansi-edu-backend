CREATE TYPE "StatutNotificationEmail" AS ENUM ('EN_ATTENTE', 'EN_COURS', 'ENVOYEE', 'ECHEC');

CREATE TYPE "TypeNotificationCandidature" AS ENUM ('RECEPTION', 'CHANGEMENT_STATUT');

CREATE TABLE "NotificationCandidatureEmail" (
    "id" TEXT NOT NULL,
    "candidatureId" TEXT NOT NULL,
    "type" "TypeNotificationCandidature" NOT NULL,
    "destinataire" TEXT NOT NULL,
    "sujet" TEXT NOT NULL,
    "contenu" TEXT NOT NULL,
    "statut" "StatutNotificationEmail" NOT NULL DEFAULT 'EN_ATTENTE',
    "tentatives" INTEGER NOT NULL DEFAULT 0,
    "derniereErreur" TEXT,
    "envoyeLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationCandidatureEmail_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NotificationCandidatureEmail_candidatureId_createdAt_idx"
ON "NotificationCandidatureEmail"("candidatureId", "createdAt");

CREATE INDEX "NotificationCandidatureEmail_statut_createdAt_idx"
ON "NotificationCandidatureEmail"("statut", "createdAt");

ALTER TABLE "NotificationCandidatureEmail"
ADD CONSTRAINT "NotificationCandidatureEmail_candidatureId_fkey"
FOREIGN KEY ("candidatureId") REFERENCES "Candidature"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
