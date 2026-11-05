begin;
create table public.equipe (user_id uuid primary key references auth.users on delete cascade);
alter table public.equipe enable row level security;
create policy proprio on public.equipe for select to authenticated using (user_id = auth.uid());
grant select on public.equipe to authenticated;

create table public.configuracao (
 id int primary key check(id=1), conjunto int not null default 1000 check(conjunto>=0),
 mesa int not null default 700 check(mesa>=0), cadeira int not null default 400 check(cadeira>=0),
 saida text not null default ''
);
insert into public.configuracao(id) values(1);

create table public.reservas (
 id uuid primary key default gen_random_uuid(), numero bigint generated always as identity unique,
 nome text not null check(length(trim(nome))>0), telefone text not null check(length(trim(telefone))>0),
 telefone_extra text not null default '', contato text not null default '', parentesco text not null default '', instagram text not null default '',
 cep text not null check(cep ~ '^[0-9]{5}-?[0-9]{3}$'), rua text not null check(length(trim(rua))>0),
 numero_endereco text not null check(length(trim(numero_endereco))>0), bairro text not null check(length(trim(bairro))>0),
 cidade text not null check(length(trim(cidade))>0), uf text not null check(uf in ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
 complemento text not null default '', condominio text not null default '', apartamento text not null default '', referencia text not null default '',
 conjuntos int not null check(conjuntos between 0 and 100000), mesas int not null check(mesas between 0 and 100000),
 cadeiras int not null check(cadeiras between 0 and 100000),
 data date not null, horario time not null,
 frete int not null check(frete>=0),
 preco_conjunto int not null, preco_mesa int not null, preco_cadeira int not null,
 subtotal bigint generated always as (conjuntos::bigint*preco_conjunto + mesas::bigint*preco_mesa + cadeiras::bigint*preco_cadeira) stored,
 total bigint generated always as (conjuntos::bigint*preco_conjunto + mesas::bigint*preco_mesa + cadeiras::bigint*preco_cadeira + frete) stored,
 status text not null default 'ativa' check(status in ('ativa','cancelada')),
 entrega text not null default 'pendente' check(entrega in ('pendente','concluida','cancelada')),
 check(conjuntos+mesas+cadeiras>0)
);
create index reservas_data on public.reservas(data, horario);
create function public.aplicar_precos() returns trigger language plpgsql set search_path = '' as $$
begin
 if tg_op = 'INSERT' then
  select conjunto, mesa, cadeira into strict new.preco_conjunto, new.preco_mesa, new.preco_cadeira
  from public.configuracao where id=1;
  new.status := 'ativa';
  new.entrega := 'pendente';
 else
  if old.status = 'cancelada' then raise exception 'Reserva já cancelada'; end if;
  new.preco_conjunto := old.preco_conjunto;
  new.preco_mesa := old.preco_mesa;
  new.preco_cadeira := old.preco_cadeira;
  if new.status='cancelada' and old.entrega='pendente' then new.entrega := 'cancelada'; end if;
 end if;
 return new;
end;
$$;
create trigger aplicar_precos before insert or update on public.reservas for each row execute function public.aplicar_precos();
alter table public.reservas enable row level security;
alter table public.configuracao enable row level security;
revoke all on public.equipe, public.reservas, public.configuracao from anon, authenticated;
grant select on public.equipe to authenticated;
grant select, insert, update on public.reservas to authenticated;
grant usage on sequence public.reservas_numero_seq to authenticated;
grant select, update on public.configuracao to authenticated;
create policy equipe_reservas on public.reservas for all to authenticated
 using (exists(select 1 from public.equipe where user_id=auth.uid()))
 with check (exists(select 1 from public.equipe where user_id=auth.uid()));
create policy equipe_config on public.configuracao for all to authenticated
 using (exists(select 1 from public.equipe where user_id=auth.uid()))
 with check (exists(select 1 from public.equipe where user_id=auth.uid()));
commit;
