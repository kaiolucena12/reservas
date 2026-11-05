import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient, type Session } from '@supabase/supabase-js';
import { Calendario, FormReserva, cents } from './components';
import { Mapa, type Parada } from './maps';
import { comprovante } from './pdf';
import { dia, deslocar, endereco, entregaLabel, iso, items, moeda, semana, type Config, type Draft, type Reserva } from './model';
import './style.css';

const env=import.meta.env;
const db=env.VITE_SUPABASE_URL&&env.VITE_SUPABASE_PUBLISHABLE_KEY?createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY):null;
const tabs=['Reservas','Entregas','Financeiro'] as const;
type Tab=typeof tabs[number];
const now=()=>iso(new Date());
const fileName = (r: Reserva) => {
  const nome = r.nome.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '-');
  return `seulima reserva ${nome}.pdf`;
};

function Marca() {
  return (
    <img
      className="brand-logo"
      src={`${import.meta.env.BASE_URL}sllogo.png`}
      width={580}
      height={430}
      alt="Seu Lima Locações"
    />
  );
}function App(){
 const [session,setSession]=useState<Session|null|undefined>(undefined);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 useEffect(()=>{
  if(!db)return;
  const {data}=db.auth.onAuthStateChange((_,s)=>setSession(s));
  return ()=>data.subscription.unsubscribe();
 },[]);
 async function login(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!db||busy)return;
  const f=new FormData(e.currentTarget);
  setBusy(true);setError('');
  try {
   const {error}=await db.auth.signInWithPassword({email:String(f.get('email')),password:String(f.get('senha'))});
   if(error) setError('Não foi possível entrar. Confira o e-mail e a senha.');
  } catch {setError('Não foi possível conectar. Tente novamente.');}
  finally {setBusy(false);}
 }
 if(db&&session)return <Painel key={session.user.id}/>;
 return <main className="login"><section className="card">
  <Marca/><p className="eyebrow mt-7">ÁREA DA EQUIPE</p><h1>Acessar sistema</h1>
  {!db?<p role="alert" className="error mt-4">Configure a conexão com o Supabase para habilitar o login.</p>:
   session===undefined?<p role="status">Verificando acesso…</p>:
   <form className="grid gap-4 mt-5" onSubmit={login}>
    <label>E-mail<input name="email" type="email" autoComplete="username" required/></label>
    <label>Senha<input name="senha" type="password" autoComplete="current-password" required/></label>
    {error&&<p className="error" role="alert">{error}</p>}
    <button className="primary" disabled={busy}>{busy?'Entrando…':'Entrar'}</button>
   </form>}
 </section></main>;
}
function Quantidades({r}:{r:Reserva}) {
 return <div className="flex flex-wrap gap-2 my-3">{items.filter(i=>r[i.qty]>0).map(i=><span className="chip" key={i.qty}>{r[i.qty]} {i.label.toLowerCase()}</span>)}</div>;
}
function EntregaMovel({ id, children }: { id: string; children: ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <article
      ref={setNodeRef}
      className="entry relative bg-white"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
        opacity: isDragging ? 0.9 : 1,
      }}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="secondary mb-2"
        style={{ touchAction: 'none' }}
        {...attributes}
        {...listeners}
        aria-label="Arrastar para mudar a ordem da entrega"
      >
        ⠿ Mover entrega
      </button>

      {children}
    </article>
  );
}
function Painel(){
 const client=db!;
 const [tab,setTab]=useState<Tab>('Reservas');
 const [menu,setMenu]=useState(false);
 const [date,setDate]=useState(now);
 const [financeDate,setFinanceDate]=useState(now);
 const [period,setPeriod]=useState('mês');
 const [rows,setRows]=useState<Reserva[]>([]);
 const [config,setConfig]=useState<Config|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [detail,setDetail]=useState<string>();
 const [form,setForm]=useState<string>();
 const [estoqueAberto, setEstoqueAberto] = useState(false);
 const [prices,setPrices]=useState(false);
 const [paradas,setParadas]=useState<Parada[]>([]);
 const [ordemManual, setOrdemManual] = useState<Record<string, string[]>>({});

const sensoresEntrega = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  }),
);
 const [changing,setChanging]=useState(false);
 const reload=useCallback(async()=>{
  const conf=await client.from('configuracao').select('conjunto,mesa,cadeira,saida,estoque_mesas,estoque_cadeiras').eq('id',1).single();
  if(conf.error) throw conf.error;
  const list:Reserva[]=[];
  for(let offset=0;;offset+=500){
   const {data,error}=await client.from('reservas').select('*').order('horario').order('id').range(offset,offset+499);
   if(error)throw error;
   list.push(...data);
   if(data.length<500)break;
  }
  setConfig(conf.data);setRows(list);
 },[client]);
 useEffect(()=>{
  reload().catch(()=>setError('Não foi possível acessar os dados. Confira se sua conta foi autorizada para a equipe.')).finally(()=>setLoading(false));
 },[reload]);
