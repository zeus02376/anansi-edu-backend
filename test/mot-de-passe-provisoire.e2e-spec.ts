import { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as request from 'supertest';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import {
  cleanupTenant,
  createE2eApp,
  createTenant,
  createUser,
  describeWithTestDatabase,
  login,
  uniqueSuffix,
} from './e2e-helpers';

describeWithTestDatabase('Garde du mot de passe provisoire (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let close: () => Promise<void>;
  let tenantId: string;
  const suffix = uniqueSuffix();
  const PROVISOIRE = 'Provisoire123';

  const http = () => request(app.getHttpServer());
  const withToken = (
    method: 'get' | 'post' | 'patch',
    url: string,
    token: string,
  ) => http()[method](url).set('Authorization', `Bearer ${token}`);

  /** Compte dont le mot de passe provisoire est actif, déjà connecté. */
  async function compteProvisoire(role: Role, key: string) {
    const email = `${key}-${suffix}@example.test`;
    const user = await createUser(prisma, tenantId, email, PROVISOIRE, role);
    await prisma.user.update({
      where: { id: user.id },
      data: { doitChangerMotDePasse: true },
    });
    return { email, id: user.id, token: await login(app, email, PROVISOIRE) };
  }

  beforeAll(async () => {
    ({ app, prisma, close } = await createE2eApp());
    tenantId = (await createTenant(prisma, suffix)).id;
  });

  afterAll(async () => {
    try {
      if (prisma && tenantId) await cleanupTenant(prisma, tenantId);
    } finally {
      if (close) await close();
    }
  });

  it('la connexion reste possible et signale le mot de passe provisoire', async () => {
    const email = `connexion-${suffix}@example.test`;
    const user = await createUser(
      prisma,
      tenantId,
      email,
      PROVISOIRE,
      Role.SCOLARITE,
    );
    await prisma.user.update({
      where: { id: user.id },
      data: { doitChangerMotDePasse: true },
    });
    const { body } = await http()
      .post('/auth/login')
      .send({ email, motDePasse: PROVISOIRE })
      .expect(201);
    expect(body.user.doitChangerMotDePasse).toBe(true);
  });

  it('bloque (403 explicite, pas 401) toute route authentifiée', async () => {
    for (const role of [
      Role.ADMIN,
      Role.SCOLARITE,
      Role.ENSEIGNANT,
      Role.ETUDIANT,
    ]) {
      const { token } = await compteProvisoire(role, `bloque-${role}`);
      for (const url of [
        '/candidatures',
        '/etudiants',
        '/annees-academiques',
        '/inscriptions',
        '/tenants/me',
      ]) {
        const response = await withToken('get', url, token).expect(403);
        expect(response.body.message).toContain('provisoire');
      }
    }
  });

  it('bloque aussi les routes à JWT facultatif quand un jeton est présenté', async () => {
    const { token } = await compteProvisoire(Role.SCOLARITE, 'optionnel');
    const response = await withToken(
      'post',
      '/candidatures/00000000-0000-4000-8000-000000000000/documents',
      token,
    ).expect(403);
    expect(response.body.message).toContain('provisoire');
  });

  it('laisse passer les routes publiques, même avec le jeton', async () => {
    const { token } = await compteProvisoire(Role.SCOLARITE, 'public');
    await withToken('get', '/filieres', token).expect(200);
    await http().get('/annees-academiques/ouvertes').expect(200);
    await http().get('/filieres').expect(200);
  });

  it('reste en 401 sans jeton ou avec un jeton invalide', async () => {
    await http().get('/candidatures').expect(401);
    await withToken('get', '/candidatures', 'jeton-invalide').expect(401);
  });

  it('autorise le changement de mot de passe, puis débloque le compte avec le même jeton', async () => {
    const { token, email } = await compteProvisoire(Role.SCOLARITE, 'change');
    await withToken('get', '/candidatures', token).expect(403);

    // Une erreur de saisie reste une erreur 400, pas un 403
    await withToken('patch', '/auth/change-password', token)
      .send({
        motDePasseActuel: 'mauvais-mot-de-passe',
        nouveauMotDePasse: 'Definitif123',
      })
      .expect(400);

    await withToken('patch', '/auth/change-password', token)
      .send({ motDePasseActuel: PROVISOIRE, nouveauMotDePasse: 'Definitif123' })
      .expect(200);

    await withToken('get', '/candidatures', token).expect(200);
    const { body } = await http()
      .post('/auth/login')
      .send({ email, motDePasse: 'Definitif123' })
      .expect(201);
    expect(body.user.doitChangerMotDePasse).toBe(false);
  });

  it('un étudiant au mot de passe provisoire peut le changer', async () => {
    const { token } = await compteProvisoire(Role.ETUDIANT, 'etudiant');
    await withToken('patch', '/auth/change-password', token)
      .send({ motDePasseActuel: PROVISOIRE, nouveauMotDePasse: 'Definitif123' })
      .expect(200);
  });

  it('ne touche pas aux comptes sans mot de passe provisoire', async () => {
    const email = `normal-${suffix}@example.test`;
    await createUser(prisma, tenantId, email, 'Password123', Role.SCOLARITE);
    const token = await login(app, email, 'Password123');
    await withToken('get', '/candidatures', token).expect(200);
  });
});
