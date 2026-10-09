import { Cycle, Langue, Regime } from '@prisma/client';
import { IsEnum, IsInt, IsString, IsUUID, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FiliereDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  ecoleId: string;
  @ApiProperty({ example: 'Informatique' })
  @IsString()
  nom: string;
  @ApiProperty({ example: 'INFO' })
  @IsString()
  code: string;
  @ApiProperty({ enum: Cycle })
  @IsEnum(Cycle)
  cycle: Cycle;
  @ApiProperty({ enum: Regime })
  @IsEnum(Regime)
  regime: Regime;
  @ApiProperty({ enum: Langue })
  @IsEnum(Langue)
  langue: Langue;
  @ApiProperty({ minimum: 1, example: 3 })
  @IsInt()
  @Min(1)
  dureeAnnees: number;
  @ApiProperty({ example: 'MINESUP' })
  @IsString()
  tutelle: string;
}
