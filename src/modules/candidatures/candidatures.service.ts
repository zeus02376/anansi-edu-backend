import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  StatutCandidature,
  StatutNotificationEmail,
  TypeNotificationCandidature,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { CandidatureEmailSender } from './candidature-email.sender';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCandidatureDto,
  UpdateCandidatureStatusDto,
} from './dto/candidature.dto';

const { SOUMIS, INCOMPLET, EN_EXAMEN, ACCEPTE, REJETE } = StatutCandidature;
const { EN_ATTENTE, EN_COURS, ENVOYEE, ECHEC } = StatutNotificationEmail;

/**
 * Durée maximale pendant laquelle une requête attend l'envoi du courriel
 * (CANDIDATURE_EMAIL_WAIT_MS). Au-delà, la réponse part avec la notification
 * « EN_COURS » et l'envoi se termine en arrière-plan.
 */
const DEFAULT_EMAIL_WAIT_MS = 3000;

const STATUT_LABELS: Record<StatutCandidature, string> = {
  [SOUMIS]: 'reçue',
  [INCOMPLET]: 'incomplète',
  [EN_EXAMEN]: 'en cours d’examen',
  [ACCEPTE]: 'acceptée',
  [REJETE]: 'rejetée',
};

/**
 * Transitions autorisées. ACCEPTE devient définitif dès qu'un compte
 * Étudiant existe ; quitter ou atteindre REJETE exige un commentaire.
 */
export const TRANSITIONS: Record<StatutCandidature, StatutCandidature[]> = {
  [SOUMIS]: [EN_EXAMEN, INCOMPLET, REJETE],
  [INCOMPLET]: [EN_EXAMEN, REJETE],
  [EN_EXAMEN]: [ACCEPTE, REJETE, INCOMPLET],
  [ACCEPTE]: [EN_EXAMEN, REJETE],
  [REJETE]: [EN_EXAMEN],
};

@Injectable()
export class CandidaturesService {
  private readonly logger = new Logger(CandidaturesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailSender: CandidatureEmailSender,
  ) {}

