import { ArgumentsHost, Catch, HttpStatus } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

/**
 * Traduit les erreurs Prisma connues en réponses HTTP explicites
 * au lieu d'un 500 générique.
 */
@Catch(
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientUnknownRequestError,
)
export class PrismaExceptionFilter extends BaseExceptionFilter {
  catch(
    exception:
      | Prisma.PrismaClientKnownRequestError
      | Prisma.PrismaClientUnknownRequestError,
    host: ArgumentsHost,
  ) {
    const mapped =
      exception instanceof Prisma.PrismaClientKnownRequestError
        ? this.map(exception, host.switchToHttp().getRequest())
        : this.mapUnknown(exception);
    if (!mapped) {
      return super.catch(exception, host);
    }

    const [statusCode, message] = mapped;
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(statusCode)
      .json({ statusCode, message, error: HttpStatus[statusCode] });
  }

  // Les contraintes FK en RESTRICT (code PostgreSQL 23001) ne sont pas
  // typées par Prisma et arrivent comme erreurs inconnues.
  private mapUnknown(
    exception: Prisma.PrismaClientUnknownRequestError,
  ): [number, string] | null {
    return exception.message.includes('23001')
      ? [
          HttpStatus.CONFLICT,
          'Suppression impossible : des données liées existent',
        ]
      : null;
  }

  private map(
    exception: Prisma.PrismaClientKnownRequestError,
    request: Request,
  ): [number, string] | null {
    switch (exception.code) {
      case 'P2025':
        return [HttpStatus.NOT_FOUND, 'Ressource introuvable'];
      case 'P2002': {
        const target = exception.meta?.target;
        const fields = Array.isArray(target) ? target.join(', ') : target;
        return [
          HttpStatus.CONFLICT,
          fields
            ? `Valeur déjà utilisée pour : ${String(fields)}`
            : 'Cette valeur est déjà utilisée',
        ];
      }
      case 'P2003':
        return request.method === 'DELETE'
          ? [
              HttpStatus.CONFLICT,
              'Suppression impossible : des données liées existent',
            ]
          : [
              HttpStatus.BAD_REQUEST,
              'Une ressource référencée est introuvable',
            ];
      default:
        return null;
    }
  }
}
