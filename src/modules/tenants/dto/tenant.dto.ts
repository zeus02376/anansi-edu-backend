import { IsString, Length } from 'class-validator';

export class TenantDto {
  @IsString()
  nom: string;

  @IsString()
  @Length(2, 80)
  slug: string;

  @IsString()
  pays: string;

  @IsString()
  ville: string;
}
