using System.Net;
using Microsoft.EntityFrameworkCore;

namespace PDV.Api.Common;

public class ExceptionMiddleware(RequestDelegate next, ILogger<ExceptionMiddleware> logger, IHostEnvironment environment)
{
    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (AppException exception)
        {
            await WriteErrorAsync(context, (int)exception.StatusCode, exception.Message);
        }
        catch (DbUpdateConcurrencyException exception)
        {
            logger.LogError(exception, "Erro de concorrencia ao persistir dados.");
            var entityNames = exception.Entries
                .Select(entry => entry.Metadata.ClrType.Name)
                .Distinct()
                .OrderBy(name => name)
                .ToArray();

            var message = entityNames.Length == 0
                ? "Os dados foram alterados por outra operacao antes do salvamento. Atualize a tela e tente novamente."
                : $"Falha de concorrencia ao salvar: {string.Join(", ", entityNames)}. Atualize a tela e tente novamente.";

            await WriteErrorAsync(context, (int)HttpStatusCode.Conflict, message);
        }
        catch (DbUpdateException exception)
        {
            logger.LogError(exception, "Erro de persistencia no banco de dados.");
            var message = TryBuildFriendlyPersistenceMessage(exception, out var friendlyMessage)
                ? friendlyMessage
                : environment.IsDevelopment()
                    ? BuildDevelopmentMessage(exception)
                    : "Nao foi possivel salvar os dados no banco. Revise os campos informados e tente novamente.";
            await WriteErrorAsync(context, (int)HttpStatusCode.BadRequest, message);
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Erro nao tratado.");
            var message = environment.IsDevelopment()
                ? BuildDevelopmentMessage(exception)
                : "Ocorreu um erro interno no servidor.";
            await WriteErrorAsync(context, (int)HttpStatusCode.InternalServerError, message);
        }
    }

    private static Task WriteErrorAsync(HttpContext context, int statusCode, string message)
    {
        context.Response.StatusCode = statusCode;
        context.Response.ContentType = "application/json";
        return context.Response.WriteAsJsonAsync(ApiResponse<object>.Fail(message, message));
    }

    private static string BuildDevelopmentMessage(Exception exception)
    {
        var root = exception.GetBaseException();
        return $"Falha em desenvolvimento: {root.Message}";
    }

    private static bool TryBuildFriendlyPersistenceMessage(DbUpdateException exception, out string message)
    {
        var rootMessage = exception.GetBaseException().Message;
        var isDuplicateProductCode =
            rootMessage.Contains("IX_Produtos_EmpresaId_CodigoBarras", StringComparison.OrdinalIgnoreCase) ||
            rootMessage.Contains("IX_ProdutoCodigos_EmpresaId_Codigo", StringComparison.OrdinalIgnoreCase) ||
            rootMessage.Contains("duplicate key", StringComparison.OrdinalIgnoreCase) ||
            rootMessage.Contains("chave duplicada", StringComparison.OrdinalIgnoreCase);

        if (isDuplicateProductCode)
        {
            message = "Ja existe outro produto com este codigo na empresa. Se o item antigo estiver inativo, reative ou edite o cadastro existente.";
            return true;
        }

        message = string.Empty;
        return false;
    }
}
