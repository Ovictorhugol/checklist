# Donato | Controle de Ativos

Aplicação web para registrar entregas e devoluções de equipamentos, acompanhar inspeções e manter histórico operacional e administrativo. O frontend usa React, TypeScript, Vite e Three.js. A API usa Express, TypeScript e PostgreSQL no AWS RDS, com o driver `pg`.

## Funcionalidades

- Login corporativo exclusivo com Microsoft Entra ID e permissões validadas no backend.
- Cadastro de equipamento, patrimônio, número de série, modelo, marca, responsável, e-mail e setor.
- Inspeção interativa de notebooks, desktops, celulares e monitores, com observações para itens danificados.
- Histórico de entregas pesquisável, filtros por situação/danos, consulta de detalhes e impressão.
- Registro de devolução e comparação das condições da entrega e da devolução.
- Exclusão permitida apenas ao administrador, com confirmação e auditoria no PostgreSQL.
- Tela administrativa para consultar entregas excluídas e o snapshot arquivado.
- Recuperação de entregas excluídas pelo administrador, preservando os dados originais e registrando a recuperação na auditoria.
- Layout responsivo para desktop e celular.

## Requisitos

- Node.js 22.12+ e npm (os testes usam mocks de módulos do Node).
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
| `ENTRA_TENANT_ID` | ID do diretório corporativo. |
| `ENTRA_API_CLIENT_ID` | ID do aplicativo API no Entra ID. |
| `ENTRA_CLIENT_ID` | ID do aplicativo Web autorizado. |
| `PGHOST`, `PGPORT` | Endpoint do RDS e porta; padrão `5432`. |
| `PGDATABASE` | Banco PostgreSQL, configurado como `inventorycontrol`. |
| `PGUSER`, `PGPASSWORD` | Credenciais PostgreSQL, somente no backend. |
| `PGSSLROOTCERT` | Caminho do certificado CA relativo a `server`, por exemplo `certs/global-bundle.pem`. |

Configure o acesso de rede ao RDS para o servidor da API. A conexão exige TLS e verifica a CA e o nome do servidor. O certificado público da AWS está em `server/certs/global-bundle.pem`. Não use placeholders, credenciais de exemplo ou segredos padrão em produção. `server/.env` é local e não deve ser enviado ao repositório.

Configure também os IDs `VITE_ENTRA_*` no `.env` da raiz, conforme a seção de login corporativo. Contas, senhas e funções de acesso são administradas no Microsoft Entra ID. O servidor valida os IDs do Entra e a configuração do banco antes de iniciar.

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

A rota de saúde fica em `http://localhost:5000/api/health`. O terminal do backend mostra o resultado da conexão PostgreSQL.

## Uso e permissões

- As funções `operator` e `admin` são atribuídas no aplicativo API do Microsoft Entra ID.
- Todas as rotas de entregas exigem token de acesso Microsoft válido no backend. A exclusão e a consulta da auditoria exigem também a role `admin`. Sessões expiradas retornam à tela de login.
- Operadores não podem excluir entregas nem consultar a auditoria de excluídos.
- Administradores podem excluir entregas e acessar **Excluídas**. O servidor valida a role nas duas operações, independentemente do que a interface exibe.

## API

Todas as rotas têm o prefixo `/api`. Os endpoints marcados como autenticados ou admin esperam o cabeçalho `Authorization: Bearer <token>`.

| Método | Caminho | Acesso | Descrição |
| --- | --- | --- | --- |
| `GET` | `/health` | Público | Verifica a disponibilidade da API. |
| `GET` | `/auth/me` | Autenticado | Consulta o perfil. |
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
│   ├── config/                    # Conexão PostgreSQL e configuração do Entra ID
│   ├── controllers/               # Lógica dos endpoints
│   ├── middleware/                # Autenticação e autorização
│   ├── models/                    # Modelos PostgreSQL
│   ├── routes/                    # Rotas Express
│   └── server.ts                  # Inicialização da API
├── index.html
├── package.json                  # Dependências e scripts do frontend
└── README.md
```

O PostgreSQL armazena usuários, entregas, reservas, contadores anuais e auditorias em tabelas no schema `checklist_donato`. IDs de documentos antigos continuam como texto, preservando referências históricas. Cada nova auditoria inclui o snapshot integral da entrega, o ID/e-mail do administrador e o timestamp. Registros de auditoria criados por versões anteriores podem conter somente os campos disponíveis à época.

## Login corporativo com Microsoft Entra ID

O acesso é feito exclusivamente pelo Microsoft Entra ID. O site usa MSAL com autorização por código e PKCE; a API verifica os tokens com as chaves públicas da Microsoft. Nenhum segredo de aplicativo é necessário para este fluxo.

O sistema não cria usuários no banco. Cadastro, login por senha, alteração de senha e administração de contas locais foram removidos do código. As entregas usam o PostgreSQL/RDS configurado. As auditorias guardam a identidade estável `tenantId:objectId` e o identificador de exibição do autor. Usuários locais migrados não são removidos automaticamente.

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
VITE_ENTRA_TENANT_ID=ID_DO_DIRETORIO
VITE_ENTRA_CLIENT_ID=ID_DO_APLICATIVO_WEB
VITE_ENTRA_API_CLIENT_ID=ID_DO_APLICATIVO_API
```

