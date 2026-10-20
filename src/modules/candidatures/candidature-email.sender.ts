import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export type CandidatureEmail = {
  destinataire: string;
  sujet: string;
  contenu: string;
};

@Injectable()
export class CandidatureEmailSender {
  async send(message: CandidatureEmail) {
    const host = process.env.SMTP_HOST?.trim();
    const portValue = process.env.SMTP_PORT?.trim();
    const from = process.env.SMTP_FROM?.trim();
    const missing = [
      !host && 'SMTP_HOST',
      !portValue && 'SMTP_PORT',
      !from && 'SMTP_FROM',
    ].filter(Boolean);
    if (missing.length) {
      throw new Error(`Configuration SMTP manquante : ${missing.join(', ')}`);
    }

    const port = Number(portValue);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('SMTP_PORT doit être un port valide entre 1 et 65535');
    }

    const secureValue = process.env.SMTP_SECURE?.trim().toLowerCase();
    if (secureValue && !['true', 'false'].includes(secureValue)) {
      throw new Error('SMTP_SECURE doit être true ou false');
    }

    const user = process.env.SMTP_USER?.trim();
    const password = process.env.SMTP_PASSWORD;
    if (Boolean(user) !== Boolean(password)) {
      throw new Error(
        'SMTP_USER et SMTP_PASSWORD doivent être renseignés ensemble',
      );
    }

    const transport = nodemailer.createTransport({
      host,
      port,
      secure: secureValue ? secureValue === 'true' : port === 465,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      ...(user && password ? { auth: { user, pass: password } } : {}),
    });
    try {
      await transport.sendMail({
        from,
        to: message.destinataire,
        subject: message.sujet,
        text: message.contenu,
      });
    } finally {
      transport.close();
    }
  }
}
