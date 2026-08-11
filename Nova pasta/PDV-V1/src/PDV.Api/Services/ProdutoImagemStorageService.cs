using Microsoft.AspNetCore.Http;
using PDV.Api.Common;

namespace PDV.Api.Services;

public class ProdutoImagemStorageService(IWebHostEnvironment environment)
{
    private const long MaxImageSizeBytes = 6 * 1024 * 1024;
    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg",
        ".jpeg",
        ".png",
        ".webp"
    };

    private readonly string uploadsRootPath = Path.Combine(environment.ContentRootPath, "uploads", "produtos");

    public async Task<ProdutoImagemArmazenada> SaveAsync(IFormFile arquivo, CancellationToken cancellationToken = default)
    {
        if (arquivo.Length <= 0)
        {
            throw new AppException("Selecione uma imagem valida do produto.");
        }

        if (arquivo.Length > MaxImageSizeBytes)
        {
            throw new AppException("A imagem do produto excede o limite de 6 MB.");
        }

        if (string.IsNullOrWhiteSpace(arquivo.ContentType) || !arquivo.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
        {
            throw new AppException("O arquivo enviado nao e uma imagem compativel.");
        }

        var extension = NormalizeExtension(arquivo.FileName, arquivo.ContentType);
        if (!AllowedExtensions.Contains(extension))
        {
            throw new AppException("Use uma imagem JPG, PNG ou WEBP para cadastrar o produto.");
        }

        var now = DateTime.UtcNow;
        var yearSegment = now.ToString("yyyy");
        var monthSegment = now.ToString("MM");
        var directoryPath = Path.Combine(uploadsRootPath, yearSegment, monthSegment);
        Directory.CreateDirectory(directoryPath);

        var storedFileName = $"produto-{Guid.NewGuid():N}{extension}";
        var fullPath = Path.Combine(directoryPath, storedFileName);

        await using (var targetStream = new FileStream(fullPath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
        {
            await arquivo.CopyToAsync(targetStream, cancellationToken);
        }

        return new ProdutoImagemArmazenada(
            $"/uploads/produtos/{yearSegment}/{monthSegment}/{storedFileName}",
            fullPath,
            Path.GetFileName(arquivo.FileName),
            arquivo.Length);
    }

    private static string NormalizeExtension(string? originalFileName, string? contentType)
    {
        var extension = Path.GetExtension(originalFileName);
        if (!string.IsNullOrWhiteSpace(extension))
        {
            return extension.ToLowerInvariant();
        }

        return contentType?.ToLowerInvariant() switch
        {
            "image/png" => ".png",
            "image/webp" => ".webp",
            _ => ".jpg"
        };
    }
}

public sealed record ProdutoImagemArmazenada(
    string CaminhoRelativo,
    string CaminhoFisico,
    string NomeArquivoOriginal,
    long TamanhoBytes);
