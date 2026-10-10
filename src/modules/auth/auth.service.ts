import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const publicUserSelect = {
  id: true,
  tenantId: true,
  nom: true,
  prenom: true,
  email: true,
  role: true,
  statut: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    if (dto.role && dto.role !== Role.ADMIN && dto.role !== Role.ETUDIANT) {
      throw new ForbiddenException(
        'Le rôle demandé ne peut pas être attribué lors de l’inscription publique',
      );
    }

    const passwordHash = await bcrypt.hash(dto.motDePasse, 12);
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const tenant = await tx.tenant.findUnique({
            where: { id: dto.tenantId },
            select: { id: true },
          });
          if (!tenant) {
            throw new UnauthorizedException('Établissement introuvable');
          }

          let role: Role = Role.ETUDIANT;
          if (dto.role === Role.ADMIN) {
            const existingUser = await tx.user.findFirst({
              select: { id: true },
            });
            if (existingUser) {
              throw new ForbiddenException(
                'Le compte ADMIN initial a déjà été créé',
              );
            }
            role = Role.ADMIN;
          }

          return tx.user.create({
            data: {
              tenantId: dto.tenantId,
              nom: dto.nom,
              prenom: dto.prenom,
              email: dto.email,
              telephone: dto.telephone,
              motDePasseHash: passwordHash,
              role,
            },
            select: publicUserSelect,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('Cette adresse e-mail est déjà utilisée');
        }
        if (error.code === 'P2034') {
          throw new ConflictException(
            'Un compte a déjà été créé pendant le bootstrap initial',
          );
        }
      }
      throw error;
    }
  }

  async createStaff(tenantId: string, dto: CreateStaffDto) {
    const passwordHash = await bcrypt.hash(dto.motDePasse, 12);
    try {
      return await this.prisma.user.create({
        data: {
          tenantId,
          nom: dto.nom,
          prenom: dto.prenom,
          email: dto.email,
          telephone: dto.telephone,
          motDePasseHash: passwordHash,
          role: dto.role,
        },
        select: publicUserSelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Cette adresse e-mail est déjà utilisée');
      }
      throw error;
    }
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (
      !user ||
      user.statut !== 'ACTIF' ||
      !(await bcrypt.compare(dto.motDePasse, user.motDePasseHash))
    ) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
    });
    return {
      access_token: accessToken,
      user: {
        id: user.id,
        tenantId: user.tenantId,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        role: user.role,
      },
    };
  }
}
