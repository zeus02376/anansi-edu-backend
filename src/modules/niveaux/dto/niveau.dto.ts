import { IsInt, IsString, IsUUID, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class NiveauDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  filiereId: string;
  @ApiProperty({ example: 'Licence 1' })
  @IsString()
  nom: string;
  @ApiProperty({ example: 'L1' })
  @IsString()
  code: string;
  @ApiProperty({ minimum: 1, example: 1 })
  @IsInt()
  @Min(1)
  ordre: number;
}
