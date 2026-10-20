import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TypeDocument } from '@prisma/client';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { StaffOnly } from '../../common/decorators/staff-only.decorator';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import {
  THROTTLE_PUBLIC,
  THROTTLE_SUIVI,
} from '../../common/throttle/public-throttle.module';
import {
  CandidatureDocumentsService,
  MAX_DOCUMENT_SIZE,
  Requester,
} from './candidature-documents.service';
import { UploadDocumentDto, ValidateDocumentDto } from './dto/document.dto';

type AuthRequest = { user?: Requester };
const uuid = new ParseUUIDPipe();

@Controller('candidatures/:id/documents')
@ApiTags('candidatures')
export class CandidatureDocumentsController {
  constructor(private readonly service: CandidatureDocumentsService) {}

  @Post()
  // JWT d'abord : le personnel authentifié échappe à la limite de débit
  @UseGuards(OptionalJwtAuthGuard, ThrottlerGuard)
  @SkipThrottle({ [THROTTLE_PUBLIC]: true, [THROTTLE_SUIVI]: true })
  // En mémoire : le fichier n'est écrit sur disque qu'après les contrôles d'accès
  @UseInterceptors(
    FileInterceptor('fichier', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_DOCUMENT_SIZE, files: 1 },
    }),
  )
  @ApiOperation({
    summary:
      'Déposer un document (candidat : numeroDossier + email ; ou JWT ADMIN/SCOLARITE)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['fichier', 'typeDocument'],
      properties: {
        fichier: {
          type: 'string',
          format: 'binary',
          description: 'PDF, JPG ou PNG, 10 Mo maximum',
        },
        typeDocument: { type: 'string', enum: Object.values(TypeDocument) },
        numeroDossier: { type: 'string' },
        email: { type: 'string', format: 'email' },
      },
    },
  })
  @ApiCreatedResponse({ description: 'Document enregistré' })
  @ApiBadRequestResponse({ description: 'Fichier manquant ou format refusé' })
  @ApiForbiddenResponse({ description: 'Numéro de dossier / e-mail incorrect' })
  @ApiConflictResponse({ description: 'Candidature déjà acceptée ou rejetée' })
  @ApiPayloadTooLargeResponse({ description: 'Fichier de plus de 10 Mo' })
  @ApiTooManyRequestsResponse({
    description:
      'Limite de débit atteinte (candidat : 20 envois / 10 min, THROTTLE_UPLOAD_LIMIT)',
  })
  upload(
    @Param('id', uuid) id: string,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() request: AuthRequest,
  ) {
    return this.service.upload(id, dto, file, request.user);
  }

  @Get()
  @StaffOnly()
  @ApiOperation({ summary: 'Lister les documents d’une candidature' })
  @ApiOkResponse({ description: 'Documents de la candidature' })
  @ApiNotFoundResponse({ description: 'Candidature introuvable' })
  list(@Param('id', uuid) id: string, @Req() request: AuthRequest) {
    return this.service.list(id, request.user);
  }

  @Get(':docId/fichier')
  @StaffOnly()
  @ApiOperation({ summary: 'Télécharger le fichier d’un document' })
  @ApiOkResponse({ description: 'Contenu du fichier' })
  @ApiNotFoundResponse({ description: 'Document introuvable' })
  download(
    @Param('id', uuid) id: string,
    @Param('docId', uuid) docId: string,
    @Req() request: AuthRequest,
  ) {
    return this.service.download(id, docId, request.user);
  }

  @Patch(':docId/valider')
  @StaffOnly()
  @ApiOperation({ summary: 'Valider ou invalider un document' })
  @ApiOkResponse({ description: 'Document mis à jour' })
  @ApiNotFoundResponse({ description: 'Document introuvable' })
  validate(
    @Param('id', uuid) id: string,
    @Param('docId', uuid) docId: string,
    @Body() dto: ValidateDocumentDto,
    @Req() request: AuthRequest,
  ) {
    return this.service.validate(id, docId, dto, request.user);
  }

  @Delete(':docId')
  @StaffOnly()
  @ApiOperation({ summary: 'Supprimer un document et son fichier' })
  @ApiOkResponse({ description: 'Document supprimé' })
  @ApiNotFoundResponse({ description: 'Document introuvable' })
  remove(
    @Param('id', uuid) id: string,
    @Param('docId', uuid) docId: string,
    @Req() request: AuthRequest,
  ) {
    return this.service.remove(id, docId, request.user);
  }
}
