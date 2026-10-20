import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { ALLOW_TEMPORARY_PASSWORD_KEY } from '../decorators/allow-temporary-password.decorator';

/**
 * Authentification JWT. Tant que le mot de passe est provisoire
 * (doitChangerMotDePasse), toute route authentifiée répond 403 — et non 401,
 * qui déconnecterait le frontend — sauf celles marquées
 * @AllowTemporaryPassword() (le changement de mot de passe).
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  handleRequest<TUser = { doitChangerMotDePasse?: boolean }>(
    err: unknown,
    user: TUser,
    info: unknown,
    context: ExecutionContext,
    status?: unknown,
  ): TUser {
    const authenticated = super.handleRequest(
      err,
      user,
      info,
      context,
      status,
    ) as TUser & { doitChangerMotDePasse?: boolean };
    const allowed = this.reflector.getAllAndOverride<boolean>(
      ALLOW_TEMPORARY_PASSWORD_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (authenticated.doitChangerMotDePasse && !allowed) {
      throw new ForbiddenException(
        'Mot de passe provisoire à changer avant de continuer (PATCH /auth/change-password)',
      );
    }
    return authenticated;
  }
}
