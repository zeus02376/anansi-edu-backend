import { BadRequestException } from '@nestjs/common';
import { formaterDate, jourSemaine, lireDate, lireSemaine } from './temps';

describe('temps du planning', () => {
  describe('lireDate / jourSemaine', () => {
    it('accepte une vraie date et en déduit le jour de la semaine (1 = lundi, 7 = dimanche)', () => {
      expect(jourSemaine(lireDate('2027-01-04')!)).toBe(1); // lundi
      expect(jourSemaine(lireDate('2027-01-10')!)).toBe(7); // dimanche
      expect(jourSemaine(lireDate('2026-05-30')!)).toBe(6); // samedi
    });

    it('refuse un format ou un jour inexistant (comme l’erreur de date des documents sources)', () => {
      expect(lireDate('2027-02-30')).toBeNull();
      expect(lireDate('05/01/2027')).toBeNull();
      expect(lireDate('2027-1-4')).toBeNull();
    });
  });

  describe('lireSemaine (ISO 8601)', () => {
    const bornes = (semaine: string) => {
      const { lundi, dimanche } = lireSemaine(semaine);
      return [formaterDate(lundi), formaterDate(dimanche)];
    };

    it('la semaine 1 contient le 4 janvier', () => {
      expect(bornes('2027-W01')).toEqual(['2027-01-04', '2027-01-10']);
      expect(bornes('2027-W05')).toEqual(['2027-02-01', '2027-02-07']);
    });

    it('la semaine 1 peut commencer l’année précédente', () => {
      expect(bornes('2019-W01')).toEqual(['2018-12-31', '2019-01-06']);
    });

    it('la semaine 53 n’existe que les années qui en comptent une', () => {
      expect(bornes('2026-W53')).toEqual(['2026-12-28', '2027-01-03']);
      expect(bornes('2020-W53')).toEqual(['2020-12-28', '2021-01-03']);
      expect(() => lireSemaine('2027-W53')).toThrow(BadRequestException);
      expect(() => lireSemaine('2025-W53')).toThrow(BadRequestException);
    });

    it('refuse les formats et numéros invalides', () => {
      for (const texte of [
        '2027-W00',
        '2027-W54',
        '2027W05',
        '2027-W5',
        '27-W05',
        '2027-05',
        '',
      ]) {
        expect(() => lireSemaine(texte)).toThrow(BadRequestException);
      }
    });
  });
});
