import { EtatNote } from '@prisma/client';
import {
  arrondir,
  moyenneGenerale,
  moyenneMatiere,
  noteSur20,
  NoteEvaluation,
} from './calcul-moyennes';
import { erreurValeur } from './valeur-note';

const note = (
  valeur: number | null,
  coefficient = 1,
  bareme = 20,
  etat: EtatNote = EtatNote.NOTEE,
): NoteEvaluation => ({ valeur, coefficient, bareme, etat });

describe('noteSur20', () => {
  it('ramène une note sur 20 selon son barème', () => {
    expect(noteSur20(note(15, 1, 20))).toBe(15);
    expect(noteSur20(note(30, 1, 40))).toBe(15);
    expect(noteSur20(note(7, 1, 10))).toBe(14);
    expect(noteSur20(note(80, 1, 100))).toBe(16);
  });

  it('compte 0 pour un absent, même avec une valeur résiduelle', () => {
    expect(noteSur20(note(null, 1, 20, EtatNote.ABSENT))).toBe(0);
    expect(noteSur20(note(12, 1, 20, EtatNote.ABSENT))).toBe(0);
  });

  it('exclut un dispensé (null)', () => {
    expect(noteSur20(note(null, 1, 20, EtatNote.DISPENSE))).toBeNull();
  });
});

describe('moyenneMatiere', () => {
  it('pondère par le coefficient des évaluations', () => {
    // (10×1 + 16×3) ÷ 4 = 14,5
    expect(moyenneMatiere([note(10, 1), note(16, 3)])).toBe(14.5);
  });

  it('ramène chaque note sur 20 avant de pondérer', () => {
    // 12/20 → 12 (coef 1) ; 30/40 → 15 (coef 2) : (12 + 30) ÷ 3 = 14
    expect(moyenneMatiere([note(12, 1, 20), note(30, 2, 40)])).toBe(14);
  });

  it('compte l’absent pour 0 et exclut le dispensé', () => {
    // 12 (coef 1), absent → 0 (coef 1), dispensé exclu (coef 5) : 12 ÷ 2 = 6
    expect(
      moyenneMatiere([
        note(12, 1),
        note(null, 1, 20, EtatNote.ABSENT),
        note(null, 5, 20, EtatNote.DISPENSE),
      ]),
    ).toBe(6);
  });

  it('renvoie null sans évaluation comptée (liste vide, ou seulement des dispenses)', () => {
    expect(moyenneMatiere([])).toBeNull();
    expect(moyenneMatiere([note(null, 2, 20, EtatNote.DISPENSE)])).toBeNull();
  });
});

describe('moyenneGenerale', () => {
  it('pondère les moyennes de matière par le coefficient de la matière', () => {
    // (10,5×2 + 14×3) ÷ 5 = 12,6
    expect(
      moyenneGenerale([
        { coefficient: 2, moyenne: 10.5 },
        { coefficient: 3, moyenne: 14 },
      ]),
    ).toBeCloseTo(12.6, 10);
  });

  it('ignore les matières sans moyenne (leur coefficient ne compte pas)', () => {
    expect(
      moyenneGenerale([
        { coefficient: 2, moyenne: 10 },
        { coefficient: 8, moyenne: null },
      ]),
    ).toBe(10);
  });

  it('renvoie null sans aucune moyenne de matière', () => {
    expect(moyenneGenerale([])).toBeNull();
    expect(moyenneGenerale([{ coefficient: 3, moyenne: null }])).toBeNull();
  });
});

describe('arrondir', () => {
  it('arrondit à 2 décimales (demi vers le haut)', () => {
    expect(arrondir(6.666666)).toBe(6.67);
    expect(arrondir(12.345)).toBe(12.35);
    expect(arrondir(10)).toBe(10);
    expect(arrondir(1.005)).toBe(1.01);
  });
});

describe('erreurValeur', () => {
  it('valide NOTEE entre 0 et le barème', () => {
    expect(erreurValeur(EtatNote.NOTEE, 0, 20)).toBeNull();
    expect(erreurValeur(EtatNote.NOTEE, 20, 20)).toBeNull();
    expect(erreurValeur(EtatNote.NOTEE, 20.01, 20)).toContain('barème');
    expect(erreurValeur(EtatNote.NOTEE, null, 20)).toContain('obligatoire');
  });

  it('interdit une valeur pour ABSENT et DISPENSE', () => {
    expect(erreurValeur(EtatNote.ABSENT, null, 20)).toBeNull();
    expect(erreurValeur(EtatNote.DISPENSE, null, 20)).toBeNull();
    expect(erreurValeur(EtatNote.ABSENT, 5, 20)).toContain('ABSENT');
  });
});
