using System.Net;

namespace PDV.Api.Common;

public class AppException(string message, HttpStatusCode statusCode = HttpStatusCode.BadRequest) : Exception(message)
{
    public HttpStatusCode StatusCode { get; } = statusCode;
}

public sealed class NotFoundException(string message) : AppException(message, HttpStatusCode.NotFound);

public sealed class UnauthorizedAppException(string message) : AppException(message, HttpStatusCode.Unauthorized);

public sealed class ForbiddenAppException(string message) : AppException(message, HttpStatusCode.Forbidden);
