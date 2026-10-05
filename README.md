# Donato | Controle de Ativos

Aplicação web para registrar entregas e devoluções de equipamentos, acompanhar inspeções e manter histórico operacional e administrativo. O frontend usa React, TypeScript, Vite e Three.js. A API usa Express, TypeScript, Mongoose e MongoDB.

## Funcionalidades

- Login e criação de contas com autenticação no backend e tokens JWT.
- Criação automática da conta administradora configurada ao iniciar o backend.
- Cadastro de equipamento, patrimônio, número de série, modelo, marca, responsável, e-mail e setor.
- Inspeção interativa de notebooks, desktops, celulares e monitores, com observações para itens danificados.
- Histórico de entregas pesquisável, filtros por situação/danos, consulta de detalhes e impressão.
- Registro de devolução e comparação das condições da entrega e da devolução.
- Exclusão permitida apenas ao administrador, com confirmação e auditoria no MongoDB.
- Tela administrativa para consultar entregas excluídas e o snapshot arquivado.
- Troca da senha do usuário autenticado sem solicitar a senha anterior; nova senha com pelo menos 8 caracteres.
- Layout responsivo para desktop e celular.

## Requisitos

- Node.js 20.19+ ou 22.12+ e npm (requisitos do Vite 8).
- MongoDB Atlas ou uma instância MongoDB configurada como replica set. A auditoria e a exclusão são confirmadas na mesma transação, que exige replica set.

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
| `MONGO_URI` | URI do MongoDB. Exemplo local: `mongodb://localhost:27017/checklist_donato`. |
| `JWT_SECRET` | Segredo aleatório obrigatório, com pelo menos 32 caracteres. |
| `ADMIN_EMAIL` | E-mail da conta administradora inicial. |
| `ADMIN_PASSWORD` | Senha inicial exclusiva, com pelo menos 12 caracteres. |
| `ADMIN_NAME` | Nome da conta administradora. |

Para MongoDB Atlas, use a URI do cluster e permita o IP do servidor na lista de acesso. Não use placeholders, credenciais de exemplo ou segredos padrão em produção. `server/.env` é local e não deve ser enviado ao repositório.

O servidor cria o administrador configurado na primeira inicialização. Se já existir uma conta com `ADMIN_EMAIL`, o seed garante a role `admin`, mas não substitui a senha existente. Não há segredo JWT nem senha administrativa padrão. O servidor recusa configurações ausentes, curtas ou com placeholders e só inicia após conectar ao banco, criar os índices e inicializar os contadores de protocolo. `ADMIN_NAME` permanece opcional.

## Recuperar o acesso administrativo

Se a conta administradora já existe, alterar `ADMIN_PASSWORD` no `.env` não altera sua senha no banco. Na pasta `server`, execute `npm run admin:check` para verificar se a senha configurada corresponde à salva. Para aplicar explicitamente a senha atual do `.env` à conta indicada por `ADMIN_EMAIL`, execute `npm run admin:reset`. Esses comandos exigem acesso ao MongoDB e não exibem credenciais. O reset altera somente a senha dessa conta, preservando usuários, entregas e auditorias.

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

A rota de saúde fica em `http://localhost:5000/api/health`. O terminal do backend mostra o resultado da conexão MongoDB e do seed do administrador.

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
│   ├── assets/                    # Ativos importados pelo frontend
│   ├── components/                # Componentes reutilizáveis e modelo 3D
│   ├── domain/                    # Tipos e regras de domínio
│   ├── hooks/                     # Estado e operações de entregas
│   ├── pages/                     # Login, entregas e auditoria
│   ├── services/                  # Chamadas HTTP e autenticação
│   ├── styles/                    # Estilos globais e por tela
│   └── main.tsx                   # Entrada React
├── server/src/
│   ├── config/                    # Conexão MongoDB e seed do admin
│   ├── controllers/               # Lógica dos endpoints
│   ├── middleware/                # Autenticação e autorização
│   ├── models/                    # Schemas Mongoose
│   ├── routes/                    # Rotas Express
│   └── server.ts                  # Inicialização da API
├── index.html
├── package.json                  # Dependências e scripts do frontend
└── README.md
```

O MongoDB armazena contadores anuais na coleção `protocolcounters`, usuários, entregas e auditorias na coleção `delivery_deletion_audits`. Cada nova auditoria inclui o snapshot integral da entrega, o ID/e-mail do administrador e o timestamp. Registros de auditoria criados por versões anteriores podem conter somente os campos disponíveis à época.

## Comandos

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

## Gravação e protocolos

Login, cadastro e gravações exigem conexão com a API. A interface aguarda confirmação do servidor e exibe erros sem simular sucesso local. Alterações rejeitadas não modificam o histórico. Dados antigos em `localStorage` não são apagados, mas não são carregados nem sincronizados automaticamente; exporte e confira esses registros antes de migrá-los para o banco.

Os protocolos são reservados por um incremento atômico no MongoDB, por ano. Na inicialização, o contador considera os protocolos das entregas e dos snapshots de exclusão existentes, sem diminuir uma sequência já reservada. Exclusões não reutilizam números. Falhas após a reserva podem deixar lacunas na sequência. Protocolos enviados pelo cliente são ignorados.

O backend valida equipamento, peças únicas, inspeção completa e condições válidas. Na devolução, os IDs e as condições originais devem corresponder à entrega. Rótulos e condições da entrega são obtidos do registro original. Uma atualização condicional impede sobrescrever devoluções, inclusive em requisições simultâneas.

## Testes

Execute `npm --prefix server test` para as regressões de autenticação, configuração, inspeções, protocolos, gravações e tratamento de falhas da API. Os testes sem MongoDB usam modelos substituídos. Para validar os contadores e a concorrência em um MongoDB de testes, configure `TEST_MONGO_URI`; a suíte cria um banco exclusivo, removido ao final. Nunca use credenciais de produção para esses testes.

## Segurança

- Não versione nem compartilhe `server/.env`, `MONGO_URI` ou `JWT_SECRET`.
- Use HTTPS, senha inicial exclusiva e segredo JWT aleatório em ambientes publicados.
- A operação de exclusão e a criação do registro de auditoria são atômicas; se uma falhar, nenhuma é confirmada.
- Proteções de interface não substituem validação no servidor. As operações administrativas validam a role `admin` na API.
