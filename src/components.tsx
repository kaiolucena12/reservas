import { useEffect, useState, type FormEvent } from 'react';
import {
  dia,
  deslocar,
  semana,
  items,
  moeda,
  empty,
  valores,
  type Config,
  type Draft,
  type Reserva,
} from './model';

export function Calendario({
  date,
  setDate,
  reservas,
}: {
  date: string;
  setDate: (d: string) => void;
  reservas: Reserva[];
}) {
  const primeiroDia = `${date.slice(0, 7)}-01`;
  const inicio = deslocar(primeiroDia, -semana(primeiroDia));
  const datasComReserva = new Set(
    reservas.filter(r => r.status === 'ativa').map(r => r.data),
  );

  function mudarMes(delta: number) {
    const novoMes = new Date(`${primeiroDia}T12:00:00Z`);
    novoMes.setUTCMonth(novoMes.getUTCMonth() + delta);
    setDate(novoMes.toISOString().slice(0, 10));
  }

  return (
    <section className="card">
      <div className="mb-4 flex items-center justify-between gap-2">
        <button
          type="button"
          className="secondary"
          aria-label="Mês anterior"
          onClick={() => mudarMes(-1)}
        >
          ‹
        </button>

        <h2 className="text-center capitalize">
          {dia(date, { month: 'long', year: 'numeric' })}
        </h2>

        <button
          type="button"
          className="secondary"
          aria-label="Próximo mês"
          onClick={() => mudarMes(1)}
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(nomeDia => (
          <span className="muted py-2 text-xs" key={nomeDia}>
            {nomeDia}
          </span>
        ))}

        {Array.from({ length: 42 }, (_, i) => deslocar(inicio, i)).map(d => (
          <button
            type="button"
            key={d}
            onClick={() => setDate(d)}
            className={`day${d === date ? ' selected' : ''}${
              d.slice(0, 7) !== date.slice(0, 7) ? ' outside' : ''
            }`}
            aria-label={`${dia(d)}${
              datasComReserva.has(d) ? ', com reservas' : ''
            }`}
            aria-pressed={d === date}
          >
            {Number(d.slice(8))}
            {datasComReserva.has(d) && <span className="dot" />}
          </button>
        ))}
      </div>

      <p className="muted mt-3 text-xs">● Dias com reservas ativas</p>
    </section>
  );
}

const grupos = [
  ['Cliente', [
    ['nome', 'Nome completo', true],
    ['telefone', 'Telefone principal', true, 'tel'],
    ['telefone_extra', 'Telefone adicional', false, 'tel'],
    ['contato', 'Nome do contato'],
    ['parentesco', 'Parentesco'],
    ['instagram', 'Instagram'],
  ]],
  ['Endereço de entrega', [
    ['cep', 'CEP', true],
    ['rua', 'Rua', true],
    ['numero_endereco', 'Número', true],
    ['bairro', 'Bairro', true],
    ['cidade', 'Cidade', true],
    ['uf', 'Estado', true],
    ['complemento', 'Complemento'],
    ['condominio', 'Condomínio ou prédio'],
    ['apartamento', 'Nº do apartamento'],
    ['referencia', 'Ponto de referência'],
  ]],
  ['Evento', [
    ['data', 'Data do evento', true, 'date'],
    ['horario', 'Horário da festa', true, 'time'],
  ]],
] as const;

const estados =
  'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'
    .split(' ');

const apenasDigitos = (valor: string) => valor.replace(/\D/g, '');

const normalizarNome = (nome: string) =>
  nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

export function cents(value: string) {
  const texto = value.trim();
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(texto)) return NaN;
  return Math.round(Number(texto.replace(',', '.')) * 100);
}

