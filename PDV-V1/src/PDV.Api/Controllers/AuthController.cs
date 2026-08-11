using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PDV.Api.Common;
using PDV.Api.DTOs;
using PDV.Api.Infrastructure;
using PDV.Api.Services;

namespace PDV.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(
    AuthService authService,
    CurrentUserService currentUser,
    UserPresenceService userPresenceService) : ControllerBase
{
    [HttpPost("login")]
    [ProducesResponseType(typeof(ApiResponse<LoginResponse>), StatusCodes.Status200OK)]
    public async Task<ActionResult<ApiResponse<LoginResponse>>> Login([FromBody] LoginRequest request)
    {
        var response = await authService.LoginAsync(request);
        return Ok(ApiResponse<LoginResponse>.Ok(response, "Login realizado com sucesso."));
    }

    [Authorize]
    [HttpPost("presenca/heartbeat")]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status200OK)]
    public ActionResult<ApiResponse<object>> Heartbeat()
    {
        userPresenceService.RegisterHeartbeat(currentUser.GetUserId(), currentUser.GetEmpresaId());
        return Ok(ApiResponse<object>.Ok(null, "Presenca atualizada."));
    }
}
