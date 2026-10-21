import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Rythme, TypeSeance } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  matiereInTenant,
  TenantScopeService,
} from '../../common/tenant/tenant-scope.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreneauSeance, TypeConflit, typesDeConflit } from './conflits';
import {
  AnnulerSeanceDto,
  CreerSeanceDto,
  CreerSerieDto,
  FenetreQueryDto,
  ListeSeancesQueryDto,
  ModifierSeanceDto,
} from './dto/seance.dto';
import {
  creneauDe,
  presenterSeance,
  resumerSeance,
  SEANCE_SELECT,
  SeanceLue,
} from './seance-lecture';
import {
  ajouterJours,
  dateObligatoire,
  ecartJours,
  formaterDate,
  formaterHeure,
  jourSemaine,
  lireFenetre,
} from './temps';

/** Une série couvre au plus ces occurrences / ce nombre de jours : garde-fou contre une saisie absurde. */
const SERIE_MAX_OCCURRENCES = 200;
const SERIE_MAX_JOURS = 400;
const ESSAIS_SERIALISABLE = 3;

type Db = Pick<Prisma.TransactionClient, 'seance'>;

type Candidat = CreneauSeance & { heureDebut: number; heureFin: number };

export type ConflitDetecte = {
  date: string;
  heureDebut: number;
  heureFin: number;
  type: TypeConflit;
  avec: ReturnType<typeof resumerSeance>;
};

const LIBELLE_CONFLIT: Record<TypeConflit, string> = {
  ENSEIGNANT: 'enseignant déjà occupé',
  SALLE: 'salle déjà occupée',
  CLASSE: 'classe déjà en cours',
};

type Reference = {
  matiereIds?: string[];
  enseignantId?: string | null;
  salleId?: string | null;
};

/**
 * Séances du planning, côté personnel. Établissement du JWT uniquement : toute
 * référence (matière, enseignant, salle, séance) passe par TenantScopeService.
 *
 * Conflits (séances non annulées, intervalles [début, fin)) : même enseignant, même
 * salle, même classe (niveau + rythme). Le contrôle et l'écriture partagent une
 * transaction sérialisable : deux demandes simultanées ne peuvent pas se croiser.
 */
