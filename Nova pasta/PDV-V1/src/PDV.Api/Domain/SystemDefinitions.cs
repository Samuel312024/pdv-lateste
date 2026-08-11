namespace PDV.Api.Domain;

public static class Perfis
{
    public const string Admin = "Admin";
    public const string Gerente = "Gerente";
    public const string OperadorCaixa = "OperadorCaixa";
    public const string Comprador = "Comprador";
    public const string Entregador = "Entregador";

    public static readonly IReadOnlyCollection<string> All =
    [
        Admin,
        Gerente,
        OperadorCaixa,
        Comprador,
        Entregador
    ];
}

public static class UsuariosSistema
{
    public const string MasterEmail = "master@pdv.local";
}

public sealed record PermissaoDefinicao(
    string Codigo,
    string Nome,
    string Grupo,
    string Descricao);

public static class Permissoes
{
    public const string VisualizarDashboard = "VisualizarDashboard";
    public const string VisualizarProduto = "VisualizarProduto";
    public const string VisualizarCatalogoProdutos = "VisualizarCatalogoProdutos";
    public const string VisualizarPedidos = "VisualizarPedidos";
    public const string GerenciarPedidos = "GerenciarPedidos";
    public const string AcompanharPedidosCliente = "AcompanharPedidosCliente";
    public const string RealizarPedidoCliente = "RealizarPedidoCliente";
    public const string AcessarPainelEntregador = "AcessarPainelEntregador";
    public const string CriarProduto = "CriarProduto";
    public const string EditarProduto = "EditarProduto";
    public const string ExcluirProduto = "ExcluirProduto";
    public const string VisualizarClientes = "VisualizarClientes";
    public const string GerenciarClientes = "GerenciarClientes";
    public const string RealizarVenda = "RealizarVenda";
    public const string CancelarVenda = "CancelarVenda";
    public const string AplicarDesconto = "AplicarDesconto";
    public const string VisualizarVendas = "VisualizarVendas";
    public const string AbrirCaixa = "AbrirCaixa";
    public const string FecharCaixa = "FecharCaixa";
    public const string SangriaCaixa = "SangriaCaixa";
    public const string SuprimentoCaixa = "SuprimentoCaixa";
    public const string VisualizarRelatorios = "VisualizarRelatorios";
    public const string VisualizarFinanceiro = "VisualizarFinanceiro";
    public const string GerenciarFinanceiro = "GerenciarFinanceiro";
    public const string GerenciarUsuarios = "GerenciarUsuarios";
    public const string GerenciarEmpresaFiscal = "GerenciarEmpresaFiscal";
    public const string VisualizarNotasFiscais = "VisualizarNotasFiscais";
    public const string EmitirNotasFiscais = "EmitirNotasFiscais";
    public const string VisualizarMonitorOperacional = "VisualizarMonitorOperacional";
    public const string VisualizarHardware = "VisualizarHardware";

