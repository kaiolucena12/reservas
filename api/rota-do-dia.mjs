const ORS = 'https://api.openrouteservice.org';
const fields = 'id,nome,rua,numero_endereco,bairro,cidade,uf,cep,horario,data,entrega,data_retirada,retirada_concluida';

class Falha extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function json(url, options, message) {
  const resposta = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
  if (resposta.status === 429) throw new Falha(429, 'Limite de consultas atingido. Tente novamente mais tarde.');
  if (!resposta.ok) throw new Falha(502, message);
  return resposta.json();
}

function endereco(r) {
  return [r.rua + ', ' + r.numero_endereco, r.bairro, r.cidade, r.uf, r.cep, 'Brasil'].filter(Boolean).join(', ');
}

async function geocodificar(texto, headers) {
  const params = new URLSearchParams({ text: texto, 'boundary.country': 'BR', layers: 'address', size: '1' });
  const dados = await json(ORS + '/geocode/search?' + params, { headers }, 'Não foi possível consultar endereços no openrouteservice.');
  const ponto = dados.features?.[0];
  const coordenadas = ponto?.geometry?.coordinates;
  // Não aceita um resultado aproximado como se fosse o número do imóvel.
  return ponto?.properties?.match_type === 'exact' &&
    coordenadas?.length === 2 && coordenadas.every(Number.isFinite) ? coordenadas : null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ erro: 'Use POST.' });
  }
  const authorization = req.headers.authorization;
  if (!/^Bearer \S+$/.test(authorization ?? '')) return res.status(401).json({ erro: 'Entre no painel novamente.' });
  const { data, retornar } = req.body ?? {};
  if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data) ||
      !Number.isFinite(Date.parse(data)) || new Date(data).toISOString().slice(0, 10) !== data ||
      typeof retornar !== 'boolean') return res.status(400).json({ erro: 'Selecione uma data válida.' });

  const url = process.env.VITE_SUPABASE_URL;
  const apikey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const chave = process.env.ORS_API_KEY;
  if (!url || !apikey || !chave) return res.status(503).json({ erro: 'Configure o Supabase e ORS_API_KEY na Vercel.' });

  try {
    const headers = { apikey, Authorization: authorization };
    const base = url.replace(/\/$/, '') + '/rest/v1/';
    const config = await json(base + 'configuracao?select=saida&id=eq.1', { headers }, 'Não foi possível acessar a configuração do painel.');
    if (!config.length) throw new Falha(403, 'Sua conta não tem acesso ao painel.');
    const deposito = config[0].saida.trim();
    if (!deposito) throw new Falha(400, 'Salve o endereço completo do depósito antes de gerar a rota.');

    const filtro = new URLSearchParams({
      select: fields, status: 'eq.ativa', order: 'horario.asc,id.asc', limit: '50',
      or: `(and(data.eq.${data},entrega.eq.pendente),and(data_retirada.eq.${data},retirada_concluida.eq.false))`,
    });
    const reservas = await json(base + 'reservas?' + filtro, { headers }, 'Não foi possível carregar as reservas. Confira se o SQL de retiradas foi aplicado.');
    const paradas = reservas.flatMap(r => {
      const tipos = [];
      if (r.data === data && r.entrega === 'pendente') tipos.push('Entrega');
      if (r.data_retirada === data && !r.retirada_concluida) tipos.push('Retirada');
      return tipos.map(tipo => ({ id: r.id, nome: r.nome, tipo, endereco: endereco(r) }));
    });
    // Limita geocodificações por clique e mantém a matriz em 21 × 21 ou menos.
    if (reservas.length >= 50 || paradas.length > 20) throw new Falha(400, 'Há mais de 20 paradas pendentes. Divida a operação antes de gerar a rota.');
    if (!paradas.length) return res.json({ deposito, ordem: [], pendencias: [], retornoSegundos: null });

    const orsHeaders = { Authorization: chave };
    const origem = await geocodificar(deposito, orsHeaders);
    if (!origem) throw new Falha(422, 'O depósito não foi localizado com precisão. Confira rua, número, cidade, UF e CEP.');
    const enderecos = [...new Set(paradas.map(p => p.endereco))].filter(e => e !== deposito);
    const pontos = new Map([[deposito, origem]]);
    // Grupos pequenos evitam disparar todas as consultas simultaneamente.
    for (let i = 0; i < enderecos.length; i += 4) {
      await Promise.all(enderecos.slice(i, i + 4).map(async e => {
        pontos.set(e, await geocodificar(e, orsHeaders));
      }));
    }

    const localizadas = paradas.filter(p => pontos.get(p.endereco));
    const pendencias = paradas.filter(p => !pontos.get(p.endereco)).map(p => ({ ...p, motivo: 'Endereço sem correspondência exata' }));
    if (!localizadas.length) return res.json({ deposito, ordem: [], pendencias, retornoSegundos: null });

    const locais = [deposito, ...new Set(localizadas.map(p => p.endereco).filter(e => e !== deposito))];
    const indices = new Map(locais.map((e, i) => [e, i]));
    const { durations } = locais.length === 1 ? { durations: [[0]] } : await json(
      ORS + '/v2/matrix/driving-car',
      {
        method: 'POST',
        headers: { ...orsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations: locais.map(e => pontos.get(e)), metrics: ['duration'] }),
      },
      'Não foi possível calcular os tempos de deslocamento.',
    );

    const restantes = [...localizadas];
    const ordem = [];
    let atual = 0;
    while (restantes.length) {
      let melhor = -1;
      let segundos = Infinity;
      for (const [i, parada] of restantes.entries()) {
        if (parada.tipo === 'Retirada' && restantes.some(p => p.id === parada.id && p.tipo === 'Entrega')) continue;
        const tempo = durations?.[atual]?.[indices.get(parada.endereco)];
        if (Number.isFinite(tempo) && tempo < segundos) {
          melhor = i;
          segundos = tempo;
        }
      }
      if (melhor === -1) break;
      const [parada] = restantes.splice(melhor, 1);
      atual = indices.get(parada.endereco);
      ordem.push({ ...parada, segundos, coordenadas: pontos.get(parada.endereco) });
    }
    pendencias.push(...restantes.map(p => ({ ...p, motivo: 'Sem trajeto de carro calculado' })));
    const volta = durations?.[atual]?.[0];
    return res.json({
      deposito, origem, ordem, pendencias,
      retornoSegundos: retornar && ordem.length && Number.isFinite(volta) ? volta : null,
    });
  } catch (erro) {
    return res.status(erro instanceof Falha ? erro.status : 502).json({
      erro: erro instanceof Falha ? erro.message : 'Não foi possível gerar a rota agora. Tente novamente.',
    });
  }
}
