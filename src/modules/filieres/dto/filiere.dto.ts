import { Cycle, Langue, Regime } from '@prisma/client';
import { IsEnum, IsInt, IsString, IsUUID, Min } from 'class-validator';

export class FiliereDto {
  @IsUUID()
  ecoleId: string;
  @IsString()
  nom: string;
  @IsString()
  code: string;
  @IsEnum(Cycle)
  cycle: Cycle;
  @IsEnum(Regime)
  regime: Regime;
  @IsEnum(Langue)
  langue: Langue;
  @IsInt()
  @Min(1)
  dureeAnnees: number;
  @IsString()
  tutelle: string;
}