    public static readonly IReadOnlyCollection<PermissaoDefinicao> Definitions =
    [
        new(VisualizarDashboard, "Visualizar dashboard", "Gestao", "Permite acessar o dashboard administrativo e seus indicadores."),
        new(VisualizarProduto, "Visualizar produtos", "Produtos", "Permite consultar listagem, busca e detalhes de produtos."),
        new(VisualizarCatalogoProdutos, "Visualizar catalogo digital", "Produtos", "Permite acessar a vitrine responsiva de produtos para celular, computador e terminais."),
        new(VisualizarPedidos, "Visualizar pedidos", "Pedidos", "Permite consultar pedidos com retirada, entrega e seus status operacionais."),
        new(GerenciarPedidos, "Gerenciar pedidos", "Pedidos", "Permite atualizar status do pedido, preparo, retirada e entrega."),
        new(AcompanharPedidosCliente, "Acompanhar meus pedidos", "Pedidos", "Permite ao comprador acompanhar somente os pedidos vinculados ao proprio cadastro."),
        new(RealizarPedidoCliente, "Realizar pedidos no catalogo", "Pedidos", "Permite montar carrinho e fechar pedidos pelo modulo de compras."),
        new(AcessarPainelEntregador, "Acessar painel do entregador", "Pedidos", "Permite ao entregador visualizar as entregas vinculadas ao proprio usuario e compartilhar a localizacao em tempo real."),
        new(CriarProduto, "Criar produtos", "Produtos", "Permite cadastrar novos produtos."),
        new(EditarProduto, "Editar produtos", "Produtos", "Permite alterar cadastro e configuracao fiscal dos produtos."),
        new(ExcluirProduto, "Excluir produtos", "Produtos", "Permite inativar ou excluir produtos."),
        new(VisualizarClientes, "Visualizar clientes", "Clientes", "Permite acessar a base de clientes, fornecedores e historicos."),
        new(GerenciarClientes, "Gerenciar clientes", "Clientes", "Permite criar, editar, inativar e excluir clientes e fornecedores."),
        new(RealizarVenda, "Realizar vendas", "Operacao", "Permite operar a tela do PDV e finalizar vendas."),
        new(CancelarVenda, "Cancelar vendas", "Operacao", "Permite cancelar vendas ja registradas."),
        new(AplicarDesconto, "Aplicar descontos", "Operacao", "Permite conceder descontos nos itens ou na venda."),
        new(VisualizarVendas, "Visualizar vendas", "Operacao", "Permite consultar historico de vendas."),
        new(AbrirCaixa, "Abrir caixa", "Caixa", "Permite iniciar um caixa para operacao."),
        new(FecharCaixa, "Fechar caixa", "Caixa", "Permite encerrar caixas abertos."),
        new(SangriaCaixa, "Registrar sangria", "Caixa", "Permite lancar retiradas de caixa."),
        new(SuprimentoCaixa, "Registrar suprimento", "Caixa", "Permite lancar reforco de caixa."),
        new(VisualizarRelatorios, "Visualizar relatorios", "Gestao", "Permite acessar relatorios operacionais e gerenciais."),
        new(VisualizarMonitorOperacional, "Visualizar monitor operacional", "Gestao", "Permite acompanhar PDVs abertos e produtividade ao vivo."),
        new(VisualizarFinanceiro, "Visualizar financeiro", "Financeiro", "Permite consultar o modulo financeiro."),
        new(GerenciarFinanceiro, "Gerenciar financeiro", "Financeiro", "Permite criar e atualizar lancamentos financeiros."),
        new(GerenciarUsuarios, "Gerenciar usuarios", "Administracao", "Permite acessar a area de administracao de usuarios."),
        new(GerenciarEmpresaFiscal, "Gerenciar empresa fiscal", "Fiscal", "Permite alterar configuracoes fiscais da empresa."),
        new(VisualizarNotasFiscais, "Visualizar NF-e", "Fiscal", "Permite consultar notas fiscais."),
        new(EmitirNotasFiscais, "Emitir NF-e", "Fiscal", "Permite gerar e transmitir notas fiscais."),
        new(VisualizarHardware, "Visualizar hardware", "Operacao", "Permite acessar a area de testes de scanner, camera e impressao.")
    ];

    public static readonly IReadOnlyCollection<string> All = Definitions
        .Select(item => item.Codigo)
        .ToArray();

    public static readonly IReadOnlyDictionary<string, PermissaoDefinicao> Map = Definitions
        .ToDictionary(item => item.Codigo, item => item, StringComparer.OrdinalIgnoreCase);
}

public sealed record LiberacaoGerencialDefinicao(
    string Codigo,
    string Nome,
    string Descricao);

public static class LiberacoesGerenciais
{
    public const string AplicarDescontoVenda = "AplicarDescontoVenda";
    public const string EmitirNfeVenda = "EmitirNfeVenda";
    public const string AbrirCaixa = "AbrirCaixa";
    public const string FecharCaixa = "FecharCaixa";
    public const string SangriaCaixa = "SangriaCaixa";
    public const string SuprimentoCaixa = "SuprimentoCaixa";

    public static readonly IReadOnlyCollection<LiberacaoGerencialDefinicao> Definitions =
    [
        new(AplicarDescontoVenda, "Aplicar desconto na venda", "Permite que um gerente libere descontos no fechamento do PDV."),
        new(EmitirNfeVenda, "Emitir NF-e na venda", "Permite que um gerente libere a emissao de NF-e durante a venda."),
        new(AbrirCaixa, "Abrir caixa", "Permite que um gerente libere a abertura do caixa para o operador."),
        new(FecharCaixa, "Fechar caixa", "Permite que um gerente libere o fechamento do caixa para o operador."),
        new(SangriaCaixa, "Registrar sangria", "Permite que um gerente libere uma sangria no caixa."),
        new(SuprimentoCaixa, "Registrar suprimento", "Permite que um gerente libere um suprimento no caixa.")
    ];

    public static readonly IReadOnlyCollection<string> All = Definitions
        .Select(item => item.Codigo)
        .ToArray();

