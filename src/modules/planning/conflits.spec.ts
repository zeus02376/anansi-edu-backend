import { CreneauSeance, seChevauchent, typesDeConflit } from './conflits';

const creneau = (surcharge: Partial<CreneauSeance> = {}): CreneauSeance => ({
  date: '2026-10-05',
  heureDebut: 480, // 08:00
  heureFin: 590, // 09:50
  enseignantId: 'ens-1',
  salleId: 'salle-1',
  rythme: 'JOUR',
  niveauIds: ['niv-1'],
  ...surcharge,
});

describe('règles de conflit entre séances', () => {
  describe('chevauchement (fin exclue)', () => {
    it('détecte un chevauchement partiel, dans les deux sens', () => {
      const a = creneau();
      const b = creneau({ heureDebut: 540, heureFin: 650 });
      expect(seChevauchent(a, b)).toBe(true);
      expect(seChevauchent(b, a)).toBe(true);
    });

    it('détecte l’inclusion et l’égalité', () => {
      expect(
        seChevauchent(creneau(), creneau({ heureDebut: 500, heureFin: 520 })),
      ).toBe(true);
      expect(seChevauchent(creneau(), creneau())).toBe(true);
    });

    it('deux blocs consécutifs (fin = début) ne se chevauchent pas', () => {
      const bloc1 = creneau();
      const bloc2 = creneau({ heureDebut: 590, heureFin: 720 });
      expect(seChevauchent(bloc1, bloc2)).toBe(false);
      expect(seChevauchent(bloc2, bloc1)).toBe(false);
    });

    it('deux jours différents ne se chevauchent jamais', () => {
      expect(seChevauchent(creneau(), creneau({ date: '2026-10-06' }))).toBe(
        false,
      );
    });
  });

  describe('types de conflit', () => {
    const autre = (surcharge: Partial<CreneauSeance>) =>
      creneau({
        enseignantId: 'ens-2',
        salleId: 'salle-2',
        niveauIds: ['niv-2'],
        ...surcharge,
      });

    it('ENSEIGNANT : même enseignant, salle et classe différentes', () => {
      expect(
        typesDeConflit(creneau(), autre({ enseignantId: 'ens-1' })),
      ).toEqual(['ENSEIGNANT']);
    });

    it('SALLE : même salle, enseignant et classe différents', () => {
      expect(typesDeConflit(creneau(), autre({ salleId: 'salle-1' }))).toEqual([
        'SALLE',
      ]);
    });

    it('CLASSE : même niveau et même rythme', () => {
      expect(
        typesDeConflit(creneau(), autre({ niveauIds: ['niv-1'] })),
      ).toEqual(['CLASSE']);
    });

    it('CLASSE : un seul niveau commun parmi plusieurs suffit (séance commune)', () => {
      expect(
        typesDeConflit(
          creneau({ niveauIds: ['niv-1', 'niv-3'] }),
          autre({ niveauIds: ['niv-3', 'niv-4'] }),
        ),
      ).toEqual(['CLASSE']);
    });

    it('même niveau mais rythme différent (Jour / Soir) : pas de conflit de classe', () => {
      expect(
        typesDeConflit(
          creneau(),
          autre({ niveauIds: ['niv-1'], rythme: 'SOIR' }),
        ),
      ).toEqual([]);
    });

    it('plusieurs conflits sur la même paire sont tous signalés', () => {
      expect(typesDeConflit(creneau(), creneau())).toEqual([
        'ENSEIGNANT',
        'SALLE',
        'CLASSE',
      ]);
    });

    it('enseignant ou salle absents : jamais de conflit sur ce critère', () => {
      const sans = creneau({ enseignantId: null, salleId: null });
      expect(
        typesDeConflit(sans, autre({ enseignantId: null, salleId: null })),
      ).toEqual([]);
    });

    it('sans chevauchement horaire, aucun type', () => {
      expect(
        typesDeConflit(creneau(), creneau({ heureDebut: 590, heureFin: 700 })),
      ).toEqual([]);
    });
  });
});
