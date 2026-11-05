# Seu Lima Locações

Sistema interno de reservas, entregas e acompanhamento do valor de locações. Interface React em TypeScript e Tailwind CSS, executada e compilada com Node.js e Vite. O Supabase fornece autenticação, banco e validação dos valores no servidor.

## Configurar o Supabase

1. Crie um projeto no Supabase e execute `supabase/migrations/001_reservas.sql` no SQL Editor do projeto. Execute a migração uma vez, em um banco novo.
2. Em **Authentication → Users**, crie as contas da equipe. Desative novos cadastros públicos nas configurações de autenticação.
3. Para cada usuário autorizado, copie seu UUID e execute no SQL Editor:

   ```sql
   insert into public.equipe (user_id) values ('UUID-DO-USUARIO');
   ```

   Para revogar o acesso aos dados, remova o UUID da tabela `equipe`. As políticas RLS exigem vínculo com a equipe mesmo para usuários autenticados.
4. Copie `.env.example` para `.env.local`. Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com a URL do projeto e sua chave publicável. Use somente chaves publicáveis no navegador.

## Configurar o Google Maps

1. No Google Cloud, selecione um projeto com faturamento ativo. Ative **Maps JavaScript API**, **Geocoding API** e **Routes API**.
2. Crie uma chave com restrição de sites (HTTP referrers). Autorize `http://localhost:5173/*` para desenvolvimento e o domínio HTTPS da publicação para produção. Restrinja a chave às APIs listadas acima.
3. Preencha `VITE_GOOGLE_MAPS_KEY` e, na aba Entregas, salve o endereço de saída com número, cidade, estado e CEP.
4. O mapa geocodifica os endereços da agenda. A ordem sugerida usa a distância de carro a cada nova parada pendente. Entregas concluídas ou canceladas ficam no histórico da lista. Endereços sem correspondência podem ser corrigidos na reserva. Sem a chave, a lista e os links de navegação continuam disponíveis.

A ordenação consulta as rotas entre a parada atual e as restantes. O número de consultas cresce com a quantidade de paradas. Consulte a [documentação da biblioteca Routes](https://developers.google.com/maps/documentation/javascript/routes/overview).

## Rodar e publicar

Use Node.js 22 ou superior.

```bash
npm ci
npm run dev
```

Abra `http://localhost:5173`. No PowerShell, copie o ambiente com `Copy-Item .env.example .env.local`.

Para publicar, envie o código a um repositório Git e importe-o em um serviço de hospedagem com preset **Vite**. Cadastre as três variáveis do `.env.example` nas configurações do projeto, use `npm run build` como comando e `dist` como diretório de saída. Publique em HTTPS para habilitar o compartilhamento nativo nos navegadores compatíveis. Se mudar as variáveis, execute um novo build. O acesso aos dados depende do login e das políticas do Supabase.

## Conferência no celular

1. Entre com uma conta autorizada e verifique se Reservas abre no dia atual de Recife.
2. Em Configurar preços, cadastre conjunto a R$ 10,00, mesa avulsa a R$ 7,00 e cadeira avulsa a R$ 4,00.
3. Selecione uma data e crie uma reserva com 10 conjuntos e frete de R$ 50,00. O formulário, a reserva salva e o PDF devem mostrar subtotal de R$ 100,00 e total de R$ 150,00.
4. Toque em Enviar reserva e confira as opções de compartilhamento do aparelho. Teste também Baixar PDF e leia as três observações de entrega.
5. Em Entregas, selecione o dia do evento. Confira o endereço, a numeração, a navegação no Google Maps e marque a entrega como concluída.
6. No Financeiro, selecione o dia do evento. A reserva deve contribuir com R$ 100,00 em materiais. Cancelar somente a entrega preserva essa contribuição. Cancelar a reserva remove o valor do Financeiro.
7. Mude o preço unitário e abra a reserva anterior. Confira que o preço aplicado permaneceu o mesmo. Ao editar a data, confira a mudança no calendário.
