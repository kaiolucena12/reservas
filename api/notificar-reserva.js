import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const assuntosPermitidos = new Set([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
]);

function segredoValido(recebido, esperado) {
  if (typeof recebido !== 'string' || !esperado) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

function endpointPermitido(endpoint) {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      (
        assuntosPermitidos.has(url.hostname) ||
        url.hostname.endsWith('.push.apple.com')
      )
    );
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ erro: 'Use POST.' });
  }

  const {
    VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    VITE_PUSH_PUBLIC_KEY,
    PUSH_PRIVATE_KEY,
    PUSH_WEBHOOK_SECRET,
  } = process.env;

  if (!segredoValido(req.headers['x-webhook-secret'], PUSH_WEBHOOK_SECRET)) {
    return res.status(401).json({ erro: 'Webhook não autorizado.' });
  }

  if (
    !VITE_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY ||
    !VITE_PUSH_PUBLIC_KEY || !PUSH_PRIVATE_KEY
  ) {
    return res.status(503).json({ erro: 'Configure as chaves na Vercel.' });
  }

  const { type, schema, table, record } = req.body ?? {};

  if (type !== 'INSERT' || schema !== 'public' || table !== 'reservas') {
    return res.status(204).end();
  }

  if (
    typeof record?.id !== 'string' ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(record.id) ||
    !/^\d+$/.test(String(record.numero)) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(String(record.data))
  ) {
    return res.status(400).json({ erro: 'Dados da reserva inválidos.' });
  }

  try {
    const supabase = createClient(
      VITE_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: dispositivos, error } = await supabase
      .from('push_dispositivos')
      .select('user_id,endpoint,p256dh,auth');

    if (error) {
      return res.status(502).json({ erro: 'Falha ao consultar dispositivos.' });
    }

    const dataEvento = record.data.split('-').reverse().join('/');
    const payload = JSON.stringify({
      titulo: 'Nova reserva no Seu Lima',
      mensagem: `Reserva #${record.numero} · Evento em ${dataEvento}`,
      id: record.id,
    });

    const resultados = await Promise.all(
      dispositivos.map(async (dispositivo) => {
        const { user_id, endpoint, p256dh, auth } = dispositivo;

        if (!endpointPermitido(endpoint)) return 'falha';

        try {
          await webpush.sendNotification(
            { endpoint, keys: { p256dh, auth } },
            payload,
            {
              TTL: 86400,
              timeout: 5000,
              vapidDetails: {
                subject: 'https://seulima.vercel.app',
                publicKey: VITE_PUSH_PUBLIC_KEY,
                privateKey: PUSH_PRIVATE_KEY,
              },
            },
          );
          return 'enviado';
        } catch (error) {
          if (error.statusCode !== 404 && error.statusCode !== 410) {
            return 'falha';
          }

          const { error: erroRemocao } = await supabase
            .from('push_dispositivos')
            .delete()
            .eq('user_id', user_id)
            .eq('endpoint', endpoint)
            .eq('p256dh', p256dh)
            .eq('auth', auth);

          return erroRemocao ? 'falha' : 'expirado';
        }
      }),
    );

    const enviados = resultados.filter((item) => item === 'enviado').length;
    const expirados = resultados.filter((item) => item === 'expirado').length;
    const falhas = resultados.filter((item) => item === 'falha').length;

    return res.status(falhas ? 502 : 200).json({ enviados, expirados, falhas });
  } catch {
    return res.status(500).json({ erro: 'Falha no envio de notificações.' });
  }
}