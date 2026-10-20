import { SetMetadata } from '@nestjs/common';

export const ALLOW_TEMPORARY_PASSWORD_KEY = 'allowTemporaryPassword';

/**
 * Route accessible même quand le mot de passe est provisoire
 * (doitChangerMotDePasse) : uniquement le changement de mot de passe.
 */
export const AllowTemporaryPassword = () =>
  SetMetadata(ALLOW_TEMPORARY_PASSWORD_KEY, true);
