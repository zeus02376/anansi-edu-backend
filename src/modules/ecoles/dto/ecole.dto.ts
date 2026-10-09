import { IsOptional, IsString, IsUUID } from 'class-validator';

export class EcoleDto {
  @IsUUID()
  tenantId: string;
  @IsString()
  nom: string;
  @IsString()
  code: string;
  @IsOptional()
  @IsString()
  description?: string;
}
