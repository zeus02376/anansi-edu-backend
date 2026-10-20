import * as nodemailer from 'nodemailer';
import { CandidatureEmailSender } from './candidature-email.sender';

describe('CandidatureEmailSender', () => {
  const smtpKeys = [
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_SECURE',
    'SMTP_USER',
    'SMTP_PASSWORD',
    'SMTP_FROM',
  ] as const;
  const originalValues = Object.fromEntries(
    smtpKeys.map((key) => [key, process.env[key]]),
  );
  const sender = new CandidatureEmailSender();

  beforeEach(() => {
    for (const key of smtpKeys) delete process.env[key];
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const key of smtpKeys) {
      const value = originalValues[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('rejects incomplete SMTP configuration without attempting delivery', async () => {
    await expect(
      sender.send({
        destinataire: 'candidat@example.test',
        sujet: 'Candidature reçue',
        contenu: 'Message',
      }),
    ).rejects.toThrow('SMTP_HOST, SMTP_PORT, SMTP_FROM');
  });

  it('sends the configured message and closes the SMTP transport', async () => {
    process.env.SMTP_HOST = 'smtp.example.test';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_SECURE = 'false';
    process.env.SMTP_USER = 'mailer';
    process.env.SMTP_PASSWORD = 'secret';
    process.env.SMTP_FROM = 'Admissions <admissions@example.test>';

    const sendMail = jest.fn().mockResolvedValue({ accepted: [] });
    const close = jest.fn();
    const transport = { sendMail, close } as unknown as ReturnType<
      typeof nodemailer.createTransport
    >;
    const createTransport = jest
      .spyOn(nodemailer, 'createTransport')
      .mockReturnValue(transport);

    await sender.send({
      destinataire: 'candidat@example.test',
      sujet: 'Candidature reçue',
      contenu: 'Message',
    });

    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.test',
      port: 587,
      secure: false,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      auth: { user: 'mailer', pass: 'secret' },
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: 'Admissions <admissions@example.test>',
      to: 'candidat@example.test',
      subject: 'Candidature reçue',
      text: 'Message',
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('uses implicit TLS on port 465 and closes even if SMTP rejects the message', async () => {
    process.env.SMTP_HOST = 'smtp.example.test';
    process.env.SMTP_PORT = '465';
    process.env.SMTP_FROM = 'admissions@example.test';

    const sendMail = jest.fn().mockRejectedValue(new Error('SMTP unavailable'));
    const close = jest.fn();
    const transport = { sendMail, close } as unknown as ReturnType<
      typeof nodemailer.createTransport
    >;
    const createTransport = jest
      .spyOn(nodemailer, 'createTransport')
      .mockReturnValue(transport);

    await expect(
      sender.send({
        destinataire: 'candidat@example.test',
        sujet: 'Candidature reçue',
        contenu: 'Message',
      }),
    ).rejects.toThrow('SMTP unavailable');

    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.test',
      port: 465,
      secure: true,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    expect(close).toHaveBeenCalledTimes(1);
  });
});