Em `server/.env`, mantenha a configuração real do banco e da porta e acrescente:

```dotenv
ENTRA_TENANT_ID=ID_DO_DIRETORIO
ENTRA_CLIENT_ID=ID_DO_APLICATIVO_WEB
ENTRA_API_CLIENT_ID=ID_DO_APLICATIVO_API
```

Os valores dos três IDs devem ser GUIDs reais. As variáveis `VITE_*` são públicas e entram no build. Reinicie o Vite ao editar o ambiente; em produção, gere e publique um novo build do frontend. Reinicie também a API.

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
- As antigas rotas `/auth/register`, `/auth/login` e `/auth/password` retornam 404.

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

A devolução exige uma nova assinatura da pessoa que estava em posse do equipamento. O nome vem do responsável da entrega e não pode ser editado; a API recusa um signatário diferente. O operador que coleta e confere continua registrado separadamente. A inspeção e a assinatura são salvas juntas; a devolução só é concluída após a resposta da API. A assinatura da entrega não é reutilizada para confirmar a devolução.

Os traços são armazenados como coordenadas, com nome do signatário, data do servidor, operador autenticado e hash dos dados da movimentação. A API exige assinaturas válidas nas novas entregas e devoluções, mesmo se a chamada não passar pela interface. Registros antigos permanecem consultáveis sem assinatura. O PDF mostra a assinatura da entrega no termo de responsabilidade e a assinatura de devolução nas duas vias, com ajuste para uma página A4.

## Reservas de equipamentos

O menu **Minhas reservas** permite solicitar notebook, desktop, celular ou monitor do mesmo catálogo utilizado nas conferências. O formulário informa nome, setor, finalidade e datas de início e fim. O e-mail é obtido da sessão autenticada, e toda solicitação nasce pendente. O usuário consulta somente suas reservas e pode cancelar solicitações pendentes ou aprovadas que ainda não tenham entrega vinculada.

O administrador não cria solicitações; acessa **Solicitações de reserva**, consulta todos os usuários, filtra por situação, busca por solicitante/equipamento e aprova pedidos pendentes com observação opcional ou os recusa com justificativa obrigatória, exibida ao solicitante. A API registra o administrador e a data da análise. Aprovação é uma autorização para o período solicitado; não atribui um patrimônio nem substitui a conferência e assinatura na retirada. O sistema ainda não possui inventário de disponibilidade para bloquear sobreposição de reservas.

Após aprovar, o sistema pergunta se deseja iniciar a conferência. O administrador também pode usar **Iniciar conferência** depois. Equipamento, solicitante, e-mail e setor são preenchidos e bloqueados para edição, com validação dos dados na API; os demais dados e a assinatura continuam obrigatórios. A entrega salva o identificador da reserva, e a reserva passa a mostrar o protocolo gerado. O vínculo e a entrega são gravados na mesma transação, impedindo entregas duplicadas ou o cancelamento de uma reserva já atendida.

As reservas são persistidas na tabela `checklist_donato.reservations` do PostgreSQL. A API autenticada disponibiliza `GET /api/reservations`, `POST /api/reservations` e `PATCH /api/reservations/:id`. O vínculo com a entrega usa uma transação SQL e um índice único para impedir duplicação. Reinicie o backend para carregar as novas rotas quando estiver executando o build compilado.

## Gravação e protocolos

Acesso e gravações exigem conexão com a API. A interface aguarda confirmação do servidor e exibe erros sem simular sucesso local. Alterações rejeitadas não modificam o histórico. Dados antigos em `localStorage` não são apagados, mas não são carregados nem sincronizados automaticamente; exporte e confira esses registros antes de migrá-los para o banco.

