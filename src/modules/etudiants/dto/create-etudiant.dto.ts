import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateEtudiantDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  candidatureId: string;
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  tenantId: string;
}
