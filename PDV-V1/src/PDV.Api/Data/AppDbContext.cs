using Microsoft.EntityFrameworkCore;
using PDV.Api.Domain;

namespace PDV.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Empresa> Empresas => Set<Empresa>();
    public DbSet<TerminalPdv> TerminaisPdv => Set<TerminalPdv>();
    public DbSet<Usuario> Usuarios => Set<Usuario>();
    public DbSet<Perfil> Perfis => Set<Perfil>();
    public DbSet<Permissao> Permissoes => Set<Permissao>();
    public DbSet<PerfilPermissao> PerfilPermissoes => Set<PerfilPermissao>();
    public DbSet<UsuarioPermissao> UsuarioPermissoes => Set<UsuarioPermissao>();
    public DbSet<Categoria> Categorias => Set<Categoria>();
    public DbSet<Produto> Produtos => Set<Produto>();
    public DbSet<ProdutoFornecedor> ProdutoFornecedores => Set<ProdutoFornecedor>();
    public DbSet<ProdutoCampoPadrao> ProdutoCamposPadrao => Set<ProdutoCampoPadrao>();
    public DbSet<ProdutoCodigo> ProdutoCodigos => Set<ProdutoCodigo>();
    public DbSet<ProdutoLote> ProdutoLotes => Set<ProdutoLote>();
    public DbSet<EstoqueLote> EstoquesLote => Set<EstoqueLote>();
    public DbSet<DepositoEstoque> DepositosEstoque => Set<DepositoEstoque>();
    public DbSet<EstoqueDeposito> EstoquesDeposito => Set<EstoqueDeposito>();
    public DbSet<TransferenciaEstoque> TransferenciasEstoque => Set<TransferenciaEstoque>();
    public DbSet<MovimentacaoEstoqueLote> MovimentacoesEstoqueLote => Set<MovimentacaoEstoqueLote>();
    public DbSet<FiscalNcm> FiscalNcms => Set<FiscalNcm>();
    public DbSet<FiscalNcmOficial> FiscalNcmsOficiais => Set<FiscalNcmOficial>();
    public DbSet<FiscalCest> FiscalCests => Set<FiscalCest>();
    public DbSet<FiscalCfop> FiscalCfops => Set<FiscalCfop>();
    public DbSet<FiscalCsosn> FiscalCsosns => Set<FiscalCsosn>();
    public DbSet<FiscalCstIcms> FiscalCstIcms => Set<FiscalCstIcms>();
    public DbSet<FiscalCstPisCofins> FiscalCstPisCofins => Set<FiscalCstPisCofins>();
    public DbSet<FiscalAliquotaIcms> FiscalAliquotasIcms => Set<FiscalAliquotaIcms>();
    public DbSet<FiscalBeneficio> FiscalBeneficios => Set<FiscalBeneficio>();
    public DbSet<FiscalUfParametro> FiscalUfParametros => Set<FiscalUfParametro>();
    public DbSet<ProdutoFiscalRegraAplicada> ProdutoFiscalRegrasAplicadas => Set<ProdutoFiscalRegraAplicada>();
    public DbSet<FiscalRegraAplicadaLog> FiscalRegraAplicadaLogs => Set<FiscalRegraAplicadaLog>();
    public DbSet<Municipio> Municipios => Set<Municipio>();
    public DbSet<Cliente> Clientes => Set<Cliente>();
    public DbSet<Fornecedor> Fornecedores => Set<Fornecedor>();
    public DbSet<Transportadora> Transportadoras => Set<Transportadora>();
    public DbSet<Caixa> Caixas => Set<Caixa>();
    public DbSet<Venda> Vendas => Set<Venda>();
    public DbSet<NotaFiscal> NotasFiscais => Set<NotaFiscal>();
    public DbSet<NotaFiscalItem> NotaFiscalItens => Set<NotaFiscalItem>();
    public DbSet<FiscalSefazUrl> FiscalSefazUrls => Set<FiscalSefazUrl>();
    public DbSet<VendaItem> VendaItens => Set<VendaItem>();
    public DbSet<VendaPagamento> VendaPagamentos => Set<VendaPagamento>();
    public DbSet<PedidoOcorrencia> PedidoOcorrencias => Set<PedidoOcorrencia>();
    public DbSet<PedidoEntregaLocalizacao> PedidoEntregaLocalizacoes => Set<PedidoEntregaLocalizacao>();
    public DbSet<MovimentacaoEstoque> MovimentacoesEstoque => Set<MovimentacaoEstoque>();
    public DbSet<LancamentoFinanceiro> LancamentosFinanceiros => Set<LancamentoFinanceiro>();
    public DbSet<CobrancaDigital> CobrancasDigitais => Set<CobrancaDigital>();
    public DbSet<LogSistema> LogsSistema => Set<LogSistema>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("pdv");

        modelBuilder.Entity<Empresa>(entity =>
        {
            entity.HasKey(item => item.EmpresaId);
            entity.Property(item => item.Nome).HasMaxLength(150).IsRequired();
            entity.Property(item => item.NomeFantasia).HasMaxLength(150);
            entity.Property(item => item.Cnpj).HasMaxLength(18);
            entity.Property(item => item.InscricaoEstadual).HasMaxLength(20);
            entity.Property(item => item.InscricaoMunicipal).HasMaxLength(20);
            entity.Property(item => item.CnaePrincipal).HasMaxLength(20);
            entity.Property(item => item.Telefone).HasMaxLength(20);
            entity.Property(item => item.EmailFiscal).HasMaxLength(150);
            entity.Property(item => item.Cep).HasMaxLength(8);
            entity.Property(item => item.Logradouro).HasMaxLength(180);
            entity.Property(item => item.Numero).HasMaxLength(20);
            entity.Property(item => item.Complemento).HasMaxLength(120);
            entity.Property(item => item.Bairro).HasMaxLength(80);
            entity.Property(item => item.Cidade).HasMaxLength(80);
            entity.Property(item => item.Uf).HasMaxLength(2);
            entity.Property(item => item.CodigoMunicipioIbge).HasMaxLength(7);
            entity.Property(item => item.CertificadoDigitalCaminho).HasMaxLength(500);
            entity.Property(item => item.CertificadoDigitalSenhaProtegida).HasMaxLength(2000);
            entity.Property(item => item.RegimeTributario).HasConversion<string>().HasMaxLength(40);
            entity.Property(item => item.AmbienteNfe).HasConversion<string>().HasMaxLength(20);
            entity.Property(item => item.ProviderFiscal).HasConversion<string>().HasMaxLength(30);
            entity.Property(item => item.TokenApiFiscalProtegido).HasMaxLength(4000);
            entity.Property(item => item.ApiFiscalClientId).HasMaxLength(200);
            entity.Property(item => item.ApiFiscalClientSecretProtegido).HasMaxLength(4000);
            entity.Property(item => item.UrlApiFiscal).HasMaxLength(500);
            entity.Property(item => item.CobrancaDigitalProvider).HasConversion<string>().HasMaxLength(30);
            entity.Property(item => item.AmbienteCobrancaDigital).HasConversion<string>().HasMaxLength(20);
            entity.Property(item => item.ApiCobrancaClientId).HasMaxLength(200);
            entity.Property(item => item.ApiCobrancaClientSecretProtegido).HasMaxLength(4000);
            entity.Property(item => item.UrlApiCobranca).HasMaxLength(500);
        });

        modelBuilder.Entity<TerminalPdv>(entity =>
        {
            entity.HasKey(item => item.TerminalPdvId);
            entity.Property(item => item.CodigoTerminal).HasMaxLength(80).IsRequired();
            entity.Property(item => item.NomeTerminal).HasMaxLength(120).IsRequired();
            entity.Property(item => item.LojaNome).HasMaxLength(120);
            entity.Property(item => item.EstadoUf).HasMaxLength(2);
            entity.Property(item => item.PerfilInstalacao).HasMaxLength(40).IsRequired();
            entity.Property(item => item.PerfilImpressora).HasMaxLength(40).IsRequired();
            entity.Property(item => item.PerfilScanner).HasMaxLength(40).IsRequired();
            entity.Property(item => item.PerfilTeclado).HasMaxLength(40).IsRequired();
            entity.Property(item => item.Observacao).HasMaxLength(500);
            entity.Property(item => item.ChaveAtivacaoHash).HasMaxLength(128).IsRequired();
            entity.Property(item => item.ChaveAtivacaoMascara).HasMaxLength(40).IsRequired();
            entity.Property(item => item.DispositivoIdentificador).HasMaxLength(120);
            entity.Property(item => item.NomeHost).HasMaxLength(120);
            entity.Property(item => item.VersaoInstalador).HasMaxLength(40);
            entity.Property(item => item.VersaoAplicativo).HasMaxLength(40);
            entity.Property(item => item.UltimoIp).HasMaxLength(80);
            entity.HasIndex(item => item.CodigoTerminal).IsUnique();
            entity.HasIndex(item => new { item.EmpresaId, item.NumeroPdv }).IsUnique();
            entity.HasIndex(item => new { item.EmpresaId, item.Ativo });
            entity.HasOne(item => item.Empresa)
                .WithMany(item => item.TerminaisPdv)
                .HasForeignKey(item => item.EmpresaId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        modelBuilder.Entity<Usuario>(entity =>
        {
            entity.HasKey(item => item.UsuarioId);
            entity.Property(item => item.Nome).HasMaxLength(120).IsRequired();
            entity.Property(item => item.Email).HasMaxLength(150).IsRequired();
            entity.Property(item => item.CodigoBarrasCracha).HasMaxLength(80);
            entity.Property(item => item.SenhaHash).HasMaxLength(500).IsRequired();
            entity.HasIndex(item => item.Email).IsUnique();
            entity.HasIndex(item => new { item.EmpresaId, item.CodigoBarrasCracha })
                .IsUnique()
                .HasFilter("[CodigoBarrasCracha] IS NOT NULL");
            entity.HasOne(item => item.Empresa).WithMany(item => item.Usuarios).HasForeignKey(item => item.EmpresaId).OnDelete(DeleteBehavior.NoAction);
            entity.HasOne(item => item.Perfil).WithMany().HasForeignKey(item => item.PerfilId).OnDelete(DeleteBehavior.NoAction);
            entity.HasOne(item => item.Cliente).WithMany().HasForeignKey(item => item.ClienteId).OnDelete(DeleteBehavior.NoAction);
        });

        modelBuilder.Entity<Perfil>(entity =>
        {
            entity.HasKey(item => item.PerfilId);
            entity.Property(item => item.Codigo).HasMaxLength(60).IsRequired();
            entity.Property(item => item.Nome).HasMaxLength(80).IsRequired();
            entity.HasIndex(item => item.Codigo).IsUnique();
        });

        modelBuilder.Entity<Permissao>(entity =>
        {
            entity.HasKey(item => item.PermissaoId);
            entity.Property(item => item.Codigo).HasMaxLength(80).IsRequired();
            entity.Property(item => item.Nome).HasMaxLength(120).IsRequired();
            entity.HasIndex(item => item.Codigo).IsUnique();
        });

        modelBuilder.Entity<PerfilPermissao>(entity =>
        {
            entity.HasKey(item => new { item.PerfilId, item.PermissaoId });
            entity.HasOne(item => item.Perfil).WithMany(item => item.PerfilPermissoes).HasForeignKey(item => item.PerfilId);
            entity.HasOne(item => item.Permissao).WithMany(item => item.PerfilPermissoes).HasForeignKey(item => item.PermissaoId);
        });

        modelBuilder.Entity<UsuarioPermissao>(entity =>
        {
            entity.HasKey(item => new { item.UsuarioId, item.PermissaoId });
            entity.HasOne(item => item.Usuario).WithMany(item => item.UsuarioPermissoes).HasForeignKey(item => item.UsuarioId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(item => item.Permissao).WithMany(item => item.UsuarioPermissoes).HasForeignKey(item => item.PermissaoId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Categoria>(entity =>
        {
            entity.HasKey(item => item.CategoriaId);
            entity.Property(item => item.Nome).HasMaxLength(100).IsRequired();
            entity.HasIndex(item => new { item.EmpresaId, item.Nome }).IsUnique();
        });

        modelBuilder.Entity<Produto>(entity =>
        {
            entity.HasKey(item => item.ProdutoId);
            entity.Property(item => item.Nome).HasMaxLength(150).IsRequired();
            entity.Property(item => item.CodigoBarras).HasMaxLength(50);
            entity.Property(item => item.Descricao).HasMaxLength(500);
            entity.Property(item => item.Marca).HasMaxLength(120);
            entity.Property(item => item.CatalogoResumo).HasMaxLength(220);
            entity.Property(item => item.Ncm).HasMaxLength(20);
            entity.Property(item => item.Cest).HasMaxLength(20);
            entity.Property(item => item.OrigemFiscal).HasMaxLength(120);
            entity.Property(item => item.PerfilFiscalPadrao).HasConversion<string>().HasMaxLength(40);
            entity.Property(item => item.CfopVendaPadrao).HasMaxLength(10);
            entity.Property(item => item.CfopVendaInterestadual).HasMaxLength(10);
            entity.Property(item => item.CfopCompraPadrao).HasMaxLength(10);
            entity.Property(item => item.CfopCompraInterestadual).HasMaxLength(10);
            entity.Property(item => item.Csosn).HasMaxLength(10);
            entity.Property(item => item.CstIcms).HasMaxLength(10);
            entity.Property(item => item.CstPis).HasMaxLength(10);
            entity.Property(item => item.CstCofins).HasMaxLength(10);
            entity.Property(item => item.BeneficioFiscalCodigo).HasMaxLength(20);
            entity.Property(item => item.CodigoAnp).HasMaxLength(20);
            entity.Property(item => item.UnidadeTributavel).HasMaxLength(10);
            entity.Property(item => item.ExTipi).HasMaxLength(3);
            entity.Property(item => item.AliquotaIcms).HasPrecision(9, 4);
            entity.Property(item => item.AliquotaIpi).HasPrecision(9, 4);
            entity.Property(item => item.AliquotaPis).HasPrecision(9, 4);
            entity.Property(item => item.AliquotaCofins).HasPrecision(9, 4);
            entity.Property(item => item.ImagemUrl).HasMaxLength(500);
            entity.Property(item => item.PrecoPromocional).HasPrecision(18, 2);
            entity.Property(item => item.PromocaoTitulo).HasMaxLength(120);
            entity.Property(item => item.CodigoProdutoFornecedor).HasMaxLength(120);
            entity.Property(item => item.UltimaNotaFiscalCompra).HasMaxLength(60);
            entity.Property(item => item.DadosExtrasJson).HasColumnType("nvarchar(max)");
            entity.Property(item => item.UnidadeMedida).HasMaxLength(10).IsRequired();
            entity.Property(item => item.PoliticaBaixaLote).HasConversion<string>().HasMaxLength(10);
            entity.Property(item => item.PrecoVenda).HasPrecision(18, 2);
            entity.Property(item => item.PrecoCusto).HasPrecision(18, 2);
            entity.Property(item => item.EstoqueAtual).HasPrecision(18, 3);
            entity.Property(item => item.EstoqueMinimo).HasPrecision(18, 3);
            entity.HasIndex(item => new { item.EmpresaId, item.CodigoBarras })
                .IsUnique()
                .HasFilter("[CodigoBarras] IS NOT NULL");
            entity.HasOne(item => item.ClienteFornecedor)
                .WithMany()
                .HasForeignKey(item => item.ClienteFornecedorId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        modelBuilder.Entity<ProdutoFornecedor>(entity =>
        {
            entity.ToTable("ProdutoFornecedores");
            entity.HasKey(item => item.ProdutoFornecedorId);
            entity.Property(item => item.CodigoProdutoFornecedor).HasMaxLength(120);
            entity.Property(item => item.NomeProdutoFornecedor).HasMaxLength(180);
            entity.Property(item => item.PrecoCompra).HasPrecision(18, 2);
            entity.Property(item => item.QuantidadeMinima).HasPrecision(18, 3);
            entity.Property(item => item.UltimoPrecoPago).HasPrecision(18, 2);
            entity.HasIndex(item => new { item.ProdutoId, item.ClienteFornecedorId }).IsUnique();
            entity.HasIndex(item => new { item.EmpresaId, item.ClienteFornecedorId, item.Ativo });
            entity.HasIndex(item => new { item.ProdutoId, item.FornecedorPrincipal });
            entity.HasOne(item => item.Produto)
                .WithMany(item => item.Fornecedores)
                .HasForeignKey(item => item.ProdutoId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(item => item.ClienteFornecedor)
                .WithMany()
                .HasForeignKey(item => item.ClienteFornecedorId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        modelBuilder.Entity<ProdutoCampoPadrao>(entity =>
        {
            entity.HasKey(item => item.ProdutoCampoPadraoId);
            entity.Property(item => item.Chave).HasMaxLength(80).IsRequired();
            entity.Property(item => item.ValorPadrao).HasMaxLength(2000);
            entity.HasIndex(item => new { item.EmpresaId, item.Chave }).IsUnique();
            entity.HasIndex(item => new { item.EmpresaId, item.Ordem });
        });

        modelBuilder.Entity<ProdutoCodigo>(entity =>
        {
            entity.HasKey(item => item.ProdutoCodigoId);
            entity.Property(item => item.Codigo).HasMaxLength(120).IsRequired();
            entity.Property(item => item.Tipo).HasConversion<string>().HasMaxLength(20);
            entity.HasIndex(item => new { item.EmpresaId, item.Codigo }).IsUnique();
            entity.HasIndex(item => new { item.ProdutoId, item.Principal });
            entity.HasOne(item => item.Produto)
                .WithMany(item => item.Codigos)
                .HasForeignKey(item => item.ProdutoId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ProdutoLote>(entity =>
        {
            entity.ToTable("ProdutoLotes");
            entity.HasKey(item => item.ProdutoLoteId);
            entity.Property(item => item.CodigoLote).HasMaxLength(60).IsRequired();
            entity.Property(item => item.DataFabricacao).HasColumnType("date");
            entity.Property(item => item.DataValidade).HasColumnType("date");
            entity.Property(item => item.Observacao).HasMaxLength(250);
            entity.HasIndex(item => new { item.EmpresaId, item.ProdutoId, item.CodigoLote }).IsUnique();
            entity.HasIndex(item => new { item.EmpresaId, item.ProdutoId, item.DataValidade });
            entity.HasOne(item => item.Produto)
                .WithMany(item => item.Lotes)
                .HasForeignKey(item => item.ProdutoId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<EstoqueLote>(entity =>
        {
            entity.ToTable("EstoquesLote");
            entity.HasKey(item => item.EstoqueLoteId);
            entity.Property(item => item.QuantidadeEntrada).HasPrecision(18, 3);
            entity.Property(item => item.QuantidadeDisponivel).HasPrecision(18, 3);
            entity.Property(item => item.PrecoCustoUnitario).HasPrecision(18, 2);
            entity.Property(item => item.DocumentoReferencia).HasMaxLength(80);
            entity.HasIndex(item => new { item.EmpresaId, item.ProdutoId, item.DataEntrada });
            entity.HasIndex(item => new { item.ProdutoId, item.QuantidadeDisponivel });
            entity.HasOne(item => item.Produto)
                .WithMany(item => item.EstoquesLote)
                .HasForeignKey(item => item.ProdutoId)
                .OnDelete(DeleteBehavior.NoAction);
            entity.HasOne(item => item.ProdutoLote)
                .WithMany(item => item.Estoques)
                .HasForeignKey(item => item.ProdutoLoteId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(item => item.Usuario)
                .WithMany()
                .HasForeignKey(item => item.UsuarioId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        modelBuilder.Entity<DepositoEstoque>(entity =>
        {
            entity.ToTable("DepositosEstoque");
            entity.HasKey(item => item.DepositoEstoqueId);
            entity.Property(item => item.Codigo).HasMaxLength(30).IsRequired();
            entity.Property(item => item.Nome).HasMaxLength(120).IsRequired();
            entity.Property(item => item.Descricao).HasMaxLength(250);
            entity.HasIndex(item => new { item.EmpresaId, item.Codigo }).IsUnique();
            entity.HasIndex(item => new { item.EmpresaId, item.Padrao });
            entity.HasOne(item => item.Empresa)
                .WithMany(item => item.DepositosEstoque)
                .HasForeignKey(item => item.EmpresaId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<EstoqueDeposito>(entity =>
        {
            entity.ToTable("EstoquesDeposito");
            entity.HasKey(item => item.EstoqueDepositoId);
            entity.Property(item => item.QuantidadeDisponivel).HasPrecision(18, 3);
            entity.Property(item => item.QuantidadeReservada).HasPrecision(18, 3);
            entity.HasIndex(item => new { item.EmpresaId, item.DepositoEstoqueId });
            entity.HasIndex(item => new { item.EmpresaId, item.ProdutoId, item.DepositoEstoqueId }).IsUnique();
            entity.HasOne(item => item.DepositoEstoque)
                .WithMany(item => item.Estoques)
                .HasForeignKey(item => item.DepositoEstoqueId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(item => item.Produto)
                .WithMany(item => item.EstoquesDeposito)
                .HasForeignKey(item => item.ProdutoId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        modelBuilder.Entity<MovimentacaoEstoqueLote>(entity =>
        {
            entity.ToTable("MovimentacoesEstoqueLote");
            entity.HasKey(item => item.MovimentacaoEstoqueLoteId);
            entity.Property(item => item.Quantidade).HasPrecision(18, 3);
            entity.HasIndex(item => new { item.MovimentacaoEstoqueId, item.EstoqueLoteId });
            entity.HasIndex(item => new { item.EmpresaId, item.ProdutoId, item.DataMovimentacao });
            entity.HasOne(item => item.MovimentacaoEstoque)
                .WithMany(item => item.Lotes)
                .HasForeignKey(item => item.MovimentacaoEstoqueId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(item => item.Produto)
                .WithMany()
                .HasForeignKey(item => item.ProdutoId)
                .OnDelete(DeleteBehavior.NoAction);
            entity.HasOne(item => item.ProdutoLote)
                .WithMany()
                .HasForeignKey(item => item.ProdutoLoteId)
                .OnDelete(DeleteBehavior.NoAction);
            entity.HasOne(item => item.EstoqueLote)
                .WithMany(item => item.Movimentacoes)
                .HasForeignKey(item => item.EstoqueLoteId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        modelBuilder.Entity<TransferenciaEstoque>(entity =>
        {
            entity.ToTable("TransferenciasEstoque");
            entity.HasKey(item => item.TransferenciaEstoqueId);
            entity.Property(item => item.Quantidade).HasPrecision(18, 3);
            entity.Property(item => item.Status).HasConversion<string>().HasMaxLength(20);
            entity.Property(item => item.DocumentoReferencia).HasMaxLength(80);
            entity.Property(item => item.Observacao).HasMaxLength(250);
            entity.HasIndex(item => new { item.EmpresaId, item.DataTransferencia });
            entity.HasIndex(item => new { item.EmpresaId, item.ProdutoId, item.DataTransferencia });
            entity.HasOne(item => item.Produto)
                .WithMany()
                .HasForeignKey(item => item.ProdutoId)
                .OnDelete(DeleteBehavior.NoAction);
            entity.HasOne(item => item.DepositoOrigem)
                .WithMany(item => item.TransferenciasOrigem)
                .HasForeignKey(item => item.DepositoOrigemId)
                .OnDelete(DeleteBehavior.NoAction);
            entity.HasOne(item => item.DepositoDestino)
                .WithMany(item => item.TransferenciasDestino)
                .HasForeignKey(item => item.DepositoDestinoId)
                .OnDelete(DeleteBehavior.NoAction);
            entity.HasOne(item => item.Usuario)
                .WithMany()
                .HasForeignKey(item => item.UsuarioId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        modelBuilder.Entity<FiscalSefazUrl>(entity =>
        {
            entity.ToTable("FiscalSefazUrls");
            entity.HasKey(item => item.FiscalSefazUrlId);
            entity.Property(item => item.Uf).HasMaxLength(2).IsRequired();
            entity.Property(item => item.Ambiente).HasConversion<string>().HasMaxLength(20);
            entity.Property(item => item.Servico).HasConversion<string>().HasMaxLength(40);
            entity.Property(item => item.Url).HasMaxLength(500).IsRequired();
            entity.HasIndex(item => new { item.Uf, item.Ambiente, item.Servico }).IsUnique();
        });

        modelBuilder.Entity<FiscalNcm>(entity =>
        {
            entity.ToTable("FiscalNcm");
            entity.HasKey(item => item.FiscalNcmId);
            entity.Property(item => item.Codigo).HasMaxLength(8).IsRequired();
            entity.Property(item => item.Descricao).HasMaxLength(250).IsRequired();
            entity.Property(item => item.DescricaoCompleta).HasMaxLength(2000);
            entity.Property(item => item.AtoLegal).HasMaxLength(160);
            entity.Property(item => item.DataInicio).HasColumnType("date");
            entity.Property(item => item.DataFim).HasColumnType("date");
            entity.Property(item => item.CestPadraoCodigo).HasMaxLength(7);
            entity.Property(item => item.AliquotaIbpt).HasPrecision(9, 4);
            entity.HasIndex(item => item.Codigo).IsUnique();
        });

        modelBuilder.Entity<FiscalNcmOficial>(entity =>
        {
            entity.ToTable("FiscalNcmOficial");
            entity.HasKey(item => item.FiscalNcmOficialId);
            entity.Property(item => item.Codigo).HasMaxLength(20).IsRequired();
            entity.Property(item => item.CodigoNormalizado).HasMaxLength(8).IsRequired();
            entity.Property(item => item.Descricao).HasMaxLength(500).IsRequired();
            entity.Property(item => item.DescricaoConcatenada).HasMaxLength(4000);
            entity.Property(item => item.DataInicio).HasColumnType("date");
            entity.Property(item => item.DataFim).HasColumnType("date");
            entity.Property(item => item.TipoAtoInicio).HasMaxLength(80);
            entity.Property(item => item.NumeroAtoInicio).HasMaxLength(20);
            entity.Property(item => item.AnoAtoInicio).HasMaxLength(10);
            entity.HasIndex(item => item.Codigo).IsUnique();
            entity.HasIndex(item => item.CodigoNormalizado);
            entity.HasIndex(item => new { item.EhItemFinal, item.Vigente, item.Ativo });
        });

        modelBuilder.Entity<FiscalCest>(entity =>
        {
            entity.ToTable("FiscalCest");
            entity.HasKey(item => item.FiscalCestId);
            entity.Property(item => item.Codigo).HasMaxLength(7).IsRequired();
            entity.Property(item => item.Descricao).HasMaxLength(250).IsRequired();
            entity.Property(item => item.NcmCodigo).HasMaxLength(8);
            entity.HasIndex(item => item.Codigo).IsUnique();
            entity.HasIndex(item => item.NcmCodigo);
        });

        modelBuilder.Entity<FiscalCfop>(entity =>
        {
            entity.ToTable("FiscalCfop");
            entity.HasKey(item => item.FiscalCfopId);
            entity.Property(item => item.Codigo).HasMaxLength(4).IsRequired();
            entity.Property(item => item.Descricao).HasMaxLength(250).IsRequired();
            entity.Property(item => item.PerfilFiscalPadrao).HasConversion<string>().HasMaxLength(40);
            entity.HasIndex(item => item.Codigo).IsUnique();
        });

        modelBuilder.Entity<FiscalCsosn>(entity =>
        {
            entity.ToTable("FiscalCsosn");
            entity.HasKey(item => item.FiscalCsosnId);
            entity.Property(item => item.Codigo).HasMaxLength(3).IsRequired();
            entity.Property(item => item.Descricao).HasMaxLength(250).IsRequired();
            entity.HasIndex(item => item.Codigo).IsUnique();
        });

        modelBuilder.Entity<FiscalCstIcms>(entity =>
        {
            entity.ToTable("FiscalCstIcms");
            entity.HasKey(item => item.FiscalCstIcmsId);
            entity.Property(item => item.Codigo).HasMaxLength(2).IsRequired();
            entity.Property(item => item.Descricao).HasMaxLength(250).IsRequired();
            entity.HasIndex(item => item.Codigo).IsUnique();
        });

        modelBuilder.Entity<FiscalCstPisCofins>(entity =>
        {
            entity.ToTable("FiscalCstPisCofins");
            entity.HasKey(item => item.FiscalCstPisCofinsId);
            entity.Property(item => item.Codigo).HasMaxLength(2).IsRequired();
            entity.Property(item => item.Descricao).HasMaxLength(250).IsRequired();
            entity.HasIndex(item => item.Codigo).IsUnique();
        });

        modelBuilder.Entity<FiscalAliquotaIcms>(entity =>
        {
            entity.ToTable("FiscalAliquotaIcms");
            entity.HasKey(item => item.FiscalAliquotaIcmsId);
            entity.Property(item => item.UfOrigem).HasMaxLength(2).IsRequired();
            entity.Property(item => item.UfDestino).HasMaxLength(2);
            entity.Property(item => item.NcmPrefixo).HasMaxLength(8);
            entity.Property(item => item.OrigemFiscalCodigo).HasMaxLength(1);
            entity.Property(item => item.CfopCodigo).HasMaxLength(4);
            entity.Property(item => item.RegimeTributario).HasMaxLength(40);
            entity.Property(item => item.Aliquota).HasPrecision(9, 4);
            entity.Property(item => item.Descricao).HasMaxLength(250).IsRequired();
            entity.HasIndex(item => new { item.UfOrigem, item.UfDestino, item.NcmPrefixo, item.CfopCodigo, item.RegimeTributario, item.Prioridade })
                .HasDatabaseName("IX_FiscalAliquotaIcms_RegraBusca");
        });

        modelBuilder.Entity<FiscalBeneficio>(entity =>
        {
            entity.ToTable("FiscalBeneficio");
            entity.HasKey(item => item.FiscalBeneficioId);
            entity.Property(item => item.Codigo).HasMaxLength(20).IsRequired();
            entity.Property(item => item.Descricao).HasMaxLength(250).IsRequired();
            entity.Property(item => item.Uf).HasMaxLength(2);
            entity.Property(item => item.NcmPrefixo).HasMaxLength(8);
            entity.HasIndex(item => item.Codigo).IsUnique();
            entity.HasIndex(item => new { item.Uf, item.NcmPrefixo });
        });

        modelBuilder.Entity<FiscalUfParametro>(entity =>
        {
            entity.ToTable("FiscalUfParametro");
            entity.HasKey(item => item.FiscalUfParametroId);
            entity.Property(item => item.Uf).HasMaxLength(2).IsRequired();
            entity.Property(item => item.AliquotaInternaIcms).HasPrecision(9, 4);
            entity.Property(item => item.AliquotaInterestadual).HasPrecision(9, 4);
            entity.Property(item => item.AliquotaFcp).HasPrecision(9, 4);
            entity.Property(item => item.AliquotaIssPadrao).HasPrecision(9, 4);
            entity.Property(item => item.Observacoes).HasMaxLength(300);
            entity.HasIndex(item => item.Uf).IsUnique();
        });

        modelBuilder.Entity<ProdutoFiscalRegraAplicada>(entity =>
        {
            entity.ToTable("ProdutoFiscalRegraAplicada");
            entity.HasKey(item => item.ProdutoFiscalRegraAplicadaId);
            entity.Property(item => item.Campo).HasMaxLength(80).IsRequired();
            entity.Property(item => item.Codigo).HasMaxLength(40);
            entity.Property(item => item.Descricao).HasMaxLength(300).IsRequired();
            entity.Property(item => item.OrigemRegra).HasConversion<string>().HasMaxLength(30);
            entity.HasIndex(item => new { item.ProdutoId, item.Ordem });
            entity.HasOne(item => item.Produto)
                .WithMany(item => item.RegrasFiscaisAplicadas)
                .HasForeignKey(item => item.ProdutoId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<FiscalRegraAplicadaLog>(entity =>
        {
            entity.ToTable("FiscalRegraAplicadaLog");
            entity.HasKey(item => item.FiscalRegraAplicadaLogId);
            entity.Property(item => item.Campo).HasMaxLength(80).IsRequired();
            entity.Property(item => item.ValorAnterior).HasMaxLength(200);
            entity.Property(item => item.ValorNovo).HasMaxLength(200);
            entity.Property(item => item.OrigemRegra).HasConversion<string>().HasMaxLength(30);
            entity.Property(item => item.Justificativa).HasMaxLength(500);
            entity.Property(item => item.IpAddress).HasMaxLength(64);
            entity.HasIndex(item => new { item.ProdutoId, item.DataAlteracao });
            entity.HasOne(item => item.Produto)
                .WithMany(item => item.AuditoriasFiscais)
                .HasForeignKey(item => item.ProdutoId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(item => item.Usuario)
                .WithMany()
                .HasForeignKey(item => item.UsuarioId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        modelBuilder.Entity<Municipio>(entity =>
        {
            entity.ToTable("Municipios");
            entity.HasKey(item => item.MunicipioId);
            entity.Property(item => item.CodigoIbge).HasMaxLength(7).IsRequired();
            entity.Property(item => item.Nome).HasMaxLength(120).IsRequired();
            entity.Property(item => item.Uf).HasMaxLength(2).IsRequired();
            entity.Property(item => item.CepInicial).HasMaxLength(8);
            entity.Property(item => item.CepFinal).HasMaxLength(8);
            entity.HasIndex(item => item.CodigoIbge).IsUnique();
            entity.HasIndex(item => new { item.Uf, item.Nome });
        });

        modelBuilder.Entity<Cliente>(entity =>
        {
            entity.HasKey(item => item.ClienteId);
            entity.Property(item => item.Nome).HasMaxLength(150).IsRequired();
            entity.Property(item => item.Documento).HasMaxLength(20);
            entity.Property(item => item.Segmento).HasMaxLength(80);
            entity.Property(item => item.Telefone).HasMaxLength(20);
            entity.Property(item => item.Email).HasMaxLength(150);
            entity.Property(item => item.Cep).HasMaxLength(8);
            entity.Property(item => item.Logradouro).HasMaxLength(180);
            entity.Property(item => item.Numero).HasMaxLength(20);
            entity.Property(item => item.Complemento).HasMaxLength(120);
            entity.Property(item => item.Bairro).HasMaxLength(80);
            entity.Property(item => item.Cidade).HasMaxLength(80);
            entity.Property(item => item.Uf).HasMaxLength(2);
            entity.Property(item => item.CodigoMunicipioIbge).HasMaxLength(7);
            entity.Property(item => item.Endereco).HasMaxLength(300);
            entity.HasIndex(item => new { item.EmpresaId, item.Documento })
                .IsUnique()
                .HasFilter("[Documento] IS NOT NULL");
        });

        modelBuilder.Entity<Fornecedor>(entity =>
        {
            entity.HasKey(item => item.FornecedorId);
            entity.Property(item => item.Nome).HasMaxLength(150).IsRequired();
            entity.Property(item => item.Documento).HasMaxLength(20);
        });

        modelBuilder.Entity<Transportadora>(entity =>
        {
            entity.ToTable("Transportadoras");
            entity.HasKey(item => item.TransportadoraId);
            entity.Property(item => item.Nome).HasMaxLength(150).IsRequired();
            entity.Property(item => item.NomeFantasia).HasMaxLength(150);
            entity.Property(item => item.Documento).HasMaxLength(20);
            entity.Property(item => item.InscricaoEstadual).HasMaxLength(20);
            entity.Property(item => item.Telefone).HasMaxLength(20);
            entity.Property(item => item.Email).HasMaxLength(150);
            entity.Property(item => item.Responsavel).HasMaxLength(120);
            entity.Property(item => item.Cep).HasMaxLength(8);
            entity.Property(item => item.Logradouro).HasMaxLength(180);
            entity.Property(item => item.Numero).HasMaxLength(20);
            entity.Property(item => item.Complemento).HasMaxLength(120);
            entity.Property(item => item.Bairro).HasMaxLength(80);
            entity.Property(item => item.Cidade).HasMaxLength(80);
            entity.Property(item => item.Uf).HasMaxLength(2);
            entity.Property(item => item.CodigoMunicipioIbge).HasMaxLength(7);
            entity.Property(item => item.Endereco).HasMaxLength(220);
            entity.Property(item => item.CorTemaHex).HasMaxLength(7);
            entity.Property(item => item.Observacao).HasMaxLength(500);
            entity.HasIndex(item => new { item.EmpresaId, item.Nome }).IsUnique();
            entity.HasIndex(item => new { item.EmpresaId, item.Ativo });
            entity.HasIndex(item => new { item.EmpresaId, item.Documento });
        });

        modelBuilder.Entity<Caixa>(entity =>
        {
            entity.HasKey(item => item.CaixaId);
            entity.Property(item => item.ValorInicial).HasPrecision(18, 2);
            entity.Property(item => item.ValorDinheiro).HasPrecision(18, 2);
            entity.Property(item => item.ValorCartaoCredito).HasPrecision(18, 2);
            entity.Property(item => item.ValorCartaoDebito).HasPrecision(18, 2);
            entity.Property(item => item.ValorPix).HasPrecision(18, 2);
            entity.Property(item => item.ValorVoucher).HasPrecision(18, 2);
            entity.Property(item => item.ValorTotalVendas).HasPrecision(18, 2);
            entity.Property(item => item.ValorSangria).HasPrecision(18, 2);
            entity.Property(item => item.ValorSuprimento).HasPrecision(18, 2);
            entity.Property(item => item.DiferencaInformada).HasPrecision(18, 2);
            entity.Property(item => item.Status).HasConversion<string>().HasMaxLength(20);
            entity.HasOne(item => item.Usuario).WithMany().HasForeignKey(item => item.UsuarioId).OnDelete(DeleteBehavior.NoAction);
        });

        modelBuilder.Entity<Venda>(entity =>
        {
            entity.HasKey(item => item.VendaId);
            entity.Property(item => item.NumeroVenda).HasMaxLength(40).IsRequired();
            entity.Property(item => item.Subtotal).HasPrecision(18, 2);
            entity.Property(item => item.DescontoTotal).HasPrecision(18, 2);
            entity.Property(item => item.Total).HasPrecision(18, 2);
            entity.Property(item => item.Status).HasConversion<string>().HasMaxLength(20);
            entity.Property(item => item.AtendimentoTipo).HasConversion<string>().HasMaxLength(20);
            entity.Property(item => item.PedidoStatus).HasConversion<string>().HasMaxLength(30);
            entity.Property(item => item.CodigoAcompanhamento).HasMaxLength(24);
            entity.Property(item => item.ContatoNome).HasMaxLength(150);
            entity.Property(item => item.ContatoTelefone).HasMaxLength(20);
            entity.Property(item => item.ObservacaoPedido).HasMaxLength(500);
            entity.Property(item => item.EnderecoEntregaSnapshotJson).HasColumnType("nvarchar(max)");
            entity.Property(item => item.NomeEntregador).HasMaxLength(120);
            entity.Property(item => item.TelefoneEntregador).HasMaxLength(20);
            entity.Property(item => item.EntregaCodigoAcesso).HasMaxLength(40);
            entity.Property(item => item.EntregaUltimaLatitude).HasPrecision(9, 6);
            entity.Property(item => item.EntregaUltimaLongitude).HasPrecision(9, 6);
            entity.Property(item => item.EntregaPrecisaoMetros).HasPrecision(10, 2);
            entity.Property(item => item.EntregaVelocidadeKmh).HasPrecision(10, 2);
            entity.Property(item => item.EntregaDirecaoGraus).HasPrecision(10, 2);
            entity.Property(item => item.MotivoCancelamento).HasMaxLength(300);
            entity.HasIndex(item => new { item.EmpresaId, item.NumeroVenda }).IsUnique();
            entity.HasIndex(item => new { item.EmpresaId, item.EhPedido, item.DataVenda });
            entity.HasIndex(item => new { item.EmpresaId, item.CodigoAcompanhamento })
                .IsUnique()
                .HasFilter("[CodigoAcompanhamento] IS NOT NULL");
            entity.HasIndex(item => new { item.EmpresaId, item.EntregaCodigoAcesso })
                .IsUnique()
                .HasFilter("[EntregaCodigoAcesso] IS NOT NULL");
            entity.HasIndex(item => new { item.EmpresaId, item.EntregadorUsuarioId })
                .HasFilter("[EntregadorUsuarioId] IS NOT NULL");
            entity.HasOne(item => item.Caixa).WithMany(item => item.Vendas).HasForeignKey(item => item.CaixaId).OnDelete(DeleteBehavior.NoAction);
            entity.HasOne(item => item.Usuario).WithMany().HasForeignKey(item => item.UsuarioId).OnDelete(DeleteBehavior.NoAction);
            entity.HasOne(item => item.Cliente).WithMany().HasForeignKey(item => item.ClienteId).OnDelete(DeleteBehavior.NoAction);
            entity.HasOne(item => item.Transportadora).WithMany(item => item.Vendas).HasForeignKey(item => item.TransportadoraId).OnDelete(DeleteBehavior.NoAction);
            entity.HasOne(item => item.EntregadorUsuario).WithMany().HasForeignKey(item => item.EntregadorUsuarioId).OnDelete(DeleteBehavior.NoAction);
        });

        modelBuilder.Entity<NotaFiscal>(entity =>
        {
            entity.HasKey(item => item.NotaFiscalId);
            entity.Property(item => item.Ambiente).HasConversion<string>().HasMaxLength(20);
            entity.Property(item => item.Status).HasConversion<string>().HasMaxLength(30);
            entity.Property(item => item.Origem).HasConversion<string>().HasMaxLength(20);
            entity.Property(item => item.NumeroVenda).HasMaxLength(40);
            entity.Property(item => item.DestinatarioNome).HasMaxLength(150).IsRequired();
            entity.Property(item => item.DestinatarioDocumento).HasMaxLength(20);
            entity.Property(item => item.EmitenteSnapshotJson).HasColumnType("nvarchar(max)");
            entity.Property(item => item.DestinatarioSnapshotJson).HasColumnType("nvarchar(max)");
            entity.Property(item => item.PendenciasJson).HasColumnType("nvarchar(max)");
            entity.Property(item => item.Observacoes).HasMaxLength(500);
            entity.Property(item => item.ChaveAcesso).HasMaxLength(44);
            entity.Property(item => item.CodigoNumerico).HasMaxLength(8);
            entity.Property(item => item.LoteTransmissao).HasMaxLength(20);
            entity.Property(item => item.ReciboSefaz).HasMaxLength(20);
            entity.Property(item => item.ProtocoloAutorizacao).HasMaxLength(40);
            entity.Property(item => item.MensagemStatusSefaz).HasMaxLength(500);
            entity.Property(item => item.ProviderFiscal).HasConversion<string>().HasMaxLength(30);
            entity.Property(item => item.ReferenciaFiscal).HasMaxLength(80);
            entity.Property(item => item.DocumentoFiscalId).HasMaxLength(120);
            entity.Property(item => item.PayloadOriginalJson).HasColumnType("nvarchar(max)");
            entity.Property(item => item.PayloadProviderJson).HasColumnType("nvarchar(max)");
            entity.Property(item => item.RetornoProviderJson).HasColumnType("nvarchar(max)");
            entity.Property(item => item.DanfeUrl).HasMaxLength(1000);
            entity.Property(item => item.DanfePdfBase64).HasColumnType("nvarchar(max)");
            entity.Property(item => item.XmlEnvio).HasColumnType("nvarchar(max)");
            entity.Property(item => item.XmlRetorno).HasColumnType("nvarchar(max)");
            entity.Property(item => item.ValorProdutos).HasPrecision(18, 2);
            entity.Property(item => item.ValorDesconto).HasPrecision(18, 2);
            entity.Property(item => item.ValorTotal).HasPrecision(18, 2);
            entity.HasIndex(item => new { item.EmpresaId, item.Serie, item.Numero }).IsUnique();
            entity.HasIndex(item => new { item.EmpresaId, item.ChaveAcesso })
                .IsUnique()
                .HasFilter("[ChaveAcesso] IS NOT NULL");
            entity.HasIndex(item => new { item.EmpresaId, item.VendaId })
                .IsUnique()
                .HasFilter("[VendaId] IS NOT NULL");
            entity.HasIndex(item => new { item.EmpresaId, item.Status, item.DataEmissao });
            entity.HasOne(item => item.Venda).WithMany().HasForeignKey(item => item.VendaId).OnDelete(DeleteBehavior.NoAction);
            entity.HasOne(item => item.Cliente).WithMany().HasForeignKey(item => item.ClienteId).OnDelete(DeleteBehavior.NoAction);
            entity.HasOne(item => item.Usuario).WithMany().HasForeignKey(item => item.UsuarioId).OnDelete(DeleteBehavior.NoAction);
        });

        modelBuilder.Entity<NotaFiscalItem>(entity =>
        {
            entity.HasKey(item => item.NotaFiscalItemId);
            entity.Property(item => item.ProdutoNome).HasMaxLength(150).IsRequired();
            entity.Property(item => item.UnidadeMedida).HasMaxLength(10).IsRequired();
            entity.Property(item => item.Ncm).HasMaxLength(20);
            entity.Property(item => item.Cest).HasMaxLength(20);
            entity.Property(item => item.OrigemFiscal).HasMaxLength(120);
            entity.Property(item => item.Cfop).HasMaxLength(10);
            entity.Property(item => item.Csosn).HasMaxLength(10);
            entity.Property(item => item.CstIcms).HasMaxLength(10);
            entity.Property(item => item.CstPis).HasMaxLength(10);
            entity.Property(item => item.CstCofins).HasMaxLength(10);
            entity.Property(item => item.BeneficioFiscalCodigo).HasMaxLength(20);
            entity.Property(item => item.CodigoAnp).HasMaxLength(20);
            entity.Property(item => item.UnidadeTributavel).HasMaxLength(10);
            entity.Property(item => item.ExTipi).HasMaxLength(3);
            entity.Property(item => item.AliquotaIcms).HasPrecision(9, 4);
            entity.Property(item => item.AliquotaIpi).HasPrecision(9, 4);
            entity.Property(item => item.AliquotaPis).HasPrecision(9, 4);
            entity.Property(item => item.AliquotaCofins).HasPrecision(9, 4);
            entity.Property(item => item.Quantidade).HasPrecision(18, 3);
            entity.Property(item => item.ValorUnitario).HasPrecision(18, 2);
            entity.Property(item => item.Desconto).HasPrecision(18, 2);
            entity.Property(item => item.Total).HasPrecision(18, 2);
            entity.HasOne(item => item.NotaFiscal)
                .WithMany(item => item.Itens)
                .HasForeignKey(item => item.NotaFiscalId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(item => item.Produto).WithMany().HasForeignKey(item => item.ProdutoId).OnDelete(DeleteBehavior.NoAction);
        });

        modelBuilder.Entity<VendaItem>(entity =>
        {
            entity.HasKey(item => item.VendaItemId);
            entity.Property(item => item.Quantidade).HasPrecision(18, 3);
            entity.Property(item => item.ValorUnitario).HasPrecision(18, 2);
            entity.Property(item => item.Desconto).HasPrecision(18, 2);
            entity.Property(item => item.Total).HasPrecision(18, 2);
            entity.HasOne(item => item.Venda).WithMany(item => item.Itens).HasForeignKey(item => item.VendaId);
            entity.HasOne(item => item.Produto).WithMany().HasForeignKey(item => item.ProdutoId).OnDelete(DeleteBehavior.NoAction);
        });

        modelBuilder.Entity<VendaPagamento>(entity =>
        {
            entity.HasKey(item => item.VendaPagamentoId);
            entity.Property(item => item.FormaPagamento).HasConversion<string>().HasMaxLength(30);
            entity.Property(item => item.CapturaModo).HasConversion<string>().HasMaxLength(30);
            entity.Property(item => item.StatusTransacao).HasConversion<string>().HasMaxLength(30);
            entity.Property(item => item.ProvedorOperacao).HasMaxLength(60);
            entity.Property(item => item.ReferenciaTransacao).HasMaxLength(100);
            entity.Property(item => item.CodigoAutorizacao).HasMaxLength(60);
            entity.Property(item => item.BandeiraCartao).HasMaxLength(40);
            entity.Property(item => item.UltimosDigitosCartao).HasMaxLength(4);
            entity.Property(item => item.ObservacaoOperacao).HasMaxLength(200);
            entity.Property(item => item.PayloadOperacaoJson).HasColumnType("nvarchar(max)");
            entity.Property(item => item.ValorPago).HasPrecision(18, 2);
            entity.Property(item => item.Troco).HasPrecision(18, 2);
            entity.HasOne(item => item.Venda).WithMany(item => item.Pagamentos).HasForeignKey(item => item.VendaId);
        });

        modelBuilder.Entity<PedidoOcorrencia>(entity =>
        {
            entity.HasKey(item => item.PedidoOcorrenciaId);
            entity.Property(item => item.Status).HasConversion<string>().HasMaxLength(30);
            entity.Property(item => item.Titulo).HasMaxLength(120).IsRequired();
            entity.Property(item => item.Descricao).HasMaxLength(500);
            entity.HasIndex(item => new { item.EmpresaId, item.VendaId, item.DataOcorrencia });
            entity.HasOne(item => item.Venda).WithMany(item => item.OcorrenciasPedido).HasForeignKey(item => item.VendaId).OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(item => item.Usuario).WithMany().HasForeignKey(item => item.UsuarioId).OnDelete(DeleteBehavior.NoAction);
        });

        modelBuilder.Entity<PedidoEntregaLocalizacao>(entity =>
        {
            entity.ToTable("PedidoEntregaLocalizacoes");
            entity.HasKey(item => item.PedidoEntregaLocalizacaoId);
            entity.Property(item => item.Latitude).HasPrecision(9, 6);
            entity.Property(item => item.Longitude).HasPrecision(9, 6);
            entity.Property(item => item.PrecisaoMetros).HasPrecision(10, 2);
            entity.Property(item => item.VelocidadeKmh).HasPrecision(10, 2);
            entity.Property(item => item.DirecaoGraus).HasPrecision(10, 2);
            entity.Property(item => item.Origem).HasMaxLength(40).IsRequired();
            entity.Property(item => item.Observacao).HasMaxLength(200);
            entity.HasIndex(item => new { item.EmpresaId, item.VendaId, item.DataCaptura });
            entity.HasOne(item => item.Venda)
                .WithMany(item => item.LocalizacoesEntrega)
                .HasForeignKey(item => item.VendaId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<MovimentacaoEstoque>(entity =>
        {
            entity.ToTable("MovimentacoesEstoque");
            entity.HasKey(item => item.MovimentacaoEstoqueId);
            entity.Property(item => item.Tipo).HasConversion<string>().HasMaxLength(30);
            entity.Property(item => item.Origem).HasConversion<string>().HasMaxLength(30);
            entity.Property(item => item.Quantidade).HasPrecision(18, 3);
            entity.Property(item => item.EstoqueAnterior).HasPrecision(18, 3);
            entity.Property(item => item.EstoqueAtual).HasPrecision(18, 3);
            entity.Property(item => item.EstoqueReservadoAtual).HasPrecision(18, 3);
            entity.Property(item => item.Observacao).HasMaxLength(250);
            entity.HasIndex(item => new { item.EmpresaId, item.ProdutoId, item.DataMovimentacao });
            entity.HasOne(item => item.Produto).WithMany().HasForeignKey(item => item.ProdutoId).OnDelete(DeleteBehavior.NoAction);
            entity.HasOne(item => item.Usuario).WithMany().HasForeignKey(item => item.UsuarioId).OnDelete(DeleteBehavior.NoAction);
            entity.HasOne(item => item.DepositoEstoque).WithMany().HasForeignKey(item => item.DepositoEstoqueId).OnDelete(DeleteBehavior.NoAction);
            entity.HasOne(item => item.DepositoOrigem).WithMany().HasForeignKey(item => item.DepositoOrigemId).OnDelete(DeleteBehavior.NoAction);
            entity.HasOne(item => item.DepositoDestino).WithMany().HasForeignKey(item => item.DepositoDestinoId).OnDelete(DeleteBehavior.NoAction);
        });

        modelBuilder.Entity<LancamentoFinanceiro>(entity =>
        {
            entity.HasKey(item => item.LancamentoFinanceiroId);
            entity.Property(item => item.Tipo).HasConversion<string>().HasMaxLength(20);
            entity.Property(item => item.Origem).HasConversion<string>().HasMaxLength(30);
            entity.Property(item => item.Status).HasConversion<string>().HasMaxLength(20);
            entity.Property(item => item.Descricao).HasMaxLength(180).IsRequired();
            entity.Property(item => item.DocumentoReferencia).HasMaxLength(60);
            entity.Property(item => item.ValorOriginal).HasPrecision(18, 2);
            entity.Property(item => item.ValorDesconto).HasPrecision(18, 2);
            entity.Property(item => item.ValorAcrescimo).HasPrecision(18, 2);
            entity.Property(item => item.ValorFinal).HasPrecision(18, 2);
            entity.Property(item => item.ValorCusto).HasPrecision(18, 2);
            entity.Property(item => item.Observacao).HasMaxLength(500);
            entity.HasIndex(item => new { item.EmpresaId, item.DataCompetencia });
            entity.HasIndex(item => new { item.EmpresaId, item.Status, item.Tipo });
            entity.HasOne(item => item.Venda).WithMany().HasForeignKey(item => item.VendaId).OnDelete(DeleteBehavior.NoAction);
            entity.HasOne(item => item.Cliente).WithMany().HasForeignKey(item => item.ClienteId).OnDelete(DeleteBehavior.NoAction);
            entity.HasOne(item => item.Fornecedor).WithMany().HasForeignKey(item => item.FornecedorId).OnDelete(DeleteBehavior.NoAction);
            entity.HasOne(item => item.Usuario).WithMany().HasForeignKey(item => item.UsuarioId).OnDelete(DeleteBehavior.NoAction);
            entity.HasOne(item => item.Caixa).WithMany().HasForeignKey(item => item.CaixaId).OnDelete(DeleteBehavior.NoAction);
        });

        modelBuilder.Entity<CobrancaDigital>(entity =>
        {
            entity.ToTable("CobrancasDigitais");
            entity.HasKey(item => item.CobrancaDigitalId);
            entity.Property(item => item.Provider).HasConversion<string>().HasMaxLength(30);
            entity.Property(item => item.Origem).HasConversion<string>().HasMaxLength(30);
            entity.Property(item => item.Status).HasConversion<string>().HasMaxLength(20);
            entity.Property(item => item.Descricao).HasMaxLength(180).IsRequired();
            entity.Property(item => item.DocumentoReferencia).HasMaxLength(60);
            entity.Property(item => item.IdentificadorInterno).HasMaxLength(80);
            entity.Property(item => item.ChargeIdExterno).HasMaxLength(80);
            entity.Property(item => item.CustomIdExterno).HasMaxLength(80);
            entity.Property(item => item.StatusExterno).HasMaxLength(40);
            entity.Property(item => item.PixCopiaECola).HasColumnType("nvarchar(max)");
            entity.Property(item => item.PixQrCodeImageUrl).HasColumnType("nvarchar(max)");
            entity.Property(item => item.LinhaDigitavel).HasMaxLength(120);
            entity.Property(item => item.LinkCobranca).HasMaxLength(1000);
            entity.Property(item => item.LinkBoleto).HasMaxLength(1000);
            entity.Property(item => item.LinkPdf).HasMaxLength(1000);
            entity.Property(item => item.ValorOriginal).HasPrecision(18, 2);
            entity.Property(item => item.ValorPago).HasPrecision(18, 2);
            entity.Property(item => item.PayloadCriacaoJson).HasColumnType("nvarchar(max)");
            entity.Property(item => item.PayloadConsultaJson).HasColumnType("nvarchar(max)");
            entity.Property(item => item.RetornoProviderJson).HasColumnType("nvarchar(max)");
            entity.Property(item => item.Observacao).HasMaxLength(500);
            entity.HasIndex(item => new { item.EmpresaId, item.DataCriacao });
            entity.HasIndex(item => new { item.EmpresaId, item.Status, item.Origem });
            entity.HasIndex(item => new { item.EmpresaId, item.ChargeIdExterno })
                .IsUnique()
                .HasFilter("[ChargeIdExterno] IS NOT NULL");
            entity.HasOne(item => item.Cliente).WithMany().HasForeignKey(item => item.ClienteId).OnDelete(DeleteBehavior.NoAction);
            entity.HasOne(item => item.Venda).WithMany().HasForeignKey(item => item.VendaId).OnDelete(DeleteBehavior.NoAction);
            entity.HasOne(item => item.LancamentoFinanceiro).WithMany().HasForeignKey(item => item.LancamentoFinanceiroId).OnDelete(DeleteBehavior.NoAction);
            entity.HasOne(item => item.Usuario).WithMany().HasForeignKey(item => item.UsuarioId).OnDelete(DeleteBehavior.NoAction);
        });

        modelBuilder.Entity<LogSistema>(entity =>
        {
            entity.HasKey(item => item.LogSistemaId);
            entity.Property(item => item.Modulo).HasMaxLength(80).IsRequired();
            entity.Property(item => item.Acao).HasMaxLength(80).IsRequired();
            entity.Property(item => item.Descricao).HasMaxLength(300).IsRequired();
            entity.Property(item => item.Dados).HasColumnType("nvarchar(max)");
            entity.Property(item => item.IpAddress).HasMaxLength(64);
        });
    }
}
