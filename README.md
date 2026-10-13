# Donato | Controle de Ativos

Aplicação web para registrar entregas e devoluções de equipamentos, acompanhar inspeções e manter histórico operacional e administrativo. O frontend usa React, TypeScript, Vite e Three.js. A API usa Express, TypeScript e PostgreSQL no AWS RDS, com o driver `pg`.

## Funcionalidades

- Login e criação de contas com autenticação no backend e tokens JWT.
- Criação automática da conta administradora configurada ao iniciar o backend.
- Cadastro de equipamento, patrimônio, número de série, modelo, marca, responsável, e-mail e setor.
- Inspeção interativa de notebooks, desktops, celulares e monitores, com observações para itens danificados.
- Histórico de entregas pesquisável, filtros por situação/danos, consulta de detalhes e impressão.
- Registro de devolução e comparação das condições da entrega e da devolução.
- Exclusão permitida apenas ao administrador, com confirmação e auditoria no PostgreSQL.
- Tela administrativa para consultar entregas excluídas e o snapshot arquivado.
- Troca da senha do usuário autenticado sem solicitar a senha anterior; nova senha com pelo menos 8 caracteres.
- Layout responsivo para desktop e celular.

## Requisitos

- Node.js 20.19+ ou 22.12+ e npm (requisitos do Vite 8).
- PostgreSQL/RDS acessível na porta 5432, com certificado CA válido. A auditoria e a exclusão são confirmadas na mesma transação SQL.

## Instalação

Na raiz do projeto, instale as dependências do frontend e do backend:

```sh
npm install
npm --prefix server install
```

Crie `server/.env` a partir do exemplo. No PowerShell:

```powershell
Copy-Item server/.env.example server/.env
```

Em macOS/Linux, use `cp server/.env.example server/.env`. Edite o arquivo e configure:

| Variável | Descrição |
| --- | --- |
| `PORT` | Porta da API; padrão `5000`. |
| `PGHOST`, `PGPORT` | Endpoint do RDS e porta; padrão `5432`. |
| `PGDATABASE` | Banco PostgreSQL, configurado como `inventorycontrol`. |
| `PGUSER`, `PGPASSWORD` | Credenciais PostgreSQL, somente no backend. |
| `PGSSLROOTCERT` | Caminho do certificado CA relativo a `server`, por exemplo `certs/global-bundle.pem`. |
| `JWT_SECRET` | Segredo aleatório obrigatório, com pelo menos 32 caracteres. |
| `ADMIN_EMAIL` | E-mail da conta administradora inicial. |
| `ADMIN_PASSWORD` | Senha inicial exclusiva, com pelo menos 12 caracteres. |
| `ADMIN_NAME` | Nome da conta administradora. |

Configure o acesso de rede ao RDS para o servidor da API. A conexão exige TLS e verifica a CA e o nome do servidor. O certificado público da AWS está em `server/certs/global-bundle.pem`. Não use placeholders, credenciais de exemplo ou segredos padrão em produção. `server/.env` é local e não deve ser enviado ao repositório.

No modo local, o servidor cria o administrador configurado na primeira inicialização. Se já existir uma conta com `ADMIN_EMAIL`, o seed garante a role `admin`, mas não substitui a senha existente. Não há segredo JWT nem senha administrativa padrão. O servidor recusa configurações ausentes, curtas ou com placeholders e só inicia após conectar ao banco, verificar as tabelas e inicializar os contadores de protocolo. `ADMIN_NAME` permanece opcional. No modo Microsoft, as credenciais locais não são exigidas.

## Recuperar o acesso administrativo

Se a conta administradora já existe, alterar `ADMIN_PASSWORD` no `.env` não altera sua senha no banco. Na pasta `server`, execute `npm run admin:check` para verificar se a senha configurada corresponde à salva. Para aplicar explicitamente a senha atual do `.env` à conta indicada por `ADMIN_EMAIL`, execute `npm run admin:reset`. Esses comandos exigem acesso ao PostgreSQL e não exibem credenciais. O reset altera somente a senha dessa conta, preservando usuários, entregas e auditorias.

## Executar em desenvolvimento

Abra dois terminais na raiz. Inicie a API em um deles:

```sh
npm run server
```

Inicie o frontend no outro:

```sh
npm run dev
```

