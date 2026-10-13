const BASE_URL = 'http://localhost:3000';
const CANDIDATURE_ID = 'ab6e8bac-1d0a-4276-a94e-c6fd723b2e63';
const TENANT_ID = '85949015-d9af-451c-8a72-b220c080f62a';
const NIVEAU_ID = '7012b098-18aa-4162-b0a3-e1fdafb1781a';
const ANNEE_ACADEMIQUE_ID = 'ff720d7f-3199-47c5-af20-c6b2afdb235f';

async function request(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return { status: response.status, ok: response.ok, data };
}

function formatData(data) {
  return typeof data === 'string' ? data : JSON.stringify(data);
}

function reportStep(number, title, result, details) {
  const icon = result === 'success' ? '✅' : result === 'failure' ? '❌' : '⏭️';
  const status = Number.isInteger(details.status) ? `HTTP ${details.status}` : 'HTTP —';
  console.log(`${icon} Étape ${number}/5 — ${title} (${status})`);
  if (details.message) {
    console.log(`   ${details.message}`);
  }
  if (details.data !== undefined) {
    console.log(`   Données : ${formatData(details.data)}`);
  }
}

async function main() {
  const results = [];
  const email = process.env.ANANSI_ADMIN_EMAIL;
  const password = process.env.ANANSI_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'Définissez ANANSI_ADMIN_EMAIL et ANANSI_ADMIN_PASSWORD avant de lancer ce script.',
    );
  }

  let token;
  let loginResult;
  try {
    loginResult = await request('/auth/login', {
      method: 'POST',
      body: { email, motDePasse: password },
    });
    token = loginResult.data?.access_token;
    const success = loginResult.ok && Boolean(token);
    results.push(success);
    reportStep(1, 'LOGIN admin', success ? 'success' : 'failure', {
      status: loginResult.status,
      message: success ? 'Token JWT reçu.' : 'Connexion admin échouée.',
      data: success
        ? { user: loginResult.data.user, tokenReceived: true }
        : loginResult.data,
    });
  } catch (error) {
    results.push(false);
    reportStep(1, 'LOGIN admin', 'failure', { message: error.message });
  }

  let candidatureAccepted = false;
  if (token) {
    try {
      // Transitions imposées : une candidature SOUMIS doit passer EN_EXAMEN
      // avant ACCEPTE (sans effet si elle y est déjà ou plus loin)
      await request(`/candidatures/${CANDIDATURE_ID}/statut`, {
        method: 'PATCH',
        token,
        body: { statut: 'EN_EXAMEN' },
      });
      const result = await request(`/candidatures/${CANDIDATURE_ID}/statut`, {
        method: 'PATCH',
        token,
        body: {
          statut: 'ACCEPTE',
          commentaire: 'Dossier complet, candidat admis',
        },
      });
      candidatureAccepted = result.ok && result.data?.statut === 'ACCEPTE';
      results.push(candidatureAccepted);
      reportStep(
        2,
        'ACCEPTER la candidature',
        candidatureAccepted ? 'success' : 'failure',
        {
          status: result.status,
          message: candidatureAccepted
            ? `Statut confirmé : ${result.data.statut}.`
            : 'La réponse ne confirme pas le statut ACCEPTE.',
          data: result.data,
        },
      );
    } catch (error) {
      results.push(false);
      reportStep(2, 'ACCEPTER la candidature', 'failure', {
        message: error.message,
      });
    }
  } else {
    results.push(false);
    reportStep(2, 'ACCEPTER la candidature', 'skipped', {
      message: 'Ignorée : aucun token JWT.',
    });
  }

  let student;
  if (token && candidatureAccepted) {
    try {
      const result = await request('/etudiants', {
        method: 'POST',
        token,
        body: {
          candidatureId: CANDIDATURE_ID,
          tenantId: TENANT_ID,
        },
      });
      student = result.data;
      const success =
        result.ok &&
        Boolean(student?.id) &&
        /^IUC-2026-\d{5}$/.test(student?.matricule ?? '');
      results.push(success);
      reportStep(3, "CRÉER L'ÉTUDIANT", success ? 'success' : 'failure', {
        status: result.status,
        message: success
          ? `Étudiant créé, matricule ${student.matricule}.`
          : 'La création doit retourner un étudiant avec un matricule IUC-2026-XXXXX.',
        data: result.data,
      });
    } catch (error) {
      results.push(false);
      reportStep(3, "CRÉER L'ÉTUDIANT", 'failure', { message: error.message });
    }
  } else {
    results.push(false);
    reportStep(3, "CRÉER L'ÉTUDIANT", 'skipped', {
      message: 'Ignorée : le login ou l’acceptation de la candidature a échoué.',
    });
  }

  if (token && student?.id) {
    try {
      const result = await request('/inscriptions', {
        method: 'POST',
        token,
        body: {
          etudiantId: student.id,
          niveauId: NIVEAU_ID,
          anneeAcademiqueId: ANNEE_ACADEMIQUE_ID,
        },
      });
      const success = result.ok && Boolean(result.data?.id);
      results.push(success);
      reportStep(4, "INSCRIRE L'ÉTUDIANT", success ? 'success' : 'failure', {
        status: result.status,
        message: success
          ? `Inscription créée : ${result.data.id}.`
          : 'La création de l’inscription a échoué.',
        data: result.data,
      });
    } catch (error) {
      results.push(false);
      reportStep(4, "INSCRIRE L'ÉTUDIANT", 'failure', { message: error.message });
    }
  } else {
    results.push(false);
    reportStep(4, "INSCRIRE L'ÉTUDIANT", 'skipped', {
      message: 'Ignorée : aucun étudiant créé à l’étape précédente.',
    });
  }

  if (token && student?.id) {
    try {
      const result = await request(`/etudiants/${student.id}`, { token });
      const success = result.ok && result.data?.id === student.id;
      results.push(success);
      reportStep(5, "VÉRIFIER L'ÉTUDIANT", success ? 'success' : 'failure', {
        status: result.status,
        message: success
          ? `Étudiant vérifié : ${result.data.matricule}.`
          : 'La réponse ne contient pas l’étudiant créé.',
        data: result.data,
      });
    } catch (error) {
      results.push(false);
      reportStep(5, "VÉRIFIER L'ÉTUDIANT", 'failure', { message: error.message });
    }
  } else {
    results.push(false);
    reportStep(5, "VÉRIFIER L'ÉTUDIANT", 'skipped', {
      message: 'Ignorée : aucun étudiant créé à l’étape précédente.',
    });
  }

  const successes = results.filter(Boolean).length;
  console.log(`\nFlow complet : ${successes}/5 étapes réussies`);
  if (successes !== 5) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`❌ Erreur du script : ${error.message}`);
  process.exitCode = 1;
});
