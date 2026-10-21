import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantScopeService } from '../../common/tenant/tenant-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreerSalleDto,
  ListeSallesQueryDto,
  ModifierSalleDto,
} from './dto/salle.dto';

const SALLE_SELECT = {
  id: true,
  campusId: true,
  code: true,
  nom: true,
  type: true,
  capacite: true,
  campus: { select: { id: true, nom: true, code: true } },
} satisfies Prisma.SalleSelect;

const corps = (message: string) => ({
  statusCode: 409,
  error: 'Conflict',
  message,
});

/** Salles des campus de l'établissement du JWT ; toute référence hors établissement donne 404. */
@Injectable()
export class SallesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScopeService,
  ) {}

  async creer(tenantId: string, dto: CreerSalleDto) {
    await this.scope.campus(tenantId, dto.campusId);
    return this.codeUnique(() =>
      this.prisma.salle.create({ data: dto, select: SALLE_SELECT }),
    );
  }

  lister(tenantId: string, { campusId }: ListeSallesQueryDto) {
    return this.prisma.salle.findMany({
      where: { campus: { tenantId }, ...(campusId && { campusId }) },
      select: SALLE_SELECT,
      orderBy: [{ campus: { nom: 'asc' } }, { code: 'asc' }],
    });
  }

  consulter(tenantId: string, id: string) {
    return this.prisma.salle.findFirstOrThrow({
      where: { id, campus: { tenantId } },
      select: SALLE_SELECT,
    });
  }

  async modifier(tenantId: string, id: string, dto: ModifierSalleDto) {
    await this.scope.salle(tenantId, id);
    return this.codeUnique(() =>
      this.prisma.salle.update({
        where: { id },
        // Un champ facultatif absent est effacé : PUT remplace la salle
        data: {
          code: dto.code,
          nom: dto.nom || null,
          type: dto.type || null,
          capacite: dto.capacite ?? null,
        },
        select: SALLE_SELECT,
      }),
    );
  }

  /** Refusée tant qu'une séance (à venir, ou passée : l'historique la référence) l'utilise. */
  async supprimer(tenantId: string, id: string) {
    await this.scope.salle(tenantId, id);
    const aujourdhui = new Date(new Date().toISOString().slice(0, 10));
    const aVenir = await this.prisma.seance.count({
      where: { salleId: id, date: { gte: aujourdhui } },
    });
    if (aVenir > 0) {
      throw new ConflictException(
        corps(
          `Suppression impossible : ${aVenir} séance(s) à venir utilisent cette salle. Changez leur salle ou supprimez-les d’abord.`,
        ),
      );
    }
    const passees = await this.prisma.seance.count({ where: { salleId: id } });
    if (passees > 0) {
      throw new ConflictException(
        corps(
          'Suppression impossible : des séances passées utilisent cette salle (historique du planning).',
        ),
      );
    }
    await this.prisma.salle.delete({ where: { id } });
    return { id };
  }

  private async codeUnique<T>(action: () => Promise<T>) {
    try {
      return await action();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          corps('Une salle avec ce code existe déjà dans ce campus'),
        );
      }
      throw error;
    }
  }
}
