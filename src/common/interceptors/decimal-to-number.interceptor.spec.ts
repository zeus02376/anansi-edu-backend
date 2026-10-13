import { Prisma } from '@prisma/client';
import { decimalsToNumbers } from './decimal-to-number.interceptor';

describe('decimalsToNumbers', () => {
  it('convertit les Decimal en nombres, y compris imbriqués', () => {
    const date = new Date('2026-10-01T00:00:00.000Z');
    const result = decimalsToNumbers({
      fraisCandidatureNational: new Prisma.Decimal('25000'),
      fraisCandidatureEtranger: new Prisma.Decimal('50000.5'),
      ecole: { filieres: [{ frais: new Prisma.Decimal(12) }] },
      createdAt: date,
    });

    expect(result).toEqual({
      fraisCandidatureNational: 25000,
      fraisCandidatureEtranger: 50000.5,
      ecole: { filieres: [{ frais: 12 }] },
      createdAt: date,
    });
    expect((result as { createdAt: Date }).createdAt).toBe(date);
  });

  it('laisse null à null (jamais 0) et ne touche pas aux autres valeurs', () => {
    expect(
      decimalsToNumbers({
        fraisCandidatureNational: null,
        piecesRequises: ['CNI'],
        credits: 180,
        nom: 'ISM',
      }),
    ).toEqual({
      fraisCandidatureNational: null,
      piecesRequises: ['CNI'],
      credits: 180,
      nom: 'ISM',
    });
    expect(decimalsToNumbers(null)).toBeNull();
    expect(decimalsToNumbers(undefined)).toBeUndefined();
  });
});