export function FormReserva({
  date,
  config,
  current,
  historico = [],
  save,
  close,
}: {
  date: string;
  config: Config;
  current?: Reserva;
  historico?: Reserva[];
  save: (d: Draft, id?: string) => Promise<void>;
  close: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() =>
    current
      ? Object.fromEntries(
          Object.keys(empty).map(key => [
            key,
            current[key as keyof typeof empty] ?? empty[key as keyof typeof empty],
          ]),
        ) as Draft
      : { ...empty, data: date },
  );

  const [frete, setFrete] = useState(
    (draft.frete / 100).toFixed(2).replace('.', ','),
  );

  const [precosDigitados, setPrecosDigitados] = useState(() => {
    const aplicados = current ? valores(current) : config;

    return {
      conjunto: (aplicados.conjunto / 100).toFixed(2).replace('.', ','),
      mesa: (aplicados.mesa / 100).toFixed(2).replace('.', ','),
      cadeira: (aplicados.cadeira / 100).toFixed(2).replace('.', ','),
      toalha: (aplicados.toalha / 100).toFixed(2).replace('.', ','),
    };
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cepStatus, setCepStatus] = useState('');
  const [cepDoCadastro, setCepDoCadastro] = useState(
    () => apenasDigitos(current?.cep ?? ''),
  );
  const [mostrarClientes, setMostrarClientes] = useState(true);

  const cep = apenasDigitos(draft.cep);

  useEffect(() => {
    setCepStatus('');
    if (cep.length !== 8 || cep === cepDoCadastro) return;

    const controller = new AbortController();

    async function buscarCep() {
      setCepStatus('Buscando endereço…');

      try {
        const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
          signal: controller.signal,
        });

        if (!resposta.ok) throw new Error('Falha na consulta');

        const endereco = await resposta.json();
        if (controller.signal.aborted) return;

        if (endereco.erro) {
          setCepStatus('CEP não encontrado. Preencha o endereço manualmente.');
          return;
        }

        setDraft(anterior => {
          if (apenasDigitos(anterior.cep) !== cep) return anterior;

          return {
            ...anterior,
            rua: endereco.logradouro || '',
            bairro: endereco.bairro || '',
            cidade: endereco.localidade || '',
            uf: endereco.uf || '',
          };
        });

        setCepStatus(
          endereco.logradouro && endereco.bairro
            ? 'Endereço preenchido. Informe o número e, se houver, o apartamento.'
            : 'Este CEP tem dados parciais. Complete os campos de endereço.',
        );
      } catch {
        if (!controller.signal.aborted) {
          setCepStatus(
            'Não foi possível consultar o CEP. Preencha o endereço manualmente.',
          );
        }
      }
    }

    void buscarCep();
    return () => controller.abort();
  }, [cep, cepDoCadastro]);

  const busca = normalizarNome(draft.nome);
  const clientesEncontrados = new Map<string, Reserva>();

  if (!current && mostrarClientes && busca.length >= 3) {
    const recentes = [...historico].sort((a, b) => b.numero - a.numero);

    for (const reserva of recentes) {
      const nome = normalizarNome(reserva.nome);
      const chave = `${nome}:${apenasDigitos(reserva.telefone)}`;

      if (nome.includes(busca) && !clientesEncontrados.has(chave)) {
        clientesEncontrados.set(chave, reserva);
      }

      if (clientesEncontrados.size === 5) break;
    }
  }

  function preencherCliente(cliente: Reserva) {
    setCepDoCadastro(apenasDigitos(cliente.cep ?? ''));
    setCepStatus('');
    setMostrarClientes(false);

    setDraft(anterior => ({
      ...anterior,
      nome: cliente.nome,
      telefone: cliente.telefone,
      telefone_extra: cliente.telefone_extra ?? '',
      contato: cliente.contato ?? '',
      parentesco: cliente.parentesco ?? '',
      instagram: cliente.instagram ?? '',
      cep: cliente.cep ?? '',
      rua: cliente.rua ?? '',
      numero_endereco: cliente.numero_endereco ?? '',
      bairro: cliente.bairro ?? '',
      cidade: cliente.cidade ?? '',
      uf: cliente.uf ?? '',
      complemento: cliente.complemento ?? '',
      condominio: cliente.condominio ?? '',
      apartamento: cliente.apartamento ?? '',
      referencia: cliente.referencia ?? '',
    }));
  }

  const precos = {
    conjunto: cents(precosDigitados.conjunto),
    mesa: cents(precosDigitados.mesa),
    cadeira: cents(precosDigitados.cadeira),
    toalha: cents(precosDigitados.toalha),
  };

  const precosValidos = Object.values(precos).every(
    valor => Number.isInteger(valor) && valor >= 0 && valor <= 2147483647,
  );

  const subtotal = items.reduce(
    (total, item) => total + draft[item.qty] * (
      Number.isFinite(precos[item.price]) ? precos[item.price] : 0
    ),
    0,
  );

  const valorFrete = cents(frete) || 0;

  const ocupacao = historico.reduce(
    (total, reserva) => {
      if (
        reserva.data !== draft.data ||
        reserva.status !== 'ativa' ||
        reserva.id === current?.id
      ) {
        return total;
      }

      return {
        mesas: total.mesas + reserva.conjuntos + reserva.mesas,
        cadeiras: total.cadeiras + reserva.conjuntos * 4 + reserva.cadeiras,
      };
    },
    { mesas: 0, cadeiras: 0 },
  );

  const mesasLivres = Math.max(
    0,
    (config.estoque_mesas ?? 35) - ocupacao.mesas,
  );
  const cadeirasLivres = Math.max(
    0,
    (config.estoque_cadeiras ?? 140) - ocupacao.cadeiras,
  );
  const conjuntosLivres = Math.min(
    mesasLivres,
    Math.floor(cadeirasLivres / 4),
  );

  const estoqueInsuficiente =
    draft.conjuntos + draft.mesas > mesasLivres ||
    draft.conjuntos * 4 + draft.cadeiras > cadeirasLivres;

  const estoqueEsgotado = mesasLivres === 0 && cadeirasLivres === 0;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;

    if (!precosValidos) {
      setError(
        'Confira os preços unitários. Use valores com até duas casas decimais.',
      );
      return;
    }

    if (estoqueInsuficiente) {
      setError('A quantidade escolhida supera o estoque disponível nesta data.');
      return;
    }

    if (!items.every(item =>
      Number.isInteger(draft[item.qty]) &&
      draft[item.qty] >= 0 &&
      draft[item.qty] <= 100000
    )) {
      setError('Informe quantidades inteiras maiores ou iguais a zero.');
      return;
    }

    if (!items.some(item => draft[item.qty] > 0)) {
      setError('Informe pelo menos um item de locação.');
      return;
    }

    const submitted = new FormData(e.currentTarget);
    const freight = cents(frete);

    if (!Number.isInteger(freight) || freight < 0 || freight > 2147483647) {
      setError('Informe um frete válido com até duas casas decimais.');
      return;
    }

    setBusy(true);
    setError('');

    try {
      const clean = Object.fromEntries(
        Object.entries(draft).map(([key, value]) => [
          key,
          typeof value === 'string' ? value.trim() : value,
        ]),
      ) as Draft;

      await save({
        ...clean,
        data: String(submitted.get('data')),
        horario: String(submitted.get('horario')),
        frete: freight,
        preco_conjunto: precos.conjunto,
        preco_mesa: precos.mesa,
        preco_cadeira: precos.cadeira,
        preco_toalha: precos.toalha,
      }, current?.id);
    } catch {
      setError(
        'Não foi possível salvar. Confira os dados, o estoque e a conexão.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {grupos.map(([title, fields]) => (
        <section className="card" key={title}>
          <h2>{title}</h2>

          <div className="fields">
            {fields.map(([key, label, required, type]) => (
              <div key={key}>
                <label>
                  {label}{required ? ' *' : ''}

                  {key === 'uf' ? (
                    <select
                      name="uf"
                      required
                      value={draft.uf}
                      onChange={e => {
                        const uf = e.target.value;
                        setDraft(anterior => ({ ...anterior, uf }));
                      }}
                    >
                      <option value="">Selecione</option>
                      {estados.map(uf => <option key={uf}>{uf}</option>)}
                    </select>
                  ) : (
                    <input
                      name={key}
                      required={required}
                      type={type ?? 'text'}
                      value={draft[key]}
                      maxLength={key === 'cep' ? 9 : 240}
                      pattern={key === 'cep' ? '[0-9]{5}-?[0-9]{3}' : undefined}
                      inputMode={key === 'cep' ? 'numeric' : undefined}
                      onChange={e => {
                        const valor = e.target.value;
                        setDraft(anterior => ({ ...anterior, [key]: valor }));
                        if (key === 'nome') setMostrarClientes(true);
                      }}
                    />
                  )}
                </label>

                {key === 'cep' && cepStatus && (
                  <p className="muted mt-1 text-xs" role="status">
                    {cepStatus}
                  </p>
                )}

                {key === 'nome' && clientesEncontrados.size > 0 && (
                  <div className="mt-2 grid gap-2">
                    <p className="muted text-sm">
                      Selecione um cliente cadastrado
                    </p>

                    {[...clientesEncontrados.values()].map(cliente => (
                      <button
                        key={cliente.id}
                        type="button"
                        className="secondary"
                        onClick={() => preencherCliente(cliente)}
                      >
                        {cliente.nome} · {cliente.telefone}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="card">
        <h2>Itens e valores</h2>
        <p className="muted mt-1 text-sm">
          Ajuste os preços unitários conforme o valor combinado com o cliente.
        </p>

        <div className="summary" aria-live="polite">
          <p>
            <strong>
              Disponibilidade para{' '}
              {draft.data ? dia(draft.data, { dateStyle: 'short' }) : 'a data selecionada'}
            </strong>
          </p>
          <p>
            Mesas: {mesasLivres || 'esgotadas'} ·{' '}
            Cadeiras: {cadeirasLivres || 'esgotadas'}
          </p>
          <p>Conjuntos completos: {conjuntosLivres || 'esgotados'}</p>
          <p className="muted text-sm">
            Cada conjunto usa 1 mesa e 4 cadeiras.
          </p>

          {estoqueInsuficiente ? (
            <p className="error mt-2">
              A quantidade escolhida supera o estoque disponível para esta data.
            </p>
          ) : estoqueEsgotado && (
            <p className="muted mt-2">
              Mesas e cadeiras esgotadas para esta data.
            </p>
          )}
        </div>

        <div className="fields">
          {items.map(item => (
            <div
              key={item.qty}
              className="grid grid-cols-2 gap-2 rounded-xl border border-stone-200 p-3"
            >
              <label>
                {item.label}
                <input
                  type="number"
                  required
                  min={0}
                  max={100000}
                  step={1}
                  value={draft[item.qty]}
                  onFocus={e => e.target.select()}
                  onChange={e => {
                    const quantidade = Number(e.target.value);
                    setDraft(anterior => ({
                      ...anterior,
                      [item.qty]: quantidade,
                    }));
                  }}
                />
              </label>

              <label>
                Valor unitário (R$)
                <input
                  required
                  inputMode="decimal"
                  value={precosDigitados[item.price]}
                  onFocus={e => e.target.select()}
                  onChange={e => {
                    const valor = e.target.value;
                    setPrecosDigitados(anterior => ({
                      ...anterior,
                      [item.price]: valor,
                    }));
                  }}
                />
              </label>
            </div>
          ))}

          <label>
            Frete (R$) *
            <input
              required
              inputMode="decimal"
              value={frete}
              onChange={e => setFrete(e.target.value)}
            />
          </label>
        </div>

        <dl className="summary" aria-live="polite">
          <div>
            <dt>Subtotal da locação</dt>
            <dd>{moeda(subtotal)}</dd>
          </div>
          <div>
            <dt>Frete</dt>
            <dd>{moeda(valorFrete)}</dd>
          </div>
          <div className="font-bold">
            <dt>Total da reserva</dt>
            <dd>{moeda(subtotal + valorFrete)}</dd>
          </div>
        </dl>
      </section>

      {error && <p role="alert" className="error">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className="primary"
          disabled={busy || estoqueInsuficiente || !precosValidos}
        >
          {busy ? 'Salvando…' : 'Salvar reserva'}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={close}
        >
          Voltar
        </button>
      </div>
    </form>
  );
}