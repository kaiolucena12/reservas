import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

const chavePublica = import.meta.env.VITE_PUSH_PUBLIC_KEY;

const suportaPush =
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

function converterChave(chave: string) {
  const preenchimento = '='.repeat((4 - (chave.length % 4)) % 4);
  const base64 = chave.replace(/-/g, '+').replace(/_/g, '/') + preenchimento;
  return Uint8Array.from(atob(base64), (letra) => letra.charCodeAt(0));
}

export function Notificacoes({ client }: { client: SupabaseClient }) {
  const [socio, setSocio] = useState<string>();
  const [ativo, setAtivo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [mensagem, setMensagem] = useState('');

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      const { data } = await client
        .from('push_socios')
        .select('user_id')
        .maybeSingle();

      if (cancelado || !data) return;
      setSocio(data.user_id);

      if (!suportaPush || !chavePublica) return;

      const registro = await navigator.serviceWorker.register('/push-sw.js');
      const inscricao = await registro.pushManager.getSubscription();

      if (!inscricao || cancelado) return;

      const { data: dispositivo } = await client
        .from('push_dispositivos')
        .select('endpoint')
        .eq('user_id', data.user_id)
        .eq('endpoint', inscricao.endpoint)
        .maybeSingle();

      if (!cancelado) setAtivo(Boolean(dispositivo));
    }

    void carregar().catch(() => {
      if (!cancelado) {
        setMensagem('Não foi possível verificar os avisos deste aparelho.');
      }
    });

    return () => { cancelado = true; };
  }, [client]);

  async function ativar() {
    if (!socio || !chavePublica || ocupado) return;

    setOcupado(true);
    setMensagem('');

    try {
      // O aviso de permissão é solicitado diretamente pelo toque no botão.
      const permissao = await Notification.requestPermission();

      if (permissao !== 'granted') {
        setMensagem('Permita as notificações nas configurações do aparelho e tente novamente.');
        return;
      }

      await navigator.serviceWorker.register('/push-sw.js');
      const registro = await navigator.serviceWorker.ready;
      const existente = await registro.pushManager.getSubscription();
      const inscricao = existente ?? await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: converterChave(chavePublica),
      });

      const { keys } = inscricao.toJSON();
      if (!keys?.p256dh || !keys.auth) throw new Error('Inscrição inválida.');

      const { error } = await client.from('push_dispositivos').upsert({
        user_id: socio,
        endpoint: inscricao.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      }, { onConflict: 'user_id,endpoint' });

      if (error) throw error;

      setAtivo(true);
      setMensagem('Avisos de novas reservas ativados neste aparelho.');
    } catch {
      setMensagem('Não foi possível ativar os avisos. Tente novamente.');
    } finally {
      setOcupado(false);
    }
  }

  async function desativar() {
    if (!socio || ocupado) return;

    setOcupado(true);
    setMensagem('');

    try {
      const registro = await navigator.serviceWorker.getRegistration('/');
      const inscricao = await registro?.pushManager.getSubscription();

      if (inscricao) {
        const { error } = await client
          .from('push_dispositivos')
          .delete()
          .eq('user_id', socio)
          .eq('endpoint', inscricao.endpoint);

        if (error) throw error;
      }

      setAtivo(false);
      setMensagem('Avisos desativados neste aparelho.');
    } catch {
      setMensagem('Não foi possível desativar os avisos. Tente novamente.');
    } finally {
      setOcupado(false);
    }
  }

  if (!socio || !chavePublica) return null;

  if (!suportaPush) {
    return (
      <p className="muted">
        No iPhone, adicione o Seu Lima à Tela de Início pelo Safari e abra pelo ícone.
      </p>
    );
  }

  return (
    <div className="mb-4">
      <button
        type="button"
        className="secondary"
        disabled={ocupado}
        onClick={() => void (ativo ? desativar() : ativar())}
      >
        {ativo ? 'Desativar notificações' : 'Ativar notificações'}
      </button>
      {mensagem && <p className="muted" role="status">{mensagem}</p>}
    </div>
  );
}