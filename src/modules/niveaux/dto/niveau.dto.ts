import { IsInt, IsString, IsUUID, Min } from 'class-validator';

export class NiveauDto {
  @IsUUID()
  filiereId: string;
  @IsString()
  nom: string;
  @IsString()
  code: string;
  @IsInt()
  @Min(1)
  ordre: number;
}