  async create(data: CreateCandidatureDto) {
    let result: Awaited<ReturnType<CandidaturesService['createInTransaction']>>;
    try {
      result = await this.createInTransaction(data);
    } catch (error) {
      // Deux dépôts simultanés : la transaction sérialisable en rejette un
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        throw new ConflictException(
          'Dépôt concurrent détecté : vérifiez votre candidature avant de réessayer',
        );
      }
      throw error;
    }
    const notification = await this.deliverWithinBudget(result.notificationId);
    return {
      ...result.candidature,
      notification: this.notificationSummary(notification),
    };
  }

  private createInTransaction(data: CreateCandidatureDto) {
    const year = new Date().getFullYear();
    const numeroDossier = `CAND-${year}-${randomUUID().slice(0, 8).toUpperCase()}`;
    return this.prisma.$transaction(
      async (tx) => {
        const [tenant, filiere, anneeAcademique] = await Promise.all([
          tx.tenant.findUnique({
            where: { id: data.tenantId },
            select: { id: true },
          }),
          tx.filiere.findFirst({
            where: { id: data.filiereId, ecole: { tenantId: data.tenantId } },
            select: { id: true },
          }),
          tx.anneeAcademique.findFirst({
            where: { id: data.anneeAcademiqueId, tenantId: data.tenantId },
            select: { id: true },
          }),
        ]);
        if (!tenant) {
          throw new BadRequestException('Établissement introuvable');
        }
        if (!filiere) {
          throw new BadRequestException(
            'Filière introuvable pour cet établissement',
          );
        }
        if (!anneeAcademique) {
          throw new BadRequestException(
            'Année académique introuvable pour cet établissement',
          );
        }
        // Une seule candidature active (non rejetée) par e-mail, filière et année.
        // Le message ne révèle pas le numéro de dossier existant.
        const doublon = await tx.candidature.findFirst({
          where: {
            email: { equals: data.email, mode: 'insensitive' },
            filiereId: data.filiereId,
            anneeAcademiqueId: data.anneeAcademiqueId,
            statut: { not: REJETE },
          },
          select: { id: true },
        });
        if (doublon) {
          throw new ConflictException(
            'Une candidature est déjà en cours pour cet e-mail, cette filière et cette année académique',
          );
        }
        const candidature = await tx.candidature.create({
          data: {
            ...data,
            dateNaissance: new Date(data.dateNaissance),
            numeroDossier,
          },
        });
        const contenu = this.emailContent(
          candidature.prenom,
          candidature.numeroDossier,
          SOUMIS,
        );
        const notification = await tx.notificationCandidatureEmail.create({
          data: {
            candidatureId: candidature.id,
            type: TypeNotificationCandidature.RECEPTION,
            destinataire: candidature.email,
            ...contenu,
          },
        });
        return { candidature, notificationId: notification.id };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async findAll(tenantId: string) {
    const candidatures = await this.prisma.candidature.findMany({
      where: { tenantId },
      include: {
        filiere: true,
        anneeAcademique: true,
        historiques: true,
        notifications: {
          select: {
            id: true,
            statut: true,
            createdAt: true,
            envoyeLe: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return candidatures.map(({ notifications, ...candidature }) => ({
      ...candidature,
      notifications: notifications.map((notification) =>
        this.notificationSummary(notification),
      ),
    }));
  }

  async findOne(id: string, tenantId: string) {
    const candidature = await this.prisma.candidature.findFirstOrThrow({
      where: { id, tenantId },
      include: {
        documents: true,
        historiques: true,
        notifications: {
          select: {
            id: true,
            statut: true,
            createdAt: true,
            envoyeLe: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    const { notifications, ...details } = candidature;
    return {
      ...details,
      notifications: notifications.map((notification) =>
        this.notificationSummary(notification),
      ),
    };
  }

  /**
   * Suivi public par numéro de dossier exact : sous-ensemble sûr uniquement
   * (ni e-mail, ni téléphone, ni documents, ni historique). L'identifiant
   * (UUID non devinable) permet au candidat de déposer ses documents : l'upload
   * exige toujours le numéro de dossier ET l'e-mail.
   */
  async suivi(numeroDossier: string) {
    const candidature = await this.prisma.candidature.findUnique({
      where: { numeroDossier },
      select: {
        id: true,
        numeroDossier: true,
        statut: true,
        nom: true,
        prenom: true,
        createdAt: true,
        filiere: {
          select: { nom: true, code: true, ecole: { select: { nom: true } } },
        },
        anneeAcademique: { select: { libelle: true } },
      },
    });
    if (!candidature) {
      throw new NotFoundException(
        'Aucune candidature ne correspond à ce numéro de dossier',
      );
    }
    const { createdAt, filiere, anneeAcademique, ...identite } = candidature;
    return {
      ...identite,
      dateDepot: createdAt,
      filiere: { nom: filiere.nom, code: filiere.code },
      ecole: filiere.ecole.nom,
      anneeAcademique: anneeAcademique.libelle,
    };
  }

  async updateStatus(
    id: string,
    user: { id: string; tenantId: string },
    data: UpdateCandidatureStatusDto,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const candidature = await tx.candidature.findFirst({
        where: { id, tenantId: user.tenantId },
        include: { etudiant: { select: { id: true } } },
      });
      if (!candidature) {
        throw new NotFoundException('Candidature introuvable');
      }

      const from = candidature.statut;
      const to = data.statut;
      if (from === to) {
        throw new BadRequestException(
          `La candidature est déjà au statut ${to}`,
        );
      }
      if (from === ACCEPTE && candidature.etudiant) {
        throw new ConflictException(
          'Un compte étudiant a été créé pour cette candidature : la décision ACCEPTE est définitive',
        );
      }
      if (!TRANSITIONS[from].includes(to)) {
        throw new BadRequestException(
          `Transition ${from} → ${to} non autorisée (possibles : ${TRANSITIONS[from].join(', ')})`,
        );
      }
      const commentaire = data.commentaire?.trim();
      if (to === REJETE && !commentaire) {
        throw new BadRequestException(
          'Un motif de refus (commentaire) est obligatoire pour rejeter une candidature',
        );
      }
      if (from === REJETE && !commentaire) {
        throw new BadRequestException(
          'Un commentaire est obligatoire pour rouvrir une candidature rejetée',
        );
      }

      const updated = await tx.candidature.update({
        where: { id },
        data: { statut: to },
      });
      await tx.historiqueCandidature.create({
        data: {
          candidatureId: id,
          userId: user.id,
          action: `STATUT_${to}`,
          commentaire: commentaire || null,
        },
      });
      const contenu = this.emailContent(
        candidature.prenom,
        candidature.numeroDossier,
        to,
      );
      const notification = await tx.notificationCandidatureEmail.create({
        data: {
          candidatureId: id,
          type: TypeNotificationCandidature.CHANGEMENT_STATUT,
          destinataire: candidature.email,
          ...contenu,
        },
      });
      return { updated, notificationId: notification.id };
    });
    const notification = await this.deliverWithinBudget(result.notificationId);
    return {
      ...result.updated,
      notification: this.notificationSummary(notification),
    };
  }

  async retryNotification(
    candidatureId: string,
    notificationId: string,
    tenantId: string,
  ) {
    const notification =
      await this.prisma.notificationCandidatureEmail.findFirst({
        where: { id: notificationId, candidatureId, candidature: { tenantId } },
      });
    if (!notification) {
      throw new NotFoundException('Notification introuvable');
    }
    if (notification.statut !== ECHEC) {
      throw new ConflictException(
        'Seules les notifications en échec peuvent être relancées',
      );
    }
    const reset = await this.prisma.notificationCandidatureEmail.updateMany({
      where: { id: notificationId, statut: ECHEC },
      data: { statut: EN_ATTENTE, derniereErreur: null },
    });
    if (!reset.count) {
      throw new ConflictException(
        'Cette notification est déjà en cours de traitement',
      );
    }
    const result = await this.deliverWithinBudget(notificationId);
    return this.notificationSummary(result);
  }

  async remove(id: string, tenantId: string) {
    const candidature = await this.prisma.candidature.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!candidature) {
      throw new NotFoundException('Candidature introuvable');
    }
    return this.prisma.candidature.delete({ where: { id } });
  }

  private emailContent(
    prenom: string,
    numeroDossier: string,
    statut: StatutCandidature,
  ) {
    const suiviUrl = process.env.FRONTEND_PUBLIC_URL?.trim().replace(
      /\/+$/,
      '',
    );
    const suivi = suiviUrl
      ? `${suiviUrl}/suivi`
      : 'la page de suivi de candidature de votre établissement';
    return {
      sujet:
        statut === SOUMIS
          ? `Candidature reçue — ${numeroDossier}`
          : `Mise à jour de votre candidature — ${numeroDossier}`,
      contenu: [
        `Bonjour ${prenom},`,
        '',
        statut === SOUMIS
          ? 'Nous avons bien reçu votre candidature.'
          : `Le statut de votre candidature est maintenant : ${STATUT_LABELS[statut]}.`,
        `Numéro de dossier : ${numeroDossier}`,
        `Suivi du dossier : ${suivi}.`,
        statut === INCOMPLET
          ? 'Veuillez consulter le suivi de votre dossier pour transmettre les pièces demandées.'
          : '',
        '',
        'Ceci est un message automatique. Merci de ne pas répondre à cet e-mail.',
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }

  private notificationSummary(notification: {
    id: string;
    statut: StatutNotificationEmail;
    createdAt: Date;
    envoyeLe: Date | null;
  }) {
    return {
      id: notification.id,
      statut: notification.statut,
      createdAt: notification.createdAt,
      envoyeLe: notification.envoyeLe,
      peutRelancer: notification.statut === ECHEC,
    };
  }

  /**
   * Lance l'envoi et n'attend son résultat que pendant un temps borné : un
   * échec immédiat (ex. SMTP non configuré) est renvoyé tel quel, un SMTP
   * lent ne retient plus la requête (la notification se termine seule).
   */
  private async deliverWithinBudget(id: string) {
    const waitMs = Number(process.env.CANDIDATURE_EMAIL_WAIT_MS);
    const budget =
      Number.isFinite(waitMs) && waitMs >= 0 ? waitMs : DEFAULT_EMAIL_WAIT_MS;
    const delivery = this.deliverNotification(id).catch((error: unknown) => {
      this.logger.error(
        `Notification ${id} : erreur inattendue (${String(error)})`,
      );
      return null;
    });
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), budget);
    });
    const settled = await Promise.race([delivery, timeout]);
    clearTimeout(timer);
    return (
      settled ??
      this.prisma.notificationCandidatureEmail.findUniqueOrThrow({
        where: { id },
      })
    );
  }

  private async deliverNotification(id: string) {
    const claim = await this.prisma.notificationCandidatureEmail.updateMany({
      where: { id, statut: EN_ATTENTE },
      data: { statut: EN_COURS, tentatives: { increment: 1 } },
    });
    if (!claim.count) {
      return this.prisma.notificationCandidatureEmail.findUniqueOrThrow({
        where: { id },
      });
    }

    const notification =
      await this.prisma.notificationCandidatureEmail.findUniqueOrThrow({
        where: { id },
      });
    try {
      await this.emailSender.send(notification);
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }
      this.logger.error(
        `Échec de livraison de la notification ${id} : ${error.message}`,
      );
      return this.prisma.notificationCandidatureEmail.update({
        where: { id },
        data: { statut: ECHEC, derniereErreur: error.message.slice(0, 2000) },
      });
    }
    return this.prisma.notificationCandidatureEmail.update({
      where: { id },
      data: {
        statut: ENVOYEE,
        envoyeLe: new Date(),
        derniereErreur: null,
      },
    });
  }
}