Abra a URL exibida pelo Vite, normalmente `http://localhost:5173`. O proxy do Vite encaminha chamadas `/api` para `http://localhost:5000`. Se alterar `PORT`, atualize o destino do proxy em `vite.config.ts`.

A rota de saúde fica em `http://localhost:5000/api/health`. O terminal do backend mostra o resultado da conexão PostgreSQL e, no modo local, do seed do administrador.

## Uso e permissões

- As contas criadas pela tela de cadastro recebem role `operator`.
- A role `admin` é atribuída pelo seed do servidor, não pelo prefixo do e-mail informado no navegador.
- Todas as rotas de entregas exigem JWT válido no backend. A exclusão e a consulta da auditoria exigem também a role `admin`. Sessões expiradas retornam à tela de login.
- Operadores não podem excluir entregas nem consultar a auditoria de excluídos.
- Administradores podem excluir entregas e acessar **Excluídas**. O servidor valida a role nas duas operações, independentemente do que a interface exibe.
- A troca de senha exige sessão autenticada; a senha anterior não é solicitada.

## API

Todas as rotas têm o prefixo `/api`. Os endpoints marcados como autenticados ou admin esperam o cabeçalho `Authorization: Bearer <token>`.

| Método | Caminho | Acesso | Descrição |
| --- | --- | --- | --- |
| `GET` | `/health` | Público | Verifica a disponibilidade da API. |
| `POST` | `/auth/register` | Público | Cria uma conta de operador. |
| `POST` | `/auth/login` | Público | Autentica e retorna JWT. |
| `GET` | `/auth/me` | Autenticado | Consulta o perfil. |
| `PATCH` | `/auth/password` | Autenticado | Altera a senha do próprio usuário. |
| `GET` | `/deliveries` | Autenticado | Lista entregas; aceita `?status=entregue`, `em_posse` ou `devolvido`. |
| `GET` | `/deliveries/next-protocol` | Autenticado | Mostra uma previsão do próximo protocolo, sem reservá-lo. |
| `GET` | `/deliveries/:id` | Autenticado | Consulta uma entrega. |
| `POST` | `/deliveries` | Autenticado | Cria uma entrega com inspeção completa; o servidor atribui o protocolo. |
| `PUT` | `/deliveries/:id/return` | Autenticado | Valida as peças da entrega e registra uma única devolução; repetição retorna 409. |
| `DELETE` | `/deliveries/:id` | Admin | Registra a auditoria e exclui a entrega na mesma transação. |
| `GET` | `/deliveries/deleted` | Admin | Lista snapshots e dados de auditoria. |

## Organização dos arquivos

```text
.
├── public/                       # Arquivos servidos diretamente pelo Vite
├── src/
│   ├── app/                       # Composição principal e navegação
│   ├── components/                # Componentes reutilizáveis e modelo 3D
│   ├── domain/                    # Tipos e acesso às regras compartilhadas
│   ├── hooks/                     # Estado e operações de entregas
│   ├── pages/                     # Login, entregas e auditoria
│   ├── services/                  # Chamadas HTTP e autenticação
│   ├── styles/                    # Estilos globais e por tela
│   └── main.tsx                   # Entrada React
├── server/src/
│   ├── config/                    # Conexão PostgreSQL e seed do admin
│   ├── controllers/               # Lógica dos endpoints
│   ├── middleware/                # Autenticação e autorização
│   ├── models/                    # Modelos PostgreSQL
│   ├── routes/                    # Rotas Express
│   └── server.ts                  # Inicialização da API
├── index.html
├── package.json                  # Dependências e scripts do frontend
└── README.md
```

O PostgreSQL armazena usuários, entregas, reservas, contadores anuais e auditorias em tabelas no schema `checklist_donato`. IDs de documentos antigos continuam como texto, preservando referências e sessões. Cada nova auditoria inclui o snapshot integral da entrega, o ID/e-mail do administrador e o timestamp. Registros de auditoria criados por versões anteriores podem conter somente os campos disponíveis à época.

## Login corporativo com Microsoft Entra ID

