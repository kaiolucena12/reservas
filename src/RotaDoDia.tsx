import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

type Coordenadas = [longitude: number, latitude: number];
type Parada = {
  id: string;
  nome: string;
  tipo: 'Entrega' | 'Retirada';
  endereco: string;
};
type Rota = {
  deposito: string;
  origem?: Coordenadas;
  ordem: (Parada & { segundos: number; coordenadas: Coordenadas })[];
  pendencias: (Parada & { motivo: string })[];
  retornoSegundos: number | null;
};

function linksGoogleMaps(pontos: Coordenadas[]) {
  const posicoes = pontos.map(([lng, lat]) => `${lat},${lng}`)
    .filter((ponto, i, todos) => i === 0 || ponto !== todos[i - 1]);
  const links: string[] = [];
  for (let i = 0; i < posicoes.length - 1; i += 4) {
    const trecho = posicoes.slice(i, i + 5);
    const params = new URLSearchParams({
      api: '1',
      travelmode: 'driving',
      origin: trecho[0],
      destination: trecho[trecho.length - 1],
    });
    if (trecho.length > 2) params.set('waypoints', trecho.slice(1, -1).join('|'));
    links.push('https://www.google.com/maps/dir/?' + params);
  }
  return links;
}

export function RotaDoDia({ data, deposito, client }: {
  data: string;
  deposito: string;
  client: SupabaseClient;
}) {
  const [retornar, setRetornar] = useState(false);
  const [rota, setRota] = useState<Rota | null>(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const consulta = useRef<AbortController | null>(null);

  useEffect(() => () => consulta.current?.abort(), []);

  async function gerar() {
    if (consulta.current) return;
    const controller = new AbortController();
    consulta.current = controller;
    setRota(null);
    setErro('');
    setOcupado(true);
    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) throw new Error('Entre no painel novamente.');
      const resposta = await fetch('/api/rota-do-dia', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, retornar }),
        signal: controller.signal,
      });
      const resultado = await resposta.json().catch(() => null);
      if (!resposta.ok || !resultado) {
        throw new Error(resultado?.erro ?? 'A rota não está disponível neste ambiente. Teste na Vercel ou com vercel dev.');
      }
      if (!controller.signal.aborted) setRota(resultado);
    } catch (e) {
      if (!controller.signal.aborted) setErro(e instanceof Error ? e.message : 'Não foi possível gerar a rota.');
    } finally {
      consulta.current = null;
      if (!controller.signal.aborted) setOcupado(false);
    }
  }

  const pontos = rota?.origem && rota.ordem.length ? [
    rota.origem,
    ...rota.ordem.map(p => p.coordenadas),
    ...(rota.retornoSegundos !== null ? [rota.origem] : []),
  ] : [];
  const links = linksGoogleMaps(pontos);

  return (
    <section className="card space-y-3">
      <h2>Rota do dia</h2>
      <p className="muted">Saída do depósito: {deposito.trim() || 'Cadastre o endereço de saída acima.'}</p>
      <label className="flex items-center gap-2">
        <input className="!h-4 !min-h-0 !w-4" type="checkbox" checked={retornar} disabled={ocupado} onChange={e => {
          setRetornar(e.target.checked);
          setRota(null);
        }} />
        Incluir retorno ao depósito
      </label>
      <button type="button" className="primary" disabled={ocupado || !deposito.trim()} onClick={() => void gerar()}>
        {ocupado ? 'Calculando rota…' : 'Gerar rota do dia'}
      </button>
      {erro && <p className="error" role="alert">{erro}</p>}
      {rota && (
        <div className="space-y-3" aria-live="polite">
          {!rota.ordem.length && !rota.pendencias.length && <p>Nenhuma entrega ou retirada pendente nesta data.</p>}
          {rota.ordem.length > 0 && (
            <>
              <h3 className="font-bold">Sequência sugerida</h3>
              <ol className="list-decimal space-y-2 pl-5">
                {rota.ordem.map(p => (
                  <li key={p.id + p.tipo}>
                    <strong>{p.tipo} · {p.nome}</strong>
                    <p>{p.endereco}</p>
                    <p className="muted text-sm">{Math.ceil(p.segundos / 60)} min desde a parada anterior</p>
                  </li>
                ))}
                {rota.retornoSegundos !== null && (
                  <li><strong>Retorno ao depósito</strong> · {Math.ceil(rota.retornoSegundos / 60)} min</li>
                )}
              </ol>
            </>
          )}
          {rota.pendencias.length > 0 && (
            <div className="error">
              <strong>Paradas fora da rota</strong>
              <ul className="list-disc pl-5">{rota.pendencias.map(p => (
                <li key={p.id + p.tipo}>{p.tipo} · {p.nome} · {p.endereco} · {p.motivo}</li>
              ))}</ul>
            </div>
          )}
          {retornar && rota.ordem.length > 0 && rota.retornoSegundos === null &&
            <p className="error">O retorno ao depósito não pôde ser calculado.</p>}
          {links.length > 0 && (
            <div className="flex flex-wrap gap-2">{links.map((link, i) => (
              <a key={i} className="secondary" href={link} target="_blank" rel="noreferrer">
                Abrir no Google Maps{links.length > 1 ? ` · Trecho ${i + 1}` : ''}
              </a>
            ))}</div>
          )}
          <p className="muted text-xs">© openrouteservice.org by HeiGIT | Map data © OpenStreetMap contributors</p>
        </div>
      )}
    </section>
  );
}