    public static readonly IReadOnlyDictionary<string, LiberacaoGerencialDefinicao> Map = Definitions
        .ToDictionary(item => item.Codigo, item => item, StringComparer.OrdinalIgnoreCase);
}

public enum CaixaStatus
{
    Aberto = 1,
    Fechado = 2
}

public enum VendaStatus
{
    Aberta = 1,
    Finalizada = 2,
    Cancelada = 3
}

public enum AtendimentoPedidoTipo
{
    Retirada = 1,
    Entrega = 2
}

public enum PedidoStatus
{
    Recebido = 1,
    EmPreparacao = 2,
    ProntoParaRetirada = 3,
    SaiuParaEntrega = 4,
    Entregue = 5,
    Cancelado = 6
}

public enum FormaPagamento
{
    Dinheiro = 1,
    CartaoCredito = 2,
    CartaoDebito = 3,
    Pix = 4,
    Voucher = 5
}

public enum PagamentoCapturaModo
{
    ManualAssistido = 1,
    Simulado = 2,
    Integrado = 3
}

public enum PagamentoStatusTransacao
{
    Pendente = 1,
    Aprovada = 2,
    Negada = 3,
    Cancelada = 4,
    Simulada = 5
}

public enum MovimentacaoEstoqueTipo
{
    Entrada = 1,
    Saida = 2,
    Ajuste = 3,
    CancelamentoVenda = 4,
    Reserva = 5,
    LiberacaoReserva = 6,
    Transferencia = 7
}

public enum MovimentacaoEstoqueOrigem
{
    Venda = 1,
    Compra = 2,
    AjusteManual = 3,
    Cancelamento = 4,
    ReservaManual = 5,
    TransferenciaInterna = 6,
    ExpedicaoManual = 7,
    InventarioRotativo = 8
}

public enum TransferenciaEstoqueStatus
{
    Pendente = 1,
    Concluida = 2,
    Cancelada = 3
}

public enum ScannerTipoLeitura
{
    Auto = 1,
    CodigoBarras = 2,
    QrCode = 3
}

public enum ProdutoCodigoTipo
{
    Ean = 1,
    Qr = 2,
    Interno = 3
}

public enum PoliticaBaixaEstoqueLote
{
    FIFO = 1,
    FEFO = 2
}

public enum ProdutoPerfilFiscalPadrao
{
    RevendaMercadoria = 1,
    ProducaoEstabelecimento = 2,
    Servico = 3,
    Industrializacao = 4,
    Bonificacao = 5,
    Devolucao = 6,
    Transferencia = 7
}

public enum EmpresaRegimeTributario
{
    SimplesNacional = 1,
    SimplesExcessoSublimite = 2,
    RegimeNormal = 3,
    LucroPresumido = 4,
    LucroReal = 5
}

public enum OrigemRegraFiscal
{
    Manual = 1,
    Xml = 2,
    Api = 3,
    TabelaFiscal = 4,
    SugestaoAutomatica = 5
}

public enum AmbienteFiscal
{
    Homologacao = 1,
    Producao = 2
}

public enum FiscalProvider
{
    SefazDirect = 1,
    NuvemFiscal = 2,
    FocusNFe = 3,
    PlugNotas = 4
}

public enum CobrancaDigitalProvider
{
    Nenhum = 1,
    Efi = 2
}

public enum FiscalSefazServico
{
    StatusServico = 1,
    Autorizacao = 2,
    RetAutorizacao = 3,
    RecepcaoEvento = 4,
    Inutilizacao = 5
}

public enum FinanceiroTipo
{
    Receber = 1,
    Pagar = 2
}

public enum FinanceiroStatus
{
    Pendente = 1,
    Liquidado = 2,
    Cancelado = 3
}

public enum FinanceiroOrigem
{
    Venda = 1,
    ContaManual = 2,
    CancelamentoVenda = 3,
    CobrancaDigital = 4
}

public enum CobrancaDigitalOrigem
{
    CheckoutVenda = 1,
    Financeiro = 2
}

public enum CobrancaDigitalStatus
{
    Pendente = 1,
    Paga = 2,
    Cancelada = 3,
    Expirada = 4,
    Falha = 5
}

public enum NotaFiscalStatus
{
    Rascunho = 1,
    PendenteTransmissao = 2,
    Autorizada = 3,
    Rejeitada = 4,
    Cancelada = 5
}

public enum NotaFiscalOrigem
{
    Manual = 1,
    Pdv = 2
}