Novos protocolos usam `ENT-AAAA-MM-DD-NNNN`, por exemplo `ENT-2026-10-13-0006`. A data corresponde ao mesmo instante da entrega, no fuso `America/Sao_Paulo`. A sequência continua anual e é reservada por `INSERT ... ON CONFLICT DO UPDATE` atômico no PostgreSQL. Protocolos antigos são preservados. Na inicialização, o contador considera ambos os formatos nas entregas e nos snapshots de exclusão, sem diminuir uma sequência já reservada. Exclusões e recuperações não reutilizam números. Falhas após a reserva podem deixar lacunas na sequência. Protocolos enviados pelo cliente são ignorados.

## Recuperar uma entrega excluída

Em **Excluídas**, o administrador pode usar **Recuperar entrega** e confirmar a operação. A entrega volta à lista com o mesmo ID, protocolo, datas, CPF, inspeções e assinaturas. O registro de exclusão permanece no histórico e mostra a data e o autor da recuperação. A inserção da entrega e o registro da recuperação ocorrem na mesma transação; disputas simultâneas, conflitos de protocolo ou alterações no vínculo da reserva são recusados sem confirmar alterações parciais.

Registros antigos sem snapshot completo não podem ser recuperados automaticamente, e a interface informa essa limitação. Após uma nova exclusão da mesma entrega, a recuperação utiliza o snapshot dessa última exclusão. A rota `POST /api/deliveries/deleted/:auditId/restore` exige autenticação e perfil de administrador.

O script `server/sql/004_restore_deliveries.sql` adiciona os campos de recuperação e já foi aplicado ao RDS configurado. Em outra instalação, execute esse script antes de publicar esta versão da API. Para uma instalação nova, aplique `001_checklist_schema.sql`, `003_rds_backend.sql`, `004_restore_deliveries.sql`, `005_equipment_possession.sql`, `006_delivery_email.sql`, `007_return_email.sql` e `008_reservation_glpi.sql`, nessa ordem.

## Bloqueio de equipamentos em posse

Uma entrega nova é recusada quando o patrimônio **ou** o número de série já aparece em uma entrega em posse. A comparação ignora maiúsculas/minúsculas e espaços nas extremidades, preservando os valores originais e zeros iniciais. Após registrar a devolução, os identificadores ficam disponíveis para outro empréstimo, mantendo o histórico anterior.

O script `server/sql/005_equipment_possession.sql` mantém as ocupações no RDS e aplica a regra na mesma transação de cada entrega, inclusive em cadastros simultâneos, reservas e recuperações. A API retorna erro 409 com a identificação do campo bloqueado. Tentativas rejeitadas não gravam entregas nem deixam vínculos de reserva ou bloqueios parciais.

Duplicidades anteriores à implantação são preservadas. Nesses casos, o equipamento permanece bloqueado enquanto houver qualquer entrega dele em posse. O script deve ser aplicado antes de publicar esta versão em outra instância do banco.

O backend valida equipamento, peças únicas, inspeção completa e condições válidas. Na devolução, os IDs e as condições originais devem corresponder à entrega. Rótulos e condições da entrega são obtidos do registro original. Uma atualização condicional impede sobrescrever devoluções, inclusive em requisições simultâneas.

## Envio automático do termo assinado

O backend gera um PDF A4 com os dados, protocolo e traços da assinatura, usando o mesmo HTML, CSS, logotipo, campos e assinatura do botão de impressão. O modelo compartilhado fica em `server/src/domain/loanTermHtml.ts` e `loanTermStyles.ts`; o Chromium aplica o mesmo ajuste de escala para uma página. Na entrega assinada, o anexo inclui somente os dados do requisitante/produto e o termo de responsabilidade, sem as vias de devolução. Na devolução assinada, o anexo inclui somente a **Via do Requisitante** do termo de devolução, com observações, data e assinatura da pessoa que devolve o equipamento. Os dois envios usam o `recipientEmail` da entrega; a impressão continua com o documento completo. O remetente configurado é `ti@donatoholhos.com.br` e o envio usa Microsoft Graph com autenticação de aplicativo. A senha da caixa não é utilizada.

Para gerar o PDF no servidor, instale o Chromium do Playwright depois das dependências:

```powershell
npm --prefix server exec -- playwright install chromium
```

Em um servidor Linux, execute `playwright install --with-deps chromium` dentro de `server`. A instalação deve estar disponível para o usuário que executa a API. O navegador funciona sem interface e o documento usa somente recursos locais, sem acessar serviços externos.

