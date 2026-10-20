import { TypeDocument } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Champs texte du formulaire multipart d'upload (le fichier est à part). */
export class UploadDocumentDto {
  @ApiProperty({ enum: TypeDocument })
  @IsEnum(TypeDocument)
  typeDocument: TypeDocument;

  @ApiPropertyOptional({
    example: 'CAND-2026-1A2B3C4D',
    description: 'Candidat sans compte : numéro de dossier de la candidature',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  numeroDossier?: string;

  @ApiPropertyOptional({
    example: 'amina@example.cm',
    description: 'Candidat sans compte : e-mail saisi lors de la candidature',
  })
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class ValidateDocumentDto {
  @ApiProperty({ description: 'true : validé ; false : invalidé' })
  @IsBoolean()
  valide: boolean;

  @ApiPropertyOptional({ example: 'Document illisible, merci de le renvoyer' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  commentaire?: string;
}
