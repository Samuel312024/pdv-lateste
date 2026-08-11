using System.ComponentModel;
using System.Diagnostics;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using PDV.Api.Infrastructure;

namespace PDV.Api.Services;

public class ProdutoImagemReconhecimentoService(
    IWebHostEnvironment environment,
    IOptions<ProdutoImagemReconhecimentoOptions> optionsAccessor,
    ILogger<ProdutoImagemReconhecimentoService> logger)
{
    private readonly ProdutoImagemReconhecimentoOptions options = optionsAccessor.Value;

    public async Task<ProdutoImagemReconhecimentoResultado> IdentificarAsync(
        ProdutoImagemArmazenada imagem,
        string? termoBuscaInformado,
        CancellationToken cancellationToken = default)
    {
        var termoManual = NormalizeSearchTerm(termoBuscaInformado);
        if (!options.Habilitado)
        {
            return new ProdutoImagemReconhecimentoResultado(
                termoManual,
                null,
                termoManual is null ? null : "manual",
                "Reconhecimento por imagem desabilitado na configuracao do backend.");
        }

        var scriptPath = ResolveScriptPath();
        if (!File.Exists(scriptPath))
        {
            return new ProdutoImagemReconhecimentoResultado(
                termoManual,
                null,
                termoManual is null ? null : "manual",
                $"Script Python de reconhecimento nao encontrado em {scriptPath}.");
        }

        var pythonResult = await TryRunPythonRecognitionAsync(scriptPath, imagem, termoManual, cancellationToken);
        var termoEfetivo = BuildEffectiveSearchTerm(
            termoManual,
            pythonResult?.SearchTerm,
            pythonResult?.Brand,
            pythonResult?.ProductName,
            pythonResult?.Size);

        var origem = !string.IsNullOrWhiteSpace(pythonResult?.SearchTerm)
            ? NormalizeNullable(pythonResult!.Source) ?? "python-ocr"
            : termoManual is null ? null : "manual";

        var diagnostico = BuildRecognitionDiagnostic(termoManual, pythonResult);

        return new ProdutoImagemReconhecimentoResultado(
            termoEfetivo,
            NormalizeSearchTerm(pythonResult?.SearchTerm),
            origem,
            diagnostico);
    }

    private async Task<PythonImageRecognitionResult?> TryRunPythonRecognitionAsync(
        string scriptPath,
        ProdutoImagemArmazenada imagem,
        string? termoBuscaInformado,
        CancellationToken cancellationToken)
    {
        foreach (var attempt in BuildPythonAttempts())
        {
            using var process = new Process
            {
                StartInfo = BuildPythonStartInfo(attempt, scriptPath, imagem.CaminhoFisico, termoBuscaInformado)
            };

            try
            {
                process.Start();
            }
            catch (Win32Exception exception)
            {
                logger.LogDebug(exception, "Falha ao iniciar tentativa de Python {Command}.", attempt.FileName);
                continue;
            }

            var stdoutTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
            var stderrTask = process.StandardError.ReadToEndAsync(cancellationToken);
            await process.WaitForExitAsync(cancellationToken);

            var stdout = await stdoutTask;
            var stderr = await stderrTask;
            if (process.ExitCode != 0)
            {
                logger.LogInformation(
                    "Reconhecimento Python terminou com codigo {ExitCode} usando {Command}. STDERR: {Stderr}",
                    process.ExitCode,
                    attempt.FileName,
                    LimitText(stderr, 320));

                if (attempt.IsLastFallback)
                {
                    return new PythonImageRecognitionResult(
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        BuildFailureDiagnostic(stderr, process.ExitCode, attempt.FileName));
                }

                continue;
            }

            try
            {
                var parsed = JsonSerializer.Deserialize<PythonImageRecognitionResult>(stdout, new JsonSerializerOptions(JsonSerializerDefaults.Web));
                if (parsed is not null)
                {
                    return parsed with
                    {
                        Diagnostic = LimitText(parsed.Diagnostic, 320)
                    };
                }
            }
            catch (JsonException exception)
            {
                logger.LogWarning(exception, "Saida do script Python nao retornou JSON valido.");
                return new PythonImageRecognitionResult(
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    "O script Python respondeu, mas nao retornou um JSON de reconhecimento valido.");
            }
        }

        return new PythonImageRecognitionResult(
            null,
            null,
            null,
            null,
            null,
            null,
            "Nenhum runtime Python foi encontrado. Instale Python 3 e, opcionalmente, o Tesseract OCR para ativar a identificacao visual.");
    }

    private ProcessStartInfo BuildPythonStartInfo(
        PythonCommandAttempt attempt,
        string scriptPath,
        string imagePath,
        string? termoBuscaInformado)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = attempt.FileName,
            RedirectStandardError = true,
            RedirectStandardOutput = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            WorkingDirectory = environment.ContentRootPath
        };

        if (!string.IsNullOrWhiteSpace(attempt.FixedArguments))
        {
            foreach (var item in SplitCommandArguments(attempt.FixedArguments!))
            {
                startInfo.ArgumentList.Add(item);
            }
        }

        startInfo.ArgumentList.Add(scriptPath);
        startInfo.ArgumentList.Add("--image-path");
        startInfo.ArgumentList.Add(imagePath);
        startInfo.ArgumentList.Add("--ocr-languages");
        startInfo.ArgumentList.Add(options.OcrLanguages);

        if (!string.IsNullOrWhiteSpace(options.TesseractExecutablePath))
        {
            startInfo.ArgumentList.Add("--tesseract-path");
            startInfo.ArgumentList.Add(options.TesseractExecutablePath!);
        }

        if (!string.IsNullOrWhiteSpace(termoBuscaInformado))
        {
            startInfo.ArgumentList.Add("--hint");
            startInfo.ArgumentList.Add(termoBuscaInformado);
        }

        return startInfo;
    }

    private IEnumerable<PythonCommandAttempt> BuildPythonAttempts()
    {
        var configuredExecutable = NormalizeNullable(options.PythonExecutable);
        if (configuredExecutable is not null)
        {
            yield return new PythonCommandAttempt(configuredExecutable, NormalizeNullable(options.PythonArguments), true);
            yield break;
        }

        yield return new PythonCommandAttempt("py", "-3", false);
        yield return new PythonCommandAttempt("python3", null, false);
        yield return new PythonCommandAttempt("python", null, true);
    }

    private string ResolveScriptPath()
    {
        var configuredPath = options.ScriptRelativePath.Trim();
        if (Path.IsPathRooted(configuredPath))
        {
            return configuredPath;
        }

        return Path.GetFullPath(Path.Combine(environment.ContentRootPath, configuredPath));
    }

    private static string? BuildEffectiveSearchTerm(
        string? termoManual,
        string? termoIdentificado,
        string? brand,
        string? productName,
        string? size)
    {
        var parts = new List<string>();
        AddPart(parts, termoIdentificado);
        AddPart(parts, JoinParts(brand, productName, size));
        AddPart(parts, termoManual);

        if (parts.Count == 0)
        {
            return null;
        }

        var distinctTokens = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var part in parts)
        {
            foreach (var token in part.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                if (token.Length < 2)
                {
                    continue;
                }

                if (seen.Add(token))
                {
                    distinctTokens.Add(token);
                }
            }
        }

        return LimitText(string.Join(' ', distinctTokens), 96);
    }

    private static string BuildRecognitionDiagnostic(string? termoManual, PythonImageRecognitionResult? result)
    {
        var messages = new List<string>();

        if (!string.IsNullOrWhiteSpace(result?.SearchTerm))
        {
            messages.Add($"Python identificou \"{result!.SearchTerm}\" pela imagem.");
        }

        if (!string.IsNullOrWhiteSpace(termoManual))
        {
            messages.Add("O termo digitado pelo operador foi preservado como apoio no cruzamento externo.");
        }

        if (!string.IsNullOrWhiteSpace(result?.Diagnostic))
        {
            messages.Add(result!.Diagnostic!);
        }

        if (messages.Count == 0)
        {
            messages.Add("A imagem foi recebida, mas o reconhecimento visual nao encontrou texto suficiente para orientar a busca externa.");
        }

        return LimitText(string.Join(' ', messages.Distinct(StringComparer.OrdinalIgnoreCase)), 320)
            ?? "A imagem foi recebida, mas o reconhecimento visual nao encontrou texto suficiente para orientar a busca externa.";
    }

    private static string BuildFailureDiagnostic(string? stderr, int exitCode, string command)
    {
        var message = NormalizeNullable(stderr);
        if (message is null)
        {
            return $"O processo Python terminou com codigo {exitCode} usando {command}.";
        }

        return $"O processo Python terminou com codigo {exitCode} usando {command}: {LimitText(message, 240)}";
    }

    private static void AddPart(ICollection<string> parts, string? value)
    {
        var normalized = NormalizeSearchTerm(value);
        if (!string.IsNullOrWhiteSpace(normalized))
        {
            parts.Add(normalized);
        }
    }

    private static string? JoinParts(params string?[] values)
    {
        var parts = values
            .Select(NormalizeSearchTerm)
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();

        return parts.Length == 0 ? null : string.Join(' ', parts);
    }

    private static IEnumerable<string> SplitCommandArguments(string value)
    {
        var current = new StringBuilder();
        var insideQuotes = false;
        foreach (var character in value)
        {
            if (character == '"')
            {
                insideQuotes = !insideQuotes;
                continue;
            }

            if (char.IsWhiteSpace(character) && !insideQuotes)
            {
                if (current.Length > 0)
                {
                    yield return current.ToString();
                    current.Clear();
                }

                continue;
            }

            current.Append(character);
        }

        if (current.Length > 0)
        {
            yield return current.ToString();
        }
    }

    private static string? NormalizeSearchTerm(string? value)
        => NormalizeNullable(string.Join(' ',
            (value ?? string.Empty)
                .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)));

    private static string? NormalizeNullable(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string? LimitText(string? value, int maxLength)
    {
        var normalized = NormalizeNullable(value);
        if (normalized is null)
        {
            return null;
        }

        return normalized.Length <= maxLength
            ? normalized
            : $"{normalized[..(maxLength - 3)].TrimEnd()}...";
    }

    private sealed record PythonCommandAttempt(string FileName, string? FixedArguments, bool IsLastFallback);

    private sealed record PythonImageRecognitionResult(
        string? SearchTerm,
        string? ProductName,
        string? Brand,
        string? Size,
        string? Barcode,
        string? Source,
        string? Diagnostic);
}

public sealed record ProdutoImagemReconhecimentoResultado(
    string? TermoBuscaEfetivo,
    string? TermoBuscaIdentificado,
    string? TermoBuscaOrigem,
    string DiagnosticoReconhecimento);