Configure exclusivamente no ambiente do backend:

```dotenv
MAIL_ENABLED=true
MAIL_GRAPH_TENANT_ID=ID_DO_DIRETORIO
MAIL_GRAPH_CLIENT_ID=ID_DO_APLICATIVO_DE_ENVIO
MAIL_GRAPH_CLIENT_SECRET=VALOR_DO_SEGREDO
MAIL_FROM_EMAIL=ti@donatoholhos.com.br
```

A autorização `Application Mail.Send` deve estar restrita à caixa remetente pelo RBAC do Exchange. A configuração de login do site permanece independente. `npm --prefix server run mail:check` verifica as credenciais obtendo um token sem enviar mensagens e sem exibir o segredo ou token. O segredo precisa ser renovado antes da expiração no Entra.

O SQL `006_delivery_email.sql` cria a fila e o histórico de tentativas no RDS. O registro da fila ocorre na mesma transação da entrega e guarda uma cópia imutável dos dados assinados. O PDF gerado é preservado para novas tentativas, mesmo se a entrega for alterada depois. A fila não tem preenchimento retroativo: entregas antigas e recuperações não disparam novos e-mails automaticamente.

Com `MAIL_ENABLED=true`, a API processa a fila a cada 10 segundos. A página de consulta da entrega mostra o estado do envio para administradores e permite uma nova tentativa após falha. Falhas de autenticação/rede antes do envio e rejeições temporárias são repetidas até cinco vezes, respeitando `Retry-After`. Uma conexão interrompida durante o envio ou um processo encerrado após iniciar a tentativa exige verificar Itens Enviados antes de reenviar, pois a Microsoft pode já ter recebido a mensagem.

O estado “Encaminhado para envio” corresponde ao aceite HTTP 202 do Graph; não comprova chegada à caixa do destinatário. Veja a [documentação de sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0). A implementação suporta anexos PDF menores que 3 MB. O processamento é parte da API, que precisa permanecer em execução; o servidor deve alcançar `login.microsoftonline.com` e `graph.microsoft.com` por HTTPS.

Em outra implantação, aplique o SQL, configure as variáveis, instale as dependências, gere o build e reinicie a API. `MAIL_ENABLED=false` pausa o trabalhador e mantém os registros na fila. Alterações no `.env` exigem reiniciar o backend.

O script `007_return_email.sql` já foi aplicado ao RDS. A fila possui um registro único por entrega e tipo (`delivery` ou `return`); a devolução agenda o envio na mesma transação que salva sua assinatura. Devoluções anteriores não são reenviadas. Na tela de detalhes, os status e as novas tentativas são separados para cada termo.

## Chamados automáticos no GLPI

Cada nova reserva gera uma pendência no RDS na mesma transação em que é salva. O backend abre um chamado do tipo Requisição no GLPI 10, categoria Hardware (ID 25), entidade raiz (ID 0). O chamado inclui solicitante, e-mail, setor, equipamento, período e finalidade. O solicitante é registrado pelo e-mail; o nome consta na descrição. Nenhum grupo é imposto: valem as regras de atribuição do GLPI, ou `GLPI_GROUP_ID` se configurado. A tela de reservas mostra o número e o link do chamado; administradores podem reagendar falhas.

Configure exclusivamente em `server/.env`:

```dotenv
GLPI_ENABLED=true
GLPI_BASE_URL=http://suporte.donatoholhos.com.br
GLPI_APP_TOKEN=TOKEN_DO_CLIENTE_DA_API
GLPI_USER_TOKEN=TOKEN_DE_API_DO_USUARIO
GLPI_CATEGORY_NAME=Hardware
GLPI_CATEGORY_ID=25
GLPI_ENTITY_ID=0
GLPI_GROUP_ID=
```

A API REST e a autenticação por token externo devem estar habilitadas no GLPI. Crie o cliente em Configurar → Geral → API; o token pessoal fica em Minhas preferências → Chaves de acesso remoto. O usuário precisa criar e consultar chamados, e acessar a categoria/entidade. Credenciais não são enviadas ao navegador nem incluídas nos logs. A URL da API foi verificada no domínio como `/apirest.php`; não é necessário usar o IP do servidor mostrado na configuração antiga do GLPI.

`npm --prefix server run glpi:check` valida a autenticação e consulta a categoria, entidade e chamados, sem criar chamados. `GLPI_ENABLED=false` pausa o processamento e mantém as novas pendências. Reinicie a API ao alterar o ambiente. A fila é processada a cada 10 segundos; falhas seguras anteriores à criação e limites temporários são repetidos até cinco vezes, respeitando Retry-After. Depois, o administrador pode usar **Tentar abrir chamado novamente**.

