# PDV MVP

MVP incremental de um sistema PDV web com:

- Backend: ASP.NET Core Web API
- Frontend: React + Vite + Material UI
- Banco: SQL Server
- Autenticacao: JWT
- Modelo: multiempresa, multiusuario e autorizacao por permissoes

## Estrutura

- `src/PDV.Api`: API principal do sistema
- `src/PDV.Web`: frontend React

## O que ja foi entregue neste incremento

- Login JWT com seed inicial
- Perfis iniciais: `Admin`, `Gerente`, `OperadorCaixa`
- Permissoes por endpoint para produtos, vendas, caixa, estoque e visualizacao
- Cadastro de produtos
- Cadastro de clientes
- Abertura, sangria, suprimento e fechamento de caixa
- Tela PDV com busca de produto, leitura por codigo, carrinho e pagamento multiplo
- Finalizacao de venda com baixa de estoque e movimentacao
- Cancelamento de venda com devolucao de estoque
- Dashboard simples
- Relatorios avancados com filtros por periodo, usuario, produto, cliente, pagamento e status
- Leitura por scanner comum, camera local e celular como scanner remoto
- Pagina de hardware para teste rapido de automacao
- Impressao simples de comprovante pelo navegador
- Seed automatico com empresa demo e usuarios iniciais

## Credenciais iniciais

- Master: `master@pdv.local` / `Master@123`
- Admin: `admin@pdv.local` / `Admin@123`
- Operador: `operador@pdv.local` / `Operador@123`

## Como executar

### Backend

```powershell
cd .\src\PDV.Api
dotnet run
```

API padrao em desenvolvimento:

- `http://localhost:5080`

### Frontend

```powershell
cd .\src\PDV.Web
npm install
npm run dev
```

Frontend padrao:

- `http://localhost:5173`

Se precisar apontar para outra URL da API:

```powershell
$env:VITE_API_URL="http://localhost:5080"
npm run dev
```

## Instalar como aplicativo no Windows

O caminho mais simples hoje e publicar a API com o frontend embutido e instalar o PWA no Edge/Chrome.

### Gerar pacote local

```powershell
.\scripts\publish-pdv-local.ps1
```

O script:

- builda o frontend
- copia o `dist` para `src/PDV.Api/wwwroot`
- publica a API self-contained para Windows
- gera o atalho `Iniciar PDV.cmd` dentro da pasta publicada

Observacao: na primeira geracao do pacote para um runtime novo, o `dotnet restore -r win-x64` pode precisar de acesso a internet para baixar os assets do runtime.

### Usar como software instalado

1. Abra a pasta publicada em `artifacts\pdv-local`
2. Execute `Iniciar PDV.cmd`
3. No navegador, abra o menu e clique em `Instalar app do PDV`
4. O Windows passa a abrir o PDV em janela propria, como aplicativo instalado

## Gerar um setup.exe real

Se quiser um instalador tradicional do Windows, use o Inno Setup:

```powershell
.\scripts\build-pdv-setup.ps1
```

O script:

- builda o frontend
- embute o frontend na API
- publica a API para a pasta de staging
- adiciona launchers do Windows para abrir e parar o PDV
- compila um `PDV-Control-Hub-Setup.exe` com o Inno Setup

Saida esperada:

- `artifacts\pdv-setup\app`
- `artifacts\pdv-setup\setup\PDV-Control-Hub-Setup.exe`

Opcionalmente, para gerar um pacote self-contained:

```powershell
.\scripts\build-pdv-setup.ps1 -SelfContained
```

Observacao: o modo `-SelfContained` pode precisar baixar dependencias do runtime `win-x64` na primeira execucao.

## Automacao e scanner

- Scanner USB/Bluetooth: funciona como teclado no campo de leitura do PDV e no cadastro de produtos
- Camera local: disponivel nas telas do PDV, produtos e hardware
- Celular como scanner: gere a sessao no desktop e abra o link ou QR Code no telefone
- QR Code e codigo de barras: suportados no scanner por camera
- Impressora: use a pagina `Hardware` para imprimir um comprovante de teste pelo navegador

## Banco de dados

O projeto usa SQL Server com `EnsureCreated` para este MVP.

Connection strings padrao:

- `src/PDV.Api/appsettings.json`
- `src/PDV.Api/appsettings.Development.json`

## Proximos incrementos sugeridos

- Relatorios completos
- Gestao de usuarios, empresas e permissoes por tela
- Fornecedores, categorias e configuracoes
- Fluxo avancado de cancelamento, troca e devolucao
- Migrations EF Core e scripts SQL versionados
- Multi-loja, delivery, comanda, restaurante e integracoes fiscais/pagamento
