import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { DocumentCandidature, Role, StatutCandidature } from '@prisma/client';
import { randomUUID } from 'crypto';
import { createReadStream, existsSync } from 'fs';
import { mkdir, rm, writeFile } from 'fs/promises';
import { basename, dirname, extname, join, resolve } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { UploadDocumentDto, ValidateDocumentDto } from './dto/document.dto';

export const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;

// Extension autorisée → type MIME et signature binaire attendue en début de fichier
const FORMATS: Record<string, { mime: string; signature: number[] }> = {
  '.pdf': { mime: 'application/pdf', signature: [0x25, 0x50, 0x44, 0x46] },
  '.jpg': { mime: 'image/jpeg', signature: [0xff, 0xd8, 0xff] },
  '.jpeg': { mime: 'image/jpeg', signature: [0xff, 0xd8, 0xff] },
  '.png': { mime: 'image/png', signature: [0x89, 0x50, 0x4e, 0x47] },
};

// Plus aucun dépôt une fois la décision prise
const STATUTS_CLOS: StatutCandidature[] = [
  StatutCandidature.ACCEPTE,
  StatutCandidature.REJETE,
];

export type Requester = { id: string; tenantId: string; role: Role };

const isStaff = (user?: Requester) =>
  user?.role === Role.ADMIN || user?.role === Role.SCOLARITE;

@Injectable()
export class CandidatureDocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Racine de stockage, lue à chaque appel pour rester configurable (UPLOAD_DIR). */
  private root() {
    return resolve(process.env.UPLOAD_DIR || 'uploads');
  }

  /** Chemin disque d'un document : jamais dérivé d'une valeur fournie par le client. */
  private storagePath(document: DocumentCandidature) {
    return join(
      this.root(),
      'candidatures',
      document.candidatureId,
      document.id + extname(document.nomFichier).toLowerCase(),
    );
  }

  async upload(
    candidatureId: string,
    dto: UploadDocumentDto,
    file: Express.Multer.File | undefined,
    user?: Requester,
  ) {
    if (!file) {
      throw new BadRequestException('Fichier manquant (champ « fichier »)');
    }
    const extension = extname(file.originalname).toLowerCase();
    const format = FORMATS[extension];
    const signatureOk = format?.signature.every(
      (byte, index) => file.buffer[index] === byte,
    );
    if (!format || !signatureOk) {
      throw new BadRequestException(
        'Format non accepté : PDF, JPG ou PNG uniquement',
      );
    }

    const candidature = await this.findForUpload(candidatureId, dto, user);
    if (STATUTS_CLOS.includes(candidature.statut)) {
      throw new ConflictException(
        `Candidature au statut ${candidature.statut} : dépôt de document impossible`,
      );
    }

    const id = randomUUID();
    const nomFichier = basename(file.originalname)
      .replace(/[\u0000-\u001f]/g, '')
      .slice(0, 255);
    const document = {
      id,
      candidatureId,
      typeDocument: dto.typeDocument,
      nomFichier,
      urlFichier: `/candidatures/${candidatureId}/documents/${id}/fichier`,
    };
    const path = this.storagePath(document as DocumentCandidature);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, file.buffer);
    try {
      return await this.prisma.documentCandidature.create({ data: document });
    } catch (error) {
      await rm(path, { force: true });
      throw error;
    }
  }

  async list(candidatureId: string, user: Requester) {
    const candidature = await this.prisma.candidature.findFirst({
      where: { id: candidatureId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!candidature) throw new NotFoundException('Candidature introuvable');
    return this.prisma.documentCandidature.findMany({
      where: { candidatureId },
      orderBy: { nomFichier: 'asc' },
    });
  }

  async validate(
    candidatureId: string,
    documentId: string,
    dto: ValidateDocumentDto,
    user: Requester,
  ) {
    await this.findDocument(candidatureId, documentId, user);
    return this.prisma.documentCandidature.update({
      where: { id: documentId },
      data: { valide: dto.valide, commentaire: dto.commentaire ?? null },
    });
  }

  async remove(candidatureId: string, documentId: string, user: Requester) {
    const document = await this.findDocument(candidatureId, documentId, user);
    await this.prisma.documentCandidature.delete({ where: { id: documentId } });
    await rm(this.storagePath(document), { force: true });
    return document;
  }

  async download(candidatureId: string, documentId: string, user: Requester) {
    const document = await this.findDocument(candidatureId, documentId, user);
    const path = this.storagePath(document);
    if (!existsSync(path)) {
      throw new NotFoundException('Fichier introuvable sur le serveur');
    }
    const format = FORMATS[extname(document.nomFichier).toLowerCase()];
    return new StreamableFile(createReadStream(path), {
      type: format?.mime ?? 'application/octet-stream',
      disposition: `inline; filename*=UTF-8''${encodeURIComponent(document.nomFichier)}`,
    });
  }

  /**
   * Personnel : candidature de son tenant. Candidat sans compte : numéro de
   * dossier + e-mail doivent correspondre (même message d'erreur dans tous
   * les cas, pour ne rien révéler). Autres rôles : refus.
   */
  private async findForUpload(
    candidatureId: string,
    dto: UploadDocumentDto,
    user?: Requester,
  ) {
    if (isStaff(user)) {
      const candidature = await this.prisma.candidature.findFirst({
        where: { id: candidatureId, tenantId: user.tenantId },
      });
      if (!candidature) throw new NotFoundException('Candidature introuvable');
      return candidature;
    }
    if (user) {
      throw new ForbiddenException(
        'Dépôt réservé au candidat ou au personnel ADMIN/SCOLARITE',
      );
    }
    const candidature =
      dto.numeroDossier && dto.email
        ? await this.prisma.candidature.findFirst({
            where: {
              id: candidatureId,
              numeroDossier: dto.numeroDossier,
              email: { equals: dto.email, mode: 'insensitive' },
            },
          })
        : null;
    if (!candidature) {
      throw new ForbiddenException(
        'Numéro de dossier ou e-mail incorrect pour cette candidature',
      );
    }
    return candidature;
  }

  private async findDocument(
    candidatureId: string,
    documentId: string,
    user: Requester,
  ) {
    const document = await this.prisma.documentCandidature.findFirst({
      where: {
        id: documentId,
        candidatureId,
        candidature: { tenantId: user.tenantId },
      },
    });
    if (!document) throw new NotFoundException('Document introuvable');
    return document;
  }
}