O título dos novos chamados é `Nova Reserva de Equipamento realizada por NOME_DO_SOLICITANTE`, usando o nome da pessoa que solicitou o equipamento. A descrição contém a referência única `[Reserva ID_DA_RESERVA]`. Antes de criar, o backend busca essa referência no título e na descrição para reconhecer tanto os chamados antigos quanto os novos e vincular um chamado existente. Timeout ou erro 5xx durante a criação e processos interrompidos exigem revisão, sem repetir automaticamente o POST. O usuário da API deve enxergar os chamados da entidade para essa verificação funcionar.

O SQL `server/sql/008_reservation_glpi.sql` já foi aplicado ao RDS. Ele adiciona os campos de acompanhamento e a fila `reservation_glpi_jobs`. Não há envio retroativo das reservas existentes. Aprovar, recusar, cancelar ou entregar uma reserva não altera o chamado nesta integração; a automação trata da abertura ao criar a reserva. Em outra instalação, aplique o SQL antes de publicar esta versão, configure as credenciais e reinicie a API. A integração utiliza a [API REST V1 do GLPI](https://help.glpi-project.org/documentation/modules/configuration/general/api/api).

## Testes

Execute `npm --prefix server test` para as regressões de autenticação, configuração, inspeções, protocolos, gravações e tratamento de falhas da API. Por padrão, os testes de integração ficam desativados. Para habilitá-los, configure `TEST_POSTGRES=1` e as variáveis `PG*` de uma instância de testes. A suíte cria bancos exclusivos com prefixo `checklist_test_` e remove somente esses bancos ao final; o usuário precisa de permissão para criar bancos. `TEST_RDS_ENV` pode indicar um arquivo de configuração relativo a `server`, como `.env`; não é necessário duplicar a configuração em outro arquivo.

## Banco RDS e arquivo da migração

A migração de `checklist_donato` para `inventorycontrol` foi executada em 13/10/2026: 3 usuários, 5 entregas, 2 reservas, 1 auditoria e 1 contador. A verificação comparou 179 campos e os 12 documentos integrais. O projeto utiliza somente PostgreSQL/RDS. As dependências, credenciais e ferramentas da origem foram removidas após a migração.

Para verificar a conexão TLS, o banco configurado e as contagens atuais, sem alterar dados:

```powershell
npm --prefix server run db:check
```

O backend lê as variáveis `PG*` de `server/.env` e conecta exclusivamente ao PostgreSQL com validação do certificado. O frontend acessa `/api` e não recebe credenciais de banco nem mantém uma base alternativa de entregas. Na execução de desenvolvimento, o proxy do Vite encaminha essas chamadas para a API na porta 5000.

O backup, o relatório e uma cópia do importador foram arquivados fora do projeto em `../Backups Checklist/migracao-rds-2026-10-13/`. O backup da transferência está na subpasta `rds-2026-10-13T14-42-49.179Z/`. Esses arquivos não são utilizados pelo aplicativo. Os documentos originais também são preservados no RDS em `migration_source_documents`, com SHA-256. As tabelas operacionais mantêm IDs, datas, inspeções, assinaturas e vínculos. A tabela de usuários e os hashes antigos são preservados como histórico, sem uso na autenticação atual. Auditorias antigas incompletas exibem os dados históricos disponíveis.

Na implantação, instale as dependências do backend, gere o build e configure `PG*` e o certificado CA no servidor que hospeda a API. A troca feita nesta migração está no ambiente local do projeto; outras instâncias da API devem receber o mesmo código/configuração e ser reiniciadas. O certificado segue a [documentação TLS do RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.SSL.html).

Para recuperação histórica, `server.env.before.local` no arquivo externo preserva a configuração anterior. O aplicativo atual usa exclusivamente o RDS; retornar à versão anterior exige restaurar o código correspondente e reconciliar as movimentações feitas depois da migração.

## Segurança

- Não versione nem compartilhe `server/.env`, `PGPASSWORD`, tokens de integração ou backups.
- Use HTTPS em ambientes publicados e gerencie o acesso corporativo no Microsoft Entra ID.
- A operação de exclusão e a criação do registro de auditoria são atômicas; se uma falhar, nenhuma é confirmada.
- Proteções de interface não substituem validação no servidor. As operações administrativas validam a role `admin` na API.
