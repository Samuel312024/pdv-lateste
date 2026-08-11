using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Hosting;
using PDV.Api.Domain;
using System.Data;
using Npgsql;

namespace PDV.Api.Data;

public static class DatabaseSeeder
{
    private const string PdvSchema = "pdv";
    private static readonly string[] RequiredTables =
    [
        "Empresas",
        "TerminaisPdv",
        "Usuarios",
        "Perfis",
        "Permissoes",
        "PerfilPermissoes",
        "UsuarioPermissoes",
        "Categorias",
        "Produtos",
        "ProdutoFornecedores",
        "ProdutoCamposPadrao",
        "ProdutoCodigos",
        "ProdutoLotes",
        "EstoquesLote",
        "DepositosEstoque",
        "EstoquesDeposito",
        "TransferenciasEstoque",
        "MovimentacoesEstoqueLote",
        "FiscalNcm",
        "FiscalCest",
        "FiscalCfop",
        "FiscalCsosn",
        "FiscalCstIcms",
        "FiscalCstPisCofins",
        "FiscalAliquotaIcms",
        "FiscalBeneficio",
        "FiscalUfParametro",
        "ProdutoFiscalRegraAplicada",
        "FiscalRegraAplicadaLog",
        "Municipios",
        "Clientes",
        "Fornecedores",
        "Transportadoras",
        "Caixas",
        "Vendas",
        "NotasFiscais",
        "NotaFiscalItens",
        "FiscalSefazUrls",
        "VendaItens",
        "VendaPagamentos",
        "PedidoOcorrencias",
        "PedidoEntregaLocalizacoes",
        "MovimentacoesEstoque",
        "LancamentosFinanceiros",
        "CobrancasDigitais",
        "LogsSistema"
    ];

    private static readonly FiscalNcmSeed[] BaseFiscalNcms =
    [
        new("04022110", "Leite em po integral", null, 0m, false),
        new("19053100", "Biscoitos e bolachas doces", null, 0m, false),
        new("21069090", "Outras preparacoes alimenticias", null, 0m, false),
        new("22021000", "Bebidas nao alcoolicas", null, 0m, false),
        new("22030000", "Cerveja de malte", null, 0m, false),
        new("33051000", "Shampoo", null, 0m, false),
        new("33072010", "Desodorantes corporais", null, 0m, false),
        new("39241000", "Artigos de cozinha e mesa de plastico", null, 0m, false),
        new("48201000", "Cadernos", null, 0m, false),
        new("84713012", "Computadores portateis", null, 0m, false),
        new("85171231", "Telefones celulares inteligentes", null, 0m, false),
        new("94036000", "Outros moveis de madeira", null, 0m, false)
    ];

    private static readonly FiscalCestSeed[] BaseFiscalCests =
    [
        new("1700900", "Biscoitos e bolachas", "19053100"),
        new("2003600", "Shampoo", "33051000"),
        new("2003700", "Desodorantes", "33072010")
    ];

    private static readonly FiscalCfopSeed[] BaseFiscalCfops =
    [
        new("1101", "Compra para industrializacao ou producao rural", ProdutoPerfilFiscalPadrao.ProducaoEstabelecimento, true, false, true, false, false),
        new("1102", "Compra para comercializacao", ProdutoPerfilFiscalPadrao.RevendaMercadoria, true, false, true, false, false),
        new("1202", "Devolucao de venda de mercadoria adquirida ou recebida de terceiros", ProdutoPerfilFiscalPadrao.Devolucao, true, false, true, false, true),
        new("2101", "Compra para industrializacao ou producao rural de outra UF", ProdutoPerfilFiscalPadrao.ProducaoEstabelecimento, true, false, false, true, false),
        new("2102", "Compra para comercializacao de outra UF", ProdutoPerfilFiscalPadrao.RevendaMercadoria, true, false, false, true, false),
        new("2202", "Devolucao de venda de mercadoria adquirida ou recebida de terceiros para outra UF", ProdutoPerfilFiscalPadrao.Devolucao, true, false, false, true, true),
        new("5101", "Venda de producao do estabelecimento", ProdutoPerfilFiscalPadrao.ProducaoEstabelecimento, false, true, true, false, false),
        new("5102", "Venda de mercadoria adquirida ou recebida de terceiros", ProdutoPerfilFiscalPadrao.RevendaMercadoria, false, true, true, false, false),
        new("5202", "Devolucao de compra para comercializacao", ProdutoPerfilFiscalPadrao.Devolucao, false, true, true, false, true),
        new("6101", "Venda de producao do estabelecimento para outra UF", ProdutoPerfilFiscalPadrao.ProducaoEstabelecimento, false, true, false, true, false),
        new("6102", "Venda de mercadoria adquirida ou recebida de terceiros para outra UF", ProdutoPerfilFiscalPadrao.RevendaMercadoria, false, true, false, true, false),
        new("6202", "Devolucao de compra para comercializacao de outra UF", ProdutoPerfilFiscalPadrao.Devolucao, false, true, false, true, true)
    ];

    private static readonly FiscalCodigoDescricaoSeed[] BaseFiscalCsosns =
    [
        new("101", "Tributada pelo Simples Nacional com permissao de credito", false, true),
        new("102", "Tributada pelo Simples Nacional sem permissao de credito", false, false),
        new("103", "Isencao do Simples Nacional para faixa de receita bruta", false, false),
        new("201", "Tributada pelo Simples Nacional com ST e credito", true, true),
        new("202", "Tributada pelo Simples Nacional com ST sem credito", true, false),
        new("203", "Isencao do Simples Nacional com ST", true, false),
        new("300", "Imune", false, false),
        new("400", "Nao tributada pelo Simples Nacional", false, false),
        new("500", "ICMS cobrado anteriormente por substituicao tributaria", true, false),
        new("900", "Outros", false, true)
    ];

    private static readonly FiscalCodigoDescricaoSeed[] BaseFiscalCstIcms =
    [
        new("00", "Tributada integralmente", false, true),
        new("10", "Tributada com cobranca de ICMS por substituicao tributaria", true, true),
        new("20", "Com reducao de base de calculo", false, true),
        new("30", "Isenta ou nao tributada com cobranca de ST", true, false),
        new("40", "Isenta", false, false),
        new("41", "Nao tributada", false, false),
        new("50", "Suspensao", false, false),
        new("51", "Diferimento", false, true),
        new("60", "ICMS cobrado anteriormente por substituicao tributaria", true, false),
        new("70", "Com reducao de base de calculo e cobranca de ST", true, true),
        new("90", "Outras", false, true)
    ];

    private static readonly FiscalPisCofinsSeed[] BaseFiscalCstPisCofins =
    [
        new("01", "Operacao tributavel com aliquota basica", false, true),
        new("02", "Operacao tributavel com aliquota diferenciada", false, true),
        new("03", "Operacao tributavel por unidade de medida", false, true),
        new("04", "Operacao tributavel monofasica - revenda com aliquota zero", true, false),
        new("05", "Operacao tributavel por substituicao tributaria", false, false),
        new("06", "Operacao tributavel com aliquota zero", true, false),
        new("07", "Operacao isenta da contribuicao", true, false),
        new("08", "Operacao sem incidencia da contribuicao", true, false),
        new("09", "Operacao com suspensao da contribuicao", true, false),
        new("49", "Outras operacoes de saida", false, true),
        new("99", "Outras operacoes", false, true)
    ];

    private static readonly FiscalAliquotaSeed[] BaseFiscalAliquotasIcms =
    [
        new("AC", 18m, 1000, "Aliquota interna padrao inicial do sistema - revise com a contabilidade."),
        new("AL", 18m, 1000, "Aliquota interna padrao inicial do sistema - revise com a contabilidade."),
        new("AP", 18m, 1000, "Aliquota interna padrao inicial do sistema - revise com a contabilidade."),
        new("AM", 18m, 1000, "Aliquota interna padrao inicial do sistema - revise com a contabilidade."),
        new("BA", 18m, 1000, "Aliquota interna padrao inicial do sistema - revise com a contabilidade."),
        new("CE", 18m, 1000, "Aliquota interna padrao inicial do sistema - revise com a contabilidade."),
        new("DF", 18m, 1000, "Aliquota interna padrao inicial do sistema - revise com a contabilidade."),
        new("ES", 18m, 1000, "Aliquota interna padrao inicial do sistema - revise com a contabilidade."),
        new("GO", 18m, 1000, "Aliquota interna padrao inicial do sistema - revise com a contabilidade."),
        new("MA", 18m, 1000, "Aliquota interna padrao inicial do sistema - revise com a contabilidade."),
        new("MG", 18m, 1000, "Aliquota interna padrao inicial do sistema - revise com a contabilidade."),
        new("MS", 18m, 1000, "Aliquota interna padrao inicial do sistema - revise com a contabilidade."),
        new("MT", 18m, 1000, "Aliquota interna padrao inicial do sistema - revise com a contabilidade."),
        new("PA", 18m, 1000, "Aliquota interna padrao inicial do sistema - revise com a contabilidade."),
        new("PB", 18m, 1000, "Aliquota interna padrao inicial do sistema - revise com a contabilidade."),
        new("PE", 18m, 1000, "Aliquota interna padrao inicial do sistema - revise com a contabilidade."),
        new("PI", 18m, 1000, "Aliquota interna padrao inicial do sistema - revise com a contabilidade."),
        new("PR", 18m, 1000, "Aliquota interna padrao inicial do sistema - revise com a contabilidade."),
        new("RJ", 18m, 1000, "Aliquota interna padrao inicial do sistema - revise com a contabilidade."),
        new("RN", 18m, 1000, "Aliquota interna padrao inicial do sistema - revise com a contabilidade."),
        new("RO", 18m, 1000, "Aliquota interna padrao inicial do sistema - revise com a contabilidade."),
        new("RR", 18m, 1000, "Aliquota interna padrao inicial do sistema - revise com a contabilidade."),
        new("RS", 18m, 1000, "Aliquota interna padrao inicial do sistema - revise com a contabilidade."),
        new("SC", 18m, 1000, "Aliquota interna padrao inicial do sistema - revise com a contabilidade."),
        new("SE", 18m, 1000, "Aliquota interna padrao inicial do sistema - revise com a contabilidade."),
        new("SP", 18m, 1000, "Aliquota interna padrao inicial do sistema - revise com a contabilidade."),
        new("TO", 18m, 1000, "Aliquota interna padrao inicial do sistema - revise com a contabilidade.")
    ];

    public static async Task SeedAsync(AppDbContext dbContext, IPasswordHasher<Usuario> passwordHasher, IHostEnvironment environment)
    {
        await EnsureDatabaseStructureAsync(dbContext, environment);
        await SeedFiscalCatalogAsync(dbContext);

        var existingPermissions = await dbContext.Permissoes.ToDictionaryAsync(item => item.Codigo);
        foreach (var definicao in Permissoes.Definitions)
        {
            if (existingPermissions.TryGetValue(definicao.Codigo, out var permissaoExistente))
            {
                if (permissaoExistente.Nome != definicao.Nome)
                {
                    permissaoExistente.Nome = definicao.Nome;
                }

                continue;
            }

            dbContext.Permissoes.Add(new Permissao
            {
                PermissaoId = Guid.NewGuid(),
                Codigo = definicao.Codigo,
                Nome = definicao.Nome
            });
        }

        await dbContext.SaveChangesAsync();

        var existingProfiles = await dbContext.Perfis.ToDictionaryAsync(item => item.Codigo);
        var newlyCreatedProfileCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var codigo in Perfis.All)
        {
            if (existingProfiles.ContainsKey(codigo))
            {
                continue;
            }

            dbContext.Perfis.Add(new Perfil
            {
                PerfilId = Guid.NewGuid(),
                Codigo = codigo,
                Nome = codigo
            });
            newlyCreatedProfileCodes.Add(codigo);
        }

        await dbContext.SaveChangesAsync();

        var permissions = await dbContext.Permissoes.ToDictionaryAsync(item => item.Codigo, item => item.PermissaoId);
        var profiles = await dbContext.Perfis.ToDictionaryAsync(item => item.Codigo, item => item.PerfilId);

        var profilePermissions = new Dictionary<string, string[]>
        {
            [Perfis.Admin] = Permissoes.All.ToArray(),
            [Perfis.Gerente] =
            [
                Permissoes.VisualizarDashboard,
                Permissoes.VisualizarProduto,
                Permissoes.VisualizarCatalogoProdutos,
                Permissoes.VisualizarPedidos,
                Permissoes.GerenciarPedidos,
                Permissoes.CriarProduto,
                Permissoes.EditarProduto,
                Permissoes.ExcluirProduto,
                Permissoes.VisualizarClientes,
                Permissoes.GerenciarClientes,
                Permissoes.RealizarVenda,
                Permissoes.CancelarVenda,
                Permissoes.AplicarDesconto,
                Permissoes.VisualizarVendas,
                Permissoes.AbrirCaixa,
                Permissoes.FecharCaixa,
                Permissoes.SangriaCaixa,
                Permissoes.SuprimentoCaixa,
                Permissoes.VisualizarRelatorios,
                Permissoes.VisualizarMonitorOperacional,
                Permissoes.VisualizarFinanceiro,
                Permissoes.GerenciarFinanceiro,
                Permissoes.GerenciarEmpresaFiscal,
                Permissoes.VisualizarNotasFiscais,
                Permissoes.EmitirNotasFiscais,
                Permissoes.VisualizarHardware
            ],
            [Perfis.OperadorCaixa] =
            [
                Permissoes.VisualizarProduto,
                Permissoes.VisualizarCatalogoProdutos,
                Permissoes.VisualizarPedidos,
                Permissoes.GerenciarPedidos,
                Permissoes.VisualizarClientes,
                Permissoes.RealizarVenda,
                Permissoes.VisualizarVendas,
                Permissoes.VisualizarNotasFiscais,
                Permissoes.EmitirNotasFiscais,
                Permissoes.AbrirCaixa,
                Permissoes.FecharCaixa,
                Permissoes.SangriaCaixa,
                Permissoes.SuprimentoCaixa,
                Permissoes.VisualizarFinanceiro,
                Permissoes.VisualizarHardware
            ],
            [Perfis.Comprador] =
            [
                Permissoes.VisualizarCatalogoProdutos,
                Permissoes.RealizarPedidoCliente,
                Permissoes.AcompanharPedidosCliente
            ],
            [Perfis.Entregador] =
            [
                Permissoes.AcessarPainelEntregador
            ]
        };

        foreach (var profilePermission in profilePermissions)
        {
            var perfilId = profiles[profilePermission.Key];
            var existingCodes = await dbContext.PerfilPermissoes
                .Where(item => item.PerfilId == perfilId)
                .Join(dbContext.Permissoes, item => item.PermissaoId, item => item.PermissaoId, (item, permissao) => permissao.Codigo)
                .ToListAsync();

            // Existing non-admin profiles keep their current permission set so new releases
            // do not broaden access silently for operator accounts.
            var shouldApplyDefaultPermissions =
                newlyCreatedProfileCodes.Contains(profilePermission.Key) ||
                existingCodes.Count == 0 ||
                string.Equals(profilePermission.Key, Perfis.Admin, StringComparison.OrdinalIgnoreCase);

            if (!shouldApplyDefaultPermissions)
            {
                continue;
            }

            foreach (var permissionCode in profilePermission.Value.Except(existingCodes, StringComparer.OrdinalIgnoreCase))
            {
                dbContext.PerfilPermissoes.Add(new PerfilPermissao
                {
                    PerfilId = perfilId,
                    PermissaoId = permissions[permissionCode]
                });
            }
        }

        await dbContext.SaveChangesAsync();

        Empresa? empresa = await dbContext.Empresas
            .OrderBy(item => item.EmpresaId)
            .FirstOrDefaultAsync();
        if (empresa is null)
        {
            empresa = new Empresa
            {
                EmpresaId = Guid.NewGuid(),
                Nome = "Empresa Demo PDV",
                NomeFantasia = "Loja Demo",
                Cnpj = "00.000.000/0001-00",
                Ativo = true
            };

            dbContext.Empresas.Add(empresa);
            await dbContext.SaveChangesAsync();
        }

        if (!await dbContext.Categorias.AnyAsync(item => item.EmpresaId == empresa.EmpresaId))
        {
            dbContext.Categorias.Add(new Categoria
            {
                CategoriaId = Guid.NewGuid(),
                EmpresaId = empresa.EmpresaId,
                Nome = "Geral"
            });

            await dbContext.SaveChangesAsync();
        }

        if (!await dbContext.Transportadoras.AnyAsync(item => item.EmpresaId == empresa.EmpresaId))
        {
            dbContext.Transportadoras.Add(new Transportadora
            {
                TransportadoraId = Guid.NewGuid(),
                EmpresaId = empresa.EmpresaId,
                Nome = "Entrega propria",
                NomeFantasia = empresa.NomeFantasia,
                Telefone = empresa.Telefone,
                Email = empresa.EmailFiscal,
                Responsavel = "Central operacional",
                Cep = NormalizeFixedDigits(empresa.Cep, 8),
                Logradouro = NormalizeNullable(empresa.Logradouro),
                Numero = NormalizeNullable(empresa.Numero),
                Complemento = NormalizeNullable(empresa.Complemento),
                Bairro = NormalizeNullable(empresa.Bairro),
                Cidade = NormalizeNullable(empresa.Cidade),
                Uf = NormalizeNullable(empresa.Uf)?.ToUpperInvariant(),
                CodigoMunicipioIbge = NormalizeFixedDigits(empresa.CodigoMunicipioIbge, 7),
                Endereco = string.Join(" | ", new[]
                {
                    string.Join(", ", new[] { NormalizeNullable(empresa.Logradouro), NormalizeNullable(empresa.Numero), NormalizeNullable(empresa.Complemento) }
                        .Where(item => !string.IsNullOrWhiteSpace(item))),
                    string.Join(" - ", new[] { NormalizeNullable(empresa.Bairro), NormalizeNullable(empresa.Cidade), NormalizeNullable(empresa.Uf) }
                        .Where(item => !string.IsNullOrWhiteSpace(item))),
                    NormalizeFixedDigits(empresa.Cep, 8) is { Length: 8 } cep ? $"CEP {cep[..5]}-{cep[5..]}" : null
                }.Where(item => !string.IsNullOrWhiteSpace(item))),
                CorTemaHex = "#1D4ED8",
                PrazoMedioEntregaMinutos = 60,
                Observacao = "Transportadora inicial criada automaticamente para os fluxos de entrega da loja."
            });

            await dbContext.SaveChangesAsync();
        }

        await EnsureDefaultUserAsync(
            dbContext,
            passwordHasher,
            empresa.EmpresaId,
            profiles[Perfis.Admin],
            "Master PDV",
            UsuariosSistema.MasterEmail,
            "Master@123",
            codigoBarrasCracha: "900000000001");

        await EnsureDefaultUserAsync(
            dbContext,
            passwordHasher,
            empresa.EmpresaId,
            profiles[Perfis.Admin],
            "Administrador",
            "admin@pdv.local",
            "Admin@123",
            codigoBarrasCracha: "900000000002");

        await EnsureDefaultUserAsync(
            dbContext,
            passwordHasher,
            empresa.EmpresaId,
            profiles[Perfis.Gerente],
            "Gerente Loja",
            "gerente@pdv.local",
            "Gerente@123",
            codigoBarrasCracha: "900000000003");

        await EnsureDefaultUserAsync(
            dbContext,
            passwordHasher,
            empresa.EmpresaId,
            profiles[Perfis.OperadorCaixa],
            "Operador Caixa",
            "operador@pdv.local",
            "Operador@123",
            codigoBarrasCracha: "900000000004");

        var compradorCliente = await dbContext.Clientes
            .FirstOrDefaultAsync(item => item.EmpresaId == empresa.EmpresaId && item.Email == "comprador@pdv.local");
        if (compradorCliente is null)
        {
            compradorCliente = new Cliente
            {
                ClienteId = Guid.NewGuid(),
                EmpresaId = empresa.EmpresaId,
                Nome = "Comprador Demo",
                Documento = "12345678901",
                Telefone = "11999990000",
                Email = "comprador@pdv.local",
                Cep = "13270000",
                Logradouro = "Rua do Comprador",
                Numero = "100",
                Bairro = "Centro",
                Cidade = "Vinhedo",
                Uf = "SP",
                Endereco = "Rua do Comprador, 100 - Centro - Vinhedo/SP",
                Ativo = true,
                DataCadastro = DateTime.UtcNow
            };

            dbContext.Clientes.Add(compradorCliente);
            await dbContext.SaveChangesAsync();
        }

        await EnsureDefaultUserAsync(
            dbContext,
            passwordHasher,
            empresa.EmpresaId,
            profiles[Perfis.Comprador],
            "Comprador Demo",
            "comprador@pdv.local",
            "Comprador@123",
            compradorCliente.ClienteId);

        await EnsureDefaultUserAsync(
            dbContext,
            passwordHasher,
            empresa.EmpresaId,
            profiles[Perfis.Entregador],
            "Entregador Demo",
            "entregador@pdv.local",
            "Entregador@123",
            codigoBarrasCracha: "900000000005");