A integração está implementada e é ativada por `AUTH_PROVIDER=microsoft` na API e `VITE_AUTH_PROVIDER=microsoft` no frontend. O modo padrão continua sendo `local` até você preencher os IDs dos aplicativos. No modo Microsoft, o site usa MSAL com autorização por código e PKCE; a API verifica os tokens com as chaves públicas da Microsoft. Nenhum segredo de aplicativo é necessário para este fluxo.

O modo Microsoft não cria usuários no banco, não inicializa o administrador local e bloqueia cadastro, login por senha e alteração de senha. As entregas usam o PostgreSQL/RDS configurado. As auditorias guardam a identidade estável `tenantId:objectId` e o identificador de exibição do autor. Usuários locais migrados não são removidos automaticamente.

### 1. Confirmar a identidade corporativa

Acesse [Microsoft Entra admin center](https://entra.microsoft.com/) com uma conta autorizada a registrar e administrar aplicativos. Confirme que os usuários aparecem no diretório da empresa. Se as contas existem apenas no Active Directory local, o administrador precisa configurar a identidade híbrida antes desta integração; veja [Microsoft Entra Connect e entrada de usuários](https://learn.microsoft.com/en-us/entra/identity/hybrid/connect/plan-connect-user-signin).

### 2. Registrar o aplicativo da API

Em **Entra ID > Registros de aplicativos > Novo registro**, crie **Donato Checklist API**. Selecione **Contas somente neste diretório organizacional**. Não cadastre URI de redirecionamento para a API. Na visão geral, copie o **ID do diretório (tenant)** e o **ID do aplicativo (cliente)** da API. Use os IDs de aplicativo, e não os IDs de objeto.

Em **Expor uma API**, configure a URI como `api://ID_DO_APLICATIVO_API`. Adicione um escopo chamado `access_as_user`, habilitado, com consentimento permitido a **somente administradores**. Os textos de exibição podem ser “Acessar o Checklist Donato” e “Permite usar o checklist em nome do usuário conectado”.

Em **Manifesto**, configure `api.requestedAccessTokenVersion` como `2`. Edite apenas essa propriedade dentro do objeto `api`, preservando os escopos e demais propriedades existentes. A API deste projeto aceita tokens v2. Veja [configuração da API protegida](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-protected-web-api-app-configuration) e a propriedade [requestedAccessTokenVersion](https://learn.microsoft.com/en-us/entra/identity-platform/reference-app-manifest#requestedaccesstokenversion-attribute).

### 3. Criar funções e autorizar usuários

No registro **Donato Checklist API**, abra **Funções de aplicativo (App roles)** e crie duas funções habilitadas, com tipo de membro permitido **Usuários/Grupos**:

| Nome de exibição | Valor exato | Acesso |
| --- | --- | --- |
| Operador | `operator` | Consultar somente entregas destinadas ao e-mail da conta autenticada. |
| Administrador | `admin` | Consultar todas as entregas, cadastrar, registrar devoluções, excluir e consultar auditorias. |

Em **Aplicativos empresariais > Donato Checklist API > Usuários e grupos**, adicione cada usuário e selecione sua função. Atribua funções no aplicativo **API**, pois são elas que precisam chegar no token de acesso. Usuários sem uma dessas funções são recusados pelo backend. Quando as duas estão presentes, prevalece `admin`.

Em **Propriedades**, configure **Atribuição necessária? = Sim** para a API. Você pode começar com atribuições individuais. Se usar grupos, confirme com o administrador as licenças necessárias. Veja [atribuição de funções de aplicativo](https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-app-roles-in-apps).

### 4. Registrar o aplicativo do site

Crie outro registro chamado **Donato Checklist Web**, também somente para contas do diretório da empresa. Copie o **ID do aplicativo (cliente)** do Web.

Em **Autenticação > Adicionar uma plataforma > Aplicativo de página única (SPA)**, adicione:

- Desenvolvimento: `http://localhost:5173/redirect.html`.
- Produção: `https://SEU_DOMINIO/redirect.html`, substituindo pelo endereço real do site.

Protocolo, domínio, porta e caminho precisam corresponder ao endereço usado no navegador. O Vite está configurado com porta fixa 5173. A página `redirect.html` é incluída no build. Não ative o fluxo implícito e não crie um client secret para o frontend. Veja [configuração de SPA](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-spa-app-configuration).

Em **Permissões de API > Adicionar uma permissão > Minhas APIs**, selecione **Donato Checklist API > Permissões delegadas > access_as_user**. Adicione e solicite ao administrador **Conceder consentimento de administrador** para a organização. Não é necessário pedir acesso ao Microsoft Graph para este login. Veja [configuração de permissões de API](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-configure-app-access-web-apis).

Se ativar **Atribuição necessária? = Sim** também no aplicativo empresarial Web, atribua os usuários a ele com acesso padrão. Isso é separado das funções atribuídas na API.

### 5. Configurar o projeto

Crie ou edite `.env` na raiz com os valores do portal:

```dotenv
VITE_AUTH_PROVIDER=microsoft
VITE_ENTRA_TENANT_ID=ID_DO_DIRETORIO
VITE_ENTRA_CLIENT_ID=ID_DO_APLICATIVO_WEB
VITE_ENTRA_API_CLIENT_ID=ID_DO_APLICATIVO_API
```

Em `server/.env`, mantenha a configuração real do banco e da porta e acrescente:

```dotenv
AUTH_PROVIDER=microsoft
ENTRA_TENANT_ID=ID_DO_DIRETORIO
ENTRA_CLIENT_ID=ID_DO_APLICATIVO_WEB
ENTRA_API_CLIENT_ID=ID_DO_APLICATIVO_API
```

Os valores dos três IDs devem ser GUIDs reais. `JWT_SECRET`, `ADMIN_EMAIL` e `ADMIN_PASSWORD` são usados somente no modo local; não são exigidos no modo Microsoft. As variáveis `VITE_*` são públicas e entram no build. Reinicie o Vite ao editar o ambiente; em produção, gere e publique um novo build do frontend. Reinicie também a API.

Na raiz do projeto, em dois terminais:

```powershell
npm run server
```

```powershell
npm run dev
```

Abra `http://localhost:5173` e clique em **Entrar com Microsoft**. Permita a janela de login. O perfil mostrado vem de `/api/auth/me`, após validação no servidor. Tokens são renovados silenciosamente pelo MSAL; quando for necessária uma nova interação, o site volta ao login.

### 6. Publicar e validar

Publique o frontend e a página `redirect.html` no mesmo domínio. A hospedagem deve servir `/redirect.html` como arquivo real, sem substituir pelo `index.html`. Configure nessa página **Cache-Control: no-store** e remova **Cross-Origin-Opener-Policy**. Sirva os scripts do build no mesmo domínio. A página de retorno usa o redirect bridge exigido pelo MSAL Browser v5; veja [instruções oficiais para Vite e hospedagem](https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-browser/docs/redirect-bridge.md).

Use HTTPS em produção e encaminhe `/api` para o Express. O backend precisa alcançar os endpoints Microsoft para consultar as chaves públicas. O sistema pode permanecer hospedado na AWS.

Confira com contas de teste:

- Operador entra em “Minhas entregas” e consulta somente os equipamentos destinados ao e-mail da conta. Pode ver detalhes e imprimir, mas não cadastrar, registrar devoluções, excluir nem consultar auditorias.
- Administrador entra, exclui uma entrega e a auditoria contém sua identidade corporativa.
- Usuário sem função e conta de outra organização não acessam a API.
- Atualizar a página mantém a sessão; sair retorna ao login.
- Cadastro local, login por senha e alteração de senha são recusados no modo Microsoft.

Erros comuns: `AADSTS50011` indica divergência da URI de retorno; consentimento pendente exige aprovação do administrador; erro 403 de função exige atribuição no aplicativo empresarial **API**; erro 401 pode indicar tokens v1, IDs incorretos ou token expirado. Após alterar funções, saia e entre novamente para obter um token novo. Mudanças de acesso podem levar tempo para aparecer nos tokens já emitidos.

Os testes automatizados verificam assinaturas, expiração, emissor, destinatário, tenant, aplicativo cliente, escopo, funções e bloqueio das rotas locais. A validação de login real, MFA e políticas corporativas deve ser feita no tenant da empresa.

## Comandos

O formulário exige CPF válido do responsável nas novas entregas. A API grava `recipientCpf` como uma string com 11 dígitos, preservando zeros iniciais, e o termo exibe a máscara `000.000.000-00`. O termo de empréstimo não inclui a seção “Itens conferidos”; os detalhes da inspeção continuam disponíveis na tela da entrega.

O backend usa PostgreSQL/RDS. Entregas antigas sem CPF podem ser consultadas, devolvidas e arquivadas normalmente. O snapshot de exclusão preserva o CPF quando ele existir.

Para PostgreSQL/RDS, `server/sql/001_checklist_schema.sql` inclui `recipient_cpf` nas instalações novas. Se as tabelas já existirem, execute na conexão PostgreSQL do projeto:

```sql
\set ON_ERROR_STOP on
\i server/sql/002_delivery_recipient_cpf.sql
```

Essa alteração adiciona a coluna no schema `checklist_donato`, aceita `NULL` nos registros antigos e exige 11 dígitos nos valores presentes. A API valida os dígitos verificadores. CPF não tem restrição de unicidade, pois uma pessoa pode receber vários equipamentos. A importação automática cria o schema completo com `001` e `003`; `002` serve apenas para instalações antigas sem a coluna de CPF.

Na raiz:

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Inicia Vite em desenvolvimento. |
| `npm run server` | Inicia a API com `tsx watch`. |
| `npm run build` | Verifica TypeScript e gera o frontend em `dist/`. |
| `npm run lint` | Executa Oxlint. |
| `npm run preview` | Serve localmente o build do frontend. |

Backend:

| Comando | Descrição |
| --- | --- |
| `npm --prefix server run dev` | Inicia a API com recarga automática. |
| `npm --prefix server run build` | Compila TypeScript para `server/dist/`. |
| `npm --prefix server start` | Executa o backend compilado após o build. |

## Assinatura presencial

Ao registrar uma nova entrega, a aplicação apresenta os dados e condições da inspeção e abre uma tela para o responsável desenhar sua assinatura com o mouse (ou toque). A confirmação exige assinatura não vazia e aceite dos dados. Voltar à conferência não grava a entrega. Se o servidor recusar a operação, o desenho permanece disponível para tentar novamente.

A devolução exige uma nova assinatura do responsável pelo recebimento no hospital, identificado na tela. A inspeção e a assinatura são salvas juntas; a devolução só é concluída após a resposta da API. A assinatura da entrega não é reutilizada para confirmar a devolução.

Os traços são armazenados como coordenadas, com nome do signatário, data do servidor, operador autenticado e hash dos dados da movimentação. A API exige assinaturas válidas nas novas entregas e devoluções, mesmo se a chamada não passar pela interface. Registros antigos permanecem consultáveis sem assinatura. O PDF mostra a assinatura da entrega no termo de responsabilidade e a assinatura de devolução nas duas vias, com ajuste para uma página A4.

## Reservas de equipamentos

O menu **Minhas reservas** permite solicitar notebook, desktop, celular ou monitor do mesmo catálogo utilizado nas conferências. O formulário informa nome, setor, finalidade e datas de início e fim. O e-mail é obtido da sessão autenticada, e toda solicitação nasce pendente. O usuário consulta somente suas reservas e pode cancelar solicitações pendentes ou aprovadas que ainda não tenham entrega vinculada.

O administrador não cria solicitações; acessa **Solicitações de reserva**, consulta todos os usuários, filtra por situação, busca por solicitante/equipamento e aprova pedidos pendentes com observação opcional ou os recusa com justificativa obrigatória, exibida ao solicitante. A API registra o administrador e a data da análise. Aprovação é uma autorização para o período solicitado; não atribui um patrimônio nem substitui a conferência e assinatura na retirada. O sistema ainda não possui inventário de disponibilidade para bloquear sobreposição de reservas.

Após aprovar, o sistema pergunta se deseja iniciar a conferência. O administrador também pode usar **Iniciar conferência** depois. Equipamento, solicitante, e-mail e setor são preenchidos e bloqueados para edição, com validação dos dados na API; os demais dados e a assinatura continuam obrigatórios. A entrega salva o identificador da reserva, e a reserva passa a mostrar o protocolo gerado. O vínculo e a entrega são gravados na mesma transação, impedindo entregas duplicadas ou o cancelamento de uma reserva já atendida.

As reservas são persistidas na tabela `checklist_donato.reservations` do PostgreSQL. A API autenticada disponibiliza `GET /api/reservations`, `POST /api/reservations` e `PATCH /api/reservations/:id`. O vínculo com a entrega usa uma transação SQL e um índice único para impedir duplicação. Reinicie o backend para carregar as novas rotas quando estiver executando o build compilado.

## Gravação e protocolos

Login, cadastro e gravações exigem conexão com a API. A interface aguarda confirmação do servidor e exibe erros sem simular sucesso local. Alterações rejeitadas não modificam o histórico. Dados antigos em `localStorage` não são apagados, mas não são carregados nem sincronizados automaticamente; exporte e confira esses registros antes de migrá-los para o banco.

Os protocolos são reservados por `INSERT ... ON CONFLICT DO UPDATE` atômico no PostgreSQL, por ano. Na inicialização, o contador considera os protocolos das entregas e dos snapshots de exclusão existentes, sem diminuir uma sequência já reservada. Exclusões não reutilizam números. Falhas após a reserva podem deixar lacunas na sequência. Protocolos enviados pelo cliente são ignorados.

O backend valida equipamento, peças únicas, inspeção completa e condições válidas. Na devolução, os IDs e as condições originais devem corresponder à entrega. Rótulos e condições da entrega são obtidos do registro original. Uma atualização condicional impede sobrescrever devoluções, inclusive em requisições simultâneas.

## Testes

Execute `npm --prefix server test` para as regressões de autenticação, configuração, inspeções, protocolos, gravações e tratamento de falhas da API. Por padrão, os testes de integração ficam desativados. Para habilitá-los, configure `TEST_POSTGRES=1` e as variáveis `PG*` de uma instância de testes. A suíte cria bancos exclusivos com prefixo `checklist_test_` e remove somente esses bancos ao final; o usuário precisa de permissão para criar bancos. `TEST_RDS_ENV` pode indicar um arquivo de configuração relativo a `server`, como `.env`; não é necessário duplicar a configuração em outro arquivo.

## Banco RDS e arquivo da migração

A migração de `checklist_donato` para `inventorycontrol` foi executada em 13/10/2026: 3 usuários, 5 entregas, 2 reservas, 1 auditoria e 1 contador. A verificação comparou 179 campos e os 12 documentos integrais. O projeto utiliza somente PostgreSQL/RDS. As dependências, credenciais e ferramentas da origem foram removidas após a migração.

Para verificar a conexão TLS, o banco configurado e as contagens atuais, sem alterar dados:

```powershell
npm --prefix server run db:check
```

O backend lê as variáveis `PG*` de `server/.env` e conecta exclusivamente ao PostgreSQL com validação do certificado. O frontend acessa `/api` e não recebe credenciais de banco nem mantém uma base alternativa de entregas. Na execução de desenvolvimento, o proxy do Vite encaminha essas chamadas para a API na porta 5000.

O backup, o relatório e uma cópia do importador foram arquivados fora do projeto em `../Backups Checklist/migracao-rds-2026-10-13/`. O backup da transferência está na subpasta `rds-2026-10-13T14-42-49.179Z/`. Esses arquivos não são utilizados pelo aplicativo. Os documentos originais também são preservados no RDS em `migration_source_documents`, com SHA-256. As tabelas operacionais mantêm IDs, hashes de senha, datas, inspeções, assinaturas e vínculos. Auditorias antigas incompletas exibem os dados históricos disponíveis.

Na implantação, instale as dependências do backend, gere o build e configure `PG*` e o certificado CA no servidor que hospeda a API. A troca feita nesta migração está no ambiente local do projeto; outras instâncias da API devem receber o mesmo código/configuração e ser reiniciadas. O certificado segue a [documentação TLS do RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.SSL.html).

Para recuperação histórica, `server.env.before.local` no arquivo externo preserva a configuração anterior. O aplicativo atual usa exclusivamente o RDS; retornar à versão anterior exige restaurar o código correspondente e reconciliar as movimentações feitas depois da migração.

## Segurança

- Não versione nem compartilhe `server/.env`, `PGPASSWORD`, backups ou `JWT_SECRET`.
- Use HTTPS, senha inicial exclusiva e segredo JWT aleatório em ambientes publicados.
- A operação de exclusão e a criação do registro de auditoria são atômicas; se uma falhar, nenhuma é confirmada.
- Proteções de interface não substituem validação no servidor. As operações administrativas validam a role `admin` na API.