@Injectable()
export class SeancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: TenantScopeService,
  ) {}

  creer(tenantId: string, userId: string, dto: CreerSeanceDto) {
    const date = dateObligatoire(dto.date, 'date');
    return this.planifier(tenantId, userId, dto, [date], null);
  }

  creerSerie(tenantId: string, userId: string, dto: CreerSerieDto) {
    const debut = dateObligatoire(dto.dateDebut, 'dateDebut');
    const fin = dateObligatoire(dto.dateFin, 'dateFin');
    if (fin < debut) {
      throw new BadRequestException(
        '« dateFin » doit être postérieure ou égale à « dateDebut »',
      );
    }
    if (ecartJours(debut, fin) > SERIE_MAX_JOURS) {
      throw new BadRequestException(
        `Une série ne peut pas dépasser ${SERIE_MAX_JOURS} jours`,
      );
    }
    const dates: Date[] = [];
    for (let d = debut; d <= fin; d = ajouterJours(d, 1)) {
      if (dto.joursSemaine.includes(jourSemaine(d))) dates.push(d);
    }
    if (dates.length === 0) {
      throw new BadRequestException(
        'Aucune date de la période ne tombe sur les jours demandés',
      );
    }
    if (dates.length > SERIE_MAX_OCCURRENCES) {
      throw new BadRequestException(
        `Une série ne peut pas dépasser ${SERIE_MAX_OCCURRENCES} séances (${dates.length} demandées)`,
      );
    }
    return this.planifier(tenantId, userId, dto, dates, randomUUID());
  }

  async lister(tenantId: string, query: ListeSeancesQueryDto) {
    const { debut, fin } = lireFenetre(query.du, query.au);
    const seances = await this.prisma.seance.findMany({
      where: {
        date: { gte: debut, lte: fin },
        matieres: {
          some: {
            matiere: {
              ...matiereInTenant(tenantId),
              ...(query.niveauId && { niveauId: query.niveauId }),
            },
          },
        },
        ...(query.enseignantId && { enseignantId: query.enseignantId }),
        ...(query.salleId && { salleId: query.salleId }),
        ...(query.type && { type: query.type }),
        ...(query.statut && { statut: query.statut }),
        ...(query.rythme && { rythme: query.rythme }),
      },
      select: SEANCE_SELECT,
      orderBy: [{ date: 'asc' }, { heureDebut: 'asc' }, { id: 'asc' }],
    });
    return seances.map(presenterSeance);
  }

  async consulter(tenantId: string, id: string) {
    await this.scope.seance(tenantId, id);
    return presenterSeance(await this.lireUne(id));
  }

  async modifier(tenantId: string, id: string, dto: ModifierSeanceDto) {
    await this.scope.seance(tenantId, id);
    const portee = dto.portee ?? 'cette_seance';
    const champs = [
      dto.date,
      dto.heureDebut,
      dto.heureFin,
      dto.type,
      dto.matiereIds,
      dto.enseignantId,
      dto.salleId,
      dto.rythme,
    ];
    if (champs.every((valeur) => valeur === undefined)) {
      throw new BadRequestException('Aucune modification fournie');
    }
    const ancre = await this.lireUne(id);
    if (ancre.annuleLe) {
      throw new ConflictException(
        corps('Une séance annulée ne peut plus être modifiée'),
      );
    }
    if (portee !== 'cette_seance') {
      if (dto.date !== undefined) {
        throw new BadRequestException(
          'La date ne se change que pour « cette_seance » : chaque occurrence garde sa date',
        );
      }
      if (!ancre.serieId) {
        throw new BadRequestException(
          'Cette séance n’appartient à aucune série : utilisez la portée « cette_seance »',
        );
      }
    }
    const cibles =
      portee === 'cette_seance'
        ? [ancre]
        : await this.prisma.seance.findMany({
            where: {
              serieId: ancre.serieId,
              annuleLe: null,
              ...(portee === 'suivantes' && { date: { gte: ancre.date } }),
              matieres: { some: { matiere: matiereInTenant(tenantId) } },
            },
            select: SEANCE_SELECT,
            orderBy: [{ date: 'asc' }, { heureDebut: 'asc' }],
          });

    const nouvelles = await this.verifierReferences(tenantId, {
      matiereIds: dto.matiereIds,
      enseignantId: dto.enseignantId,
      salleId: dto.salleId,
    });
    const nouvelleDate =
      dto.date === undefined ? null : dateObligatoire(dto.date, 'date');

    const valeurs = cibles.map((cible) => {
      const heureDebut = dto.heureDebut ?? cible.heureDebut;
      const heureFin = dto.heureFin ?? cible.heureFin;
      this.verifierHeures(heureDebut, heureFin);
      return {
        id: cible.id,
        date: nouvelleDate ?? cible.date,
        heureDebut,
        heureFin,
        type: dto.type ?? cible.type,
        enseignantId:
          dto.enseignantId === undefined
            ? cible.enseignantId
            : dto.enseignantId,
        salleId: dto.salleId === undefined ? cible.salleId : dto.salleId,
        rythme: dto.rythme ?? cible.rythme,
        niveauIds: nouvelles?.niveauIds ?? creneauDe(cible).niveauIds,
      };
    });
    const candidats: Candidat[] = valeurs.map((v) => ({
      date: formaterDate(v.date),
      heureDebut: v.heureDebut,
      heureFin: v.heureFin,
      enseignantId: v.enseignantId,
      salleId: v.salleId,
      rythme: v.rythme,
      niveauIds: v.niveauIds,
    }));
    const ignorer = cibles.map((c) => c.id);

    if (dto.dryRun) {
      return this.apercu(
        candidats,
        await this.detecter(this.prisma, candidats, ignorer),
      );
    }

    await this.serialisable(async (tx) => {
      const conflits = await this.detecter(tx, candidats, ignorer);
      if (conflits.length) throw this.erreurConflits(conflits);
      for (const v of valeurs) {
        await tx.seance.update({
          where: { id: v.id },
          data: {
            date: v.date,
            heureDebut: v.heureDebut,
            heureFin: v.heureFin,
            type: v.type,
            enseignantId: v.enseignantId,
            salleId: v.salleId,
            rythme: v.rythme,
          },
        });
      }
      if (dto.matiereIds) {
        await tx.seanceMatiere.deleteMany({
          where: { seanceId: { in: ignorer } },
        });
        await tx.seanceMatiere.createMany({
          data: ignorer.flatMap((seanceId) =>
            dto.matiereIds!.map((matiereId) => ({ seanceId, matiereId })),
          ),
        });
      }
    });

    const seances = await this.lireIds(ignorer);
    return portee === 'cette_seance'
      ? seances[0]
      : { serieId: ancre.serieId, nombre: seances.length, seances };
  }

  async annuler(tenantId: string, id: string, dto: AnnulerSeanceDto) {
    await this.scope.seance(tenantId, id);
    const seance = await this.prisma.seance.findUniqueOrThrow({
      where: { id },
      select: { annuleLe: true },
    });
    if (seance.annuleLe) {
      throw new ConflictException(corps('Cette séance est déjà annulée'));
    }
    await this.prisma.seance.update({
      where: { id },
      data: { annuleLe: new Date(), motifAnnulation: dto.motif },
    });
    return presenterSeance(await this.lireUne(id));
  }

  async supprimer(tenantId: string, id: string) {
    await this.scope.seance(tenantId, id);
    await this.prisma.seance.delete({ where: { id } });
    return { id };
  }

  /** Audit : tous les conflits existants de la période, sans rien bloquer. */
  async auditer(tenantId: string, query: FenetreQueryDto) {
    const { debut, fin } = lireFenetre(query.du, query.au);
    const seances = await this.prisma.seance.findMany({
      where: {
        date: { gte: debut, lte: fin },
        annuleLe: null,
        matieres: { some: { matiere: matiereInTenant(tenantId) } },
      },
      select: SEANCE_SELECT,
      orderBy: [{ date: 'asc' }, { heureDebut: 'asc' }, { id: 'asc' }],
    });
    const conflits: {
      type: TypeConflit;
      date: string;
      seances: [
        ReturnType<typeof resumerSeance>,
        ReturnType<typeof resumerSeance>,
      ];
    }[] = [];
    const parJour = new Map<string, SeanceLue[]>();
    for (const seance of seances) {
      const jour = formaterDate(seance.date);
      parJour.set(jour, [...(parJour.get(jour) ?? []), seance]);
    }
    for (const [jour, duJour] of parJour) {
      for (let i = 0; i < duJour.length; i++) {
        for (let j = i + 1; j < duJour.length; j++) {
          for (const type of typesDeConflit(
            creneauDe(duJour[i]),
            creneauDe(duJour[j]),
          )) {
            conflits.push({
              type,
              date: jour,
              seances: [resumerSeance(duJour[i]), resumerSeance(duJour[j])],
            });
          }
        }
      }
    }
    return {
      du: query.du,
      au: query.au,
      nombre: conflits.length,
      conflits,
    };
  }

  // ---- création / contrôle ----

  private async planifier(
    tenantId: string,
    userId: string,
    dto: {
      heureDebut: number;
      heureFin: number;
      type: TypeSeance;
      matiereIds: string[];
      enseignantId?: string;
      salleId?: string;
      rythme?: Rythme;
      dryRun?: boolean;
    },
    dates: Date[],
    serieId: string | null,
  ) {
    this.verifierHeures(dto.heureDebut, dto.heureFin);
    const references = await this.verifierReferences(tenantId, dto);
    const niveauIds = references!.niveauIds;
    const candidats: Candidat[] = dates.map((date) => ({
      date: formaterDate(date),
      heureDebut: dto.heureDebut,
      heureFin: dto.heureFin,
      enseignantId: dto.enseignantId ?? null,
      salleId: dto.salleId ?? null,
      rythme: dto.rythme ?? Rythme.JOUR,
      niveauIds,
    }));

    if (dto.dryRun) {
      return this.apercu(
        candidats,
        await this.detecter(this.prisma, candidats, []),
      );
    }

    const ids = await this.serialisable(async (tx) => {
      const conflits = await this.detecter(tx, candidats, []);
      if (conflits.length) throw this.erreurConflits(conflits);
      const ids = dates.map(() => randomUUID());
      await tx.seance.createMany({
        data: dates.map((date, i) => ({
          id: ids[i],
          date,
          heureDebut: dto.heureDebut,
          heureFin: dto.heureFin,
          type: dto.type,
          enseignantId: dto.enseignantId ?? null,
          salleId: dto.salleId ?? null,
          rythme: dto.rythme ?? Rythme.JOUR,
          serieId,
          creePar: userId,
        })),
      });
      await tx.seanceMatiere.createMany({
        data: ids.flatMap((seanceId) =>
          dto.matiereIds.map((matiereId) => ({ seanceId, matiereId })),
        ),
      });
      return ids;
    });

    const seances = await this.lireIds(ids);
    return serieId ? { serieId, nombre: seances.length, seances } : seances[0];
  }

  private apercu(candidats: Candidat[], conflits: ConflitDetecte[]) {
    return {
      dryRun: true,
      nombre: candidats.length,
      seances: candidats.map((c) => ({
        date: c.date,
        jourSemaine: jourSemaine(new Date(`${c.date}T00:00:00.000Z`)),
        heureDebut: c.heureDebut,
        heureFin: c.heureFin,
      })),
      conflits,
    };
  }

  /**
   * Séances non annulées qui chevauchent un candidat avec le même enseignant, la même
   * salle ou un niveau commun au même rythme. `ignorer` : séances remplacées par le
   * candidat (modification) : jamais en conflit avec leur propre nouvelle version.
   */
  private async detecter(
    db: Db,
    candidats: Candidat[],
    ignorer: string[],
  ): Promise<ConflitDetecte[]> {
    if (candidats.length === 0) return [];
    const dates = [...new Set(candidats.map((c) => c.date))].map(
      (d) => new Date(`${d}T00:00:00.000Z`),
    );
    const enseignants = distincts(candidats.map((c) => c.enseignantId));
    const salles = distincts(candidats.map((c) => c.salleId));
    const niveaux = distincts(candidats.flatMap((c) => c.niveauIds));
    const existantes = await db.seance.findMany({
      where: {
        date: { in: dates },
        annuleLe: null,
        ...(ignorer.length && { id: { notIn: ignorer } }),
        OR: [
          ...(enseignants.length
            ? [{ enseignantId: { in: enseignants } }]
            : []),
          ...(salles.length ? [{ salleId: { in: salles } }] : []),
          { matieres: { some: { matiere: { niveauId: { in: niveaux } } } } },
        ],
      },
      select: SEANCE_SELECT,
    });
    const conflits: ConflitDetecte[] = [];
    for (const candidat of candidats) {
      for (const existante of existantes) {
        for (const type of typesDeConflit(candidat, creneauDe(existante))) {
          conflits.push({
            date: candidat.date,
            heureDebut: candidat.heureDebut,
            heureFin: candidat.heureFin,
            type,
            avec: resumerSeance(existante),
          });
        }
      }
    }
    return conflits.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.heureDebut - b.heureDebut ||
        a.avec.id.localeCompare(b.avec.id),
    );
  }

  /** 409 listant les séances en conflit (message lisible + détail structuré). */
  private erreurConflits(conflits: ConflitDetecte[]) {
    const lignes = conflits
      .slice(0, 3)
      .map(
        (c) =>
          `le ${c.date} ${formaterHeure(c.heureDebut)}–${formaterHeure(c.heureFin)} : ${LIBELLE_CONFLIT[c.type]} (${c.avec.type} ${c.avec.matieres.map((m) => m.code).join('/')} ${formaterHeure(c.avec.heureDebut)}–${formaterHeure(c.avec.heureFin)})`,
      );
    const reste = conflits.length - lignes.length;
    return new ConflictException({
      ...corps(
        `Conflit d’horaire : ${lignes.join(' ; ')}${reste > 0 ? ` ; … et ${reste} autre(s)` : ''}. Rien n’a été enregistré.`,
      ),
      conflits,
    });
  }

  private verifierHeures(heureDebut: number, heureFin: number) {
    if (heureDebut >= heureFin) {
      throw new BadRequestException(
        '« heureFin » doit être postérieure à « heureDebut »',
      );
    }
  }

  /**
   * 404 pour toute référence hors établissement. Les matières d'une séance doivent
   * être de la même année académique. Renvoie les niveaux des matières fournies.
   */
  private async verifierReferences(tenantId: string, ref: Reference) {
    let niveauIds: string[] | null = null;
    if (ref.matiereIds) {
      const matieres = await this.prisma.matiere.findMany({
        where: { id: { in: ref.matiereIds }, ...matiereInTenant(tenantId) },
        select: { id: true, niveauId: true, anneeAcademiqueId: true },
      });
      if (matieres.length !== new Set(ref.matiereIds).size) {
        throw new NotFoundException('Matière introuvable');
      }
      if (new Set(matieres.map((m) => m.anneeAcademiqueId)).size > 1) {
        throw new BadRequestException(
          'Les matières d’une séance doivent appartenir à la même année académique',
        );
      }
      niveauIds = distincts(matieres.map((m) => m.niveauId));
    }
    if (ref.enseignantId) {
      await this.scope.enseignant(tenantId, ref.enseignantId);
    }
    if (ref.salleId) await this.scope.salle(tenantId, ref.salleId);
    return niveauIds ? { niveauIds } : null;
  }

  private async serialisable<T>(
    travail: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let essai = 1; ; essai++) {
      try {
        return await this.prisma.$transaction(travail, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5000,
          timeout: 20000,
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034'
        ) {
          // Une autre opération sur le planning a gagné la course : on relit
          if (essai < ESSAIS_SERIALISABLE) continue;
          throw new ConflictException(
            corps(
              'Le planning est modifié en même temps par une autre opération : réessayez',
            ),
          );
        }
        throw error;
      }
    }
  }

  private lireUne(id: string) {
    return this.prisma.seance.findUniqueOrThrow({
      where: { id },
      select: SEANCE_SELECT,
    });
  }

  private async lireIds(ids: string[]) {
    const seances = await this.prisma.seance.findMany({
      where: { id: { in: ids } },
      select: SEANCE_SELECT,
      orderBy: [{ date: 'asc' }, { heureDebut: 'asc' }, { id: 'asc' }],
    });
    return seances.map(presenterSeance);
  }
}

const corps = (message: string) => ({
  statusCode: 409,
  error: 'Conflict',
  message,
});

const distincts = <T>(valeurs: (T | null)[]): T[] => [
  ...new Set(valeurs.filter((v): v is T => v !== null)),
];
