import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { map } from 'rxjs';

/**
 * Prisma sérialise les Decimal en chaîne ("25000"). Les montants sont en FCFA
 * (sans sous-unité) : on les renvoie en nombre. null reste null.
 */
export function decimalsToNumbers(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Prisma.Decimal.isDecimal(value)) return value.toNumber();
  if (Array.isArray(value)) return value.map(decimalsToNumbers);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value; // Date, Buffer…
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, decimalsToNumbers(item)]),
  );
}

@Injectable()
export class DecimalToNumberInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(map(decimalsToNumbers));
  }
}
