using System.Net.Mail;
using Microsoft.EntityFrameworkCore;
using PDV.Api.Common;
using PDV.Api.Data;
using PDV.Api.Domain;
using PDV.Api.DTOs;
using PDV.Api.Infrastructure;

namespace PDV.Api.Services;

public class TransportadoraService(
    AppDbContext dbContext,
    CurrentUserService currentUser,
    MunicipioCatalogService municipioCatalogService)
{
    private const int NomeMaxLength = 150;
    private const int DocumentoMaxLength = 20;
    private const int InscricaoEstadualMaxLength = 20;
    private const int TelefoneMaxLength = 20;
    private const int EmailMaxLength = 150;
    private const int ResponsavelMaxLength = 120;
    private const int CepMaxLength = 8;
    private const int LogradouroMaxLength = 180;
    private const int NumeroMaxLength = 20;
    private const int ComplementoMaxLength = 120;
    private const int BairroMaxLength = 80;
    private const int CidadeMaxLength = 80;
    private const int UfMaxLength = 2;
    private const int CodigoMunicipioIbgeMaxLength = 7;
    private const int EnderecoMaxLength = 220;
    private const int ObservacaoMaxLength = 500;
    private static readonly HashSet<string> ValidUfs =
    [
        "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
        "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"
    ];

    public async Task<IReadOnlyCollection<TransportadoraDto>> GetAllAsync(bool incluirInativas = false)
    {
        EnsureAccess();

        var empresaId = currentUser.GetEmpresaId();
        var query = dbContext.Transportadoras
            .AsNoTracking()
            .Where(item => item.EmpresaId == empresaId);

        if (!incluirInativas)
        {
            query = query.Where(item => item.Ativo);
        }

        var transportadoras = await query
            .OrderByDescending(item => item.Ativo)
            .ThenBy(item => item.Nome)
            .ToListAsync();

        return transportadoras.Select(Map).ToArray();
    }

    public async Task<TransportadoraDto> CreateAsync(TransportadoraRequest request)
    {
        EnsureAccess();
        var empresaId = currentUser.GetEmpresaId();
        var input = await NormalizeInputAsync(request, empresaId, null);

        var transportadora = new Transportadora
        {
            TransportadoraId = Guid.NewGuid(),
            EmpresaId = empresaId,
            Nome = input.Nome,
            NomeFantasia = input.NomeFantasia,
            Documento = input.Documento,
            InscricaoEstadual = input.InscricaoEstadual,
            Telefone = input.Telefone,
            Email = input.Email,
            Responsavel = input.Responsavel,
            Cep = input.Cep,
            Logradouro = input.Logradouro,
            Numero = input.Numero,
            Complemento = input.Complemento,
            Bairro = input.Bairro,
            Cidade = input.Cidade,
            Uf = input.Uf,
            CodigoMunicipioIbge = input.CodigoMunicipioIbge,
            Endereco = input.Endereco,
            CorTemaHex = input.CorTemaHex,
            PrazoMedioEntregaMinutos = input.PrazoMedioEntregaMinutos,
            Observacao = input.Observacao,
            Ativo = input.Ativo,
            DataCadastro = DateTime.UtcNow
        };

        dbContext.Transportadoras.Add(transportadora);
        await dbContext.SaveChangesAsync();

        return Map(transportadora);
    }

    public async Task<TransportadoraDto> UpdateAsync(Guid id, TransportadoraRequest request)
    {
        EnsureAccess();
        var empresaId = currentUser.GetEmpresaId();

        var transportadora = await dbContext.Transportadoras
            .FirstOrDefaultAsync(item => item.TransportadoraId == id && item.EmpresaId == empresaId)
            ?? throw new NotFoundException("Transportadora nao encontrada.");

        var input = await NormalizeInputAsync(request, empresaId, id);

        transportadora.Nome = input.Nome;
        transportadora.NomeFantasia = input.NomeFantasia;
        transportadora.Documento = input.Documento;
        transportadora.InscricaoEstadual = input.InscricaoEstadual;
        transportadora.Telefone = input.Telefone;
        transportadora.Email = input.Email;
        transportadora.Responsavel = input.Responsavel;
        transportadora.Cep = input.Cep;
        transportadora.Logradouro = input.Logradouro;
        transportadora.Numero = input.Numero;
        transportadora.Complemento = input.Complemento;
        transportadora.Bairro = input.Bairro;
        transportadora.Cidade = input.Cidade;
        transportadora.Uf = input.Uf;
        transportadora.CodigoMunicipioIbge = input.CodigoMunicipioIbge;
        transportadora.Endereco = input.Endereco;
        transportadora.CorTemaHex = input.CorTemaHex;
        transportadora.PrazoMedioEntregaMinutos = input.PrazoMedioEntregaMinutos;
        transportadora.Observacao = input.Observacao;
        transportadora.Ativo = input.Ativo;

        await dbContext.SaveChangesAsync();
        return Map(transportadora);
    }

    public async Task ArchiveAsync(Guid id)
    {
        EnsureAccess();
        var empresaId = currentUser.GetEmpresaId();

        var transportadora = await dbContext.Transportadoras
            .FirstOrDefaultAsync(item => item.TransportadoraId == id && item.EmpresaId == empresaId)
            ?? throw new NotFoundException("Transportadora nao encontrada.");

        transportadora.Ativo = false;
        await dbContext.SaveChangesAsync();
    }

    private async Task<NormalizedTransportadoraInput> NormalizeInputAsync(TransportadoraRequest request, Guid empresaId, Guid? transportadoraId)
    {
        var nome = NormalizeRequiredText(request.Nome, NomeMaxLength, "Nome da transportadora");
        var nomeFantasia = NormalizeOptionalText(request.NomeFantasia, NomeMaxLength, "Nome fantasia");
        await EnsureUniqueNameAsync(empresaId, nome, transportadoraId);

        var documento = DigitsOnly(request.Documento);
        if (documento is not null)
        {
            if (documento.Length != 14 || !IsValidCnpj(documento))
            {
                throw new AppException("CNPJ da transportadora invalido.");
            }

            ValidateMaxLength(documento, DocumentoMaxLength, "Documento");
            await EnsureUniqueDocumentAsync(empresaId, documento, transportadoraId);
        }

        var inscricaoEstadual = NormalizeOptionalText(request.InscricaoEstadual, InscricaoEstadualMaxLength, "Inscricao estadual");
        var telefone = DigitsOnly(request.Telefone);
        if (telefone is not null && telefone.Length is not 10 and not 11)
        {
            throw new AppException("Telefone deve ter DDD e 10 ou 11 digitos.");
        }

        ValidateMaxLength(telefone, TelefoneMaxLength, "Telefone");

        var email = NormalizeOptionalText(request.Email, EmailMaxLength, "E-mail")?.ToLowerInvariant();
        if (email is not null && !IsValidEmail(email))
        {
            throw new AppException("E-mail invalido.");
        }

        var responsavel = NormalizeOptionalText(request.Responsavel, ResponsavelMaxLength, "Responsavel");
        var cep = DigitsOnly(request.Cep);
        if (cep is not null && cep.Length != 8)
        {
            throw new AppException("CEP deve conter 8 digitos.");
        }

        ValidateMaxLength(cep, CepMaxLength, "CEP");

        var logradouro = NormalizeOptionalText(request.Logradouro, LogradouroMaxLength, "Logradouro");
        var numero = NormalizeOptionalText(request.Numero, NumeroMaxLength, "Numero");
        var complemento = NormalizeOptionalText(request.Complemento, ComplementoMaxLength, "Complemento");
        var bairro = NormalizeOptionalText(request.Bairro, BairroMaxLength, "Bairro");
        var cidade = NormalizeOptionalText(request.Cidade, CidadeMaxLength, "Cidade");
        var uf = NormalizeOptionalText(request.Uf, UfMaxLength, "UF")?.ToUpperInvariant();
        var codigoMunicipioIbge = DigitsOnly(request.CodigoMunicipioIbge);
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

        var endereco = BuildEndereco(logradouro, numero, complemento, bairro, cidade, uf, cep)
            ?? NormalizeOptionalText(request.Endereco, EnderecoMaxLength, "Endereco");
        ValidateMaxLength(endereco, EnderecoMaxLength, "Endereco");

        if (request.PrazoMedioEntregaMinutos is < 0)
        {
            throw new AppException("Prazo medio de entrega nao pode ser negativo.");
        }

        return new NormalizedTransportadoraInput(
            nome,
            nomeFantasia,
            documento,
            inscricaoEstadual,
            telefone,
            email,
            responsavel,
            cep,
            logradouro,
            numero,
            complemento,
            bairro,
            cidade,
            uf,
            codigoMunicipioIbge,
            endereco,
            NormalizeColor(request.CorTemaHex),
            request.PrazoMedioEntregaMinutos,
            NormalizeOptionalText(request.Observacao, ObservacaoMaxLength, "Observacao"),
            request.Ativo);
    }

    private void EnsureAccess()
    {
        if (currentUser.HasPermission(Permissoes.GerenciarClientes) || currentUser.HasPermission(Permissoes.VisualizarClientes))
        {
            return;
        }

        throw new ForbiddenAppException("Seu usuario nao possui permissao para administrar transportadoras.");
    }

    private async Task EnsureUniqueNameAsync(Guid empresaId, string nome, Guid? transportadoraId)
    {
        var exists = await dbContext.Transportadoras.AnyAsync(item =>
            item.EmpresaId == empresaId &&
            item.TransportadoraId != transportadoraId &&
            item.Nome == nome);

        if (exists)
        {
            throw new AppException("Ja existe uma transportadora com este nome.");
        }
    }

    private async Task EnsureUniqueDocumentAsync(Guid empresaId, string documento, Guid? transportadoraId)
    {
        var existingDocuments = await dbContext.Transportadoras
            .Where(item => item.EmpresaId == empresaId && item.TransportadoraId != transportadoraId && item.Documento != null)
            .Select(item => item.Documento!)
            .ToListAsync();

        if (existingDocuments.Any(item => string.Equals(DigitsOnly(item), documento, StringComparison.Ordinal)))
        {
            throw new AppException("Ja existe uma transportadora com este CNPJ na empresa.");
        }
    }

    private static string NormalizeRequiredText(string? value, int maxLength, string fieldName)
    {
        var normalized = NormalizeOptionalText(value, maxLength, fieldName);
        return normalized ?? throw new AppException($"{fieldName} e obrigatorio.");
    }

    private static string? NormalizeOptionalText(string? value, int maxLength, string fieldName)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var normalized = string.Join(' ', value.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
        ValidateMaxLength(normalized, maxLength, fieldName);
        return normalized;
    }

    private static void ValidateMaxLength(string? value, int maxLength, string fieldName)
    {
        if (value is not null && value.Length > maxLength)
        {
            throw new AppException($"{fieldName} excede o limite de {maxLength} caracteres.");
        }
    }

    private static string? NormalizeColor(string? value)
    {
        var normalized = NormalizeOptionalText(value, 7, "Cor");
        if (normalized is null)
        {
            return null;
        }

        if (!System.Text.RegularExpressions.Regex.IsMatch(normalized, "^#[0-9A-Fa-f]{6}$"))
        {
            throw new AppException("Cor da transportadora deve estar no formato hexadecimal, ex.: #1D4ED8.");
        }

        return normalized.ToUpperInvariant();
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

        return digits.Length == 14
            ? $"{digits[..2]}.{digits[2..5]}.{digits[5..8]}/{digits[8..12]}-{digits[12..]}"
            : digits;
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
        var firstLine = string.Join(", ", new[] { logradouro, numero, complemento }.Where(item => !string.IsNullOrWhiteSpace(item)));
        var secondLine = string.Join(" - ", new[] { bairro, cidade, uf }.Where(item => !string.IsNullOrWhiteSpace(item)));
        var parts = new List<string>();

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

    private static TransportadoraDto Map(Transportadora transportadora)
        => new(
            transportadora.TransportadoraId,
            transportadora.EmpresaId,
            transportadora.Nome,
            transportadora.NomeFantasia,
            FormatDocumento(transportadora.Documento),
            transportadora.InscricaoEstadual,
            FormatTelefone(transportadora.Telefone),
            transportadora.Email,
            transportadora.Responsavel,
            FormatCep(transportadora.Cep),
            transportadora.Logradouro,
            transportadora.Numero,
            transportadora.Complemento,
            transportadora.Bairro,
            transportadora.Cidade,
            transportadora.Uf,
            transportadora.CodigoMunicipioIbge,
            transportadora.Endereco ?? BuildEndereco(
                transportadora.Logradouro,
                transportadora.Numero,
                transportadora.Complemento,
                transportadora.Bairro,
                transportadora.Cidade,
                transportadora.Uf,
                transportadora.Cep),
            transportadora.CorTemaHex,
            transportadora.PrazoMedioEntregaMinutos,
            transportadora.Observacao,
            transportadora.Ativo,
            transportadora.DataCadastro);

    private sealed record NormalizedTransportadoraInput(
        string Nome,
        string? NomeFantasia,
        string? Documento,
        string? InscricaoEstadual,
        string? Telefone,
        string? Email,
        string? Responsavel,
        string? Cep,
        string? Logradouro,
        string? Numero,
        string? Complemento,
        string? Bairro,
        string? Cidade,
        string? Uf,
        string? CodigoMunicipioIbge,
        string? Endereco,
        string? CorTemaHex,
        int? PrazoMedioEntregaMinutos,
        string? Observacao,
        bool Ativo);
}
