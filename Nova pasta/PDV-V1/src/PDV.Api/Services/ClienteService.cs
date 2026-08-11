using System.Net.Mail;
using Microsoft.EntityFrameworkCore;
using PDV.Api.Common;
using PDV.Api.Data;
using PDV.Api.Domain;
using PDV.Api.DTOs;
using PDV.Api.Infrastructure;

namespace PDV.Api.Services;

public class ClienteService(
    AppDbContext dbContext,
    CurrentUserService currentUser,
    MunicipioCatalogService municipioCatalogService)
{
    private const int NomeMaxLength = 150;
    private const int DocumentoMaxLength = 20;
    private const int SegmentoMaxLength = 80;
    private const int TelefoneMaxLength = 20;
    private const int EmailMaxLength = 150;
    private const int CepMaxLength = 8;
    private const int LogradouroMaxLength = 180;
    private const int NumeroMaxLength = 20;
    private const int ComplementoMaxLength = 120;
    private const int BairroMaxLength = 80;
    private const int CidadeMaxLength = 80;
    private const int UfMaxLength = 2;
    private const int CodigoMunicipioIbgeMaxLength = 7;
    private const int EnderecoMaxLength = 300;

    private static readonly HashSet<string> ValidUfs =
    [
        "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
        "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
        "RS", "RO", "RR", "SC", "SP", "SE", "TO"
    ];

    public async Task<IReadOnlyCollection<ClienteDto>> GetAllAsync(string? termo)
    {
        var empresaId = currentUser.GetEmpresaId();
        var query = dbContext.Clientes.Where(item => item.EmpresaId == empresaId);

        if (!string.IsNullOrWhiteSpace(termo))
        {
            var normalizedTerm = termo.Trim();
            var digitsTerm = DigitsOnly(normalizedTerm);

            query = query.Where(item =>
                item.Nome.Contains(normalizedTerm) ||
                (item.Segmento != null && item.Segmento.Contains(normalizedTerm)) ||
                (item.Documento != null && digitsTerm != null && item.Documento.Contains(digitsTerm)) ||
                (item.Telefone != null && digitsTerm != null && item.Telefone.Contains(digitsTerm)) ||
                (item.Email != null && item.Email.Contains(normalizedTerm)) ||
                (item.Cidade != null && item.Cidade.Contains(normalizedTerm)) ||
                (item.Uf != null && item.Uf.Contains(normalizedTerm)) ||
                (item.Cep != null && digitsTerm != null && item.Cep.Contains(digitsTerm)));
        }

        var clientes = await query
            .OrderBy(item => item.Nome)
            .ToListAsync();

        return clientes.Select(Map).ToArray();
    }

    public async Task<ClienteDto> CreateAsync(ClienteRequest request)
    {
        var empresaId = currentUser.GetEmpresaId();
        var input = await ValidateAndNormalizeAsync(request, empresaId, null);

        var cliente = new Cliente
        {
            ClienteId = Guid.NewGuid(),
            EmpresaId = empresaId,
            Nome = input.Nome,
            Documento = input.Documento,
            Segmento = input.Segmento,
            Telefone = input.Telefone,
            Email = input.Email,
            Cep = input.Cep,
            Logradouro = input.Logradouro,
            Numero = input.Numero,
            Complemento = input.Complemento,
            Bairro = input.Bairro,
            Cidade = input.Cidade,
            Uf = input.Uf,
            CodigoMunicipioIbge = input.CodigoMunicipioIbge,
            Endereco = input.Endereco,
            EhFornecedor = request.EhFornecedor,
            Ativo = request.Ativo
        };

        dbContext.Clientes.Add(cliente);
        AddLog("Criacao", $"Cliente {cliente.Nome} criado.");
        await dbContext.SaveChangesAsync();

        return Map(cliente);
    }

    public async Task<ClienteDto> SaveBuyerProfileAsync(ClientePerfilCompradorRequest request)
    {
        var empresaId = currentUser.GetEmpresaId();
        var usuarioId = currentUser.GetUserId();
        var usuario = await dbContext.Usuarios
            .Include(item => item.Cliente)
            .FirstOrDefaultAsync(item => item.UsuarioId == usuarioId && item.EmpresaId == empresaId)
            ?? throw new UnauthorizedAppException("Usuario nao encontrado para vincular o comprador.");

        Cliente? cliente = null;
        if (usuario.ClienteId.HasValue)
        {
            cliente = await dbContext.Clientes
                .FirstOrDefaultAsync(item => item.ClienteId == usuario.ClienteId.Value && item.EmpresaId == empresaId);
        }

        if (cliente is null)
        {
            var documento = DigitsOnly(request.Documento);
            if (documento is not null)
            {
                var clientesComDocumento = await dbContext.Clientes
                    .Where(item => item.EmpresaId == empresaId && item.Documento != null)
                    .ToListAsync();
                cliente = clientesComDocumento.FirstOrDefault(item => string.Equals(DigitsOnly(item.Documento), documento, StringComparison.Ordinal));
            }
        }

        var normalizedRequest = new ClienteRequest(
            string.IsNullOrWhiteSpace(request.Nome) ? usuario.Nome : request.Nome,
            request.Documento,
            "Consumidor final",
            request.Telefone,
            string.IsNullOrWhiteSpace(request.Email) ? usuario.Email : request.Email,
            request.Cep,
            request.Logradouro,
            request.Numero,
            request.Complemento,
            request.Bairro,
            request.Cidade,
            request.Uf,
            request.CodigoMunicipioIbge,
            null,
            false,
            true);

        var input = await ValidateAndNormalizeAsync(normalizedRequest, empresaId, cliente?.ClienteId);
        if (cliente is null)
        {
            cliente = new Cliente
            {
                ClienteId = Guid.NewGuid(),
                EmpresaId = empresaId,
                DataCadastro = DateTime.UtcNow
            };
            dbContext.Clientes.Add(cliente);
        }

        cliente.Nome = input.Nome;
        cliente.Documento = input.Documento;
        cliente.Segmento = input.Segmento;
        cliente.Telefone = input.Telefone;
        cliente.Email = input.Email;
        cliente.Cep = input.Cep;
        cliente.Logradouro = input.Logradouro;
        cliente.Numero = input.Numero;
        cliente.Complemento = input.Complemento;
        cliente.Bairro = input.Bairro;
        cliente.Cidade = input.Cidade;
        cliente.Uf = input.Uf;
        cliente.CodigoMunicipioIbge = input.CodigoMunicipioIbge;
        cliente.Endereco = input.Endereco;
        cliente.EhFornecedor = false;
        cliente.Ativo = true;

        usuario.ClienteId = cliente.ClienteId;

        AddLog("AutovinculoComprador", $"Perfil de comprador atualizado e vinculado ao cliente {cliente.Nome}.");
        await dbContext.SaveChangesAsync();
        return Map(cliente);
    }

    public async Task<ClienteDto> UpdateAsync(Guid id, ClienteRequest request)
    {
        var empresaId = currentUser.GetEmpresaId();
        var cliente = await dbContext.Clientes
            .FirstOrDefaultAsync(item => item.ClienteId == id && item.EmpresaId == empresaId)
            ?? throw new NotFoundException("Cliente nao encontrado.");

        var input = await ValidateAndNormalizeAsync(request, empresaId, id);

        cliente.Nome = input.Nome;
        cliente.Documento = input.Documento;
        cliente.Segmento = input.Segmento;
        cliente.Telefone = input.Telefone;
        cliente.Email = input.Email;
        cliente.Cep = input.Cep;
        cliente.Logradouro = input.Logradouro;
        cliente.Numero = input.Numero;
        cliente.Complemento = input.Complemento;
        cliente.Bairro = input.Bairro;
        cliente.Cidade = input.Cidade;
        cliente.Uf = input.Uf;
        cliente.CodigoMunicipioIbge = input.CodigoMunicipioIbge;
        cliente.Endereco = input.Endereco;
        cliente.EhFornecedor = request.EhFornecedor;
        cliente.Ativo = request.Ativo;

        AddLog("Edicao", $"Cliente {cliente.Nome} atualizado.");
        await dbContext.SaveChangesAsync();

        return Map(cliente);
    }

    public async Task ArchiveAsync(Guid id)
    {
        var empresaId = currentUser.GetEmpresaId();
        var cliente = await dbContext.Clientes
            .FirstOrDefaultAsync(item => item.ClienteId == id && item.EmpresaId == empresaId)
            ?? throw new NotFoundException("Cliente nao encontrado.");

        cliente.Ativo = false;
        AddLog("Inativacao", $"Cliente {cliente.Nome} inativado.");
        await dbContext.SaveChangesAsync();
    }

    public async Task DeletePermanentlyAsync(Guid id)
    {
        var empresaId = currentUser.GetEmpresaId();
        var cliente = await dbContext.Clientes
            .FirstOrDefaultAsync(item => item.ClienteId == id && item.EmpresaId == empresaId)
            ?? throw new NotFoundException("Cliente nao encontrado.");

        var possuiReferencias = await dbContext.Vendas.AnyAsync(item => item.ClienteId == id)
            || await dbContext.LancamentosFinanceiros.AnyAsync(item => item.ClienteId == id)
            || await dbContext.Produtos.AnyAsync(item => item.ClienteFornecedorId == id)
            || await dbContext.ProdutoFornecedores.AnyAsync(item => item.ClienteFornecedorId == id);

        if (possuiReferencias)
        {
            throw new AppException("Este cliente ja participa de vendas, financeiro ou produtos vinculados como fornecedor. Use a opcao de inativar em vez de excluir permanentemente.");
        }

        dbContext.Clientes.Remove(cliente);
        AddLog("Exclusao", $"Cliente {cliente.Nome} excluido permanentemente.");
        await dbContext.SaveChangesAsync();
    }

    public async Task<ClienteHistoricoDto> GetHistoricoAsync(Guid id)
    {
        var empresaId = currentUser.GetEmpresaId();
        var cliente = await dbContext.Clientes
            .AsNoTracking()
            .FirstOrDefaultAsync(item => item.ClienteId == id && item.EmpresaId == empresaId)
            ?? throw new NotFoundException("Cliente nao encontrado.");

        var vendas = await dbContext.Vendas
            .AsNoTracking()
            .AsSplitQuery()
            .Include(item => item.Itens)
            .Include(item => item.Pagamentos)
            .Where(item => item.EmpresaId == empresaId && item.ClienteId == id)
            .OrderByDescending(item => item.DataVenda)
            .Take(30)
            .ToListAsync();

        var vendasFinalizadas = vendas.Where(item => item.Status == VendaStatus.Finalizada).ToArray();
        var totalComprado = vendasFinalizadas.Sum(item => item.Total);
        var quantidadeVendas = vendasFinalizadas.Length;

        var resumo = new ClienteHistoricoResumoDto(
            totalComprado,
            quantidadeVendas,
            quantidadeVendas == 0 ? 0 : decimal.Round(totalComprado / quantidadeVendas, 2),
            vendasFinalizadas.FirstOrDefault()?.DataVenda,
            vendas.Count(item => item.Status == VendaStatus.Cancelada));

        var historicoVendas = vendas
            .Select(item => new ClienteHistoricoVendaDto(
                item.VendaId,
                item.NumeroVenda,
                item.DataVenda,
                item.Status.ToString(),
                item.Total,
                item.Itens.Sum(vendaItem => vendaItem.Quantidade),
                string.Join(", ", item.Pagamentos
                    .Select(pagamento => pagamento.FormaPagamento.ToString())
                    .Distinct()
                    .OrderBy(nome => nome))))
            .ToArray();

        var produtosRelacionados = await dbContext.ProdutoFornecedores
            .AsNoTracking()
            .Include(item => item.Produto)
            .Where(item => item.EmpresaId == empresaId && item.ClienteFornecedorId == id)
            .OrderByDescending(item => item.FornecedorPrincipal)
            .ThenBy(item => item.Produto.Nome)
            .Take(30)
            .Select(item => new ClienteHistoricoProdutoFornecedorDto(
                item.ProdutoId,
                item.Produto.Nome,
                item.Produto.CodigoBarras,
                item.CodigoProdutoFornecedor ?? item.Produto.CodigoProdutoFornecedor,
                item.Produto.UltimaNotaFiscalCompra,
                item.Produto.PrecoCusto,
                item.Produto.EstoqueAtual,
                item.Produto.Ativo))
            .ToArrayAsync();

        return new ClienteHistoricoDto(cliente.ClienteId, cliente.Nome, resumo, historicoVendas, produtosRelacionados);
    }

    private async Task<NormalizedClienteInput> ValidateAndNormalizeAsync(ClienteRequest request, Guid empresaId, Guid? clienteId)
    {
        var nome = NormalizeRequiredText(request.Nome, "Nome do cliente");
        if (nome.Length < 3)
        {
            throw new AppException("Informe um nome com pelo menos 3 caracteres.");
        }
        ValidateMaxLength(nome, NomeMaxLength, "Nome do cliente");

        var segmento = NormalizeRequiredText(request.Segmento, "Segmento do cliente");
        if (segmento.Length < 2)
        {
            throw new AppException("Informe um segmento valido para o cliente.");
        }
        ValidateMaxLength(segmento, SegmentoMaxLength, "Segmento do cliente");

        var documento = DigitsOnly(request.Documento);
        if (request.EhFornecedor && documento is null)
        {
            throw new AppException("Fornecedor precisa ter CPF/CNPJ real cadastrado para vincular produtos automaticamente.");
        }

        if (documento is not null)
        {
            if (documento.Length == 11 && !IsValidCpf(documento))
            {
                throw new AppException("CPF invalido.");
            }

            if (documento.Length == 14 && !IsValidCnpj(documento))
            {
                throw new AppException("CNPJ invalido.");
            }

            if (documento.Length is not 11 and not 14)
            {
                throw new AppException("Documento deve ser um CPF ou CNPJ valido.");
            }
            ValidateMaxLength(documento, DocumentoMaxLength, "Documento");

            var existingDocuments = await dbContext.Clientes
                .Where(item => item.EmpresaId == empresaId && item.ClienteId != clienteId && item.Documento != null)
                .Select(item => item.Documento!)
                .ToListAsync();

            if (existingDocuments.Any(item => string.Equals(DigitsOnly(item), documento, StringComparison.Ordinal)))
            {
                throw new AppException("Ja existe um cliente com este CPF/CNPJ na empresa.");
            }
        }

        var telefone = DigitsOnly(request.Telefone);
        if (telefone is not null && telefone.Length is not 10 and not 11)
        {
            throw new AppException("Telefone deve ter DDD e 10 ou 11 digitos.");
        }
        ValidateMaxLength(telefone, TelefoneMaxLength, "Telefone");

        var email = NormalizeNullable(request.Email)?.ToLowerInvariant();
        if (email is not null && !IsValidEmail(email))
        {
            throw new AppException("E-mail invalido.");
        }
        ValidateMaxLength(email, EmailMaxLength, "E-mail");

        var cep = DigitsOnly(request.Cep);
        if (cep is not null && cep.Length != 8)
        {
            throw new AppException("CEP deve conter 8 digitos.");
        }
        ValidateMaxLength(cep, CepMaxLength, "CEP");

        var logradouro = NormalizeNullable(request.Logradouro);
        var numero = NormalizeNullable(request.Numero);
        var complemento = NormalizeNullable(request.Complemento);
        var bairro = NormalizeNullable(request.Bairro);
        var cidade = NormalizeNullable(request.Cidade);
        var uf = NormalizeNullable(request.Uf)?.ToUpperInvariant();
        var codigoMunicipioIbge = DigitsOnly(request.CodigoMunicipioIbge);

        ValidateMaxLength(logradouro, LogradouroMaxLength, "Logradouro");
        ValidateMaxLength(numero, NumeroMaxLength, "Numero");
        ValidateMaxLength(complemento, ComplementoMaxLength, "Complemento");
        ValidateMaxLength(bairro, BairroMaxLength, "Bairro");
        ValidateMaxLength(cidade, CidadeMaxLength, "Cidade");
        ValidateMaxLength(uf, UfMaxLength, "UF");
        ValidateMaxLength(codigoMunicipioIbge, CodigoMunicipioIbgeMaxLength, "Codigo IBGE do municipio");

        if (uf is not null && !ValidUfs.Contains(uf))
        {
            throw new AppException("UF invalida.");
        }

        if (codigoMunicipioIbge is not null && codigoMunicipioIbge.Length != CodigoMunicipioIbgeMaxLength)
        {
            throw new AppException("Codigo IBGE do municipio deve conter 7 digitos.");
        }

        if ((cidade is null) != (uf is null))
        {
            throw new AppException("Cidade e UF devem ser informadas em conjunto.");
        }

        var municipioResolution = await municipioCatalogService.ResolveForAddressAsync(cidade, uf, codigoMunicipioIbge);
        if (!municipioResolution.IsValid)
        {
            throw new AppException(municipioResolution.ErrorMessage ?? "Nao foi possivel validar o municipio informado.");
        }

        if (municipioResolution.Municipio is not null)
        {
            cidade = municipioResolution.Municipio.Nome;
            uf = municipioResolution.Municipio.Uf;
            codigoMunicipioIbge = municipioResolution.Municipio.CodigoIbge;
        }

        var enderecoEstruturado = BuildEndereco(logradouro, numero, complemento, bairro, cidade, uf, cep);
        var endereco = enderecoEstruturado ?? NormalizeNullable(request.Endereco);
        ValidateMaxLength(endereco, EnderecoMaxLength, "Endereco");

        return new NormalizedClienteInput(
            nome,
            documento,
            segmento,
            telefone,
            email,
            cep,
            logradouro,
            numero,
            complemento,
            bairro,
            cidade,
            uf,
            codigoMunicipioIbge,
            endereco);
    }

    private void AddLog(string acao, string descricao)
    {
        dbContext.LogsSistema.Add(new LogSistema
        {
            LogSistemaId = Guid.NewGuid(),
            EmpresaId = currentUser.GetEmpresaId(),
            UsuarioId = currentUser.GetUserId(),
            Modulo = "Clientes",
            Acao = acao,
            Descricao = descricao,
            IpAddress = currentUser.GetIpAddress()
        });
    }

    private static ClienteDto Map(Cliente cliente)
        => new(
            cliente.ClienteId,
            cliente.EmpresaId,
            cliente.Nome,
            FormatDocumento(cliente.Documento),
            cliente.Segmento,
            FormatTelefone(cliente.Telefone),
            cliente.Email,
            FormatCep(cliente.Cep),
            cliente.Logradouro,
            cliente.Numero,
            cliente.Complemento,
            cliente.Bairro,
            cliente.Cidade,
            cliente.Uf,
            cliente.CodigoMunicipioIbge,
            cliente.Endereco ?? BuildEndereco(cliente.Logradouro, cliente.Numero, cliente.Complemento, cliente.Bairro, cliente.Cidade, cliente.Uf, cliente.Cep),
            cliente.EhFornecedor,
            cliente.Ativo,
            cliente.DataCadastro);

    private static string NormalizeRequiredText(string? value, string fieldName)
        => NormalizeNullable(value) ?? throw new AppException($"{fieldName} e obrigatorio.");

    private static string? NormalizeNullable(string? value)
        => string.IsNullOrWhiteSpace(value)
            ? null
            : string.Join(' ', value.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));

    private static void ValidateMaxLength(string? value, int maxLength, string fieldName)
    {
        if (value is not null && value.Length > maxLength)
        {
            throw new AppException($"{fieldName} deve ter no maximo {maxLength} caracteres.");
        }
    }

    private static string? DigitsOnly(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var chars = value.Where(char.IsAsciiDigit).ToArray();
        return chars.Length == 0 ? null : new string(chars);
    }

    private static bool IsValidEmail(string email)
    {
        try
        {
            var address = new MailAddress(email);
            return string.Equals(address.Address, email, StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    private static bool IsValidCpf(string cpf)
    {
        if (cpf.Length != 11 || cpf.Distinct().Count() == 1)
        {
            return false;
        }

        var numbers = cpf.Select(item => item - '0').ToArray();
        var firstDigit = CalculateCheckDigit(numbers, 9, 10);
        var secondDigit = CalculateCheckDigit(numbers, 10, 11);

        return numbers[9] == firstDigit && numbers[10] == secondDigit;
    }

    private static bool IsValidCnpj(string cnpj)
    {
        if (cnpj.Length != 14 || cnpj.Distinct().Count() == 1)
        {
            return false;
        }

        var numbers = cnpj.Select(item => item - '0').ToArray();
        var firstWeights = new[] { 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2 };
        var secondWeights = new[] { 6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2 };

        var firstDigit = CalculateCheckDigit(numbers, firstWeights);
        var secondDigit = CalculateCheckDigit(numbers, secondWeights);

        return numbers[12] == firstDigit && numbers[13] == secondDigit;
    }

    private static int CalculateCheckDigit(IReadOnlyList<int> numbers, int count, int factor)
    {
        var sum = 0;
        for (var index = 0; index < count; index++)
        {
            sum += numbers[index] * (factor - index);
        }

        var remainder = sum % 11;
        return remainder < 2 ? 0 : 11 - remainder;
    }

    private static int CalculateCheckDigit(IReadOnlyList<int> numbers, IReadOnlyList<int> weights)
    {
        var sum = 0;
        for (var index = 0; index < weights.Count; index++)
        {
            sum += numbers[index] * weights[index];
        }

        var remainder = sum % 11;
        return remainder < 2 ? 0 : 11 - remainder;
    }

    private static string? FormatDocumento(string? documento)
    {
        var digits = DigitsOnly(documento);
        if (digits is null)
        {
            return null;
        }

        return digits.Length switch
        {
            11 => $"{digits[..3]}.{digits[3..6]}.{digits[6..9]}-{digits[9..]}",
            14 => $"{digits[..2]}.{digits[2..5]}.{digits[5..8]}/{digits[8..12]}-{digits[12..]}",
            _ => digits
        };
    }

    private static string? FormatTelefone(string? telefone)
    {
        var digits = DigitsOnly(telefone);
        if (digits is null)
        {
            return null;
        }

        return digits.Length switch
        {
            10 => $"({digits[..2]}) {digits[2..6]}-{digits[6..]}",
            11 => $"({digits[..2]}) {digits[2..7]}-{digits[7..]}",
            _ => digits
        };
    }

    private static string? FormatCep(string? cep)
    {
        var digits = DigitsOnly(cep);
        if (digits is null)
        {
            return null;
        }

        return digits.Length == 8
            ? $"{digits[..5]}-{digits[5..]}"
            : digits;
    }

    private static string? BuildEndereco(
        string? logradouro,
        string? numero,
        string? complemento,
        string? bairro,
        string? cidade,
        string? uf,
        string? cep)
    {
        var firstLineParts = new[] { logradouro, numero, complemento }
            .Where(item => !string.IsNullOrWhiteSpace(item));
        var secondLineParts = new[] { bairro, cidade, uf }
            .Where(item => !string.IsNullOrWhiteSpace(item));

        var parts = new List<string>();
        var firstLine = string.Join(", ", firstLineParts);
        var secondLine = string.Join(" - ", secondLineParts);

        if (!string.IsNullOrWhiteSpace(firstLine))
        {
            parts.Add(firstLine);
        }

        if (!string.IsNullOrWhiteSpace(secondLine))
        {
            parts.Add(secondLine);
        }

        if (!string.IsNullOrWhiteSpace(cep))
        {
            parts.Add($"CEP {FormatCep(cep)}");
        }

        return parts.Count == 0 ? null : string.Join(" | ", parts);
    }

    private sealed record NormalizedClienteInput(
        string Nome,
        string? Documento,
        string Segmento,
        string? Telefone,
        string? Email,
        string? Cep,
        string? Logradouro,
        string? Numero,
        string? Complemento,
        string? Bairro,
        string? Cidade,
        string? Uf,
        string? CodigoMunicipioIbge,
        string? Endereco);
}
