export const items = [
 { qty: 'conjuntos', price: 'conjunto', label: 'Conjuntos' },
 { qty: 'mesas', price: 'mesa', label: 'Mesas avulsas' },
 { qty: 'cadeiras', price: 'cadeira', label: 'Cadeiras avulsas' },
] as const;
export type Config = {
  conjunto: number;
  mesa: number;
  cadeira: number;
  saida: string;
  estoque_mesas?: number;
  estoque_cadeiras?: number;
};
export const empty = {
 nome:'', telefone:'', telefone_extra:'', contato:'', parentesco:'', instagram:'',
 cep:'', rua:'', numero_endereco:'', bairro:'', cidade:'', uf:'', complemento:'',
 condominio:'', apartamento:'', referencia:'', conjuntos:0, mesas:0, cadeiras:0,
 data:'', horario:'', frete:0,
};
export type Draft = typeof empty;
export type Reserva = Draft & {
 id:string; numero:number; preco_conjunto:number; preco_mesa:number; preco_cadeira:number;
 subtotal:number; total:number; status:'ativa'|'cancelada'; entrega:'pendente'|'concluida'|'cancelada';
};
export const moeda = (cents:number) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
export const iso = (date:Date) => new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Recife',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export const dia = (date:string, options:Intl.DateTimeFormatOptions={dateStyle:'long'}) =>
 new Intl.DateTimeFormat('pt-BR',{...options,timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
export function deslocar(date:string, days:number) {
 const d = new Date(date+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10);
}
export const semana = (date:string) => (new Date(date+'T12:00:00Z').getUTCDay()+6)%7;
export const endereco = (r:Draft) => [r.rua+' '+r.numero_endereco,r.bairro,r.cidade+' - '+r.uf,r.cep,'Brasil'].join(', ');
export const entregaLabel = {pendente:'Pendente',concluida:'Concluída',cancelada:'Cancelada'};
export const valores = (r:Reserva):Config => ({conjunto:r.preco_conjunto,mesa:r.preco_mesa,cadeira:r.preco_cadeira,saida:''});
export const observacoes = [
 'A entrega e a retirada são feitas apenas até onde o carro tiver acesso.',
 'Não subimos escadas, não fazemos entregas em ladeiras sem acesso de carro e não levamos o material até o apartamento.',
 'Em prédios e condomínios, o material fica no térreo ou na portaria, tanto na entrega quanto na retirada.',
];
