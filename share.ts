/**
 * Script utilitário para compartilhar o calendário do bot com um usuário.
 * Uso: SHARE_EMAIL=email@exemplo.com npx tsx share.ts
 */
import { google } from 'googleapis';
import dotenv from 'dotenv';
dotenv.config();

async function shareCalendar() {
  const targetEmail = process.env.SHARE_EMAIL;
  if (!targetEmail) {
    console.error('Defina a variável SHARE_EMAIL com o email de destino. Ex: SHARE_EMAIL=user@gmail.com npx tsx share.ts');
    process.exit(1);
  }

  const role = (process.env.SHARE_ROLE || 'writer') as 'owner' | 'writer' | 'reader';

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    const calendar = google.calendar({ version: 'v3', auth });

    console.log(`Compartilhando a agenda do bot com ${targetEmail} (role: ${role})...`);

    await calendar.acl.insert({
      calendarId: 'primary',
      requestBody: {
        role,
        scope: {
          type: 'user',
          value: targetEmail,
        },
      },
    });

    console.log(`Sucesso! A agenda foi compartilhada com ${targetEmail}.`);
  } catch (error) {
    console.error('Erro ao compartilhar a agenda:', error);
    process.exit(1);
  }
}

shareCalendar();
