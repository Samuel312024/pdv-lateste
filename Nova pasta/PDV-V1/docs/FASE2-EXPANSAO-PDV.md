# Fase 2 - Expansao do PDV

Este documento organiza a proxima camada do sistema sem acoplar regras sensiveis de forma improvisada.

## Escopo funcional

- Nota fiscal
- Pix integrado
- TEF
- Delivery
- Comanda
- Restaurante
- Multi-loja
- Relatorios avancados

## O que ja entrou nesta base

- Relatorios avancados com filtros por periodo, usuario, produto, cliente, pagamento e status
- Tela de relatorios no frontend
- Estrutura pronta para crescer sem mudar a experiencia do PDV atual

## Ordem recomendada de implementacao

1. Migrar a inicializacao do banco para migrations versionadas
2. Introduzir `Loja` e contexto de operacao por filial
3. Separar estoque e caixa por loja
4. Expandir venda para canais `Balcao`, `Delivery`, `Comanda`, `Mesa`
5. Criar modulo de atendimento para restaurante
6. Criar camada de integracoes externas
7. Integrar PIX, TEF e emissao fiscal por provedor

## Multi-loja

Base recomendada:

- `Loja`
- `UsuarioLoja`
- `Caixa` com `LojaId`
- `Venda` com `LojaId`
- `EstoqueLoja` por produto
- configuracao padrao da loja no login ou seletor apos autenticacao

Impactos:

- JWT deve carregar `LojaId` atual
- dashboard e relatorios precisam aceitar consolidado por empresa ou filtrado por loja
- permissoes continuam por empresa, mas acesso operacional passa a respeitar a loja ativa

## Delivery, comanda e restaurante

Base recomendada:

- `CanalVenda`
- `Mesa`
- `Comanda`
- `PedidoAtendimento`
- `PedidoAtendimentoItem`
- `Entrega`

Fluxos principais:

- `Balcao`: venda imediata
- `Delivery`: venda com dados de entrega, taxa e status logistico
- `Comanda`: acumulacao de itens antes do fechamento
- `Restaurante`: mesa, separacao por comanda e envio para cozinha

## PIX, TEF e nota fiscal

Esses pontos dependem de decisao de provedor e ambiente homologacao/producao.

Abstracoes recomendadas:

- `IPixGateway`
- `ITefGateway`
- `IFiscalGateway`

Objetivo:

- manter a regra de negocio do PDV desacoplada do provedor real
- permitir trocar integrador sem reescrever venda e caixa

Dados que precisaremos persistir:

- status da cobranca PIX
- txid e qr code
- nsu/autorizacao TEF
- protocolo e chave fiscal
- xml e retorno do autorizador

## Decisoes pendentes para implementacao real

- provedor de PIX
- provedor TEF
- tipo de emissao fiscal
- escopo de restaurante: mesa simples ou cozinha completa
- modelo de multi-loja: catalogo compartilhado ou produtos por filial

## Proximo incremento sugerido

O proximo incremento tecnico mais seguro e valioso e:

1. trocar o banco para migrations
2. criar `Loja` e `UsuarioLoja`
3. adaptar caixa e venda para `LojaId`
4. adicionar tela administrativa de lojas
