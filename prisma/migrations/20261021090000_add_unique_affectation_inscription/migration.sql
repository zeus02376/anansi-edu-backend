-- Un enseignant n'est affecté qu'une fois à une matière (la matière porte déjà l'année)
-- CreateIndex
CREATE UNIQUE INDEX "Affectation_enseignantId_matiereId_key" ON "Affectation"("enseignantId", "matiereId");

-- Un étudiant n'a qu'une inscription par année académique
-- CreateIndex
CREATE UNIQUE INDEX "Inscription_etudiantId_anneeAcademiqueId_key" ON "Inscription"("etudiantId", "anneeAcademiqueId");