const daily = useMemo(
  () => rows.filter(r => r.data === date && r.status === 'ativa'),
  [rows, date],
); const deliveries=useMemo(()=>daily.filter(r=>r.status==='ativa'),[daily]);
 const paradasDoDia: Parada[] =
  paradas.length === deliveries.length &&
  paradas.every(p => deliveries.includes(p.reserva))
    ? paradas
    : deliveries.map(reserva => ({ reserva }));

const ordemDoDia = ordemManual[date] ?? [];
const paradasPorId = new Map(paradasDoDia.map(p => [p.reserva.id, p]));

const entregasOrdenadas = [
  ...ordemDoDia.flatMap(id => {
    const parada = paradasPorId.get(id);
    return parada ? [parada] : [];
  }),
  ...paradasDoDia.filter(p => !ordemDoDia.includes(p.reserva.id)),
];

const idsDasEntregas = entregasOrdenadas.map(p => p.reserva.id);
 const mesasTotais = config?.estoque_mesas ?? 35;
 const cadeirasTotais = config?.estoque_cadeiras ?? 140;
 const mesasDisponiveis = Math.max(0, mesasTotais - daily.reduce(
  (total, r) => total + r.conjuntos + r.mesas, 0,
 ));
 const cadeirasDisponiveis = Math.max(0, cadeirasTotais - daily.reduce(
  (total, r) => total + r.conjuntos * 4 + r.cadeiras, 0,
 ));
 const conjuntosDisponiveis = Math.min(mesasDisponiveis, Math.floor(cadeirasDisponiveis / 4));
 const current=rows.find(r=>r.id===detail);
 async function save(draft:Draft,id?:string){
  const table=client.from('reservas');
  const query=id?table.update(draft).eq('id',id).eq('status','ativa'):table.insert(draft);
  const {data,error}=await query.select().single();
  if(error)throw error;
  setRows(existing=>[...existing.filter(r=>r.id!==data.id),data].sort((a,b)=>a.horario.localeCompare(b.horario)));
  setDate(data.data);setDetail(data.id);setForm(undefined);
 }
 async function update(r:Reserva,patch:Partial<Reserva>){
  if(changing)return;
  setChanging(true);setError('');
  try {
   let query=client.from('reservas').update(patch).eq('id',r.id).eq('status','ativa');
   if(patch.entrega)query=query.eq('entrega',r.entrega);
   const {data,error}=await query.select().single();
   if(error)throw error;
   setRows(existing=>existing.map(row=>row.id===r.id?data:row));
  } catch {setError('Não foi possível atualizar a reserva.');}
  finally {setChanging(false);}
 }
 async function configure(e:FormEvent<HTMLFormElement>,mode:'prices'|'saida'|'estoque'){
  e.preventDefault();if(changing)return;
  const f=new FormData(e.currentTarget);
  const patch = mode === 'saida'
    ? { saida: String(f.get('saida')).trim() }
    : mode === 'estoque'
      ? {
          estoque_mesas: Number(f.get('estoque_mesas')),
          estoque_cadeiras: Number(f.get('estoque_cadeiras')),
        }
      : Object.fromEntries(items.map(i => [i.price, cents(String(f.get(i.price)))]));
  if (mode !== 'saida' && Object.values(patch).some(v =>
    !Number.isInteger(v) || Number(v) < 0 || Number(v) > 2147483647
  )) {
    setError(mode === 'estoque'
      ? 'Informe quantidades inteiras maiores ou iguais a zero.'
      : 'Informe preços válidos com até duas casas decimais.');
    return;
  }
  setChanging(true);setError('');
  try {
   const {data,error}=await client.from('configuracao').update(patch).eq('id',1).select().single();
   if(error)throw error;
   setConfig(data);setPrices(false);
   if (mode === 'estoque') setEstoqueAberto(false);
  } catch {setError('Não foi possível salvar a configuração.');}
  finally {setChanging(false);}
 }
 async function share(r: Reserva) {
  setError('');

  const mensagem = `Oi 😊 Sua reserva com a Seu Lima Locações foi registrada. Agora falta pouco para a sua festa! 🎉

Segue o PDF da sua reserva. Dá uma conferida nos dados e, por favor, leia com atenção as observações do contrato de locação, especialmente as orientações sobre entrega, retirada e cuidado com os materiais.

Se tiver alguma dúvida ou precisar ajustar alguma informação, é só chamar por aqui. Obrigado por escolher a Seu Lima Locações para fazer parte da sua festa! 💛`;

  try {
    const pdf = comprovante(r);
    const arquivo = new File([pdf.output('blob')], fileName(r), {
      type: 'application/pdf',
    });

    const compartilhamento = {
      files: [arquivo],
      text: mensagem,
    };

    if (navigator.canShare?.(compartilhamento)) {
      await navigator.share(compartilhamento);
    } else {
      pdf.save(arquivo.name);
      setError('PDF baixado. Anexe o arquivo e cole a mensagem no WhatsApp.');
    }
  } catch (erro) {
    if (erro instanceof DOMException && erro.name === 'AbortError') return;

    setError('Não foi possível compartilhar. Use Baixar PDF e envie pelo WhatsApp.');
  }
}
 const start=period==='semana'?deslocar(financeDate,-semana(financeDate)):financeDate;
 const financial=rows.filter(r=>r.status==='ativa'&&(period==='mês'?r.data.slice(0,7)===financeDate.slice(0,7):period==='semana'?r.data>=start&&r.data<=deslocar(start,6):r.data===start)).sort((a,b)=>a.data.localeCompare(b.data));
 function selectTab(value:Tab){setTab(value);setMenu(false);setForm(undefined);setDetail(undefined);setPrices(false);setError('');}
 function editDelivery(r:Reserva){selectTab('Reservas');setDate(r.data);setDetail(r.id);setForm(r.id);}
 return <div className="layout">
  <aside><Marca/><button className="secondary mobile-menu" aria-expanded={menu} onClick={()=>setMenu(!menu)}>Menu {menu?'▴':'▾'}</button>
   <nav className={menu?'nav open':'nav'} aria-label="Menu principal">
    {tabs.map((t,i)=><button key={t} aria-current={tab===t?'page':undefined} onClick={()=>selectTab(t)}><span>0{i+1}</span>{t}</button>)}
    <button onClick={()=>void client.auth.signOut().then(({error})=>{if(error)setError('Não foi possível sair. Tente novamente.');})}>Sair</button>
   </nav>
  </aside>
  <main className="content">
   <header className="page-head"><p className="eyebrow">GESTÃO DE LOCAÇÕES</p><h1>{form?(form==='novo'?'Criar reserva':'Editar reserva'):detail&&tab==='Reservas'?'Detalhes da reserva':prices?'Configurar preços':tab}</h1>
    <p className="muted">{tab==='Reservas'?'Agenda de eventos e cadastro de clientes.':tab==='Entregas'?'Organize as paradas e acompanhe cada entrega.':'Acompanhe o valor dos materiais locados.'}</p>
   </header>
   {error&&<p className="error mb-4" role="alert">{error}</p>}
   {loading&&<p role="status">Carregando dados…</p>}
{config && tab === 'Reservas' && (form ? (
  <>
    

    <FormReserva
      key={form}
      date={date}
      historico={rows}
      current={rows.find(r => r.id === form)}
      config={config}
      save={save}
      close={() => setForm(undefined)}
    />
  </>
) :    prices?<form className="card" onSubmit={e=>configure(e,'prices')}><h2>Preços unitários</h2><p className="muted">Os novos valores se aplicam às próximas reservas.</p><div className="fields">{items.map(i=><label key={i.price}>{i.label} (R$)<input name={i.price} required inputMode="decimal" defaultValue={(config[i.price]/100).toFixed(2).replace('.',',')}/></label>)}</div><div className="flex flex-wrap gap-2 mt-4"><button className="primary" disabled={changing}>Salvar preços</button><button type="button" className="secondary" onClick={()=>setPrices(false)}>Voltar</button></div></form>:
    current?<section className="card detail"><button className="secondary mb-4" onClick={()=>setDetail(undefined)}>‹ Voltar à agenda</button>
     <p className="eyebrow">RESERVA Nº {current.numero} · {current.status.toUpperCase()}</p><h2>{current.nome}</h2>
     <p>{dia(current.data)} às {current.horario.slice(0,5)} · Entrega {entregaLabel[current.entrega].toLowerCase()}</p>
     <a className="link" href={'tel:'+current.telefone}>{current.telefone}</a>
     {current.telefone_extra&&<p>Contato adicional: {[current.telefone_extra,current.contato,current.parentesco].filter(Boolean).join(' · ')}</p>}
     {current.instagram&&<p>Instagram: {current.instagram}</p>}
     <p className="mt-3">{endereco(current)}</p><p>{[current.complemento,current.condominio,current.apartamento&&'Apto '+current.apartamento].filter(Boolean).join(' · ')}</p>
     {current.referencia&&<p>Referência: {current.referencia}</p>}
     <Quantidades r={current}/>
     <dl className="summary"><div><dt>Subtotal da locação</dt><dd>{moeda(current.subtotal)}</dd></div><div><dt>Frete</dt><dd>{moeda(current.frete)}</dd></div><div className="font-bold"><dt>Total da reserva</dt><dd>{moeda(current.total)}</dd></div></dl>
     <div className="flex gap-2 flex-wrap mt-4"><button className="primary" onClick={()=>void share(current)}>Enviar reserva</button><button className="secondary" onClick={()=>comprovante(current).save(fileName(current))}>Baixar PDF</button>
      {current.status==='ativa'&&<><button className="secondary" onClick={()=>setForm(current.id)}>Editar reserva</button><button className="danger" disabled={changing} onClick={()=>{if(confirm('Cancelar esta reserva e retirá-la do Financeiro?'))void update(current,{status:'cancelada'});}}>Cancelar reserva</button></>}
     </div></section>:
    <><div className="actions"><button className="primary" onClick={()=>setForm('novo')}>＋ Criar reserva</button><button className="secondary" onClick={()=>setPrices(true)}>Configurar preços</button><button type="button" className="secondary" aria-expanded={estoqueAberto} onClick={()=>setEstoqueAberto(aberto=>!aberto)}>Estoque</button><button className="secondary" onClick={()=>setDate(now())}>Hoje</button></div>
     {estoqueAberto && (
      <section className="card mb-4">
       <h2>Estoque</h2>
       <p className="muted">Cada conjunto usa 1 mesa e 4 cadeiras.</p>
       <form key={mesasTotais + ':' + cadeirasTotais} onSubmit={e => configure(e, 'estoque')}>
        <div className="fields">
         <label>Total de mesas
          <input name="estoque_mesas" type="number" min={0} max={2147483647} step={1} required defaultValue={mesasTotais}/>
         </label>
         <label>Total de cadeiras
          <input name="estoque_cadeiras" type="number" min={0} max={2147483647} step={1} required defaultValue={cadeirasTotais}/>
         </label>
        </div>
        <button type="submit" className="primary mt-3" disabled={changing}>
         {changing ? 'Salvando…' : 'Salvar estoque'}
        </button>
       </form>
      </section>
     )}
     <section className="card mb-4" aria-live="polite">
      <h2>Disponibilidade em {dia(date, { dateStyle: 'short' })}</h2>
      <p>{mesasDisponiveis} mesa(s) · {cadeirasDisponiveis} cadeira(s) · {conjuntosDisponiveis} conjunto(s)</p>
      {mesasDisponiveis === 0 && cadeirasDisponiveis === 0
       ? <p className="error mt-2">Estoque esgotado para esta data.</p>
       : conjuntosDisponiveis === 0 && <p className="muted">Conjuntos esgotados. Confira as peças avulsas acima.</p>}
     </section>
     <div className="columns"><Calendario date={date} setDate={setDate} reservas={rows}/><section className="card"><h2 className="capitalize">{dia(date,{weekday:'long',day:'numeric',month:'long'})}</h2>
      <p className="muted">{daily.length} {daily.length===1?'reserva':'reservas'}</p>
      {!daily.length&&<p className="empty">Nenhuma reserva para este dia.</p>}
      {daily.map(r=><article className="entry" key={r.id}><div className="split"><strong>{r.nome}</strong><strong>{moeda(r.total)}</strong></div><p className="muted">{r.horario.slice(0,5)} · {r.status==='cancelada'?'Reserva cancelada':'Entrega '+entregaLabel[r.entrega].toLowerCase()}</p><Quantidades r={r}/><button className="secondary" onClick={()=>setDetail(r.id)}>Ver reserva</button></article>)}
     </section></div></>)}
   {config&&tab==='Entregas'&&<div className="columns">
    <div className="space-y-4"><Calendario date={date} setDate={setDate} reservas={rows}/><form className="card" onSubmit={e=>configure(e,'saida')}>
     <label>Endereço de saída<input key={config.saida} name="saida" defaultValue={config.saida} placeholder="Rua, número, cidade e CEP" maxLength={240}/></label><button className="secondary mt-3" disabled={changing}>Salvar saída</button>
    </form></div>
    <div className="space-y-4"><Mapa reservas={deliveries} saida={config.saida} onParadas={setParadas}/>
     <section className="card"><h2>Entregas de {dia(date)}</h2>
      {!deliveries.length&&<p className="empty">Nenhuma entrega para este dia.</p>}
<DndContext
  sensors={sensoresEntrega}
  collisionDetection={closestCenter}
  onDragEnd={({ active, over }) => {
    if (!over || active.id === over.id) return;

    const de = idsDasEntregas.indexOf(String(active.id));
    const para = idsDasEntregas.indexOf(String(over.id));
    if (de < 0 || para < 0) return;

    setOrdemManual(anterior => ({
      ...anterior,
      [date]: arrayMove(idsDasEntregas, de, para),
    }));
  }}
>
  <SortableContext
    items={idsDasEntregas}
    strategy={verticalListSortingStrategy}
  >
    {entregasOrdenadas.map(({ reserva: r, invalido }, i) => (
      <EntregaMovel key={r.id} id={r.id}>       <div className="split"><strong><span className="number">{i+1}</span> {r.nome}</strong><span className="chip">{entregaLabel[r.entrega]}</span></div>
       <p>{endereco(r)}</p><p>{[r.complemento,r.condominio,r.apartamento&&'Apto '+r.apartamento].filter(Boolean).join(' · ')}</p>
{r.referencia && <p>Referência: {r.referencia}</p>}
<p>Festa às {r.horario.slice(0, 5)}</p>
<p>Contato: {r.telefone}</p>

<div className="my-3 flex flex-wrap gap-2">
  <a
    className="primary"
    href={`https://wa.me/${r.telefone.replace(/\D/g, '').replace(/^(\d{10,11})$/, '55$1')}`}
    target="_blank"
    rel="noopener noreferrer"
  >
    WhatsApp
  </a>

  <a
    className="secondary"
    href={`tel:${r.telefone.trim().replace(/[^\d+]/g, '')}`}
  >
    Ligar
  </a>
</div>       {invalido&&<p className="error mt-2">Endereço não localizado. <button className="link" onClick={()=>editDelivery(r)}>Corrigir endereço</button></p>}
       <Quantidades r={r}/><div className="flex flex-wrap gap-2">
        <a className="secondary" target="_blank" rel="noreferrer" href={'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination='+encodeURIComponent(endereco(r))}>Abrir no Google Maps</a>
        {r.entrega==='pendente'&&<button className="primary" disabled={changing} onClick={()=>void update(r,{entrega:'concluida'})}>Marcar como concluída</button>}
        {r.entrega!=='cancelada'&&<button className="danger" disabled={changing} onClick={()=>{if(confirm('Cancelar esta entrega? A reserva continuará ativa.'))void update(r,{entrega:'cancelada'});}}>Cancelar entrega</button>}
               </div>
      </EntregaMovel>
    ))}
  </SortableContext>
</DndContext>
     </section></div></div>}
   {config&&tab==='Financeiro'&&<section className="card">
    <div className="fields mt-0"><label>Período<select value={period} onChange={e=>setPeriod(e.target.value)}>{['dia','semana','mês'].map(p=><option key={p} value={p}>{p[0].toUpperCase()+p.slice(1)}</option>)}</select></label><label>Data de referência<input type="date" value={financeDate} onChange={e=>{if(e.target.value)setFinanceDate(e.target.value);}}/></label></div>
    <div className="kpi"><p>Valor de locações no período</p><strong>{moeda(financial.reduce((sum,r)=>sum+r.subtotal,0))}</strong><p>{financial.length} {financial.length===1?'reserva considerada':'reservas consideradas'}</p></div>
    <h2>Reservas do período</h2>
    {!financial.length&&<p className="empty">Nenhuma locação neste período.</p>}
    {financial.map(r=><article className="entry split" key={r.id}><div><strong>{r.nome}</strong><p className="muted">#{r.numero} · {dia(r.data,{dateStyle:'short'})}</p></div><strong>{moeda(r.subtotal)}</strong></article>)}
   </section>}
  </main>
 </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
