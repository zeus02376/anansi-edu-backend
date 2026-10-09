import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateEtudiantDto {
  @IsUUID()
  candidatureId: string;
  @IsString()
  @MinLength(8)
  motDePasse: string;
  @IsOptional()
  @IsString()
  photoUrl?: string;
}