        await dbContext.SaveChangesAsync();
    }

    private static async Task SeedFiscalCatalogAsync(AppDbContext dbContext)
    {
        var legacyFiscalData = await dbContext.Produtos
            .AsNoTracking()
            .Select(item => new
            {
                item.Ncm,
                item.Cest,
                item.CfopCompraPadrao,
                item.CfopCompraInterestadual,
                item.CfopVendaPadrao,
                item.CfopVendaInterestadual,
                item.Csosn,
                item.CstIcms,
                item.CstPis,
                item.CstCofins,
                item.BeneficioFiscalCodigo
            })
            .ToListAsync();

        var ncmMap = await dbContext.FiscalNcms.ToDictionaryAsync(item => item.Codigo);
        foreach (var seed in BaseFiscalNcms)
        {
            if (ncmMap.TryGetValue(seed.Codigo, out var existing))
            {
                existing.Descricao = seed.Descricao;
                existing.DescricaoCompleta = seed.Descricao;
                existing.CestPadraoCodigo = seed.CestPadraoCodigo;
                existing.AliquotaIbpt = seed.AliquotaIbpt;
                existing.SujeitoSt = seed.SujeitoSt;
                existing.Vigente = true;
                existing.Ativo = true;
                continue;
            }

            var entity = new FiscalNcm
            {
                FiscalNcmId = Guid.NewGuid(),
                Codigo = seed.Codigo,
                Descricao = seed.Descricao,
                DescricaoCompleta = seed.Descricao,
                CestPadraoCodigo = seed.CestPadraoCodigo,
                AliquotaIbpt = seed.AliquotaIbpt,
                SujeitoSt = seed.SujeitoSt,
                Vigente = true,
                Ativo = true
            };

            dbContext.FiscalNcms.Add(entity);
            ncmMap[entity.Codigo] = entity;
        }

        foreach (var codigo in legacyFiscalData
                     .Select(item => NormalizeFixedDigits(item.Ncm, 8))
                     .Where(item => item is not null)
                     .Cast<string>()
                     .Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (ncmMap.ContainsKey(codigo))
            {
                continue;
            }

            var entity = new FiscalNcm
            {
                FiscalNcmId = Guid.NewGuid(),
                Codigo = codigo,
                Descricao = "NCM importado do cadastro legado - revisar descricao fiscal.",
                DescricaoCompleta = "NCM importado do cadastro legado - revisar descricao fiscal.",
                Vigente = false,
                Ativo = true
            };

            dbContext.FiscalNcms.Add(entity);
            ncmMap[codigo] = entity;
        }

        var cestMap = await dbContext.FiscalCests.ToDictionaryAsync(item => item.Codigo);
        foreach (var seed in BaseFiscalCests)
        {
            if (cestMap.TryGetValue(seed.Codigo, out var existing))
            {
                existing.Descricao = seed.Descricao;
                existing.NcmCodigo = seed.NcmCodigo;
                existing.Ativo = true;
                continue;
            }

            var entity = new FiscalCest
            {
                FiscalCestId = Guid.NewGuid(),
                Codigo = seed.Codigo,
                Descricao = seed.Descricao,
                NcmCodigo = seed.NcmCodigo,
                Ativo = true
            };

            dbContext.FiscalCests.Add(entity);
            cestMap[entity.Codigo] = entity;
        }

        foreach (var codigo in legacyFiscalData
                     .Select(item => NormalizeFixedDigits(item.Cest, 7))
                     .Where(item => item is not null)
                     .Cast<string>()
                     .Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (cestMap.ContainsKey(codigo))
            {
                continue;
            }

            var entity = new FiscalCest
            {
                FiscalCestId = Guid.NewGuid(),
                Codigo = codigo,
                Descricao = "CEST importado do cadastro legado - revisar classificacao.",
                Ativo = true
            };

            dbContext.FiscalCests.Add(entity);
            cestMap[codigo] = entity;
        }

        var cfopMap = await dbContext.FiscalCfops.ToDictionaryAsync(item => item.Codigo);
        foreach (var seed in BaseFiscalCfops)
        {
            if (cfopMap.TryGetValue(seed.Codigo, out var existing))
            {
                existing.Descricao = seed.Descricao;
                existing.PerfilFiscalPadrao = seed.PerfilFiscalPadrao;
                existing.Entrada = seed.Entrada;
                existing.Saida = seed.Saida;
                existing.DentroEstado = seed.DentroEstado;
                existing.ForaEstado = seed.ForaEstado;
                existing.ExigeContexto = seed.ExigeContexto;
                existing.Ativo = true;
                continue;
            }

            var entity = new FiscalCfop
            {
                FiscalCfopId = Guid.NewGuid(),
                Codigo = seed.Codigo,
                Descricao = seed.Descricao,
                PerfilFiscalPadrao = seed.PerfilFiscalPadrao,
                Entrada = seed.Entrada,
                Saida = seed.Saida,
                DentroEstado = seed.DentroEstado,
                ForaEstado = seed.ForaEstado,
                ExigeContexto = seed.ExigeContexto,
                Ativo = true
            };

            dbContext.FiscalCfops.Add(entity);
            cfopMap[entity.Codigo] = entity;
        }

        var legacyCfopCodes = legacyFiscalData
            .SelectMany(item => new[]
            {
                item.CfopCompraPadrao,
                item.CfopCompraInterestadual,
                item.CfopVendaPadrao,
                item.CfopVendaInterestadual
            })
            .Select(item => NormalizeFixedDigits(item, 4))
            .Where(item => item is not null)
            .Cast<string>()
            .Distinct(StringComparer.OrdinalIgnoreCase);

        foreach (var codigo in legacyCfopCodes)
        {
            if (cfopMap.ContainsKey(codigo))
            {
                continue;
            }

            var entity = new FiscalCfop
            {
                FiscalCfopId = Guid.NewGuid(),
                Codigo = codigo,
                Descricao = "CFOP importado do cadastro legado - revisar operacao fiscal.",
                Entrada = codigo.StartsWith('1') || codigo.StartsWith('2') || codigo.StartsWith('3'),
                Saida = codigo.StartsWith('5') || codigo.StartsWith('6') || codigo.StartsWith('7'),
                DentroEstado = codigo.StartsWith('1') || codigo.StartsWith('5'),
                ForaEstado = codigo.StartsWith('2') || codigo.StartsWith('6'),
                ExigeContexto = false,
                Ativo = true
            };

            dbContext.FiscalCfops.Add(entity);
            cfopMap[codigo] = entity;
        }

        var csosnMap = await dbContext.FiscalCsosns.ToDictionaryAsync(item => item.Codigo);
        foreach (var seed in BaseFiscalCsosns)
        {
            if (csosnMap.TryGetValue(seed.Codigo, out var existing))
            {
                existing.Descricao = seed.Descricao;
                existing.ExigeSt = seed.ExigeSt;
                existing.DestacaIcmsProprio = seed.DestacaIcmsProprio;
                existing.Ativo = true;
                continue;
            }

            var entity = new FiscalCsosn
            {
                FiscalCsosnId = Guid.NewGuid(),
                Codigo = seed.Codigo,
                Descricao = seed.Descricao,
                ExigeSt = seed.ExigeSt,
                DestacaIcmsProprio = seed.DestacaIcmsProprio,
                Ativo = true
            };

            dbContext.FiscalCsosns.Add(entity);
            csosnMap[entity.Codigo] = entity;
        }

        foreach (var codigo in legacyFiscalData
                     .Select(item => NormalizeNullable(item.Csosn)?.ToUpperInvariant())
                     .Where(item => item is not null)
                     .Cast<string>()
                     .Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (csosnMap.ContainsKey(codigo))
            {
                continue;
            }

            var entity = new FiscalCsosn
            {
                FiscalCsosnId = Guid.NewGuid(),
                Codigo = codigo,
                Descricao = "CSOSN importado do cadastro legado - revisar enquadramento.",
                Ativo = true
            };

            dbContext.FiscalCsosns.Add(entity);
            csosnMap[codigo] = entity;
        }

        var cstIcmsMap = await dbContext.FiscalCstIcms.ToDictionaryAsync(item => item.Codigo);
        foreach (var seed in BaseFiscalCstIcms)
        {
            if (cstIcmsMap.TryGetValue(seed.Codigo, out var existing))
            {
                existing.Descricao = seed.Descricao;
                existing.ExigeSt = seed.ExigeSt;
                existing.DestacaIcmsProprio = seed.DestacaIcmsProprio;
                existing.Ativo = true;
                continue;
            }

            var entity = new FiscalCstIcms
            {
                FiscalCstIcmsId = Guid.NewGuid(),
                Codigo = seed.Codigo,
                Descricao = seed.Descricao,
                ExigeSt = seed.ExigeSt,
                DestacaIcmsProprio = seed.DestacaIcmsProprio,
                Ativo = true
            };

            dbContext.FiscalCstIcms.Add(entity);
            cstIcmsMap[entity.Codigo] = entity;
        }

        foreach (var codigo in legacyFiscalData
                     .Select(item => NormalizeNullable(item.CstIcms)?.ToUpperInvariant())
                     .Where(item => item is not null)
                     .Cast<string>()
                     .Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (cstIcmsMap.ContainsKey(codigo))
            {
                continue;
            }

            var entity = new FiscalCstIcms
            {
                FiscalCstIcmsId = Guid.NewGuid(),
                Codigo = codigo,
                Descricao = "CST ICMS importado do cadastro legado - revisar enquadramento.",
                Ativo = true
            };

            dbContext.FiscalCstIcms.Add(entity);
            cstIcmsMap[codigo] = entity;
        }

        var cstPisCofinsMap = await dbContext.FiscalCstPisCofins.ToDictionaryAsync(item => item.Codigo);
        foreach (var seed in BaseFiscalCstPisCofins)
        {
            if (cstPisCofinsMap.TryGetValue(seed.Codigo, out var existing))
            {
                existing.Descricao = seed.Descricao;
                existing.AliquotaZero = seed.AliquotaZero;
                existing.UsaAliquotaPadrao = seed.UsaAliquotaPadrao;
                existing.Ativo = true;
                continue;
            }

            var entity = new FiscalCstPisCofins
            {
                FiscalCstPisCofinsId = Guid.NewGuid(),
                Codigo = seed.Codigo,
                Descricao = seed.Descricao,
                AliquotaZero = seed.AliquotaZero,
                UsaAliquotaPadrao = seed.UsaAliquotaPadrao,
                Ativo = true
            };

            dbContext.FiscalCstPisCofins.Add(entity);
            cstPisCofinsMap[entity.Codigo] = entity;
        }

        foreach (var codigo in legacyFiscalData
                     .SelectMany(item => new[] { item.CstPis, item.CstCofins })
                     .Select(item => NormalizeNullable(item)?.ToUpperInvariant())
                     .Where(item => item is not null)
                     .Cast<string>()
                     .Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (cstPisCofinsMap.ContainsKey(codigo))
            {
                continue;
            }

            var entity = new FiscalCstPisCofins
            {
                FiscalCstPisCofinsId = Guid.NewGuid(),
                Codigo = codigo,
                Descricao = "CST PIS/COFINS importado do cadastro legado - revisar enquadramento.",
                Ativo = true
            };

            dbContext.FiscalCstPisCofins.Add(entity);
            cstPisCofinsMap[codigo] = entity;
        }

        var aliquotasPadrao = await dbContext.FiscalAliquotasIcms
            .Where(item =>
                item.UfDestino == null &&
                item.NcmPrefixo == null &&
                item.OrigemFiscalCodigo == null &&
                item.CfopCodigo == null &&
                item.RegimeTributario == null &&
                item.ConsumidorFinal == null)
            .ToListAsync();

        foreach (var seed in BaseFiscalAliquotasIcms)
        {
            var existing = aliquotasPadrao.FirstOrDefault(item => item.UfOrigem == seed.UfOrigem);
            if (existing is not null)
            {
                existing.Aliquota = seed.Aliquota;
                existing.Prioridade = seed.Prioridade;
                existing.Descricao = seed.Descricao;
                existing.Ativo = true;
                continue;
            }

            dbContext.FiscalAliquotasIcms.Add(new FiscalAliquotaIcms
            {
                FiscalAliquotaIcmsId = Guid.NewGuid(),
                UfOrigem = seed.UfOrigem,
                Aliquota = seed.Aliquota,
                Prioridade = seed.Prioridade,
                Descricao = seed.Descricao,
                Ativo = true
            });
        }

        var beneficiosMap = await dbContext.FiscalBeneficios.ToDictionaryAsync(item => item.Codigo);
        foreach (var codigo in legacyFiscalData
                     .Select(item => NormalizeNullable(item.BeneficioFiscalCodigo)?.ToUpperInvariant())
                     .Where(item => item is not null)
                     .Cast<string>()
                     .Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (beneficiosMap.ContainsKey(codigo))
            {
                continue;
            }

            var entity = new FiscalBeneficio
            {
                FiscalBeneficioId = Guid.NewGuid(),
                Codigo = codigo,
                Descricao = "Beneficio fiscal importado do cadastro legado - revisar com a contabilidade.",
                Ativo = true
            };

            dbContext.FiscalBeneficios.Add(entity);
            beneficiosMap[codigo] = entity;
        }

        var ufParametroMap = await dbContext.FiscalUfParametros.ToDictionaryAsync(item => item.Uf);
        foreach (var seed in BaseFiscalAliquotasIcms)
        {
            if (ufParametroMap.TryGetValue(seed.UfOrigem, out var parametroExistente))
            {
                parametroExistente.AliquotaInternaIcms = seed.Aliquota;
                parametroExistente.AliquotaInterestadual = 12m;
                parametroExistente.AliquotaFcp = 2m;
                parametroExistente.AliquotaIssPadrao = 5m;
                parametroExistente.Observacoes = "Parametro inicial do sistema - confirme ICMS interno, interestadual, FCP e ISS com a contabilidade.";
                parametroExistente.Ativo = true;
                continue;
            }

            var entity = new FiscalUfParametro
            {
                FiscalUfParametroId = Guid.NewGuid(),
                Uf = seed.UfOrigem,
                AliquotaInternaIcms = seed.Aliquota,
                AliquotaInterestadual = 12m,
                AliquotaFcp = 2m,
                AliquotaIssPadrao = 5m,
                Observacoes = "Parametro inicial do sistema - confirme ICMS interno, interestadual, FCP e ISS com a contabilidade.",
                Ativo = true
            };

            dbContext.FiscalUfParametros.Add(entity);
            ufParametroMap[entity.Uf] = entity;
        }

        await dbContext.SaveChangesAsync();
    }

    private static async Task EnsureDatabaseStructureAsync(AppDbContext dbContext, IHostEnvironment environment)
    {
        var databaseCreator = dbContext.Database.GetService<IRelationalDatabaseCreator>();

        if (!await databaseCreator.ExistsAsync())
        {
            await databaseCreator.CreateAsync();
        }

        // PostgreSQL/Supabase uses the EF Core model to create the schema.
        // All legacy Ensure* SQL scripts below this method are SQL Server-specific
        // (OBJECT_ID, sys.indexes, COL_LENGTH, uniqueidentifier, nvarchar, bit,
        // datetime2, NEWID, SYSUTCDATETIME, etc.) and must never be sent to Npgsql.
        if (dbContext.Database.IsNpgsql())
        {
            await dbContext.Database.ExecuteSqlRawAsync(
                """CREATE SCHEMA IF NOT EXISTS "pdv";""");

            var existingPostgreSqlTables = await GetExistingPdvTablesAsync(dbContext);

            if (existingPostgreSqlTables.Count == 0)
            {
                await databaseCreator.CreateTablesAsync();
            }
            else
            {
                var missingPostgreSqlTables = RequiredTables
                    .Except(existingPostgreSqlTables, StringComparer.OrdinalIgnoreCase)
                    .OrderBy(item => item)
                    .ToArray();

                if (missingPostgreSqlTables.Length > 0)
                {
                    throw new InvalidOperationException(
                        "O banco PostgreSQL ja possui parte da estrutura do schema 'pdv', " +
                        "mas existem tabelas obrigatorias ausentes: " +
                        $"{string.Join(", ", missingPostgreSqlTables)}. " +
                        "Para uma instalacao PostgreSQL nova, limpe o schema 'pdv' e execute o deploy novamente, " +
                        "ou aplique uma migracao PostgreSQL correspondente ao modelo atual.");
                }

                // The PostgreSQL database is already structurally complete.
                // Do not execute the legacy SQL Server patch methods.
            }

            return;
        }

        // SQL Server keeps the existing patch/migration path.
        var existingTables = await GetExistingPdvTablesAsync(dbContext);
        if (existingTables.Count == 0)
        {
            await databaseCreator.CreateTablesAsync();
            await EnsureTerminalPdvTableAsync(dbContext);
            await EnsureProdutoCodigoTablesAsync(dbContext);
            await EnsureEmpresaFiscalColumnsAsync(dbContext);
            await EnsureProdutoCatalogoColumnsAsync(dbContext);
            await EnsureClienteColumnsAsync(dbContext);
            await EnsureMunicipioTableAsync(dbContext);
            await EnsureProdutoFornecedorColumnsAsync(dbContext);
            await EnsureProdutoLoteTablesAsync(dbContext);
            await EnsureEstoqueErpTablesAsync(dbContext);
            await EnsureUsuarioAccessStructureAsync(dbContext);
            await EnsureProdutoFiscalColumnsAsync(dbContext);
            await EnsureProdutoFiscalAssistenteTablesAsync(dbContext);
            await EnsureAuditColumnsAsync(dbContext);
            await EnsureProdutoCampoPadraoTableAsync(dbContext);
            await EnsureFinanceiroTablesAsync(dbContext);
            await EnsureCobrancaDigitalStructureAsync(dbContext);
            await EnsureNotaFiscalTablesAsync(dbContext);
            await EnsureVendaPagamentoTransactionColumnsAsync(dbContext);
            await EnsurePedidoWorkflowStructureAsync(dbContext);
            await EnsureDeliveryExperienceStructureAsync(dbContext);
            await EnsureFiscalSefazUrlTableAsync(dbContext);
            return;
        }

        await EnsureTerminalPdvTableAsync(dbContext);
        await EnsureProdutoCodigoTablesAsync(dbContext);
        await EnsureEmpresaFiscalColumnsAsync(dbContext);
        await EnsureProdutoCatalogoColumnsAsync(dbContext);
        await EnsureClienteColumnsAsync(dbContext);
        await EnsureMunicipioTableAsync(dbContext);
        await EnsureProdutoFornecedorColumnsAsync(dbContext);
        await EnsureProdutoLoteTablesAsync(dbContext);
        await EnsureEstoqueErpTablesAsync(dbContext);
        await EnsureUsuarioAccessStructureAsync(dbContext);
        await EnsureProdutoFiscalColumnsAsync(dbContext);
        await EnsureProdutoFiscalAssistenteTablesAsync(dbContext);
        await EnsureAuditColumnsAsync(dbContext);
        await EnsureProdutoCampoPadraoTableAsync(dbContext);
        await EnsureFinanceiroTablesAsync(dbContext);
        await EnsureCobrancaDigitalStructureAsync(dbContext);
        await EnsureNotaFiscalTablesAsync(dbContext);
        await EnsureVendaPagamentoTransactionColumnsAsync(dbContext);
        await EnsurePedidoWorkflowStructureAsync(dbContext);
        await EnsureDeliveryExperienceStructureAsync(dbContext);
        await EnsureFiscalSefazUrlTableAsync(dbContext);

        existingTables = await GetExistingPdvTablesAsync(dbContext);
        var missingRequiredTables = RequiredTables
            .Except(existingTables, StringComparer.OrdinalIgnoreCase)
            .OrderBy(item => item)
            .ToArray();

        if (missingRequiredTables.Length == 0)
        {
            return;
        }

        if (environment.IsDevelopment())
        {
            await ResetPdvSchemaAsync(dbContext);
            await databaseCreator.CreateTablesAsync();
            await EnsureTerminalPdvTableAsync(dbContext);
            await EnsureEmpresaFiscalColumnsAsync(dbContext);
            await EnsureProdutoCatalogoColumnsAsync(dbContext);
            await EnsureClienteColumnsAsync(dbContext);
            await EnsureMunicipioTableAsync(dbContext);
            await EnsureProdutoFornecedorColumnsAsync(dbContext);
            await EnsureProdutoLoteTablesAsync(dbContext);
            await EnsureEstoqueErpTablesAsync(dbContext);
            await EnsureUsuarioAccessStructureAsync(dbContext);
            await EnsureProdutoFiscalColumnsAsync(dbContext);
            await EnsureProdutoFiscalAssistenteTablesAsync(dbContext);
            await EnsureAuditColumnsAsync(dbContext);
            await EnsureProdutoCampoPadraoTableAsync(dbContext);
            await EnsureFinanceiroTablesAsync(dbContext);
            await EnsureCobrancaDigitalStructureAsync(dbContext);
            await EnsureNotaFiscalTablesAsync(dbContext);
            await EnsureVendaPagamentoTransactionColumnsAsync(dbContext);
            await EnsurePedidoWorkflowStructureAsync(dbContext);
            await EnsureDeliveryExperienceStructureAsync(dbContext);
            await EnsureFiscalSefazUrlTableAsync(dbContext);
            return;
        }

        throw new InvalidOperationException(
            "O banco de dados existe, mas a estrutura do schema 'pdv' esta incompleta. " +
            $"Tabelas ausentes: {string.Join(", ", missingRequiredTables)}.");
    }

    private static async Task EnsureEmpresaFiscalColumnsAsync(AppDbContext dbContext)
    {
        const string patchScript =
            """
            IF COL_LENGTH(N'pdv.Empresas', N'InscricaoEstadual') IS NULL
                ALTER TABLE [pdv].[Empresas] ADD [InscricaoEstadual] nvarchar(20) NULL;

            IF COL_LENGTH(N'pdv.Empresas', N'InscricaoEstadualIsento') IS NULL
                ALTER TABLE [pdv].[Empresas] ADD [InscricaoEstadualIsento] bit NOT NULL CONSTRAINT [DF_Empresas_InscricaoEstadualIsento] DEFAULT 0 WITH VALUES;

            IF COL_LENGTH(N'pdv.Empresas', N'InscricaoMunicipal') IS NULL
                ALTER TABLE [pdv].[Empresas] ADD [InscricaoMunicipal] nvarchar(20) NULL;

            IF COL_LENGTH(N'pdv.Empresas', N'CnaePrincipal') IS NULL
                ALTER TABLE [pdv].[Empresas] ADD [CnaePrincipal] nvarchar(20) NULL;

            IF COL_LENGTH(N'pdv.Empresas', N'Telefone') IS NULL
                ALTER TABLE [pdv].[Empresas] ADD [Telefone] nvarchar(20) NULL;

            IF COL_LENGTH(N'pdv.Empresas', N'EmailFiscal') IS NULL
                ALTER TABLE [pdv].[Empresas] ADD [EmailFiscal] nvarchar(150) NULL;

            IF COL_LENGTH(N'pdv.Empresas', N'Cep') IS NULL
                ALTER TABLE [pdv].[Empresas] ADD [Cep] nvarchar(8) NULL;

            IF COL_LENGTH(N'pdv.Empresas', N'Logradouro') IS NULL
                ALTER TABLE [pdv].[Empresas] ADD [Logradouro] nvarchar(180) NULL;

            IF COL_LENGTH(N'pdv.Empresas', N'Numero') IS NULL
                ALTER TABLE [pdv].[Empresas] ADD [Numero] nvarchar(20) NULL;

            IF COL_LENGTH(N'pdv.Empresas', N'Complemento') IS NULL
                ALTER TABLE [pdv].[Empresas] ADD [Complemento] nvarchar(120) NULL;

            IF COL_LENGTH(N'pdv.Empresas', N'Bairro') IS NULL
                ALTER TABLE [pdv].[Empresas] ADD [Bairro] nvarchar(80) NULL;

            IF COL_LENGTH(N'pdv.Empresas', N'Cidade') IS NULL
                ALTER TABLE [pdv].[Empresas] ADD [Cidade] nvarchar(80) NULL;

            IF COL_LENGTH(N'pdv.Empresas', N'Uf') IS NULL
                ALTER TABLE [pdv].[Empresas] ADD [Uf] nvarchar(2) NULL;

            IF COL_LENGTH(N'pdv.Empresas', N'CodigoMunicipioIbge') IS NULL
                ALTER TABLE [pdv].[Empresas] ADD [CodigoMunicipioIbge] nvarchar(7) NULL;

            IF COL_LENGTH(N'pdv.Empresas', N'CertificadoDigitalCaminho') IS NULL
                ALTER TABLE [pdv].[Empresas] ADD [CertificadoDigitalCaminho] nvarchar(500) NULL;

            IF COL_LENGTH(N'pdv.Empresas', N'CertificadoDigitalSenhaProtegida') IS NULL
                ALTER TABLE [pdv].[Empresas] ADD [CertificadoDigitalSenhaProtegida] nvarchar(max) NULL;

            IF COL_LENGTH(N'pdv.Empresas', N'RegimeTributario') IS NULL
                ALTER TABLE [pdv].[Empresas] ADD [RegimeTributario] nvarchar(40) NOT NULL CONSTRAINT [DF_Empresas_RegimeTributario] DEFAULT N'SimplesNacional' WITH VALUES;

            IF COL_LENGTH(N'pdv.Empresas', N'AmbienteNfe') IS NULL
                ALTER TABLE [pdv].[Empresas] ADD [AmbienteNfe] nvarchar(20) NOT NULL CONSTRAINT [DF_Empresas_AmbienteNfe] DEFAULT N'Homologacao' WITH VALUES;

            IF COL_LENGTH(N'pdv.Empresas', N'ProviderFiscal') IS NULL
                ALTER TABLE [pdv].[Empresas] ADD [ProviderFiscal] nvarchar(30) NOT NULL CONSTRAINT [DF_Empresas_ProviderFiscal] DEFAULT N'SefazDirect' WITH VALUES;

            IF COL_LENGTH(N'pdv.Empresas', N'UsaIntegracaoDiretaSefaz') IS NULL
                ALTER TABLE [pdv].[Empresas] ADD [UsaIntegracaoDiretaSefaz] bit NOT NULL CONSTRAINT [DF_Empresas_UsaIntegracaoDiretaSefaz] DEFAULT 1 WITH VALUES;

            IF COL_LENGTH(N'pdv.Empresas', N'TokenApiFiscalProtegido') IS NULL
                ALTER TABLE [pdv].[Empresas] ADD [TokenApiFiscalProtegido] nvarchar(max) NULL;

            IF COL_LENGTH(N'pdv.Empresas', N'ApiFiscalClientId') IS NULL
                ALTER TABLE [pdv].[Empresas] ADD [ApiFiscalClientId] nvarchar(200) NULL;

            IF COL_LENGTH(N'pdv.Empresas', N'ApiFiscalClientSecretProtegido') IS NULL
                ALTER TABLE [pdv].[Empresas] ADD [ApiFiscalClientSecretProtegido] nvarchar(max) NULL;

            IF COL_LENGTH(N'pdv.Empresas', N'UrlApiFiscal') IS NULL
                ALTER TABLE [pdv].[Empresas] ADD [UrlApiFiscal] nvarchar(500) NULL;

            IF COL_LENGTH(N'pdv.Empresas', N'SerieNfe') IS NULL
                ALTER TABLE [pdv].[Empresas] ADD [SerieNfe] int NOT NULL CONSTRAINT [DF_Empresas_SerieNfe] DEFAULT 1 WITH VALUES;

            IF COL_LENGTH(N'pdv.Empresas', N'ProximoNumeroNfe') IS NULL
                ALTER TABLE [pdv].[Empresas] ADD [ProximoNumeroNfe] int NOT NULL CONSTRAINT [DF_Empresas_ProximoNumeroNfe] DEFAULT 1 WITH VALUES;
            """;

        await dbContext.Database.ExecuteSqlRawAsync(patchScript);
    }

    private static async Task EnsureTerminalPdvTableAsync(AppDbContext dbContext)
    {
        const string patchScript =
            """
            IF OBJECT_ID(N'[pdv].[TerminaisPdv]', N'U') IS NULL
            BEGIN
                CREATE TABLE [pdv].[TerminaisPdv] (
                    [TerminalPdvId] uniqueidentifier NOT NULL,
                    [EmpresaId] uniqueidentifier NOT NULL,
                    [CodigoTerminal] nvarchar(80) NOT NULL,
                    [NomeTerminal] nvarchar(120) NOT NULL,
                    [LojaNome] nvarchar(120) NULL,
                    [EstadoUf] nvarchar(2) NULL,
                    [NumeroPdv] int NOT NULL,
                    [PerfilInstalacao] nvarchar(40) NOT NULL,
                    [PerfilImpressora] nvarchar(40) NOT NULL CONSTRAINT [DF_TerminaisPdv_PerfilImpressora] DEFAULT N'TERMICA_80MM',
                    [PerfilScanner] nvarchar(40) NOT NULL CONSTRAINT [DF_TerminaisPdv_PerfilScanner] DEFAULT N'HIBRIDO',
                    [PerfilTeclado] nvarchar(40) NOT NULL CONSTRAINT [DF_TerminaisPdv_PerfilTeclado] DEFAULT N'PADRAO_PDV',
                    [ImpressaoAutomatica] bit NOT NULL CONSTRAINT [DF_TerminaisPdv_ImpressaoAutomatica] DEFAULT 1,
                    [Observacao] nvarchar(500) NULL,
                    [ChaveAtivacaoHash] nvarchar(128) NOT NULL,
                    [ChaveAtivacaoMascara] nvarchar(40) NOT NULL,
                    [Ativo] bit NOT NULL CONSTRAINT [DF_TerminaisPdv_Ativo] DEFAULT 1,
                    [Ativado] bit NOT NULL CONSTRAINT [DF_TerminaisPdv_Ativado] DEFAULT 0,
                    [DispositivoIdentificador] nvarchar(120) NULL,
                    [NomeHost] nvarchar(120) NULL,
                    [VersaoInstalador] nvarchar(40) NULL,
                    [VersaoAplicativo] nvarchar(40) NULL,
                    [UltimoIp] nvarchar(80) NULL,
                    [DataCadastro] datetime2 NOT NULL,
                    [ChaveGeradaEm] datetime2 NOT NULL,
                    [AtivadoEm] datetime2 NULL,
                    [UltimaSincronizacaoEm] datetime2 NULL,
                    CONSTRAINT [PK_TerminaisPdv] PRIMARY KEY ([TerminalPdvId]),
                    CONSTRAINT [FK_TerminaisPdv_Empresas_EmpresaId]
                        FOREIGN KEY ([EmpresaId]) REFERENCES [pdv].[Empresas] ([EmpresaId]) ON DELETE NO ACTION
                );
            END

            IF NOT EXISTS (
                SELECT 1
                FROM sys.indexes
                WHERE name = N'IX_TerminaisPdv_CodigoTerminal'
                  AND object_id = OBJECT_ID(N'[pdv].[TerminaisPdv]')
            )
                CREATE UNIQUE INDEX [IX_TerminaisPdv_CodigoTerminal]
                    ON [pdv].[TerminaisPdv] ([CodigoTerminal]);

            IF NOT EXISTS (
                SELECT 1
                FROM sys.indexes
                WHERE name = N'IX_TerminaisPdv_EmpresaId_NumeroPdv'
                  AND object_id = OBJECT_ID(N'[pdv].[TerminaisPdv]')
            )
                CREATE UNIQUE INDEX [IX_TerminaisPdv_EmpresaId_NumeroPdv]
                    ON [pdv].[TerminaisPdv] ([EmpresaId], [NumeroPdv]);

            IF NOT EXISTS (
                SELECT 1
                FROM sys.indexes
                WHERE name = N'IX_TerminaisPdv_EmpresaId_Ativo'
                  AND object_id = OBJECT_ID(N'[pdv].[TerminaisPdv]')
            )
                CREATE INDEX [IX_TerminaisPdv_EmpresaId_Ativo]
                    ON [pdv].[TerminaisPdv] ([EmpresaId], [Ativo]);

            IF COL_LENGTH(N'pdv.TerminaisPdv', N'PerfilImpressora') IS NULL
                ALTER TABLE [pdv].[TerminaisPdv] ADD [PerfilImpressora] nvarchar(40) NOT NULL CONSTRAINT [DF_TerminaisPdv_PerfilImpressora] DEFAULT N'TERMICA_80MM';

            IF COL_LENGTH(N'pdv.TerminaisPdv', N'PerfilScanner') IS NULL
                ALTER TABLE [pdv].[TerminaisPdv] ADD [PerfilScanner] nvarchar(40) NOT NULL CONSTRAINT [DF_TerminaisPdv_PerfilScanner] DEFAULT N'HIBRIDO';

            IF COL_LENGTH(N'pdv.TerminaisPdv', N'PerfilTeclado') IS NULL
                ALTER TABLE [pdv].[TerminaisPdv] ADD [PerfilTeclado] nvarchar(40) NOT NULL CONSTRAINT [DF_TerminaisPdv_PerfilTeclado] DEFAULT N'PADRAO_PDV';

            IF COL_LENGTH(N'pdv.TerminaisPdv', N'ImpressaoAutomatica') IS NULL
                ALTER TABLE [pdv].[TerminaisPdv] ADD [ImpressaoAutomatica] bit NOT NULL CONSTRAINT [DF_TerminaisPdv_ImpressaoAutomatica] DEFAULT 1;
            """;

        await dbContext.Database.ExecuteSqlRawAsync(patchScript);
    }

    private static async Task EnsureClienteColumnsAsync(AppDbContext dbContext)
    {
        const string patchScript =
            """
            IF COL_LENGTH(N'pdv.Clientes', N'Segmento') IS NULL
                ALTER TABLE [pdv].[Clientes] ADD [Segmento] nvarchar(80) NULL;

            IF COL_LENGTH(N'pdv.Clientes', N'Cep') IS NULL
                ALTER TABLE [pdv].[Clientes] ADD [Cep] nvarchar(8) NULL;

            IF COL_LENGTH(N'pdv.Clientes', N'Logradouro') IS NULL
                ALTER TABLE [pdv].[Clientes] ADD [Logradouro] nvarchar(180) NULL;

            IF COL_LENGTH(N'pdv.Clientes', N'Numero') IS NULL
                ALTER TABLE [pdv].[Clientes] ADD [Numero] nvarchar(20) NULL;

            IF COL_LENGTH(N'pdv.Clientes', N'Complemento') IS NULL
                ALTER TABLE [pdv].[Clientes] ADD [Complemento] nvarchar(120) NULL;

            IF COL_LENGTH(N'pdv.Clientes', N'Bairro') IS NULL
                ALTER TABLE [pdv].[Clientes] ADD [Bairro] nvarchar(80) NULL;

            IF COL_LENGTH(N'pdv.Clientes', N'Cidade') IS NULL
                ALTER TABLE [pdv].[Clientes] ADD [Cidade] nvarchar(80) NULL;

            IF COL_LENGTH(N'pdv.Clientes', N'Uf') IS NULL
                ALTER TABLE [pdv].[Clientes] ADD [Uf] nvarchar(2) NULL;

            IF COL_LENGTH(N'pdv.Clientes', N'CodigoMunicipioIbge') IS NULL
                ALTER TABLE [pdv].[Clientes] ADD [CodigoMunicipioIbge] nvarchar(7) NULL;

            IF COL_LENGTH(N'pdv.Clientes', N'EhFornecedor') IS NULL
                ALTER TABLE [pdv].[Clientes] ADD [EhFornecedor] bit NOT NULL CONSTRAINT [DF_Clientes_EhFornecedor] DEFAULT 0 WITH VALUES;
            """;

        await dbContext.Database.ExecuteSqlRawAsync(patchScript);
    }

    private static async Task EnsureMunicipioTableAsync(AppDbContext dbContext)
    {
        const string patchScript =
            """
            IF OBJECT_ID(N'[pdv].[Municipios]', N'U') IS NULL
            BEGIN
                CREATE TABLE [pdv].[Municipios] (
                    [MunicipioId] uniqueidentifier NOT NULL,
                    [CodigoIbge] nvarchar(7) NOT NULL,
                    [Nome] nvarchar(120) NOT NULL,
                    [Uf] nvarchar(2) NOT NULL,
                    [CepInicial] nvarchar(8) NULL,
                    [CepFinal] nvarchar(8) NULL,
                    [Ativo] bit NOT NULL,
                    CONSTRAINT [PK_Municipios] PRIMARY KEY ([MunicipioId])
                );

                CREATE UNIQUE INDEX [IX_Municipios_CodigoIbge] ON [pdv].[Municipios] ([CodigoIbge]);
                CREATE INDEX [IX_Municipios_Uf_Nome] ON [pdv].[Municipios] ([Uf], [Nome]);
            END

            IF COL_LENGTH(N'pdv.Municipios', N'CepInicial') IS NULL
                ALTER TABLE [pdv].[Municipios] ADD [CepInicial] nvarchar(8) NULL;

            IF COL_LENGTH(N'pdv.Municipios', N'CepFinal') IS NULL
                ALTER TABLE [pdv].[Municipios] ADD [CepFinal] nvarchar(8) NULL;

            IF NOT EXISTS (
                SELECT 1
                FROM sys.indexes
                WHERE name = N'IX_Municipios_CodigoIbge'
                  AND object_id = OBJECT_ID(N'[pdv].[Municipios]')
            )
                CREATE UNIQUE INDEX [IX_Municipios_CodigoIbge] ON [pdv].[Municipios] ([CodigoIbge]);

            IF NOT EXISTS (
                SELECT 1
                FROM sys.indexes
                WHERE name = N'IX_Municipios_Uf_Nome'
                  AND object_id = OBJECT_ID(N'[pdv].[Municipios]')
            )
                CREATE INDEX [IX_Municipios_Uf_Nome] ON [pdv].[Municipios] ([Uf], [Nome]);
            """;

        await dbContext.Database.ExecuteSqlRawAsync(patchScript);
    }

    private static async Task EnsureProdutoCodigoTablesAsync(AppDbContext dbContext)
    {
        const string patchScript =
            """
            IF OBJECT_ID(N'[pdv].[ProdutoCodigos]', N'U') IS NULL
            BEGIN
                CREATE TABLE [pdv].[ProdutoCodigos] (
                    [ProdutoCodigoId] uniqueidentifier NOT NULL,
                    [EmpresaId] uniqueidentifier NOT NULL,
                    [ProdutoId] uniqueidentifier NOT NULL,
                    [Codigo] nvarchar(120) NOT NULL,
                    [Tipo] nvarchar(20) NOT NULL,
                    [Principal] bit NOT NULL,
                    [Ativo] bit NOT NULL,
                    [DataCadastro] datetime2 NOT NULL,
                    CONSTRAINT [PK_ProdutoCodigos] PRIMARY KEY ([ProdutoCodigoId]),
                    CONSTRAINT [FK_ProdutoCodigos_Produtos_ProdutoId] FOREIGN KEY ([ProdutoId]) REFERENCES [pdv].[Produtos] ([ProdutoId]) ON DELETE CASCADE
                );

                CREATE UNIQUE INDEX [IX_ProdutoCodigos_EmpresaId_Codigo] ON [pdv].[ProdutoCodigos] ([EmpresaId], [Codigo]);
                CREATE INDEX [IX_ProdutoCodigos_ProdutoId_Principal] ON [pdv].[ProdutoCodigos] ([ProdutoId], [Principal]);
            END

            INSERT INTO [pdv].[ProdutoCodigos] ([ProdutoCodigoId], [EmpresaId], [ProdutoId], [Codigo], [Tipo], [Principal], [Ativo], [DataCadastro])
            SELECT NEWID(), p.[EmpresaId], p.[ProdutoId], p.[CodigoBarras], N'Ean', 1, 1, SYSUTCDATETIME()
            FROM [pdv].[Produtos] p
            WHERE p.[CodigoBarras] IS NOT NULL
              AND NOT EXISTS (
                    SELECT 1
                    FROM [pdv].[ProdutoCodigos] pc
                    WHERE pc.[EmpresaId] = p.[EmpresaId]
                      AND pc.[Codigo] = p.[CodigoBarras]
              );
            """;

        await dbContext.Database.ExecuteSqlRawAsync(patchScript);
    }

    private static async Task EnsureProdutoCatalogoColumnsAsync(AppDbContext dbContext)
    {
        const string patchScript =
            """
            IF COL_LENGTH(N'pdv.Produtos', N'Marca') IS NULL
                ALTER TABLE [pdv].[Produtos] ADD [Marca] nvarchar(120) NULL;

            IF COL_LENGTH(N'pdv.Produtos', N'Ncm') IS NULL
                ALTER TABLE [pdv].[Produtos] ADD [Ncm] nvarchar(20) NULL;

            IF COL_LENGTH(N'pdv.Produtos', N'ImagemUrl') IS NULL
                ALTER TABLE [pdv].[Produtos] ADD [ImagemUrl] nvarchar(500) NULL;

            IF COL_LENGTH(N'pdv.Produtos', N'CatalogoResumo') IS NULL
                ALTER TABLE [pdv].[Produtos] ADD [CatalogoResumo] nvarchar(220) NULL;

            IF COL_LENGTH(N'pdv.Produtos', N'DestaqueCatalogoComprador') IS NULL
                ALTER TABLE [pdv].[Produtos] ADD [DestaqueCatalogoComprador] bit NOT NULL CONSTRAINT [DF_Produtos_DestaqueCatalogoComprador] DEFAULT 0 WITH VALUES;

            IF COL_LENGTH(N'pdv.Produtos', N'PrecoPromocional') IS NULL
                ALTER TABLE [pdv].[Produtos] ADD [PrecoPromocional] decimal(18,2) NULL;

            IF COL_LENGTH(N'pdv.Produtos', N'PromocaoTitulo') IS NULL
                ALTER TABLE [pdv].[Produtos] ADD [PromocaoTitulo] nvarchar(120) NULL;

            IF COL_LENGTH(N'pdv.Produtos', N'PromocaoInicioUtc') IS NULL
                ALTER TABLE [pdv].[Produtos] ADD [PromocaoInicioUtc] datetime2 NULL;

            IF COL_LENGTH(N'pdv.Produtos', N'PromocaoFimUtc') IS NULL
                ALTER TABLE [pdv].[Produtos] ADD [PromocaoFimUtc] datetime2 NULL;
            """;

        await dbContext.Database.ExecuteSqlRawAsync(patchScript);
    }

    private static async Task EnsureDeliveryExperienceStructureAsync(AppDbContext dbContext)
    {
        const string patchScript =
            """
            IF OBJECT_ID(N'[pdv].[Transportadoras]', N'U') IS NULL
            BEGIN
                CREATE TABLE [pdv].[Transportadoras] (
                    [TransportadoraId] uniqueidentifier NOT NULL,
                    [EmpresaId] uniqueidentifier NOT NULL,
                    [Nome] nvarchar(150) NOT NULL,
                    [NomeFantasia] nvarchar(150) NULL,
                    [Documento] nvarchar(20) NULL,
                    [InscricaoEstadual] nvarchar(20) NULL,
                    [Telefone] nvarchar(20) NULL,
                    [Email] nvarchar(150) NULL,
                    [Responsavel] nvarchar(120) NULL,
                    [Cep] nvarchar(8) NULL,
                    [Logradouro] nvarchar(180) NULL,
                    [Numero] nvarchar(20) NULL,
                    [Complemento] nvarchar(120) NULL,
                    [Bairro] nvarchar(80) NULL,
                    [Cidade] nvarchar(80) NULL,
                    [Uf] nvarchar(2) NULL,
                    [CodigoMunicipioIbge] nvarchar(7) NULL,
                    [Endereco] nvarchar(220) NULL,
                    [CorTemaHex] nvarchar(7) NULL,
                    [PrazoMedioEntregaMinutos] int NULL,
                    [Observacao] nvarchar(500) NULL,
                    [Ativo] bit NOT NULL CONSTRAINT [DF_Transportadoras_Ativo] DEFAULT 1,
                    [DataCadastro] datetime2 NOT NULL,
                    CONSTRAINT [PK_Transportadoras] PRIMARY KEY ([TransportadoraId])
                );

                CREATE UNIQUE INDEX [IX_Transportadoras_EmpresaId_Nome]
                    ON [pdv].[Transportadoras] ([EmpresaId], [Nome]);

                CREATE INDEX [IX_Transportadoras_EmpresaId_Ativo]
                    ON [pdv].[Transportadoras] ([EmpresaId], [Ativo]);
            END

            IF COL_LENGTH(N'pdv.Transportadoras', N'NomeFantasia') IS NULL
                ALTER TABLE [pdv].[Transportadoras] ADD [NomeFantasia] nvarchar(150) NULL;

            IF COL_LENGTH(N'pdv.Transportadoras', N'InscricaoEstadual') IS NULL
                ALTER TABLE [pdv].[Transportadoras] ADD [InscricaoEstadual] nvarchar(20) NULL;

            IF COL_LENGTH(N'pdv.Transportadoras', N'Cep') IS NULL
                ALTER TABLE [pdv].[Transportadoras] ADD [Cep] nvarchar(8) NULL;

            IF COL_LENGTH(N'pdv.Transportadoras', N'Logradouro') IS NULL
                ALTER TABLE [pdv].[Transportadoras] ADD [Logradouro] nvarchar(180) NULL;

            IF COL_LENGTH(N'pdv.Transportadoras', N'Numero') IS NULL
                ALTER TABLE [pdv].[Transportadoras] ADD [Numero] nvarchar(20) NULL;

            IF COL_LENGTH(N'pdv.Transportadoras', N'Complemento') IS NULL
                ALTER TABLE [pdv].[Transportadoras] ADD [Complemento] nvarchar(120) NULL;

            IF COL_LENGTH(N'pdv.Transportadoras', N'Bairro') IS NULL
                ALTER TABLE [pdv].[Transportadoras] ADD [Bairro] nvarchar(80) NULL;

            IF COL_LENGTH(N'pdv.Transportadoras', N'Cidade') IS NULL
                ALTER TABLE [pdv].[Transportadoras] ADD [Cidade] nvarchar(80) NULL;

            IF COL_LENGTH(N'pdv.Transportadoras', N'Uf') IS NULL
                ALTER TABLE [pdv].[Transportadoras] ADD [Uf] nvarchar(2) NULL;

            IF COL_LENGTH(N'pdv.Transportadoras', N'CodigoMunicipioIbge') IS NULL
                ALTER TABLE [pdv].[Transportadoras] ADD [CodigoMunicipioIbge] nvarchar(7) NULL;

            IF COL_LENGTH(N'pdv.Transportadoras', N'Endereco') IS NULL
                ALTER TABLE [pdv].[Transportadoras] ADD [Endereco] nvarchar(220) NULL;

            IF NOT EXISTS (
                SELECT 1
                FROM sys.indexes
                WHERE name = N'IX_Transportadoras_EmpresaId_Documento'
                  AND object_id = OBJECT_ID(N'[pdv].[Transportadoras]')
            )
            BEGIN
                EXEC(N'
                    CREATE INDEX [IX_Transportadoras_EmpresaId_Documento]
                        ON [pdv].[Transportadoras] ([EmpresaId], [Documento]);
                ');
            END

            IF COL_LENGTH(N'pdv.Vendas', N'TransportadoraId') IS NULL
                ALTER TABLE [pdv].[Vendas] ADD [TransportadoraId] uniqueidentifier NULL;

            IF COL_LENGTH(N'pdv.Vendas', N'EntregadorUsuarioId') IS NULL
                ALTER TABLE [pdv].[Vendas] ADD [EntregadorUsuarioId] uniqueidentifier NULL;

            IF COL_LENGTH(N'pdv.Vendas', N'NomeEntregador') IS NULL
                ALTER TABLE [pdv].[Vendas] ADD [NomeEntregador] nvarchar(120) NULL;

            IF COL_LENGTH(N'pdv.Vendas', N'TelefoneEntregador') IS NULL
                ALTER TABLE [pdv].[Vendas] ADD [TelefoneEntregador] nvarchar(20) NULL;

            IF COL_LENGTH(N'pdv.Vendas', N'EntregaCodigoAcesso') IS NULL
                ALTER TABLE [pdv].[Vendas] ADD [EntregaCodigoAcesso] nvarchar(40) NULL;

            IF COL_LENGTH(N'pdv.Vendas', N'EntregaCompartilhamentoAtivo') IS NULL
                ALTER TABLE [pdv].[Vendas] ADD [EntregaCompartilhamentoAtivo] bit NOT NULL CONSTRAINT [DF_Vendas_EntregaCompartilhamentoAtivo] DEFAULT 0 WITH VALUES;

            IF COL_LENGTH(N'pdv.Vendas', N'EntregaUltimaLatitude') IS NULL
                ALTER TABLE [pdv].[Vendas] ADD [EntregaUltimaLatitude] decimal(9,6) NULL;

            IF COL_LENGTH(N'pdv.Vendas', N'EntregaUltimaLongitude') IS NULL
                ALTER TABLE [pdv].[Vendas] ADD [EntregaUltimaLongitude] decimal(9,6) NULL;

            IF COL_LENGTH(N'pdv.Vendas', N'EntregaPrecisaoMetros') IS NULL
                ALTER TABLE [pdv].[Vendas] ADD [EntregaPrecisaoMetros] decimal(10,2) NULL;

            IF COL_LENGTH(N'pdv.Vendas', N'EntregaVelocidadeKmh') IS NULL
                ALTER TABLE [pdv].[Vendas] ADD [EntregaVelocidadeKmh] decimal(10,2) NULL;

            IF COL_LENGTH(N'pdv.Vendas', N'EntregaDirecaoGraus') IS NULL
                ALTER TABLE [pdv].[Vendas] ADD [EntregaDirecaoGraus] decimal(10,2) NULL;

            IF COL_LENGTH(N'pdv.Vendas', N'EntregaUltimaAtualizacaoGps') IS NULL
                ALTER TABLE [pdv].[Vendas] ADD [EntregaUltimaAtualizacaoGps] datetime2 NULL;

            IF NOT EXISTS (
                SELECT 1
                FROM sys.foreign_keys
                WHERE name = N'FK_Vendas_Transportadoras_TransportadoraId'
                  AND parent_object_id = OBJECT_ID(N'[pdv].[Vendas]')
            ) AND COL_LENGTH(N'pdv.Vendas', N'TransportadoraId') IS NOT NULL
            BEGIN
                ALTER TABLE [pdv].[Vendas]
                ADD CONSTRAINT [FK_Vendas_Transportadoras_TransportadoraId]
                FOREIGN KEY ([TransportadoraId]) REFERENCES [pdv].[Transportadoras] ([TransportadoraId]) ON DELETE NO ACTION;
            END

            IF NOT EXISTS (
                SELECT 1
                FROM sys.foreign_keys
                WHERE name = N'FK_Vendas_Usuarios_EntregadorUsuarioId'
                  AND parent_object_id = OBJECT_ID(N'[pdv].[Vendas]')
            ) AND COL_LENGTH(N'pdv.Vendas', N'EntregadorUsuarioId') IS NOT NULL
            BEGIN
                ALTER TABLE [pdv].[Vendas]
                ADD CONSTRAINT [FK_Vendas_Usuarios_EntregadorUsuarioId]
                FOREIGN KEY ([EntregadorUsuarioId]) REFERENCES [pdv].[Usuarios] ([UsuarioId]) ON DELETE NO ACTION;
            END

            IF NOT EXISTS (
                SELECT 1
                FROM sys.indexes
                WHERE name = N'IX_Vendas_EmpresaId_EntregaCodigoAcesso'
                  AND object_id = OBJECT_ID(N'[pdv].[Vendas]')
            ) AND COL_LENGTH(N'pdv.Vendas', N'EntregaCodigoAcesso') IS NOT NULL
            BEGIN
                EXEC(N'
                    CREATE UNIQUE INDEX [IX_Vendas_EmpresaId_EntregaCodigoAcesso]
                        ON [pdv].[Vendas] ([EmpresaId], [EntregaCodigoAcesso])
                        WHERE [EntregaCodigoAcesso] IS NOT NULL;
                ');
            END

            IF NOT EXISTS (
                SELECT 1
                FROM sys.indexes
                WHERE name = N'IX_Vendas_TransportadoraId'
                  AND object_id = OBJECT_ID(N'[pdv].[Vendas]')
            ) AND COL_LENGTH(N'pdv.Vendas', N'TransportadoraId') IS NOT NULL
            BEGIN
                EXEC(N'
                    CREATE INDEX [IX_Vendas_TransportadoraId]
                        ON [pdv].[Vendas] ([TransportadoraId]);
                ');
            END

            IF NOT EXISTS (
                SELECT 1
                FROM sys.indexes
                WHERE name = N'IX_Vendas_EmpresaId_EntregadorUsuarioId'
                  AND object_id = OBJECT_ID(N'[pdv].[Vendas]')
            ) AND COL_LENGTH(N'pdv.Vendas', N'EntregadorUsuarioId') IS NOT NULL
            BEGIN
                EXEC(N'
                    CREATE INDEX [IX_Vendas_EmpresaId_EntregadorUsuarioId]
                        ON [pdv].[Vendas] ([EmpresaId], [EntregadorUsuarioId])
                        WHERE [EntregadorUsuarioId] IS NOT NULL;
                ');
            END

            IF OBJECT_ID(N'[pdv].[PedidoEntregaLocalizacoes]', N'U') IS NULL
            BEGIN
                CREATE TABLE [pdv].[PedidoEntregaLocalizacoes] (
                    [PedidoEntregaLocalizacaoId] uniqueidentifier NOT NULL,
                    [EmpresaId] uniqueidentifier NOT NULL,
                    [VendaId] uniqueidentifier NOT NULL,
                    [Latitude] decimal(9,6) NOT NULL,
                    [Longitude] decimal(9,6) NOT NULL,
                    [PrecisaoMetros] decimal(10,2) NULL,
                    [VelocidadeKmh] decimal(10,2) NULL,
                    [DirecaoGraus] decimal(10,2) NULL,
                    [DataCaptura] datetime2 NOT NULL,
                    [Origem] nvarchar(40) NOT NULL,
                    [Observacao] nvarchar(200) NULL,
                    CONSTRAINT [PK_PedidoEntregaLocalizacoes] PRIMARY KEY ([PedidoEntregaLocalizacaoId]),
                    CONSTRAINT [FK_PedidoEntregaLocalizacoes_Vendas_VendaId] FOREIGN KEY ([VendaId]) REFERENCES [pdv].[Vendas] ([VendaId]) ON DELETE CASCADE
                );

                CREATE INDEX [IX_PedidoEntregaLocalizacoes_EmpresaId_VendaId_DataCaptura]
                    ON [pdv].[PedidoEntregaLocalizacoes] ([EmpresaId], [VendaId], [DataCaptura]);
            END
            """;

        await dbContext.Database.ExecuteSqlRawAsync(patchScript);
    }

    private static async Task EnsureProdutoFornecedorColumnsAsync(AppDbContext dbContext)
    {
        const string patchScript =
            """
            IF OBJECT_ID(N'[pdv].[ProdutoFornecedores]', N'U') IS NULL
            BEGIN
                CREATE TABLE [pdv].[ProdutoFornecedores] (
                    [ProdutoFornecedorId] uniqueidentifier NOT NULL,
                    [EmpresaId] uniqueidentifier NOT NULL,
                    [ProdutoId] uniqueidentifier NOT NULL,
                    [ClienteFornecedorId] uniqueidentifier NOT NULL,
                    [CodigoProdutoFornecedor] nvarchar(120) NULL,
                    [NomeProdutoFornecedor] nvarchar(180) NULL,
                    [PrecoCompra] decimal(18,2) NULL,
                    [QuantidadeMinima] decimal(18,3) NULL,
                    [PrazoEntregaDias] int NULL,
                    [UltimaCompraEm] datetime2 NULL,
                    [UltimoPrecoPago] decimal(18,2) NULL,
                    [FornecedorPrincipal] bit NOT NULL,
                    [Ativo] bit NOT NULL,
                    [DataCadastro] datetime2 NOT NULL,
                    CONSTRAINT [PK_ProdutoFornecedores] PRIMARY KEY ([ProdutoFornecedorId]),
                    CONSTRAINT [FK_ProdutoFornecedores_Produtos_ProdutoId] FOREIGN KEY ([ProdutoId]) REFERENCES [pdv].[Produtos] ([ProdutoId]) ON DELETE CASCADE,
                    CONSTRAINT [FK_ProdutoFornecedores_Clientes_ClienteFornecedorId] FOREIGN KEY ([ClienteFornecedorId]) REFERENCES [pdv].[Clientes] ([ClienteId]) ON DELETE NO ACTION
                );

                CREATE UNIQUE INDEX [IX_ProdutoFornecedores_ProdutoId_ClienteFornecedorId]
                    ON [pdv].[ProdutoFornecedores] ([ProdutoId], [ClienteFornecedorId]);

                CREATE INDEX [IX_ProdutoFornecedores_EmpresaId_ClienteFornecedorId_Ativo]
                    ON [pdv].[ProdutoFornecedores] ([EmpresaId], [ClienteFornecedorId], [Ativo]);

                CREATE INDEX [IX_ProdutoFornecedores_ProdutoId_FornecedorPrincipal]
                    ON [pdv].[ProdutoFornecedores] ([ProdutoId], [FornecedorPrincipal]);
            END

            IF COL_LENGTH(N'pdv.Produtos', N'ClienteFornecedorId') IS NULL
                ALTER TABLE [pdv].[Produtos] ADD [ClienteFornecedorId] uniqueidentifier NULL;

            IF COL_LENGTH(N'pdv.Produtos', N'CodigoProdutoFornecedor') IS NULL
                ALTER TABLE [pdv].[Produtos] ADD [CodigoProdutoFornecedor] nvarchar(120) NULL;

            IF COL_LENGTH(N'pdv.Produtos', N'UltimaNotaFiscalCompra') IS NULL
                ALTER TABLE [pdv].[Produtos] ADD [UltimaNotaFiscalCompra] nvarchar(60) NULL;

            IF NOT EXISTS (
                SELECT 1
                FROM sys.foreign_keys
                WHERE name = N'FK_Produtos_Clientes_ClienteFornecedorId'
            )
            BEGIN
                ALTER TABLE [pdv].[Produtos]
                ADD CONSTRAINT [FK_Produtos_Clientes_ClienteFornecedorId]
                FOREIGN KEY ([ClienteFornecedorId]) REFERENCES [pdv].[Clientes] ([ClienteId]) ON DELETE NO ACTION;
            END

            INSERT INTO [pdv].[ProdutoFornecedores] (
                [ProdutoFornecedorId],
                [EmpresaId],
                [ProdutoId],
                [ClienteFornecedorId],
                [CodigoProdutoFornecedor],
                [NomeProdutoFornecedor],
                [PrecoCompra],
                [QuantidadeMinima],
                [PrazoEntregaDias],
                [UltimaCompraEm],
                [UltimoPrecoPago],
                [FornecedorPrincipal],
                [Ativo],
                [DataCadastro]
            )
            SELECT
                NEWID(),
                p.[EmpresaId],
                p.[ProdutoId],
                p.[ClienteFornecedorId],
                p.[CodigoProdutoFornecedor],
                LEFT(p.[Nome], 180),
                p.[PrecoCusto],
                NULL,
                NULL,
                NULL,
                p.[PrecoCusto],
                1,
                1,
                p.[DataCadastro]
            FROM [pdv].[Produtos] p
            WHERE p.[ClienteFornecedorId] IS NOT NULL
              AND NOT EXISTS (
                    SELECT 1
                    FROM [pdv].[ProdutoFornecedores] pf
                    WHERE pf.[ProdutoId] = p.[ProdutoId]
                      AND pf.[ClienteFornecedorId] = p.[ClienteFornecedorId]
              );
            """;

        await dbContext.Database.ExecuteSqlRawAsync(patchScript);
    }

    private static async Task EnsureProdutoLoteTablesAsync(AppDbContext dbContext)
    {
        const string patchSchemaScript =
            """
            IF COL_LENGTH(N'pdv.Produtos', N'ControlaLote') IS NULL
                ALTER TABLE [pdv].[Produtos] ADD [ControlaLote] bit NOT NULL CONSTRAINT [DF_Produtos_ControlaLote] DEFAULT 0 WITH VALUES;

            IF COL_LENGTH(N'pdv.Produtos', N'PoliticaBaixaLote') IS NULL
                ALTER TABLE [pdv].[Produtos] ADD [PoliticaBaixaLote] nvarchar(10) NOT NULL CONSTRAINT [DF_Produtos_PoliticaBaixaLote] DEFAULT N'FEFO' WITH VALUES;

            IF OBJECT_ID(N'[pdv].[ProdutoLotes]', N'U') IS NULL
            BEGIN
                CREATE TABLE [pdv].[ProdutoLotes] (
                    [ProdutoLoteId] uniqueidentifier NOT NULL,
                    [EmpresaId] uniqueidentifier NOT NULL,
                    [ProdutoId] uniqueidentifier NOT NULL,
                    [CodigoLote] nvarchar(60) NOT NULL,
                    [DataFabricacao] date NULL,
                    [DataValidade] date NULL,
                    [Observacao] nvarchar(250) NULL,
                    [Ativo] bit NOT NULL,
                    [DataCadastro] datetime2 NOT NULL,
                    CONSTRAINT [PK_ProdutoLotes] PRIMARY KEY ([ProdutoLoteId]),
                    CONSTRAINT [FK_ProdutoLotes_Produtos_ProdutoId] FOREIGN KEY ([ProdutoId]) REFERENCES [pdv].[Produtos] ([ProdutoId]) ON DELETE CASCADE
                );
            END

            IF NOT EXISTS (
                SELECT 1
                FROM sys.indexes
                WHERE name = N'IX_ProdutoLotes_EmpresaId_ProdutoId_CodigoLote'
                  AND object_id = OBJECT_ID(N'[pdv].[ProdutoLotes]')
            )
                CREATE UNIQUE INDEX [IX_ProdutoLotes_EmpresaId_ProdutoId_CodigoLote]
                    ON [pdv].[ProdutoLotes] ([EmpresaId], [ProdutoId], [CodigoLote]);

            IF NOT EXISTS (
                SELECT 1
                FROM sys.indexes
                WHERE name = N'IX_ProdutoLotes_EmpresaId_ProdutoId_DataValidade'
                  AND object_id = OBJECT_ID(N'[pdv].[ProdutoLotes]')
            )
                CREATE INDEX [IX_ProdutoLotes_EmpresaId_ProdutoId_DataValidade]
                    ON [pdv].[ProdutoLotes] ([EmpresaId], [ProdutoId], [DataValidade]);

            IF OBJECT_ID(N'[pdv].[EstoquesLote]', N'U') IS NULL
            BEGIN
                CREATE TABLE [pdv].[EstoquesLote] (
                    [EstoqueLoteId] uniqueidentifier NOT NULL,
                    [EmpresaId] uniqueidentifier NOT NULL,
                    [ProdutoId] uniqueidentifier NOT NULL,
                    [ProdutoLoteId] uniqueidentifier NOT NULL,
                    [QuantidadeEntrada] decimal(18,3) NOT NULL,
                    [QuantidadeDisponivel] decimal(18,3) NOT NULL,
                    [PrecoCustoUnitario] decimal(18,2) NULL,
                    [DataEntrada] datetime2 NOT NULL,
                    [DocumentoReferencia] nvarchar(80) NULL,
                    [UsuarioId] uniqueidentifier NOT NULL,
                    [Ativo] bit NOT NULL,
                    CONSTRAINT [PK_EstoquesLote] PRIMARY KEY ([EstoqueLoteId]),
                    CONSTRAINT [FK_EstoquesLote_Produtos_ProdutoId] FOREIGN KEY ([ProdutoId]) REFERENCES [pdv].[Produtos] ([ProdutoId]) ON DELETE NO ACTION,
                    CONSTRAINT [FK_EstoquesLote_ProdutoLotes_ProdutoLoteId] FOREIGN KEY ([ProdutoLoteId]) REFERENCES [pdv].[ProdutoLotes] ([ProdutoLoteId]) ON DELETE CASCADE,
                    CONSTRAINT [FK_EstoquesLote_Usuarios_UsuarioId] FOREIGN KEY ([UsuarioId]) REFERENCES [pdv].[Usuarios] ([UsuarioId]) ON DELETE NO ACTION
                );
            END

            IF NOT EXISTS (
                SELECT 1
                FROM sys.indexes
                WHERE name = N'IX_EstoquesLote_EmpresaId_ProdutoId_DataEntrada'
                  AND object_id = OBJECT_ID(N'[pdv].[EstoquesLote]')
            )
                CREATE INDEX [IX_EstoquesLote_EmpresaId_ProdutoId_DataEntrada]
                    ON [pdv].[EstoquesLote] ([EmpresaId], [ProdutoId], [DataEntrada]);

            IF NOT EXISTS (
                SELECT 1
                FROM sys.indexes
                WHERE name = N'IX_EstoquesLote_ProdutoId_QuantidadeDisponivel'
                  AND object_id = OBJECT_ID(N'[pdv].[EstoquesLote]')
            )
                CREATE INDEX [IX_EstoquesLote_ProdutoId_QuantidadeDisponivel]
                    ON [pdv].[EstoquesLote] ([ProdutoId], [QuantidadeDisponivel]);

            IF OBJECT_ID(N'[pdv].[MovimentacoesEstoqueLote]', N'U') IS NULL
            BEGIN
                CREATE TABLE [pdv].[MovimentacoesEstoqueLote] (
                    [MovimentacaoEstoqueLoteId] uniqueidentifier NOT NULL,
                    [EmpresaId] uniqueidentifier NOT NULL,
                    [MovimentacaoEstoqueId] uniqueidentifier NOT NULL,
                    [ProdutoId] uniqueidentifier NOT NULL,
                    [ProdutoLoteId] uniqueidentifier NOT NULL,
                    [EstoqueLoteId] uniqueidentifier NOT NULL,
                    [Quantidade] decimal(18,3) NOT NULL,
                    [DataMovimentacao] datetime2 NOT NULL,
                    CONSTRAINT [PK_MovimentacoesEstoqueLote] PRIMARY KEY ([MovimentacaoEstoqueLoteId]),
                    CONSTRAINT [FK_MovimentacoesEstoqueLote_MovimentacoesEstoque_MovimentacaoEstoqueId] FOREIGN KEY ([MovimentacaoEstoqueId]) REFERENCES [pdv].[MovimentacoesEstoque] ([MovimentacaoEstoqueId]) ON DELETE CASCADE,
                    CONSTRAINT [FK_MovimentacoesEstoqueLote_Produtos_ProdutoId] FOREIGN KEY ([ProdutoId]) REFERENCES [pdv].[Produtos] ([ProdutoId]) ON DELETE NO ACTION,
                    CONSTRAINT [FK_MovimentacoesEstoqueLote_ProdutoLotes_ProdutoLoteId] FOREIGN KEY ([ProdutoLoteId]) REFERENCES [pdv].[ProdutoLotes] ([ProdutoLoteId]) ON DELETE NO ACTION,
                    CONSTRAINT [FK_MovimentacoesEstoqueLote_EstoquesLote_EstoqueLoteId] FOREIGN KEY ([EstoqueLoteId]) REFERENCES [pdv].[EstoquesLote] ([EstoqueLoteId]) ON DELETE NO ACTION
                );
            END

            IF NOT EXISTS (
                SELECT 1
                FROM sys.indexes
                WHERE name = N'IX_MovimentacoesEstoqueLote_MovimentacaoEstoqueId_EstoqueLoteId'
                  AND object_id = OBJECT_ID(N'[pdv].[MovimentacoesEstoqueLote]')
            )
                CREATE INDEX [IX_MovimentacoesEstoqueLote_MovimentacaoEstoqueId_EstoqueLoteId]
                    ON [pdv].[MovimentacoesEstoqueLote] ([MovimentacaoEstoqueId], [EstoqueLoteId]);

            IF NOT EXISTS (
                SELECT 1
                FROM sys.indexes
                WHERE name = N'IX_MovimentacoesEstoqueLote_EmpresaId_ProdutoId_DataMovimentacao'
                  AND object_id = OBJECT_ID(N'[pdv].[MovimentacoesEstoqueLote]')
            )
                CREATE INDEX [IX_MovimentacoesEstoqueLote_EmpresaId_ProdutoId_DataMovimentacao]
                    ON [pdv].[MovimentacoesEstoqueLote] ([EmpresaId], [ProdutoId], [DataMovimentacao]);
            """;

        const string backfillScript =
            """
            UPDATE [pdv].[Produtos]
            SET [PoliticaBaixaLote] = N'FEFO'
            WHERE [PoliticaBaixaLote] IS NULL
               OR LTRIM(RTRIM([PoliticaBaixaLote])) = N'';

            IF OBJECT_ID(N'[pdv].[ProdutoLotes]', N'U') IS NOT NULL
            BEGIN
                UPDATE p
                SET
                    [ControlaLote] = 1,
                    [ControlaEstoque] = 1
                FROM [pdv].[Produtos] p
                WHERE EXISTS (
                    SELECT 1
                    FROM [pdv].[ProdutoLotes] l
                    WHERE l.[ProdutoId] = p.[ProdutoId]
                );
            END

            IF OBJECT_ID(N'[pdv].[EstoquesLote]', N'U') IS NOT NULL
            BEGIN
                UPDATE p
                SET [EstoqueAtual] = saldo.[QuantidadeDisponivel]
                FROM [pdv].[Produtos] p
                INNER JOIN (
                    SELECT [ProdutoId], SUM([QuantidadeDisponivel]) AS [QuantidadeDisponivel]
                    FROM [pdv].[EstoquesLote]
                    GROUP BY [ProdutoId]
                ) saldo ON saldo.[ProdutoId] = p.[ProdutoId]
                WHERE p.[ControlaLote] = 1;
            END
            """;

        await dbContext.Database.ExecuteSqlRawAsync(patchSchemaScript);
        await dbContext.Database.ExecuteSqlRawAsync(backfillScript);
    }

    private static async Task EnsureEstoqueErpTablesAsync(AppDbContext dbContext)
    {
        const string patchSchemaScript =
            """
            IF OBJECT_ID(N'[pdv].[DepositosEstoque]', N'U') IS NULL
            BEGIN
                CREATE TABLE [pdv].[DepositosEstoque] (
                    [DepositoEstoqueId] uniqueidentifier NOT NULL,
                    [EmpresaId] uniqueidentifier NOT NULL,
                    [Codigo] nvarchar(30) NOT NULL,
                    [Nome] nvarchar(120) NOT NULL,
                    [Descricao] nvarchar(250) NULL,
                    [Padrao] bit NOT NULL,
                    [PermiteVendaDireta] bit NOT NULL,
                    [Ativo] bit NOT NULL,
                    [DataCadastro] datetime2 NOT NULL,
                    CONSTRAINT [PK_DepositosEstoque] PRIMARY KEY ([DepositoEstoqueId]),
                    CONSTRAINT [FK_DepositosEstoque_Empresas_EmpresaId] FOREIGN KEY ([EmpresaId]) REFERENCES [pdv].[Empresas] ([EmpresaId]) ON DELETE CASCADE
                );
            END

            IF NOT EXISTS (
                SELECT 1
                FROM sys.indexes
                WHERE name = N'IX_DepositosEstoque_EmpresaId_Codigo'
                  AND object_id = OBJECT_ID(N'[pdv].[DepositosEstoque]')
            )
                CREATE UNIQUE INDEX [IX_DepositosEstoque_EmpresaId_Codigo]
                    ON [pdv].[DepositosEstoque] ([EmpresaId], [Codigo]);

            IF NOT EXISTS (
                SELECT 1
                FROM sys.indexes
                WHERE name = N'IX_DepositosEstoque_EmpresaId_Padrao'
                  AND object_id = OBJECT_ID(N'[pdv].[DepositosEstoque]')
            )
                CREATE INDEX [IX_DepositosEstoque_EmpresaId_Padrao]
                    ON [pdv].[DepositosEstoque] ([EmpresaId], [Padrao]);

            IF OBJECT_ID(N'[pdv].[EstoquesDeposito]', N'U') IS NULL
            BEGIN
                CREATE TABLE [pdv].[EstoquesDeposito] (
                    [EstoqueDepositoId] uniqueidentifier NOT NULL,
                    [EmpresaId] uniqueidentifier NOT NULL,
                    [DepositoEstoqueId] uniqueidentifier NOT NULL,
                    [ProdutoId] uniqueidentifier NOT NULL,
                    [QuantidadeDisponivel] decimal(18,3) NOT NULL,
                    [QuantidadeReservada] decimal(18,3) NOT NULL,
                    [Ativo] bit NOT NULL,
                    [DataAtualizacao] datetime2 NOT NULL,
                    CONSTRAINT [PK_EstoquesDeposito] PRIMARY KEY ([EstoqueDepositoId]),
                    CONSTRAINT [FK_EstoquesDeposito_DepositosEstoque_DepositoEstoqueId] FOREIGN KEY ([DepositoEstoqueId]) REFERENCES [pdv].[DepositosEstoque] ([DepositoEstoqueId]) ON DELETE CASCADE,
                    CONSTRAINT [FK_EstoquesDeposito_Produtos_ProdutoId] FOREIGN KEY ([ProdutoId]) REFERENCES [pdv].[Produtos] ([ProdutoId]) ON DELETE NO ACTION
                );
            END

            IF NOT EXISTS (
                SELECT 1
                FROM sys.indexes
                WHERE name = N'IX_EstoquesDeposito_EmpresaId_DepositoEstoqueId'
                  AND object_id = OBJECT_ID(N'[pdv].[EstoquesDeposito]')
            )
                CREATE INDEX [IX_EstoquesDeposito_EmpresaId_DepositoEstoqueId]
                    ON [pdv].[EstoquesDeposito] ([EmpresaId], [DepositoEstoqueId]);

            IF NOT EXISTS (
                SELECT 1
                FROM sys.indexes
                WHERE name = N'IX_EstoquesDeposito_EmpresaId_ProdutoId_DepositoEstoqueId'
                  AND object_id = OBJECT_ID(N'[pdv].[EstoquesDeposito]')
            )
                CREATE UNIQUE INDEX [IX_EstoquesDeposito_EmpresaId_ProdutoId_DepositoEstoqueId]
                    ON [pdv].[EstoquesDeposito] ([EmpresaId], [ProdutoId], [DepositoEstoqueId]);

            IF OBJECT_ID(N'[pdv].[TransferenciasEstoque]', N'U') IS NULL
            BEGIN
                CREATE TABLE [pdv].[TransferenciasEstoque] (
                    [TransferenciaEstoqueId] uniqueidentifier NOT NULL,
                    [EmpresaId] uniqueidentifier NOT NULL,
                    [ProdutoId] uniqueidentifier NOT NULL,
                    [DepositoOrigemId] uniqueidentifier NOT NULL,
                    [DepositoDestinoId] uniqueidentifier NOT NULL,
                    [Quantidade] decimal(18,3) NOT NULL,
                    [Status] nvarchar(20) NOT NULL,
                    [DocumentoReferencia] nvarchar(80) NULL,
                    [Observacao] nvarchar(250) NULL,
                    [DataTransferencia] datetime2 NOT NULL,
                    [UsuarioId] uniqueidentifier NOT NULL,
                    CONSTRAINT [PK_TransferenciasEstoque] PRIMARY KEY ([TransferenciaEstoqueId]),
                    CONSTRAINT [FK_TransferenciasEstoque_Produtos_ProdutoId] FOREIGN KEY ([ProdutoId]) REFERENCES [pdv].[Produtos] ([ProdutoId]) ON DELETE NO ACTION,
                    CONSTRAINT [FK_TransferenciasEstoque_DepositosEstoque_DepositoOrigemId] FOREIGN KEY ([DepositoOrigemId]) REFERENCES [pdv].[DepositosEstoque] ([DepositoEstoqueId]) ON DELETE NO ACTION,
                    CONSTRAINT [FK_TransferenciasEstoque_DepositosEstoque_DepositoDestinoId] FOREIGN KEY ([DepositoDestinoId]) REFERENCES [pdv].[DepositosEstoque] ([DepositoEstoqueId]) ON DELETE NO ACTION,
                    CONSTRAINT [FK_TransferenciasEstoque_Usuarios_UsuarioId] FOREIGN KEY ([UsuarioId]) REFERENCES [pdv].[Usuarios] ([UsuarioId]) ON DELETE NO ACTION
                );
            END

            IF NOT EXISTS (
                SELECT 1
                FROM sys.indexes
                WHERE name = N'IX_TransferenciasEstoque_EmpresaId_DataTransferencia'
                  AND object_id = OBJECT_ID(N'[pdv].[TransferenciasEstoque]')
            )
                CREATE INDEX [IX_TransferenciasEstoque_EmpresaId_DataTransferencia]
                    ON [pdv].[TransferenciasEstoque] ([EmpresaId], [DataTransferencia]);

            IF NOT EXISTS (
                SELECT 1
                FROM sys.indexes
                WHERE name = N'IX_TransferenciasEstoque_EmpresaId_ProdutoId_DataTransferencia'
                  AND object_id = OBJECT_ID(N'[pdv].[TransferenciasEstoque]')
            )
                CREATE INDEX [IX_TransferenciasEstoque_EmpresaId_ProdutoId_DataTransferencia]
                    ON [pdv].[TransferenciasEstoque] ([EmpresaId], [ProdutoId], [DataTransferencia]);

            IF COL_LENGTH(N'pdv.MovimentacoesEstoque', N'EstoqueReservadoAtual') IS NULL
                ALTER TABLE [pdv].[MovimentacoesEstoque] ADD [EstoqueReservadoAtual] decimal(18,3) NOT NULL CONSTRAINT [DF_MovimentacoesEstoque_EstoqueReservadoAtual] DEFAULT 0 WITH VALUES;

            IF COL_LENGTH(N'pdv.MovimentacoesEstoque', N'DepositoEstoqueId') IS NULL
                ALTER TABLE [pdv].[MovimentacoesEstoque] ADD [DepositoEstoqueId] uniqueidentifier NULL;

            IF COL_LENGTH(N'pdv.MovimentacoesEstoque', N'DepositoOrigemId') IS NULL
                ALTER TABLE [pdv].[MovimentacoesEstoque] ADD [DepositoOrigemId] uniqueidentifier NULL;

            IF COL_LENGTH(N'pdv.MovimentacoesEstoque', N'DepositoDestinoId') IS NULL
                ALTER TABLE [pdv].[MovimentacoesEstoque] ADD [DepositoDestinoId] uniqueidentifier NULL;

            IF COL_LENGTH(N'pdv.MovimentacoesEstoque', N'Observacao') IS NULL
                ALTER TABLE [pdv].[MovimentacoesEstoque] ADD [Observacao] nvarchar(250) NULL;

            IF NOT EXISTS (
                SELECT 1
                FROM sys.foreign_keys
                WHERE name = N'FK_MovimentacoesEstoque_DepositosEstoque_DepositoEstoqueId'
            )
                ALTER TABLE [pdv].[MovimentacoesEstoque]
                    ADD CONSTRAINT [FK_MovimentacoesEstoque_DepositosEstoque_DepositoEstoqueId]
                    FOREIGN KEY ([DepositoEstoqueId]) REFERENCES [pdv].[DepositosEstoque] ([DepositoEstoqueId]);

            IF NOT EXISTS (
                SELECT 1
                FROM sys.foreign_keys
                WHERE name = N'FK_MovimentacoesEstoque_DepositosEstoque_DepositoOrigemId'
            )
                ALTER TABLE [pdv].[MovimentacoesEstoque]
                    ADD CONSTRAINT [FK_MovimentacoesEstoque_DepositosEstoque_DepositoOrigemId]
                    FOREIGN KEY ([DepositoOrigemId]) REFERENCES [pdv].[DepositosEstoque] ([DepositoEstoqueId]);

            IF NOT EXISTS (
                SELECT 1
                FROM sys.foreign_keys
                WHERE name = N'FK_MovimentacoesEstoque_DepositosEstoque_DepositoDestinoId'
            )
                ALTER TABLE [pdv].[MovimentacoesEstoque]
                    ADD CONSTRAINT [FK_MovimentacoesEstoque_DepositosEstoque_DepositoDestinoId]
                    FOREIGN KEY ([DepositoDestinoId]) REFERENCES [pdv].[DepositosEstoque] ([DepositoEstoqueId]);

            IF NOT EXISTS (
                SELECT 1
                FROM sys.indexes
                WHERE name = N'IX_MovimentacoesEstoque_EmpresaId_ProdutoId_DataMovimentacao'
                  AND object_id = OBJECT_ID(N'[pdv].[MovimentacoesEstoque]')
            )
                CREATE INDEX [IX_MovimentacoesEstoque_EmpresaId_ProdutoId_DataMovimentacao]
                    ON [pdv].[MovimentacoesEstoque] ([EmpresaId], [ProdutoId], [DataMovimentacao]);
            """;

        const string backfillScript =
            """
            INSERT INTO [pdv].[DepositosEstoque] (
                [DepositoEstoqueId],
                [EmpresaId],
                [Codigo],
                [Nome],
                [Descricao],
                [Padrao],
                [PermiteVendaDireta],
                [Ativo],
                [DataCadastro]
            )
            SELECT
                NEWID(),
                e.[EmpresaId],
                N'LOJA-01',
                N'Operacao PDV',
                N'Deposito padrao que alimenta diretamente a venda no PDV.',
                1,
                1,
                1,
                SYSUTCDATETIME()
            FROM [pdv].[Empresas] e
            WHERE NOT EXISTS (
                SELECT 1
                FROM [pdv].[DepositosEstoque] d
                WHERE d.[EmpresaId] = e.[EmpresaId]
                  AND d.[Codigo] = N'LOJA-01'
            );

            INSERT INTO [pdv].[DepositosEstoque] (
                [DepositoEstoqueId],
                [EmpresaId],
                [Codigo],
                [Nome],
                [Descricao],
                [Padrao],
                [PermiteVendaDireta],
                [Ativo],
                [DataCadastro]
            )
            SELECT
                NEWID(),
                e.[EmpresaId],
                N'RET-01',
                N'Retaguarda',
                N'Reserva tecnica para abastecimento interno, contagem e pulmao de estoque.',
                0,
                0,
                1,
                SYSUTCDATETIME()
            FROM [pdv].[Empresas] e
            WHERE NOT EXISTS (
                SELECT 1
                FROM [pdv].[DepositosEstoque] d
                WHERE d.[EmpresaId] = e.[EmpresaId]
                  AND d.[Codigo] = N'RET-01'
            );

            INSERT INTO [pdv].[DepositosEstoque] (
                [DepositoEstoqueId],
                [EmpresaId],
                [Codigo],
                [Nome],
                [Descricao],
                [Padrao],
                [PermiteVendaDireta],
                [Ativo],
                [DataCadastro]
            )
            SELECT
                NEWID(),
                e.[EmpresaId],
                N'QAR-01',
                N'Quarentena e avaria',
                N'Area tecnica para itens bloqueados, avariados ou aguardando conferencia.',
                0,
                0,
                1,
                SYSUTCDATETIME()
            FROM [pdv].[Empresas] e
            WHERE NOT EXISTS (
                SELECT 1
                FROM [pdv].[DepositosEstoque] d
                WHERE d.[EmpresaId] = e.[EmpresaId]
                  AND d.[Codigo] = N'QAR-01'
            );

            ;WITH base AS (
                SELECT
                    p.[ProdutoId],
                    p.[EmpresaId],
                    p.[EstoqueAtual],
                    deposito.[DepositoEstoqueId]
                FROM [pdv].[Produtos] p
                CROSS APPLY (
                    SELECT TOP (1) d.[DepositoEstoqueId]
                    FROM [pdv].[DepositosEstoque] d
                    WHERE d.[EmpresaId] = p.[EmpresaId]
                      AND d.[Ativo] = 1
                    ORDER BY CASE WHEN d.[Padrao] = 1 THEN 0 ELSE 1 END, d.[DataCadastro], d.[Codigo]
                ) deposito
                WHERE p.[ControlaEstoque] = 1
            )
            INSERT INTO [pdv].[EstoquesDeposito] (
                [EstoqueDepositoId],
                [EmpresaId],
                [DepositoEstoqueId],
                [ProdutoId],
                [QuantidadeDisponivel],
                [QuantidadeReservada],
                [Ativo],
                [DataAtualizacao]
            )
            SELECT
                NEWID(),
                b.[EmpresaId],
                b.[DepositoEstoqueId],
                b.[ProdutoId],
                b.[EstoqueAtual],
                0,
                CASE WHEN b.[EstoqueAtual] > 0 THEN 1 ELSE 0 END,
                SYSUTCDATETIME()
            FROM base b
            WHERE NOT EXISTS (
                SELECT 1
                FROM [pdv].[EstoquesDeposito] ed
                WHERE ed.[EmpresaId] = b.[EmpresaId]
                  AND ed.[ProdutoId] = b.[ProdutoId]
                  AND ed.[DepositoEstoqueId] = b.[DepositoEstoqueId]
            );

            ;WITH saldo AS (
                SELECT
                    [ProdutoId],
                    SUM([QuantidadeDisponivel]) AS [QuantidadeDisponivel]
                FROM [pdv].[EstoquesDeposito]
                GROUP BY [ProdutoId]
            )
            UPDATE p
            SET [EstoqueAtual] = ISNULL(saldo.[QuantidadeDisponivel], 0)
            FROM [pdv].[Produtos] p
            LEFT JOIN saldo ON saldo.[ProdutoId] = p.[ProdutoId]
            WHERE p.[ControlaEstoque] = 1;
            """;

        await dbContext.Database.ExecuteSqlRawAsync(patchSchemaScript);
        await dbContext.Database.ExecuteSqlRawAsync(backfillScript);
    }

    private static async Task EnsureUsuarioAccessStructureAsync(AppDbContext dbContext)
    {
        const string patchScript =
            """
            IF COL_LENGTH(N'pdv.Usuarios', N'UsarPermissoesCustomizadas') IS NULL
                ALTER TABLE [pdv].[Usuarios] ADD [UsarPermissoesCustomizadas] bit NOT NULL CONSTRAINT [DF_Usuarios_UsarPermissoesCustomizadas] DEFAULT 0 WITH VALUES;

            IF COL_LENGTH(N'pdv.Usuarios', N'CodigoBarrasCracha') IS NULL
                ALTER TABLE [pdv].[Usuarios] ADD [CodigoBarrasCracha] nvarchar(80) NULL;

            IF NOT EXISTS (
                SELECT 1
                FROM sys.indexes
                WHERE name = N'IX_Usuarios_EmpresaId_CodigoBarrasCracha'
                  AND object_id = OBJECT_ID(N'[pdv].[Usuarios]')
            ) AND COL_LENGTH(N'pdv.Usuarios', N'CodigoBarrasCracha') IS NOT NULL
            BEGIN
                EXEC(N'
                    CREATE UNIQUE INDEX [IX_Usuarios_EmpresaId_CodigoBarrasCracha]
                        ON [pdv].[Usuarios] ([EmpresaId], [CodigoBarrasCracha])
                        WHERE [CodigoBarrasCracha] IS NOT NULL;
                ');
            END

            IF OBJECT_ID(N'[pdv].[UsuarioPermissoes]', N'U') IS NULL
            BEGIN
                CREATE TABLE [pdv].[UsuarioPermissoes] (
                    [UsuarioId] uniqueidentifier NOT NULL,
                    [PermissaoId] uniqueidentifier NOT NULL,
                    CONSTRAINT [PK_UsuarioPermissoes] PRIMARY KEY ([UsuarioId], [PermissaoId]),
                    CONSTRAINT [FK_UsuarioPermissoes_Usuarios_UsuarioId] FOREIGN KEY ([UsuarioId]) REFERENCES [pdv].[Usuarios] ([UsuarioId]) ON DELETE CASCADE,
                    CONSTRAINT [FK_UsuarioPermissoes_Permissoes_PermissaoId] FOREIGN KEY ([PermissaoId]) REFERENCES [pdv].[Permissoes] ([PermissaoId]) ON DELETE CASCADE
                );

                CREATE INDEX [IX_UsuarioPermissoes_PermissaoId] ON [pdv].[UsuarioPermissoes] ([PermissaoId]);
            END
            """;

        await dbContext.Database.ExecuteSqlRawAsync(patchScript);
    }

    private static async Task EnsureProdutoFiscalColumnsAsync(AppDbContext dbContext)
    {
        const string ensureColumnsScript =
            """
            IF COL_LENGTH(N'pdv.Produtos', N'Cest') IS NULL
                ALTER TABLE [pdv].[Produtos] ADD [Cest] nvarchar(20) NULL;

            IF COL_LENGTH(N'pdv.Produtos', N'OrigemFiscal') IS NULL
                ALTER TABLE [pdv].[Produtos] ADD [OrigemFiscal] nvarchar(120) NULL;

            IF COL_LENGTH(N'pdv.Produtos', N'PerfilFiscalPadrao') IS NULL
                ALTER TABLE [pdv].[Produtos] ADD [PerfilFiscalPadrao] nvarchar(40) NULL;

            IF COL_LENGTH(N'pdv.Produtos', N'CfopVendaPadrao') IS NULL
                ALTER TABLE [pdv].[Produtos] ADD [CfopVendaPadrao] nvarchar(10) NULL;

            IF COL_LENGTH(N'pdv.Produtos', N'CfopVendaInterestadual') IS NULL
                ALTER TABLE [pdv].[Produtos] ADD [CfopVendaInterestadual] nvarchar(10) NULL;

            IF COL_LENGTH(N'pdv.Produtos', N'CfopCompraPadrao') IS NULL
                ALTER TABLE [pdv].[Produtos] ADD [CfopCompraPadrao] nvarchar(10) NULL;

            IF COL_LENGTH(N'pdv.Produtos', N'CfopCompraInterestadual') IS NULL
                ALTER TABLE [pdv].[Produtos] ADD [CfopCompraInterestadual] nvarchar(10) NULL;

            IF COL_LENGTH(N'pdv.Produtos', N'Csosn') IS NULL
                ALTER TABLE [pdv].[Produtos] ADD [Csosn] nvarchar(10) NULL;

            IF COL_LENGTH(N'pdv.Produtos', N'CstIcms') IS NULL
                ALTER TABLE [pdv].[Produtos] ADD [CstIcms] nvarchar(10) NULL;

            IF COL_LENGTH(N'pdv.Produtos', N'CstPis') IS NULL
                ALTER TABLE [pdv].[Produtos] ADD [CstPis] nvarchar(10) NULL;

            IF COL_LENGTH(N'pdv.Produtos', N'CstCofins') IS NULL
                ALTER TABLE [pdv].[Produtos] ADD [CstCofins] nvarchar(10) NULL;

            IF COL_LENGTH(N'pdv.Produtos', N'BeneficioFiscalCodigo') IS NULL
                ALTER TABLE [pdv].[Produtos] ADD [BeneficioFiscalCodigo] nvarchar(20) NULL;

            IF COL_LENGTH(N'pdv.Produtos', N'CodigoAnp') IS NULL
                ALTER TABLE [pdv].[Produtos] ADD [CodigoAnp] nvarchar(20) NULL;

            IF COL_LENGTH(N'pdv.Produtos', N'UnidadeTributavel') IS NULL
                ALTER TABLE [pdv].[Produtos] ADD [UnidadeTributavel] nvarchar(10) NULL;

            IF COL_LENGTH(N'pdv.Produtos', N'ExTipi') IS NULL
                ALTER TABLE [pdv].[Produtos] ADD [ExTipi] nvarchar(3) NULL;

            IF COL_LENGTH(N'pdv.Produtos', N'AliquotaIcms') IS NULL
                ALTER TABLE [pdv].[Produtos] ADD [AliquotaIcms] decimal(9,4) NULL;

            IF COL_LENGTH(N'pdv.Produtos', N'AliquotaIpi') IS NULL
                ALTER TABLE [pdv].[Produtos] ADD [AliquotaIpi] decimal(9,4) NULL;

            IF COL_LENGTH(N'pdv.Produtos', N'AliquotaPis') IS NULL
                ALTER TABLE [pdv].[Produtos] ADD [AliquotaPis] decimal(9,4) NULL;

            IF COL_LENGTH(N'pdv.Produtos', N'AliquotaCofins') IS NULL
                ALTER TABLE [pdv].[Produtos] ADD [AliquotaCofins] decimal(9,4) NULL;

            IF COL_LENGTH(N'pdv.Produtos', N'DadosExtrasJson') IS NULL
                ALTER TABLE [pdv].[Produtos] ADD [DadosExtrasJson] nvarchar(max) NULL;
            """;

        const string backfillScript =
            """
            UPDATE [pdv].[Produtos]
            SET [PerfilFiscalPadrao] = N'RevendaMercadoria'
            WHERE [PerfilFiscalPadrao] IS NULL
              AND (
                    [CfopCompraPadrao] IN (N'1102', N'2102')
                 OR [CfopVendaPadrao] IN (N'5102', N'6102')
              );

            UPDATE [pdv].[Produtos]
            SET [PerfilFiscalPadrao] = N'ProducaoEstabelecimento'
            WHERE [PerfilFiscalPadrao] IS NULL
              AND (
                    [CfopCompraPadrao] IN (N'1101', N'2101')
                 OR [CfopVendaPadrao] IN (N'5101', N'6101')
              );

            UPDATE [pdv].[Produtos]
            SET [CfopCompraInterestadual] =
                CASE [CfopCompraPadrao]
                    WHEN N'1101' THEN N'2101'
                    WHEN N'1102' THEN N'2102'
                    ELSE [CfopCompraInterestadual]
                END
            WHERE [CfopCompraInterestadual] IS NULL;

            UPDATE [pdv].[Produtos]
            SET [CfopVendaInterestadual] =
                CASE [CfopVendaPadrao]
                    WHEN N'5101' THEN N'6101'
                    WHEN N'5102' THEN N'6102'
                    ELSE [CfopVendaInterestadual]
                END
            WHERE [CfopVendaInterestadual] IS NULL;

            UPDATE [pdv].[Produtos]
            SET [UnidadeTributavel] = LEFT(ISNULL([UnidadeMedida], N'UN'), 10)
            WHERE [UnidadeTributavel] IS NULL;
            """;

        await dbContext.Database.ExecuteSqlRawAsync(ensureColumnsScript);
        await dbContext.Database.ExecuteSqlRawAsync(backfillScript);
    }

    private static async Task EnsureProdutoFiscalAssistenteTablesAsync(AppDbContext dbContext)
    {
        const string patchSchemaScript =
            """
            IF OBJECT_ID(N'[pdv].[FiscalNcm]', N'U') IS NULL
            BEGIN
                CREATE TABLE [pdv].[FiscalNcm] (
                    [FiscalNcmId] uniqueidentifier NOT NULL,
                    [Codigo] nvarchar(8) NOT NULL,
                    [Descricao] nvarchar(250) NOT NULL,
                    [DescricaoCompleta] nvarchar(2000) NULL,
                    [AtoLegal] nvarchar(160) NULL,
                    [DataInicio] date NULL,
                    [DataFim] date NULL,
                    [Vigente] bit NOT NULL CONSTRAINT [DF_FiscalNcm_Vigente] DEFAULT 1,
                    [DataImportacao] datetime2 NULL,
                    [UsuarioImportacao] uniqueidentifier NULL,
                    [CestPadraoCodigo] nvarchar(7) NULL,
                    [AliquotaIbpt] decimal(9,4) NULL,
                    [SujeitoSt] bit NOT NULL,
                    [Ativo] bit NOT NULL,
                    CONSTRAINT [PK_FiscalNcm] PRIMARY KEY ([FiscalNcmId])
                );

                CREATE UNIQUE INDEX [IX_FiscalNcm_Codigo] ON [pdv].[FiscalNcm] ([Codigo]);
            END

            IF COL_LENGTH(N'pdv.FiscalNcm', N'DescricaoCompleta') IS NULL
                ALTER TABLE [pdv].[FiscalNcm] ADD [DescricaoCompleta] nvarchar(2000) NULL;

            IF COL_LENGTH(N'pdv.FiscalNcm', N'AtoLegal') IS NULL
                ALTER TABLE [pdv].[FiscalNcm] ADD [AtoLegal] nvarchar(160) NULL;

            IF COL_LENGTH(N'pdv.FiscalNcm', N'DataInicio') IS NULL
                ALTER TABLE [pdv].[FiscalNcm] ADD [DataInicio] date NULL;

            IF COL_LENGTH(N'pdv.FiscalNcm', N'DataFim') IS NULL
                ALTER TABLE [pdv].[FiscalNcm] ADD [DataFim] date NULL;

            IF COL_LENGTH(N'pdv.FiscalNcm', N'Vigente') IS NULL
                ALTER TABLE [pdv].[FiscalNcm] ADD [Vigente] bit NOT NULL CONSTRAINT [DF_FiscalNcm_Vigente] DEFAULT 1 WITH VALUES;

            IF COL_LENGTH(N'pdv.FiscalNcm', N'DataImportacao') IS NULL
                ALTER TABLE [pdv].[FiscalNcm] ADD [DataImportacao] datetime2 NULL;

            IF COL_LENGTH(N'pdv.FiscalNcm', N'UsuarioImportacao') IS NULL
                ALTER TABLE [pdv].[FiscalNcm] ADD [UsuarioImportacao] uniqueidentifier NULL;

            IF OBJECT_ID(N'[pdv].[FiscalNcmOficial]', N'U') IS NULL
            BEGIN
                CREATE TABLE [pdv].[FiscalNcmOficial] (
                    [FiscalNcmOficialId] uniqueidentifier NOT NULL,
                    [Codigo] nvarchar(20) NOT NULL,
                    [CodigoNormalizado] nvarchar(8) NOT NULL,
                    [Descricao] nvarchar(500) NOT NULL,
                    [DescricaoConcatenada] nvarchar(4000) NULL,
                    [DataInicio] date NULL,
                    [DataFim] date NULL,
                    [TipoAtoInicio] nvarchar(80) NULL,
                    [NumeroAtoInicio] nvarchar(20) NULL,
                    [AnoAtoInicio] nvarchar(10) NULL,
                    [EhItemFinal] bit NOT NULL CONSTRAINT [DF_FiscalNcmOficial_EhItemFinal] DEFAULT 0,
                    [Vigente] bit NOT NULL CONSTRAINT [DF_FiscalNcmOficial_Vigente] DEFAULT 1,
                    [DataImportacao] datetime2 NOT NULL CONSTRAINT [DF_FiscalNcmOficial_DataImportacao] DEFAULT SYSUTCDATETIME(),
                    [Ativo] bit NOT NULL CONSTRAINT [DF_FiscalNcmOficial_Ativo] DEFAULT 1,
                    CONSTRAINT [PK_FiscalNcmOficial] PRIMARY KEY ([FiscalNcmOficialId])
                );

                CREATE UNIQUE INDEX [IX_FiscalNcmOficial_Codigo] ON [pdv].[FiscalNcmOficial] ([Codigo]);
                CREATE INDEX [IX_FiscalNcmOficial_CodigoNormalizado] ON [pdv].[FiscalNcmOficial] ([CodigoNormalizado]);
                CREATE INDEX [IX_FiscalNcmOficial_Status] ON [pdv].[FiscalNcmOficial] ([EhItemFinal], [Vigente], [Ativo]);
            END

            IF COL_LENGTH(N'pdv.FiscalNcmOficial', N'CodigoNormalizado') IS NULL
                ALTER TABLE [pdv].[FiscalNcmOficial] ADD [CodigoNormalizado] nvarchar(8) NOT NULL CONSTRAINT [DF_FiscalNcmOficial_CodigoNormalizado] DEFAULT N'' WITH VALUES;

            IF COL_LENGTH(N'pdv.FiscalNcmOficial', N'DescricaoConcatenada') IS NULL
                ALTER TABLE [pdv].[FiscalNcmOficial] ADD [DescricaoConcatenada] nvarchar(4000) NULL;

            IF COL_LENGTH(N'pdv.FiscalNcmOficial', N'DataInicio') IS NULL
                ALTER TABLE [pdv].[FiscalNcmOficial] ADD [DataInicio] date NULL;

            IF COL_LENGTH(N'pdv.FiscalNcmOficial', N'DataFim') IS NULL
                ALTER TABLE [pdv].[FiscalNcmOficial] ADD [DataFim] date NULL;

            IF COL_LENGTH(N'pdv.FiscalNcmOficial', N'TipoAtoInicio') IS NULL
                ALTER TABLE [pdv].[FiscalNcmOficial] ADD [TipoAtoInicio] nvarchar(80) NULL;

            IF COL_LENGTH(N'pdv.FiscalNcmOficial', N'NumeroAtoInicio') IS NULL
                ALTER TABLE [pdv].[FiscalNcmOficial] ADD [NumeroAtoInicio] nvarchar(20) NULL;

            IF COL_LENGTH(N'pdv.FiscalNcmOficial', N'AnoAtoInicio') IS NULL
                ALTER TABLE [pdv].[FiscalNcmOficial] ADD [AnoAtoInicio] nvarchar(10) NULL;

            IF COL_LENGTH(N'pdv.FiscalNcmOficial', N'EhItemFinal') IS NULL
                ALTER TABLE [pdv].[FiscalNcmOficial] ADD [EhItemFinal] bit NOT NULL CONSTRAINT [DF_FiscalNcmOficial_EhItemFinal] DEFAULT 0 WITH VALUES;

            IF COL_LENGTH(N'pdv.FiscalNcmOficial', N'Vigente') IS NULL
                ALTER TABLE [pdv].[FiscalNcmOficial] ADD [Vigente] bit NOT NULL CONSTRAINT [DF_FiscalNcmOficial_Vigente] DEFAULT 1 WITH VALUES;

            IF COL_LENGTH(N'pdv.FiscalNcmOficial', N'DataImportacao') IS NULL
                ALTER TABLE [pdv].[FiscalNcmOficial] ADD [DataImportacao] datetime2 NOT NULL CONSTRAINT [DF_FiscalNcmOficial_DataImportacao] DEFAULT SYSUTCDATETIME() WITH VALUES;

            IF COL_LENGTH(N'pdv.FiscalNcmOficial', N'Ativo') IS NULL
                ALTER TABLE [pdv].[FiscalNcmOficial] ADD [Ativo] bit NOT NULL CONSTRAINT [DF_FiscalNcmOficial_Ativo] DEFAULT 1 WITH VALUES;

            IF NOT EXISTS (
                SELECT 1
                FROM sys.indexes
                WHERE name = N'IX_FiscalNcmOficial_Codigo'
                  AND object_id = OBJECT_ID(N'[pdv].[FiscalNcmOficial]')
            )
                CREATE UNIQUE INDEX [IX_FiscalNcmOficial_Codigo] ON [pdv].[FiscalNcmOficial] ([Codigo]);

            IF NOT EXISTS (
                SELECT 1
                FROM sys.indexes
                WHERE name = N'IX_FiscalNcmOficial_CodigoNormalizado'
                  AND object_id = OBJECT_ID(N'[pdv].[FiscalNcmOficial]')
            )
                CREATE INDEX [IX_FiscalNcmOficial_CodigoNormalizado] ON [pdv].[FiscalNcmOficial] ([CodigoNormalizado]);

            IF NOT EXISTS (
                SELECT 1
                FROM sys.indexes
                WHERE name = N'IX_FiscalNcmOficial_Status'
                  AND object_id = OBJECT_ID(N'[pdv].[FiscalNcmOficial]')
            )
                CREATE INDEX [IX_FiscalNcmOficial_Status] ON [pdv].[FiscalNcmOficial] ([EhItemFinal], [Vigente], [Ativo]);

            IF OBJECT_ID(N'[pdv].[FiscalCest]', N'U') IS NULL
            BEGIN
                CREATE TABLE [pdv].[FiscalCest] (
                    [FiscalCestId] uniqueidentifier NOT NULL,
                    [Codigo] nvarchar(7) NOT NULL,
                    [Descricao] nvarchar(250) NOT NULL,
                    [NcmCodigo] nvarchar(8) NULL,
                    [Ativo] bit NOT NULL,
                    CONSTRAINT [PK_FiscalCest] PRIMARY KEY ([FiscalCestId])
                );

                CREATE UNIQUE INDEX [IX_FiscalCest_Codigo] ON [pdv].[FiscalCest] ([Codigo]);
                CREATE INDEX [IX_FiscalCest_NcmCodigo] ON [pdv].[FiscalCest] ([NcmCodigo]);
            END

            IF OBJECT_ID(N'[pdv].[FiscalCfop]', N'U') IS NULL
            BEGIN
                CREATE TABLE [pdv].[FiscalCfop] (
                    [FiscalCfopId] uniqueidentifier NOT NULL,
                    [Codigo] nvarchar(4) NOT NULL,
                    [Descricao] nvarchar(250) NOT NULL,
                    [PerfilFiscalPadrao] nvarchar(40) NULL,
                    [Entrada] bit NOT NULL,
                    [Saida] bit NOT NULL,
                    [DentroEstado] bit NOT NULL,
                    [ForaEstado] bit NOT NULL,
                    [ExigeContexto] bit NOT NULL,
                    [Ativo] bit NOT NULL,
                    CONSTRAINT [PK_FiscalCfop] PRIMARY KEY ([FiscalCfopId])
                );

                CREATE UNIQUE INDEX [IX_FiscalCfop_Codigo] ON [pdv].[FiscalCfop] ([Codigo]);
            END

            IF OBJECT_ID(N'[pdv].[FiscalCsosn]', N'U') IS NULL
            BEGIN
                CREATE TABLE [pdv].[FiscalCsosn] (
                    [FiscalCsosnId] uniqueidentifier NOT NULL,
                    [Codigo] nvarchar(3) NOT NULL,
                    [Descricao] nvarchar(250) NOT NULL,
                    [ExigeSt] bit NOT NULL,
                    [DestacaIcmsProprio] bit NOT NULL,
                    [Ativo] bit NOT NULL,
                    CONSTRAINT [PK_FiscalCsosn] PRIMARY KEY ([FiscalCsosnId])
                );

                CREATE UNIQUE INDEX [IX_FiscalCsosn_Codigo] ON [pdv].[FiscalCsosn] ([Codigo]);
            END

            IF OBJECT_ID(N'[pdv].[FiscalCstIcms]', N'U') IS NULL
            BEGIN
                CREATE TABLE [pdv].[FiscalCstIcms] (
                    [FiscalCstIcmsId] uniqueidentifier NOT NULL,
                    [Codigo] nvarchar(2) NOT NULL,
                    [Descricao] nvarchar(250) NOT NULL,
                    [ExigeSt] bit NOT NULL,
                    [DestacaIcmsProprio] bit NOT NULL,
                    [Ativo] bit NOT NULL,
                    CONSTRAINT [PK_FiscalCstIcms] PRIMARY KEY ([FiscalCstIcmsId])
                );

                CREATE UNIQUE INDEX [IX_FiscalCstIcms_Codigo] ON [pdv].[FiscalCstIcms] ([Codigo]);
            END

            IF OBJECT_ID(N'[pdv].[FiscalCstPisCofins]', N'U') IS NULL
            BEGIN
                CREATE TABLE [pdv].[FiscalCstPisCofins] (
                    [FiscalCstPisCofinsId] uniqueidentifier NOT NULL,
                    [Codigo] nvarchar(2) NOT NULL,
                    [Descricao] nvarchar(250) NOT NULL,
                    [AliquotaZero] bit NOT NULL,
                    [UsaAliquotaPadrao] bit NOT NULL,
                    [Ativo] bit NOT NULL,
                    CONSTRAINT [PK_FiscalCstPisCofins] PRIMARY KEY ([FiscalCstPisCofinsId])
                );

                CREATE UNIQUE INDEX [IX_FiscalCstPisCofins_Codigo] ON [pdv].[FiscalCstPisCofins] ([Codigo]);
            END

            IF OBJECT_ID(N'[pdv].[FiscalAliquotaIcms]', N'U') IS NULL
            BEGIN
                CREATE TABLE [pdv].[FiscalAliquotaIcms] (
                    [FiscalAliquotaIcmsId] uniqueidentifier NOT NULL,
                    [UfOrigem] nvarchar(2) NOT NULL,
                    [UfDestino] nvarchar(2) NULL,
                    [NcmPrefixo] nvarchar(8) NULL,
                    [OrigemFiscalCodigo] nvarchar(1) NULL,
                    [CfopCodigo] nvarchar(4) NULL,
                    [RegimeTributario] nvarchar(40) NULL,
                    [ConsumidorFinal] bit NULL,
                    [Aliquota] decimal(9,4) NOT NULL,
                    [Prioridade] int NOT NULL,
                    [Descricao] nvarchar(250) NOT NULL,
                    [Ativo] bit NOT NULL,
                    CONSTRAINT [PK_FiscalAliquotaIcms] PRIMARY KEY ([FiscalAliquotaIcmsId])
                );

                CREATE INDEX [IX_FiscalAliquotaIcms_RegraBusca]
                    ON [pdv].[FiscalAliquotaIcms] ([UfOrigem], [UfDestino], [NcmPrefixo], [CfopCodigo], [RegimeTributario], [Prioridade]);
            END

            IF OBJECT_ID(N'[pdv].[FiscalBeneficio]', N'U') IS NULL
            BEGIN
                CREATE TABLE [pdv].[FiscalBeneficio] (
                    [FiscalBeneficioId] uniqueidentifier NOT NULL,
                    [Codigo] nvarchar(20) NOT NULL,
                    [Descricao] nvarchar(250) NOT NULL,
                    [Uf] nvarchar(2) NULL,
                    [NcmPrefixo] nvarchar(8) NULL,
                    [Ativo] bit NOT NULL,
                    CONSTRAINT [PK_FiscalBeneficio] PRIMARY KEY ([FiscalBeneficioId])
                );

                CREATE UNIQUE INDEX [IX_FiscalBeneficio_Codigo] ON [pdv].[FiscalBeneficio] ([Codigo]);
                CREATE INDEX [IX_FiscalBeneficio_Uf_NcmPrefixo] ON [pdv].[FiscalBeneficio] ([Uf], [NcmPrefixo]);
            END

            IF OBJECT_ID(N'[pdv].[FiscalUfParametro]', N'U') IS NULL
            BEGIN
                CREATE TABLE [pdv].[FiscalUfParametro] (
                    [FiscalUfParametroId] uniqueidentifier NOT NULL,
                    [Uf] nvarchar(2) NOT NULL,
                    [AliquotaInternaIcms] decimal(9,4) NOT NULL,
                    [AliquotaInterestadual] decimal(9,4) NOT NULL,
                    [AliquotaFcp] decimal(9,4) NOT NULL,
                    [AliquotaIssPadrao] decimal(9,4) NULL,
                    [Observacoes] nvarchar(300) NULL,
                    [Ativo] bit NOT NULL,
                    CONSTRAINT [PK_FiscalUfParametro] PRIMARY KEY ([FiscalUfParametroId])
                );

                CREATE UNIQUE INDEX [IX_FiscalUfParametro_Uf] ON [pdv].[FiscalUfParametro] ([Uf]);
            END

            IF OBJECT_ID(N'[pdv].[ProdutoFiscalRegraAplicada]', N'U') IS NULL
            BEGIN
                CREATE TABLE [pdv].[ProdutoFiscalRegraAplicada] (
                    [ProdutoFiscalRegraAplicadaId] uniqueidentifier NOT NULL,
                    [EmpresaId] uniqueidentifier NOT NULL,
                    [ProdutoId] uniqueidentifier NOT NULL,
                    [Ordem] int NOT NULL,
                    [Campo] nvarchar(80) NOT NULL,
                    [Codigo] nvarchar(40) NULL,
                    [Descricao] nvarchar(300) NOT NULL,
                    [OrigemRegra] nvarchar(30) NOT NULL,
                    [DataAplicacao] datetime2 NOT NULL,
                    CONSTRAINT [PK_ProdutoFiscalRegraAplicada] PRIMARY KEY ([ProdutoFiscalRegraAplicadaId]),
                    CONSTRAINT [FK_ProdutoFiscalRegraAplicada_Produtos_ProdutoId] FOREIGN KEY ([ProdutoId]) REFERENCES [pdv].[Produtos] ([ProdutoId]) ON DELETE CASCADE
                );

                CREATE INDEX [IX_ProdutoFiscalRegraAplicada_ProdutoId_Ordem]
                    ON [pdv].[ProdutoFiscalRegraAplicada] ([ProdutoId], [Ordem]);
            END

            IF OBJECT_ID(N'[pdv].[FiscalRegraAplicadaLog]', N'U') IS NULL
            BEGIN
                CREATE TABLE [pdv].[FiscalRegraAplicadaLog] (
                    [FiscalRegraAplicadaLogId] uniqueidentifier NOT NULL,
                    [EmpresaId] uniqueidentifier NOT NULL,
                    [ProdutoId] uniqueidentifier NOT NULL,
                    [UsuarioId] uniqueidentifier NOT NULL,
                    [Campo] nvarchar(80) NOT NULL,
                    [ValorAnterior] nvarchar(200) NULL,
                    [ValorNovo] nvarchar(200) NULL,
                    [OrigemRegra] nvarchar(30) NOT NULL,
                    [Justificativa] nvarchar(500) NULL,
                    [IpAddress] nvarchar(64) NULL,
                    [DataAlteracao] datetime2 NOT NULL,
                    CONSTRAINT [PK_FiscalRegraAplicadaLog] PRIMARY KEY ([FiscalRegraAplicadaLogId]),
                    CONSTRAINT [FK_FiscalRegraAplicadaLog_Produtos_ProdutoId] FOREIGN KEY ([ProdutoId]) REFERENCES [pdv].[Produtos] ([ProdutoId]) ON DELETE CASCADE,
                    CONSTRAINT [FK_FiscalRegraAplicadaLog_Usuarios_UsuarioId] FOREIGN KEY ([UsuarioId]) REFERENCES [pdv].[Usuarios] ([UsuarioId]) ON DELETE NO ACTION
                );

                CREATE INDEX [IX_FiscalRegraAplicadaLog_ProdutoId_DataAlteracao]
                    ON [pdv].[FiscalRegraAplicadaLog] ([ProdutoId], [DataAlteracao]);
            END

            IF COL_LENGTH(N'pdv.FiscalRegraAplicadaLog', N'IpAddress') IS NULL
                ALTER TABLE [pdv].[FiscalRegraAplicadaLog] ADD [IpAddress] nvarchar(64) NULL;
            """;

        const string backfillScript =
            """
            UPDATE [pdv].[FiscalNcm]
            SET [DescricaoCompleta] = [Descricao]
            WHERE [DescricaoCompleta] IS NULL
              AND [Descricao] IS NOT NULL;

            UPDATE [pdv].[FiscalNcm]
            SET [Vigente] = CASE WHEN [Ativo] = 1 THEN 1 ELSE 0 END
            WHERE [DataImportacao] IS NULL;
            """;

        await dbContext.Database.ExecuteSqlRawAsync(patchSchemaScript);
        await dbContext.Database.ExecuteSqlRawAsync(backfillScript);
    }

    private static async Task EnsureProdutoCampoPadraoTableAsync(AppDbContext dbContext)
    {
        const string patchScript =
            """
            IF OBJECT_ID(N'[pdv].[ProdutoCamposPadrao]', N'U') IS NULL
            BEGIN
                CREATE TABLE [pdv].[ProdutoCamposPadrao] (
                    [ProdutoCampoPadraoId] uniqueidentifier NOT NULL,
                    [EmpresaId] uniqueidentifier NOT NULL,
                    [Chave] nvarchar(80) NOT NULL,
                    [ValorPadrao] nvarchar(2000) NULL,
                    [Ordem] int NOT NULL,
                    [DataCadastro] datetime2 NOT NULL,
                    CONSTRAINT [PK_ProdutoCamposPadrao] PRIMARY KEY ([ProdutoCampoPadraoId])
                );

                CREATE UNIQUE INDEX [IX_ProdutoCamposPadrao_EmpresaId_Chave]
                    ON [pdv].[ProdutoCamposPadrao] ([EmpresaId], [Chave]);

                CREATE INDEX [IX_ProdutoCamposPadrao_EmpresaId_Ordem]
                    ON [pdv].[ProdutoCamposPadrao] ([EmpresaId], [Ordem]);
            END
            """;

        await dbContext.Database.ExecuteSqlRawAsync(patchScript);
    }

    private static async Task EnsureAuditColumnsAsync(AppDbContext dbContext)
    {
        const string patchScript =
            """
            IF OBJECT_ID(N'[pdv].[LogsSistema]', N'U') IS NOT NULL
            BEGIN
                IF COL_LENGTH(N'pdv.LogsSistema', N'IpAddress') IS NULL
                    ALTER TABLE [pdv].[LogsSistema] ADD [IpAddress] nvarchar(64) NULL;

                IF COL_LENGTH(N'pdv.LogsSistema', N'Dados') IS NOT NULL
                    ALTER TABLE [pdv].[LogsSistema] ALTER COLUMN [Dados] nvarchar(max) NULL;
            END
            """;

        await dbContext.Database.ExecuteSqlRawAsync(patchScript);
    }

    private static async Task EnsureFinanceiroTablesAsync(AppDbContext dbContext)
    {
        const string patchScript =
            """
            IF OBJECT_ID(N'[pdv].[LancamentosFinanceiros]', N'U') IS NULL
            BEGIN
                CREATE TABLE [pdv].[LancamentosFinanceiros] (
                    [LancamentoFinanceiroId] uniqueidentifier NOT NULL,
                    [EmpresaId] uniqueidentifier NOT NULL,
                    [Tipo] nvarchar(20) NOT NULL,
                    [Origem] nvarchar(30) NOT NULL,
                    [Status] nvarchar(20) NOT NULL,
                    [Descricao] nvarchar(180) NOT NULL,
                    [DocumentoReferencia] nvarchar(60) NULL,
                    [VendaId] uniqueidentifier NULL,
                    [ClienteId] uniqueidentifier NULL,
                    [FornecedorId] uniqueidentifier NULL,
                    [UsuarioId] uniqueidentifier NULL,
                    [CaixaId] uniqueidentifier NULL,
                    [DataCompetencia] datetime2 NOT NULL,
                    [DataVencimento] datetime2 NOT NULL,
                    [DataLiquidacao] datetime2 NULL,
                    [ValorOriginal] decimal(18,2) NOT NULL,
                    [ValorDesconto] decimal(18,2) NOT NULL,
                    [ValorAcrescimo] decimal(18,2) NOT NULL,
                    [ValorFinal] decimal(18,2) NOT NULL,
                    [ValorCusto] decimal(18,2) NOT NULL,
                    [Observacao] nvarchar(500) NULL,
                    CONSTRAINT [PK_LancamentosFinanceiros] PRIMARY KEY ([LancamentoFinanceiroId]),
                    CONSTRAINT [FK_LancamentosFinanceiros_Vendas_VendaId] FOREIGN KEY ([VendaId]) REFERENCES [pdv].[Vendas] ([VendaId]) ON DELETE NO ACTION,
                    CONSTRAINT [FK_LancamentosFinanceiros_Clientes_ClienteId] FOREIGN KEY ([ClienteId]) REFERENCES [pdv].[Clientes] ([ClienteId]) ON DELETE NO ACTION,
                    CONSTRAINT [FK_LancamentosFinanceiros_Fornecedores_FornecedorId] FOREIGN KEY ([FornecedorId]) REFERENCES [pdv].[Fornecedores] ([FornecedorId]) ON DELETE NO ACTION,
                    CONSTRAINT [FK_LancamentosFinanceiros_Usuarios_UsuarioId] FOREIGN KEY ([UsuarioId]) REFERENCES [pdv].[Usuarios] ([UsuarioId]) ON DELETE NO ACTION,
                    CONSTRAINT [FK_LancamentosFinanceiros_Caixas_CaixaId] FOREIGN KEY ([CaixaId]) REFERENCES [pdv].[Caixas] ([CaixaId]) ON DELETE NO ACTION
                );

                CREATE INDEX [IX_LancamentosFinanceiros_EmpresaId_DataCompetencia] ON [pdv].[LancamentosFinanceiros] ([EmpresaId], [DataCompetencia]);
                CREATE INDEX [IX_LancamentosFinanceiros_EmpresaId_Status_Tipo] ON [pdv].[LancamentosFinanceiros] ([EmpresaId], [Status], [Tipo]);
            END
            """;

        await dbContext.Database.ExecuteSqlRawAsync(patchScript);
    }

    private static async Task EnsureCobrancaDigitalStructureAsync(AppDbContext dbContext)
    {
        const string companyPatchScript =
            """
            IF COL_LENGTH(N'pdv.Empresas', N'CobrancaDigitalProvider') IS NULL
                ALTER TABLE [pdv].[Empresas] ADD [CobrancaDigitalProvider] nvarchar(30) NOT NULL CONSTRAINT [DF_Empresas_CobrancaDigitalProvider] DEFAULT N'Nenhum' WITH VALUES;

            IF COL_LENGTH(N'pdv.Empresas', N'AmbienteCobrancaDigital') IS NULL
                ALTER TABLE [pdv].[Empresas] ADD [AmbienteCobrancaDigital] nvarchar(20) NOT NULL CONSTRAINT [DF_Empresas_AmbienteCobrancaDigital] DEFAULT N'Homologacao' WITH VALUES;

            IF COL_LENGTH(N'pdv.Empresas', N'ApiCobrancaClientId') IS NULL
                ALTER TABLE [pdv].[Empresas] ADD [ApiCobrancaClientId] nvarchar(200) NULL;

            IF COL_LENGTH(N'pdv.Empresas', N'ApiCobrancaClientSecretProtegido') IS NULL
                ALTER TABLE [pdv].[Empresas] ADD [ApiCobrancaClientSecretProtegido] nvarchar(max) NULL;

            IF COL_LENGTH(N'pdv.Empresas', N'UrlApiCobranca') IS NULL
                ALTER TABLE [pdv].[Empresas] ADD [UrlApiCobranca] nvarchar(500) NULL;

            IF COL_LENGTH(N'pdv.Empresas', N'DiasVencimentoCobranca') IS NULL
                ALTER TABLE [pdv].[Empresas] ADD [DiasVencimentoCobranca] int NOT NULL CONSTRAINT [DF_Empresas_DiasVencimentoCobranca] DEFAULT 3 WITH VALUES;
            """;

        const string tablePatchScript =
            """
            IF OBJECT_ID(N'[pdv].[CobrancasDigitais]', N'U') IS NULL
            BEGIN
                CREATE TABLE [pdv].[CobrancasDigitais] (
                    [CobrancaDigitalId] uniqueidentifier NOT NULL,
                    [EmpresaId] uniqueidentifier NOT NULL,
                    [ClienteId] uniqueidentifier NULL,
                    [VendaId] uniqueidentifier NULL,
                    [LancamentoFinanceiroId] uniqueidentifier NULL,
                    [UsuarioId] uniqueidentifier NULL,
                    [Provider] nvarchar(30) NOT NULL,
                    [Origem] nvarchar(30) NOT NULL,
                    [Status] nvarchar(20) NOT NULL,
                    [Descricao] nvarchar(180) NOT NULL,
                    [DocumentoReferencia] nvarchar(60) NULL,
                    [IdentificadorInterno] nvarchar(80) NULL,
                    [ChargeIdExterno] nvarchar(80) NULL,
                    [CustomIdExterno] nvarchar(80) NULL,
                    [StatusExterno] nvarchar(40) NULL,
                    [PixCopiaECola] nvarchar(max) NULL,
                    [PixQrCodeImageUrl] nvarchar(max) NULL,
                    [LinhaDigitavel] nvarchar(120) NULL,
                    [LinkCobranca] nvarchar(1000) NULL,
                    [LinkBoleto] nvarchar(1000) NULL,
                    [LinkPdf] nvarchar(1000) NULL,
                    [ValorOriginal] decimal(18,2) NOT NULL,
                    [ValorPago] decimal(18,2) NULL,
                    [DataVencimento] datetime2 NOT NULL,
                    [DataCriacaoProvider] datetime2 NULL,
                    [DataPagamento] datetime2 NULL,
                    [DataCriacao] datetime2 NOT NULL,
                    [DataAtualizacao] datetime2 NOT NULL,
                    [PayloadCriacaoJson] nvarchar(max) NULL,
                    [PayloadConsultaJson] nvarchar(max) NULL,
                    [RetornoProviderJson] nvarchar(max) NULL,
                    [Observacao] nvarchar(500) NULL,
                    CONSTRAINT [PK_CobrancasDigitais] PRIMARY KEY ([CobrancaDigitalId]),
                    CONSTRAINT [FK_CobrancasDigitais_Clientes_ClienteId] FOREIGN KEY ([ClienteId]) REFERENCES [pdv].[Clientes] ([ClienteId]) ON DELETE NO ACTION,
                    CONSTRAINT [FK_CobrancasDigitais_Vendas_VendaId] FOREIGN KEY ([VendaId]) REFERENCES [pdv].[Vendas] ([VendaId]) ON DELETE NO ACTION,
                    CONSTRAINT [FK_CobrancasDigitais_LancamentosFinanceiros_LancamentoFinanceiroId] FOREIGN KEY ([LancamentoFinanceiroId]) REFERENCES [pdv].[LancamentosFinanceiros] ([LancamentoFinanceiroId]) ON DELETE NO ACTION,
                    CONSTRAINT [FK_CobrancasDigitais_Usuarios_UsuarioId] FOREIGN KEY ([UsuarioId]) REFERENCES [pdv].[Usuarios] ([UsuarioId]) ON DELETE NO ACTION
                );

                CREATE INDEX [IX_CobrancasDigitais_EmpresaId_DataCriacao]
                    ON [pdv].[CobrancasDigitais] ([EmpresaId], [DataCriacao]);

                CREATE INDEX [IX_CobrancasDigitais_EmpresaId_Status_Origem]
                    ON [pdv].[CobrancasDigitais] ([EmpresaId], [Status], [Origem]);

                CREATE UNIQUE INDEX [IX_CobrancasDigitais_EmpresaId_ChargeIdExterno]
                    ON [pdv].[CobrancasDigitais] ([EmpresaId], [ChargeIdExterno])
                    WHERE [ChargeIdExterno] IS NOT NULL;
            END
            """;

        await dbContext.Database.ExecuteSqlRawAsync(companyPatchScript);
        await dbContext.Database.ExecuteSqlRawAsync(tablePatchScript);
    }

    private static async Task EnsureNotaFiscalTablesAsync(AppDbContext dbContext)
    {
        const string createTablesScript =
            """
            IF OBJECT_ID(N'[pdv].[NotasFiscais]', N'U') IS NULL
            BEGIN
                CREATE TABLE [pdv].[NotasFiscais] (
                    [NotaFiscalId] uniqueidentifier NOT NULL,
                    [EmpresaId] uniqueidentifier NOT NULL,
                    [VendaId] uniqueidentifier NULL,
                    [ClienteId] uniqueidentifier NULL,
                    [UsuarioId] uniqueidentifier NOT NULL,
                    [Numero] int NOT NULL,
                    [Serie] int NOT NULL,
                    [Ambiente] nvarchar(20) NOT NULL,
                    [Status] nvarchar(30) NOT NULL,
                    [Origem] nvarchar(20) NOT NULL,
                    [NumeroVenda] nvarchar(40) NULL,
                    [DestinatarioNome] nvarchar(150) NOT NULL,
                    [DestinatarioDocumento] nvarchar(20) NULL,
                    [EmitenteSnapshotJson] nvarchar(max) NOT NULL,
                    [DestinatarioSnapshotJson] nvarchar(max) NOT NULL,
                    [PendenciasJson] nvarchar(max) NULL,
                    [Observacoes] nvarchar(500) NULL,
                    [ValorProdutos] decimal(18,2) NOT NULL,
                    [ValorDesconto] decimal(18,2) NOT NULL,
                    [ValorTotal] decimal(18,2) NOT NULL,
                    [ProntaParaTransmissao] bit NOT NULL,
                    [ProviderFiscal] nvarchar(30) NOT NULL CONSTRAINT [DF_NotasFiscais_ProviderFiscal] DEFAULT N'SefazDirect',
                    [ReferenciaFiscal] nvarchar(80) NULL,
                    [DocumentoFiscalId] nvarchar(120) NULL,
                    [ChaveAcesso] nvarchar(44) NULL,
                    [CodigoNumerico] nvarchar(8) NULL,
                    [LoteTransmissao] nvarchar(20) NULL,
                    [ReciboSefaz] nvarchar(20) NULL,
                    [ProtocoloAutorizacao] nvarchar(40) NULL,
                    [CodigoStatusSefaz] int NULL,
                    [MensagemStatusSefaz] nvarchar(500) NULL,
                    [PayloadOriginalJson] nvarchar(max) NULL,
                    [PayloadProviderJson] nvarchar(max) NULL,
                    [RetornoProviderJson] nvarchar(max) NULL,
                    [DanfeUrl] nvarchar(1000) NULL,
                    [DanfePdfBase64] nvarchar(max) NULL,
                    [XmlEnvio] nvarchar(max) NULL,
                    [XmlRetorno] nvarchar(max) NULL,
                    [DataTransmissao] datetime2 NULL,
                    [DataAutorizacao] datetime2 NULL,
                    [DataEmissao] datetime2 NOT NULL,
                    CONSTRAINT [PK_NotasFiscais] PRIMARY KEY ([NotaFiscalId]),
                    CONSTRAINT [FK_NotasFiscais_Vendas_VendaId] FOREIGN KEY ([VendaId]) REFERENCES [pdv].[Vendas] ([VendaId]) ON DELETE NO ACTION,
                    CONSTRAINT [FK_NotasFiscais_Clientes_ClienteId] FOREIGN KEY ([ClienteId]) REFERENCES [pdv].[Clientes] ([ClienteId]) ON DELETE NO ACTION,
                    CONSTRAINT [FK_NotasFiscais_Usuarios_UsuarioId] FOREIGN KEY ([UsuarioId]) REFERENCES [pdv].[Usuarios] ([UsuarioId]) ON DELETE NO ACTION
                );

                CREATE UNIQUE INDEX [IX_NotasFiscais_EmpresaId_Serie_Numero]
                    ON [pdv].[NotasFiscais] ([EmpresaId], [Serie], [Numero]);

                CREATE UNIQUE INDEX [IX_NotasFiscais_EmpresaId_VendaId]
                    ON [pdv].[NotasFiscais] ([EmpresaId], [VendaId])
                    WHERE [VendaId] IS NOT NULL;

                CREATE INDEX [IX_NotasFiscais_EmpresaId_Status_DataEmissao]
                    ON [pdv].[NotasFiscais] ([EmpresaId], [Status], [DataEmissao]);
            END

            IF OBJECT_ID(N'[pdv].[NotaFiscalItens]', N'U') IS NULL
            BEGIN
                CREATE TABLE [pdv].[NotaFiscalItens] (
                    [NotaFiscalItemId] uniqueidentifier NOT NULL,
                    [NotaFiscalId] uniqueidentifier NOT NULL,
                    [ProdutoId] uniqueidentifier NOT NULL,
                    [ProdutoNome] nvarchar(150) NOT NULL,
                    [UnidadeMedida] nvarchar(10) NOT NULL,
                    [Ncm] nvarchar(20) NULL,
                    [Cest] nvarchar(20) NULL,
                    [OrigemFiscal] nvarchar(120) NULL,
                    [Cfop] nvarchar(10) NULL,
                    [Csosn] nvarchar(10) NULL,
                    [CstIcms] nvarchar(10) NULL,
                    [CstPis] nvarchar(10) NULL,
                    [CstCofins] nvarchar(10) NULL,
                    [BeneficioFiscalCodigo] nvarchar(20) NULL,
                    [CodigoAnp] nvarchar(20) NULL,
                    [UnidadeTributavel] nvarchar(10) NULL,
                    [ExTipi] nvarchar(3) NULL,
                    [AliquotaIcms] decimal(9,4) NULL,
                    [AliquotaIpi] decimal(9,4) NULL,
                    [AliquotaPis] decimal(9,4) NULL,
                    [AliquotaCofins] decimal(9,4) NULL,
                    [Quantidade] decimal(18,3) NOT NULL,
                    [ValorUnitario] decimal(18,2) NOT NULL,
                    [Desconto] decimal(18,2) NOT NULL,
                    [Total] decimal(18,2) NOT NULL,
                    CONSTRAINT [PK_NotaFiscalItens] PRIMARY KEY ([NotaFiscalItemId]),
                    CONSTRAINT [FK_NotaFiscalItens_NotasFiscais_NotaFiscalId] FOREIGN KEY ([NotaFiscalId]) REFERENCES [pdv].[NotasFiscais] ([NotaFiscalId]) ON DELETE CASCADE,
                    CONSTRAINT [FK_NotaFiscalItens_Produtos_ProdutoId] FOREIGN KEY ([ProdutoId]) REFERENCES [pdv].[Produtos] ([ProdutoId]) ON DELETE NO ACTION
                );

                CREATE INDEX [IX_NotaFiscalItens_NotaFiscalId]
                    ON [pdv].[NotaFiscalItens] ([NotaFiscalId]);
            END
            """;

        const string patchColumnsScript =
            """
            IF COL_LENGTH(N'pdv.NotasFiscais', N'ChaveAcesso') IS NULL
                ALTER TABLE [pdv].[NotasFiscais] ADD [ChaveAcesso] nvarchar(44) NULL;

            IF COL_LENGTH(N'pdv.NotasFiscais', N'ProviderFiscal') IS NULL
                ALTER TABLE [pdv].[NotasFiscais] ADD [ProviderFiscal] nvarchar(30) NOT NULL CONSTRAINT [DF_NotasFiscais_ProviderFiscalPatch] DEFAULT N'SefazDirect' WITH VALUES;

            IF COL_LENGTH(N'pdv.NotasFiscais', N'ReferenciaFiscal') IS NULL
                ALTER TABLE [pdv].[NotasFiscais] ADD [ReferenciaFiscal] nvarchar(80) NULL;

            IF COL_LENGTH(N'pdv.NotasFiscais', N'DocumentoFiscalId') IS NULL
                ALTER TABLE [pdv].[NotasFiscais] ADD [DocumentoFiscalId] nvarchar(120) NULL;

            IF COL_LENGTH(N'pdv.NotasFiscais', N'CodigoNumerico') IS NULL
                ALTER TABLE [pdv].[NotasFiscais] ADD [CodigoNumerico] nvarchar(8) NULL;

            IF COL_LENGTH(N'pdv.NotasFiscais', N'LoteTransmissao') IS NULL
                ALTER TABLE [pdv].[NotasFiscais] ADD [LoteTransmissao] nvarchar(20) NULL;

            IF COL_LENGTH(N'pdv.NotasFiscais', N'ReciboSefaz') IS NULL
                ALTER TABLE [pdv].[NotasFiscais] ADD [ReciboSefaz] nvarchar(20) NULL;

            IF COL_LENGTH(N'pdv.NotasFiscais', N'ProtocoloAutorizacao') IS NULL
                ALTER TABLE [pdv].[NotasFiscais] ADD [ProtocoloAutorizacao] nvarchar(40) NULL;

            IF COL_LENGTH(N'pdv.NotasFiscais', N'CodigoStatusSefaz') IS NULL
                ALTER TABLE [pdv].[NotasFiscais] ADD [CodigoStatusSefaz] int NULL;

            IF COL_LENGTH(N'pdv.NotasFiscais', N'MensagemStatusSefaz') IS NULL
                ALTER TABLE [pdv].[NotasFiscais] ADD [MensagemStatusSefaz] nvarchar(500) NULL;

            IF COL_LENGTH(N'pdv.NotasFiscais', N'PayloadOriginalJson') IS NULL
                ALTER TABLE [pdv].[NotasFiscais] ADD [PayloadOriginalJson] nvarchar(max) NULL;

            IF COL_LENGTH(N'pdv.NotasFiscais', N'PayloadProviderJson') IS NULL
                ALTER TABLE [pdv].[NotasFiscais] ADD [PayloadProviderJson] nvarchar(max) NULL;

            IF COL_LENGTH(N'pdv.NotasFiscais', N'RetornoProviderJson') IS NULL
                ALTER TABLE [pdv].[NotasFiscais] ADD [RetornoProviderJson] nvarchar(max) NULL;

            IF COL_LENGTH(N'pdv.NotasFiscais', N'DanfeUrl') IS NULL
                ALTER TABLE [pdv].[NotasFiscais] ADD [DanfeUrl] nvarchar(1000) NULL;

            IF COL_LENGTH(N'pdv.NotasFiscais', N'DanfePdfBase64') IS NULL
                ALTER TABLE [pdv].[NotasFiscais] ADD [DanfePdfBase64] nvarchar(max) NULL;

            IF COL_LENGTH(N'pdv.NotasFiscais', N'XmlEnvio') IS NULL
                ALTER TABLE [pdv].[NotasFiscais] ADD [XmlEnvio] nvarchar(max) NULL;

            IF COL_LENGTH(N'pdv.NotasFiscais', N'XmlRetorno') IS NULL
                ALTER TABLE [pdv].[NotasFiscais] ADD [XmlRetorno] nvarchar(max) NULL;

            IF COL_LENGTH(N'pdv.NotasFiscais', N'DataTransmissao') IS NULL
                ALTER TABLE [pdv].[NotasFiscais] ADD [DataTransmissao] datetime2 NULL;

            IF COL_LENGTH(N'pdv.NotasFiscais', N'DataAutorizacao') IS NULL
                ALTER TABLE [pdv].[NotasFiscais] ADD [DataAutorizacao] datetime2 NULL;

            IF COL_LENGTH(N'pdv.NotaFiscalItens', N'BeneficioFiscalCodigo') IS NULL
                ALTER TABLE [pdv].[NotaFiscalItens] ADD [BeneficioFiscalCodigo] nvarchar(20) NULL;

            IF COL_LENGTH(N'pdv.NotaFiscalItens', N'CodigoAnp') IS NULL
                ALTER TABLE [pdv].[NotaFiscalItens] ADD [CodigoAnp] nvarchar(20) NULL;

            IF COL_LENGTH(N'pdv.NotaFiscalItens', N'UnidadeTributavel') IS NULL
                ALTER TABLE [pdv].[NotaFiscalItens] ADD [UnidadeTributavel] nvarchar(10) NULL;

            IF COL_LENGTH(N'pdv.NotaFiscalItens', N'ExTipi') IS NULL
                ALTER TABLE [pdv].[NotaFiscalItens] ADD [ExTipi] nvarchar(3) NULL;

            IF COL_LENGTH(N'pdv.NotaFiscalItens', N'AliquotaIpi') IS NULL
                ALTER TABLE [pdv].[NotaFiscalItens] ADD [AliquotaIpi] decimal(9,4) NULL;
            """;

        const string backfillItemColumnsScript =
            """
            UPDATE [pdv].[NotaFiscalItens]
            SET [UnidadeTributavel] = LEFT(ISNULL([UnidadeMedida], N'UN'), 10)
            WHERE [UnidadeTributavel] IS NULL;
            """;

        const string ensureChaveAcessoIndexScript =
            """
            IF COL_LENGTH(N'pdv.NotasFiscais', N'ChaveAcesso') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1
                    FROM sys.indexes
                    WHERE name = N'IX_NotasFiscais_EmpresaId_ChaveAcesso'
                      AND object_id = OBJECT_ID(N'[pdv].[NotasFiscais]')
               )
            BEGIN
                EXEC(N'
                    CREATE UNIQUE INDEX [IX_NotasFiscais_EmpresaId_ChaveAcesso]
                        ON [pdv].[NotasFiscais] ([EmpresaId], [ChaveAcesso])
                        WHERE [ChaveAcesso] IS NOT NULL;
                ');
            END
            """;

        await dbContext.Database.ExecuteSqlRawAsync(createTablesScript);
        await dbContext.Database.ExecuteSqlRawAsync(patchColumnsScript);
        await dbContext.Database.ExecuteSqlRawAsync(backfillItemColumnsScript);
        await dbContext.Database.ExecuteSqlRawAsync(ensureChaveAcessoIndexScript);
    }

    private static async Task EnsureVendaPagamentoTransactionColumnsAsync(AppDbContext dbContext)
    {
        const string patchScript =
            """
            IF COL_LENGTH(N'pdv.VendaPagamentos', N'CapturaModo') IS NULL
                ALTER TABLE [pdv].[VendaPagamentos] ADD [CapturaModo] nvarchar(30) NOT NULL CONSTRAINT [DF_VendaPagamentos_CapturaModo] DEFAULT N'ManualAssistido' WITH VALUES;

            IF COL_LENGTH(N'pdv.VendaPagamentos', N'StatusTransacao') IS NULL
                ALTER TABLE [pdv].[VendaPagamentos] ADD [StatusTransacao] nvarchar(30) NOT NULL CONSTRAINT [DF_VendaPagamentos_StatusTransacao] DEFAULT N'Aprovada' WITH VALUES;

            IF COL_LENGTH(N'pdv.VendaPagamentos', N'ProvedorOperacao') IS NULL
                ALTER TABLE [pdv].[VendaPagamentos] ADD [ProvedorOperacao] nvarchar(60) NULL;

            IF COL_LENGTH(N'pdv.VendaPagamentos', N'ReferenciaTransacao') IS NULL
                ALTER TABLE [pdv].[VendaPagamentos] ADD [ReferenciaTransacao] nvarchar(100) NULL;

            IF COL_LENGTH(N'pdv.VendaPagamentos', N'CodigoAutorizacao') IS NULL
                ALTER TABLE [pdv].[VendaPagamentos] ADD [CodigoAutorizacao] nvarchar(60) NULL;

            IF COL_LENGTH(N'pdv.VendaPagamentos', N'BandeiraCartao') IS NULL
                ALTER TABLE [pdv].[VendaPagamentos] ADD [BandeiraCartao] nvarchar(40) NULL;

            IF COL_LENGTH(N'pdv.VendaPagamentos', N'UltimosDigitosCartao') IS NULL
                ALTER TABLE [pdv].[VendaPagamentos] ADD [UltimosDigitosCartao] nvarchar(4) NULL;

            IF COL_LENGTH(N'pdv.VendaPagamentos', N'Parcelas') IS NULL
                ALTER TABLE [pdv].[VendaPagamentos] ADD [Parcelas] int NULL;

            IF COL_LENGTH(N'pdv.VendaPagamentos', N'ObservacaoOperacao') IS NULL
                ALTER TABLE [pdv].[VendaPagamentos] ADD [ObservacaoOperacao] nvarchar(200) NULL;

            IF COL_LENGTH(N'pdv.VendaPagamentos', N'PayloadOperacaoJson') IS NULL
                ALTER TABLE [pdv].[VendaPagamentos] ADD [PayloadOperacaoJson] nvarchar(max) NULL;

            IF COL_LENGTH(N'pdv.VendaPagamentos', N'DataCaptura') IS NULL
                ALTER TABLE [pdv].[VendaPagamentos] ADD [DataCaptura] datetime2 NULL;
            """;

        await dbContext.Database.ExecuteSqlRawAsync(patchScript);
    }

    private static async Task EnsurePedidoWorkflowStructureAsync(AppDbContext dbContext)
    {
        const string patchColumnsScript =
            """
            IF COL_LENGTH(N'pdv.Usuarios', N'ClienteId') IS NULL
                ALTER TABLE [pdv].[Usuarios] ADD [ClienteId] uniqueidentifier NULL;

            IF COL_LENGTH(N'pdv.Vendas', N'EhPedido') IS NULL
                ALTER TABLE [pdv].[Vendas] ADD [EhPedido] bit NOT NULL CONSTRAINT [DF_Vendas_EhPedido] DEFAULT 0 WITH VALUES;

            IF COL_LENGTH(N'pdv.Vendas', N'AtendimentoTipo') IS NULL
                ALTER TABLE [pdv].[Vendas] ADD [AtendimentoTipo] nvarchar(20) NULL;

            IF COL_LENGTH(N'pdv.Vendas', N'PedidoStatus') IS NULL
                ALTER TABLE [pdv].[Vendas] ADD [PedidoStatus] nvarchar(30) NULL;

            IF COL_LENGTH(N'pdv.Vendas', N'CodigoAcompanhamento') IS NULL
                ALTER TABLE [pdv].[Vendas] ADD [CodigoAcompanhamento] nvarchar(24) NULL;

            IF COL_LENGTH(N'pdv.Vendas', N'ContatoNome') IS NULL
                ALTER TABLE [pdv].[Vendas] ADD [ContatoNome] nvarchar(150) NULL;

            IF COL_LENGTH(N'pdv.Vendas', N'ContatoTelefone') IS NULL
                ALTER TABLE [pdv].[Vendas] ADD [ContatoTelefone] nvarchar(20) NULL;

            IF COL_LENGTH(N'pdv.Vendas', N'ObservacaoPedido') IS NULL
                ALTER TABLE [pdv].[Vendas] ADD [ObservacaoPedido] nvarchar(500) NULL;

            IF COL_LENGTH(N'pdv.Vendas', N'EnderecoEntregaSnapshotJson') IS NULL
                ALTER TABLE [pdv].[Vendas] ADD [EnderecoEntregaSnapshotJson] nvarchar(max) NULL;

            IF COL_LENGTH(N'pdv.Vendas', N'DataUltimaAtualizacaoPedido') IS NULL
                ALTER TABLE [pdv].[Vendas] ADD [DataUltimaAtualizacaoPedido] datetime2 NULL;
            """;

        const string ensureConstraintsAndIndexesScript =
            """
            IF COL_LENGTH(N'pdv.Usuarios', N'ClienteId') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1
                    FROM sys.foreign_keys
                    WHERE name = N'FK_Usuarios_Clientes_ClienteId'
                      AND parent_object_id = OBJECT_ID(N'[pdv].[Usuarios]')
               )
            BEGIN
                ALTER TABLE [pdv].[Usuarios]
                ADD CONSTRAINT [FK_Usuarios_Clientes_ClienteId]
                FOREIGN KEY ([ClienteId]) REFERENCES [pdv].[Clientes] ([ClienteId]) ON DELETE NO ACTION;
            END

            IF COL_LENGTH(N'pdv.Usuarios', N'ClienteId') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1
                    FROM sys.indexes
                    WHERE name = N'IX_Usuarios_EmpresaId_ClienteId'
                      AND object_id = OBJECT_ID(N'[pdv].[Usuarios]')
               )
            BEGIN
                EXEC(N'
                    CREATE INDEX [IX_Usuarios_EmpresaId_ClienteId]
                        ON [pdv].[Usuarios] ([EmpresaId], [ClienteId]);
                ');
            END

            IF COL_LENGTH(N'pdv.Vendas', N'EhPedido') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1
                    FROM sys.indexes
                    WHERE name = N'IX_Vendas_EmpresaId_EhPedido_DataVenda'
                      AND object_id = OBJECT_ID(N'[pdv].[Vendas]')
               )
            BEGIN
                EXEC(N'
                    CREATE INDEX [IX_Vendas_EmpresaId_EhPedido_DataVenda]
                        ON [pdv].[Vendas] ([EmpresaId], [EhPedido], [DataVenda]);
                ');
            END

            IF COL_LENGTH(N'pdv.Vendas', N'CodigoAcompanhamento') IS NOT NULL
               AND NOT EXISTS (
                    SELECT 1
                    FROM sys.indexes
                    WHERE name = N'IX_Vendas_EmpresaId_CodigoAcompanhamento'
                      AND object_id = OBJECT_ID(N'[pdv].[Vendas]')
               )
            BEGIN
                EXEC(N'
                    CREATE UNIQUE INDEX [IX_Vendas_EmpresaId_CodigoAcompanhamento]
                        ON [pdv].[Vendas] ([EmpresaId], [CodigoAcompanhamento])
                        WHERE [CodigoAcompanhamento] IS NOT NULL;
                ');
            END

            IF OBJECT_ID(N'[pdv].[PedidoOcorrencias]', N'U') IS NULL
            BEGIN
                CREATE TABLE [pdv].[PedidoOcorrencias] (
                    [PedidoOcorrenciaId] uniqueidentifier NOT NULL,
                    [EmpresaId] uniqueidentifier NOT NULL,
                    [VendaId] uniqueidentifier NOT NULL,
                    [UsuarioId] uniqueidentifier NULL,
                    [Status] nvarchar(30) NOT NULL,
                    [Titulo] nvarchar(120) NOT NULL,
                    [Descricao] nvarchar(500) NULL,
                    [VisivelParaCliente] bit NOT NULL CONSTRAINT [DF_PedidoOcorrencias_VisivelParaCliente] DEFAULT 1,
                    [DataOcorrencia] datetime2 NOT NULL,
                    CONSTRAINT [PK_PedidoOcorrencias] PRIMARY KEY ([PedidoOcorrenciaId]),
                    CONSTRAINT [FK_PedidoOcorrencias_Vendas_VendaId] FOREIGN KEY ([VendaId]) REFERENCES [pdv].[Vendas] ([VendaId]) ON DELETE CASCADE,
                    CONSTRAINT [FK_PedidoOcorrencias_Usuarios_UsuarioId] FOREIGN KEY ([UsuarioId]) REFERENCES [pdv].[Usuarios] ([UsuarioId]) ON DELETE NO ACTION
                );

                CREATE INDEX [IX_PedidoOcorrencias_EmpresaId_VendaId_DataOcorrencia]
                    ON [pdv].[PedidoOcorrencias] ([EmpresaId], [VendaId], [DataOcorrencia]);
            END
            """;

        await dbContext.Database.ExecuteSqlRawAsync(patchColumnsScript);
        await dbContext.Database.ExecuteSqlRawAsync(ensureConstraintsAndIndexesScript);
    }

    private static async Task EnsureFiscalSefazUrlTableAsync(AppDbContext dbContext)
    {
        const string script =
            """
            IF OBJECT_ID(N'[pdv].[FiscalSefazUrls]', N'U') IS NULL
            BEGIN
                CREATE TABLE [pdv].[FiscalSefazUrls] (
                    [FiscalSefazUrlId] uniqueidentifier NOT NULL,
                    [Uf] nvarchar(2) NOT NULL,
                    [Ambiente] nvarchar(20) NOT NULL,
                    [Servico] nvarchar(40) NOT NULL,
                    [Url] nvarchar(500) NOT NULL,
                    [Ativo] bit NOT NULL CONSTRAINT [DF_FiscalSefazUrls_Ativo] DEFAULT 1,
                    CONSTRAINT [PK_FiscalSefazUrls] PRIMARY KEY ([FiscalSefazUrlId])
                );

                CREATE UNIQUE INDEX [IX_FiscalSefazUrls_Uf_Ambiente_Servico]
                    ON [pdv].[FiscalSefazUrls] ([Uf], [Ambiente], [Servico]);
            END
            """;

        await dbContext.Database.ExecuteSqlRawAsync(script);

        if (await dbContext.FiscalSefazUrls.AnyAsync())
        {
            return;
        }

        var rows = new[]
        {
            new FiscalSefazUrl { FiscalSefazUrlId = Guid.NewGuid(), Uf = "SP", Ambiente = AmbienteFiscal.Homologacao, Servico = FiscalSefazServico.Autorizacao, Url = "https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx" },
            new FiscalSefazUrl { FiscalSefazUrlId = Guid.NewGuid(), Uf = "SP", Ambiente = AmbienteFiscal.Homologacao, Servico = FiscalSefazServico.RetAutorizacao, Url = "https://homologacao.nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx" },
            new FiscalSefazUrl { FiscalSefazUrlId = Guid.NewGuid(), Uf = "SP", Ambiente = AmbienteFiscal.Homologacao, Servico = FiscalSefazServico.StatusServico, Url = "https://homologacao.nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx" },
            new FiscalSefazUrl { FiscalSefazUrlId = Guid.NewGuid(), Uf = "SP", Ambiente = AmbienteFiscal.Producao, Servico = FiscalSefazServico.Autorizacao, Url = "https://nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx" },
            new FiscalSefazUrl { FiscalSefazUrlId = Guid.NewGuid(), Uf = "SP", Ambiente = AmbienteFiscal.Producao, Servico = FiscalSefazServico.RetAutorizacao, Url = "https://nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx" },
            new FiscalSefazUrl { FiscalSefazUrlId = Guid.NewGuid(), Uf = "SP", Ambiente = AmbienteFiscal.Producao, Servico = FiscalSefazServico.StatusServico, Url = "https://nfe.fazenda.sp.gov.br/ws/nfestatusservico4.asmx" }
        };

        dbContext.FiscalSefazUrls.AddRange(rows);
        await dbContext.SaveChangesAsync();
    }

    private static string? NormalizeFixedDigits(string? value, int expectedDigits)
    {
        var digits = OnlyDigits(value);
        return digits.Length == expectedDigits ? digits : null;
    }

    private static string? NormalizeNullable(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string OnlyDigits(string? value)
        => string.IsNullOrWhiteSpace(value)
            ? string.Empty
            : new string(value.Where(char.IsAsciiDigit).ToArray());

    private sealed record FiscalNcmSeed(
        string Codigo,
        string Descricao,
        string? CestPadraoCodigo,
        decimal? AliquotaIbpt,
        bool SujeitoSt);

    private sealed record FiscalCestSeed(
        string Codigo,
        string Descricao,
        string? NcmCodigo);

    private sealed record FiscalCfopSeed(
        string Codigo,
        string Descricao,
        ProdutoPerfilFiscalPadrao? PerfilFiscalPadrao,
        bool Entrada,
        bool Saida,
        bool DentroEstado,
        bool ForaEstado,
        bool ExigeContexto);

    private sealed record FiscalCodigoDescricaoSeed(
        string Codigo,
        string Descricao,
        bool ExigeSt,
        bool DestacaIcmsProprio);

    private sealed record FiscalPisCofinsSeed(
        string Codigo,
        string Descricao,
        bool AliquotaZero,
        bool UsaAliquotaPadrao);

    private sealed record FiscalAliquotaSeed(
        string UfOrigem,
        decimal Aliquota,
        int Prioridade,
        string Descricao);

    private static async Task<HashSet<string>> GetExistingPdvTablesAsync(AppDbContext dbContext)
{
    var tables = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

    var connection = dbContext.Database.GetDbConnection();

    if (connection.State != System.Data.ConnectionState.Open)
        await connection.OpenAsync();

    await using var command = connection.CreateCommand();

    string sql;

    if (connection is Npgsql.NpgsqlConnection)
    {
        sql = """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = @schemaName
              AND table_type = 'BASE TABLE'
            """;
    }
    else
    {
        sql = """
            SELECT t.name
            FROM sys.tables t
            INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
            WHERE s.name = @schemaName
            """;
    }

    command.CommandText = sql;

    var schemaParameter = command.CreateParameter();
    schemaParameter.ParameterName = "@schemaName";
    schemaParameter.Value = PdvSchema;
    command.Parameters.Add(schemaParameter);

    await using var reader = await command.ExecuteReaderAsync();

    while (await reader.ReadAsync())
    {
        tables.Add(reader.GetString(0));
    }

    return tables;
}

    private static async Task ResetPdvSchemaAsync(AppDbContext dbContext)
    {
        const string resetScript =
            """
            IF OBJECT_ID(N'[pdv].[PedidoEntregaLocalizacoes]', N'U') IS NOT NULL DROP TABLE [pdv].[PedidoEntregaLocalizacoes];
            IF OBJECT_ID(N'[pdv].[TransferenciasEstoque]', N'U') IS NOT NULL DROP TABLE [pdv].[TransferenciasEstoque];
            IF OBJECT_ID(N'[pdv].[MovimentacoesEstoqueLote]', N'U') IS NOT NULL DROP TABLE [pdv].[MovimentacoesEstoqueLote];
            IF OBJECT_ID(N'[pdv].[EstoquesLote]', N'U') IS NOT NULL DROP TABLE [pdv].[EstoquesLote];
            IF OBJECT_ID(N'[pdv].[EstoquesDeposito]', N'U') IS NOT NULL DROP TABLE [pdv].[EstoquesDeposito];
            IF OBJECT_ID(N'[pdv].[ProdutoLotes]', N'U') IS NOT NULL DROP TABLE [pdv].[ProdutoLotes];
            IF OBJECT_ID(N'[pdv].[MovimentacoesEstoque]', N'U') IS NOT NULL DROP TABLE [pdv].[MovimentacoesEstoque];
            IF OBJECT_ID(N'[pdv].[DepositosEstoque]', N'U') IS NOT NULL DROP TABLE [pdv].[DepositosEstoque];
            IF OBJECT_ID(N'[pdv].[NotaFiscalItens]', N'U') IS NOT NULL DROP TABLE [pdv].[NotaFiscalItens];
            IF OBJECT_ID(N'[pdv].[NotasFiscais]', N'U') IS NOT NULL DROP TABLE [pdv].[NotasFiscais];
            IF OBJECT_ID(N'[pdv].[VendaPagamentos]', N'U') IS NOT NULL DROP TABLE [pdv].[VendaPagamentos];
            IF OBJECT_ID(N'[pdv].[VendaItens]', N'U') IS NOT NULL DROP TABLE [pdv].[VendaItens];
            IF OBJECT_ID(N'[pdv].[Vendas]', N'U') IS NOT NULL DROP TABLE [pdv].[Vendas];
            IF OBJECT_ID(N'[pdv].[LancamentosFinanceiros]', N'U') IS NOT NULL DROP TABLE [pdv].[LancamentosFinanceiros];
            IF OBJECT_ID(N'[pdv].[Caixas]', N'U') IS NOT NULL DROP TABLE [pdv].[Caixas];
            IF OBJECT_ID(N'[pdv].[Transportadoras]', N'U') IS NOT NULL DROP TABLE [pdv].[Transportadoras];
            IF OBJECT_ID(N'[pdv].[Fornecedores]', N'U') IS NOT NULL DROP TABLE [pdv].[Fornecedores];
            IF OBJECT_ID(N'[pdv].[Municipios]', N'U') IS NOT NULL DROP TABLE [pdv].[Municipios];
            IF OBJECT_ID(N'[pdv].[Clientes]', N'U') IS NOT NULL DROP TABLE [pdv].[Clientes];
            IF OBJECT_ID(N'[pdv].[FiscalRegraAplicadaLog]', N'U') IS NOT NULL DROP TABLE [pdv].[FiscalRegraAplicadaLog];
            IF OBJECT_ID(N'[pdv].[ProdutoFiscalRegraAplicada]', N'U') IS NOT NULL DROP TABLE [pdv].[ProdutoFiscalRegraAplicada];
            IF OBJECT_ID(N'[pdv].[ProdutoCodigos]', N'U') IS NOT NULL DROP TABLE [pdv].[ProdutoCodigos];
            IF OBJECT_ID(N'[pdv].[ProdutoCamposPadrao]', N'U') IS NOT NULL DROP TABLE [pdv].[ProdutoCamposPadrao];
            IF OBJECT_ID(N'[pdv].[FiscalUfParametro]', N'U') IS NOT NULL DROP TABLE [pdv].[FiscalUfParametro];
            IF OBJECT_ID(N'[pdv].[FiscalBeneficio]', N'U') IS NOT NULL DROP TABLE [pdv].[FiscalBeneficio];
            IF OBJECT_ID(N'[pdv].[FiscalAliquotaIcms]', N'U') IS NOT NULL DROP TABLE [pdv].[FiscalAliquotaIcms];
            IF OBJECT_ID(N'[pdv].[FiscalCstPisCofins]', N'U') IS NOT NULL DROP TABLE [pdv].[FiscalCstPisCofins];
            IF OBJECT_ID(N'[pdv].[FiscalCstIcms]', N'U') IS NOT NULL DROP TABLE [pdv].[FiscalCstIcms];
            IF OBJECT_ID(N'[pdv].[FiscalCsosn]', N'U') IS NOT NULL DROP TABLE [pdv].[FiscalCsosn];
            IF OBJECT_ID(N'[pdv].[FiscalCfop]', N'U') IS NOT NULL DROP TABLE [pdv].[FiscalCfop];
            IF OBJECT_ID(N'[pdv].[FiscalCest]', N'U') IS NOT NULL DROP TABLE [pdv].[FiscalCest];
            IF OBJECT_ID(N'[pdv].[FiscalNcm]', N'U') IS NOT NULL DROP TABLE [pdv].[FiscalNcm];
            IF OBJECT_ID(N'[pdv].[ProdutoFornecedores]', N'U') IS NOT NULL DROP TABLE [pdv].[ProdutoFornecedores];
            IF OBJECT_ID(N'[pdv].[Produtos]', N'U') IS NOT NULL DROP TABLE [pdv].[Produtos];
            IF OBJECT_ID(N'[pdv].[Categorias]', N'U') IS NOT NULL DROP TABLE [pdv].[Categorias];
            IF OBJECT_ID(N'[pdv].[TerminaisPdv]', N'U') IS NOT NULL DROP TABLE [pdv].[TerminaisPdv];
            IF OBJECT_ID(N'[pdv].[UsuarioPermissoes]', N'U') IS NOT NULL DROP TABLE [pdv].[UsuarioPermissoes];
            IF OBJECT_ID(N'[pdv].[PerfilPermissoes]', N'U') IS NOT NULL DROP TABLE [pdv].[PerfilPermissoes];
            IF OBJECT_ID(N'[pdv].[Usuarios]', N'U') IS NOT NULL DROP TABLE [pdv].[Usuarios];
            IF OBJECT_ID(N'[pdv].[Permissoes]', N'U') IS NOT NULL DROP TABLE [pdv].[Permissoes];
            IF OBJECT_ID(N'[pdv].[Perfis]', N'U') IS NOT NULL DROP TABLE [pdv].[Perfis];
            IF OBJECT_ID(N'[pdv].[Empresas]', N'U') IS NOT NULL DROP TABLE [pdv].[Empresas];
            IF OBJECT_ID(N'[pdv].[LogsSistema]', N'U') IS NOT NULL DROP TABLE [pdv].[LogsSistema];
            """;

        await dbContext.Database.ExecuteSqlRawAsync(resetScript);
    }

    private static async Task EnsureDefaultUserAsync(
        AppDbContext dbContext,
        IPasswordHasher<Usuario> passwordHasher,
        Guid empresaId,
        Guid perfilId,
        string nome,
        string email,
        string senha,
        Guid? clienteId = null,
        string? codigoBarrasCracha = null)
    {
        var normalizedEmail = email.Trim().ToLowerInvariant();
        var normalizedCracha = NormalizeNullable(codigoBarrasCracha);
        var usuario = await dbContext.Usuarios.FirstOrDefaultAsync(item => item.Email == normalizedEmail);
        if (usuario is not null)
        {
            var updated = false;

            if (usuario.EmpresaId != empresaId)
            {
                usuario.EmpresaId = empresaId;
                updated = true;
            }

            if (usuario.PerfilId != perfilId)
            {
                usuario.PerfilId = perfilId;
                updated = true;
            }

            if (!usuario.Ativo)
            {
                usuario.Ativo = true;
                updated = true;
            }

            if (usuario.Nome != nome)
            {
                usuario.Nome = nome;
                updated = true;
            }

            if (usuario.ClienteId != clienteId)
            {
                usuario.ClienteId = clienteId;
                updated = true;
            }

            if (codigoBarrasCracha is not null &&
                !string.Equals(usuario.CodigoBarrasCracha, normalizedCracha, StringComparison.Ordinal))
            {
                usuario.CodigoBarrasCracha = normalizedCracha;
                updated = true;
            }

            if (usuario.UsarPermissoesCustomizadas)
            {
                usuario.UsarPermissoesCustomizadas = false;
                updated = true;
            }

            if (updated)
            {
                dbContext.LogsSistema.Add(new LogSistema
                {
                    LogSistemaId = Guid.NewGuid(),
                    EmpresaId = empresaId,
                    UsuarioId = usuario.UsuarioId,
                    Modulo = "Seed",
                    Acao = "AtualizacaoUsuarioPadrao",
                    Descricao = $"Usuario padrao {normalizedEmail} atualizado."
                });
            }

            return;
        }

        usuario = new Usuario
        {
            UsuarioId = Guid.NewGuid(),
            EmpresaId = empresaId,
            PerfilId = perfilId,
            ClienteId = clienteId,
            Nome = nome,
            Email = normalizedEmail,
            CodigoBarrasCracha = normalizedCracha,
            Ativo = true,
            UsarPermissoesCustomizadas = false,
            DataCadastro = DateTime.UtcNow
        };
        usuario.SenhaHash = passwordHasher.HashPassword(usuario, senha);

        dbContext.Usuarios.Add(usuario);
        dbContext.LogsSistema.Add(new LogSistema
        {
            LogSistemaId = Guid.NewGuid(),
            EmpresaId = empresaId,
            UsuarioId = usuario.UsuarioId,
            Modulo = "Seed",
            Acao = "CriacaoUsuarioPadrao",
            Descricao = $"Usuario padrao {normalizedEmail} criado."
        });
    }
}
