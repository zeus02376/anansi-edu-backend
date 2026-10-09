import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TenantDto {
  @ApiProperty({ example: 'Institut Universitaire de la Côte' })
  @IsString()
  nom: string;

  @ApiProperty({ example: 'iuc', minLength: 2, maxLength: 80 })
  @IsString()
  @Length(2, 80)
  slug: string;

  @ApiProperty({ example: 'Cameroun' })
  @IsString()
  pays: string;

  @ApiProperty({ example: 'Douala' })
  @IsString()
  ville: string;
}
