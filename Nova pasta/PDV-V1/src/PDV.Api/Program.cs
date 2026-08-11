using System.Text;
using System.Text.Json.Serialization;
using System.IO;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.IdentityModel.Tokens;
using PDV.Api.Authorization;
using PDV.Api.Common;
using PDV.Api.Data;
using PDV.Api.Domain;
using PDV.Api.Fiscal.Providers.NuvemFiscal;
using PDV.Api.Fiscal.Services;
using PDV.Api.Hubs;
using PDV.Api.Infrastructure;
using PDV.Api.Services;

var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = Directory.GetCurrentDirectory()
});
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.AddDebug();

var appDataRootPath = Path.GetFullPath(
    AppDataPathResolver.ResolveRootPath(builder.Environment, builder.Configuration));

var machineConfigRootPath = Path.GetFullPath(
    AppDataPathResolver.ResolveConfigRootPath(builder.Environment, builder.Configuration));

var uploadsRootPath = Path.GetFullPath(
    AppDataPathResolver.ResolveUploadsRootPath(builder.Environment, builder.Configuration));

var dataProtectionKeysRootPath = Path.GetFullPath(
    AppDataPathResolver.ResolveDataProtectionKeysRootPath(builder.Environment, builder.Configuration));

var downloadsRootPath = Path.GetFullPath(
    AppDataPathResolver.ResolveDownloadsRootPath(builder.Environment, builder.Configuration));
var databaseProvider =
    builder.Configuration["DatabaseProvider"] ?? "SqlServer";

Directory.CreateDirectory(appDataRootPath);
Directory.CreateDirectory(machineConfigRootPath);
Directory.CreateDirectory(uploadsRootPath);
Directory.CreateDirectory(dataProtectionKeysRootPath);
Directory.CreateDirectory(downloadsRootPath);

builder.Services.AddDbContext<AppDbContext>(options =>
{
    if (databaseProvider.Equals(
        "PostgreSql",
        StringComparison.OrdinalIgnoreCase))
    {
        options.UseNpgsql(
            builder.Configuration.GetConnectionString("PostgreSql"));
    }
    else
    {
        options.UseSqlServer(
            builder.Configuration.GetConnectionString("SqlServer"));
    }
});
builder.Configuration.AddJsonFile(
    "appsettings.Override.json",
    optional: true,
    reloadOnChange: false);

builder.Configuration.AddJsonFile(
    new PhysicalFileProvider(machineConfigRootPath),
    "appsettings.Override.json",
    optional: true,
    reloadOnChange: false);

builder.Services
    .AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    });

builder.Services.AddHttpContextAccessor();
builder.Services.AddSignalR();
builder.Services.AddMemoryCache();
//builder.Services.AddDbContext<AppDbContext>(options =>
//    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));
builder.Services
    .AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo(dataProtectionKeysRootPath));

builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection("Jwt"));
builder.Services.Configure<CatalogoProdutosExternosOptions>(builder.Configuration.GetSection("CatalogoProdutosExternos"));
builder.Services.Configure<ProdutoImagemReconhecimentoOptions>(builder.Configuration.GetSection("ProdutoImagemReconhecimento"));
builder.Services.Configure<NfeSefazOptions>(builder.Configuration.GetSection("NfeSefaz"));
var jwtOptions = builder.Configuration.GetSection("Jwt").Get<JwtOptions>() ?? new JwtOptions();
var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtOptions.Key));

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtOptions.Issuer,
            ValidAudience = jwtOptions.Audience,
            IssuerSigningKey = signingKey,
            ClockSkew = TimeSpan.Zero
        };

        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                var path = context.HttpContext.Request.Path;

                if (!string.IsNullOrWhiteSpace(accessToken) &&
                    (path.StartsWithSegments("/hubs/scanner") || path.StartsWithSegments("/hubs/pedidos")))
                {
                    context.Token = accessToken;
                }

                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization(options =>
{
    foreach (var permission in Permissoes.All)
    {
        options.AddPolicy(permission, policy => policy.AddRequirements(new PermissionRequirement(permission)));
    }
});

var frontendUrl = builder.Configuration["FrontendUrl"];

builder.Services.AddCors(options =>
{
    options.AddPolicy("frontend", policy =>
    {
        if (builder.Environment.IsDevelopment())
        {
            policy
                .SetIsOriginAllowed(_ => true)
                .AllowAnyHeader()
                .AllowAnyMethod();

            return;
        }

        if (string.IsNullOrWhiteSpace(frontendUrl))
        {
            throw new InvalidOperationException(
                "A variável de ambiente FrontendUrl não foi configurada.");
        }

        policy
            .WithOrigins(frontendUrl)
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

builder.Services.AddScoped<IAuthorizationHandler, PermissionAuthorizationHandler>();
builder.Services.AddScoped<CurrentUserService>();
builder.Services.AddScoped<IPasswordHasher<Usuario>, PasswordHasher<Usuario>>();
builder.Services.AddScoped<TokenService>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddSingleton<InstaladorPdvService>();
builder.Services.AddScoped<LiberacaoGerenteService>();
builder.Services.AddSingleton<UserPresenceService>();
builder.Services.AddScoped<UsuarioService>();
builder.Services.AddScoped<TerminalPdvService>();
builder.Services.AddScoped<ProdutoImagemReconhecimentoService>();
builder.Services.AddScoped<NfeCertificateService>();
builder.Services.AddSingleton<NfeSefazEndpointResolver>();
builder.Services.AddScoped<NfeTransmissionService>();
builder.Services.AddScoped<FiscalProviderFactory>();
builder.Services.AddScoped<FiscalNfeService>();
builder.Services.AddScoped<NuvemFiscalAuthService>();
builder.Services.AddScoped<EfiBillingGateway>();
builder.Services.AddScoped<EmpresaService>();
builder.Services.AddHttpClient("fiscal-provider", client =>
{
    client.Timeout = TimeSpan.FromSeconds(60);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("PDV.Api/1.0");
});
builder.Services.AddHttpClient("nuvemfiscal-auth", client =>
{
    client.Timeout = TimeSpan.FromSeconds(30);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("PDV.Api/1.0");
});
builder.Services.AddHttpClient("efi-billing", client =>
{
    client.Timeout = TimeSpan.FromSeconds(45);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("PDV.Api/1.0");
    client.DefaultRequestHeaders.Accept.ParseAdd("application/json");
});
builder.Services.AddHttpClient("siscomex-ncm", client =>
{
    client.Timeout = TimeSpan.FromSeconds(45);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("PDV.Api/1.0");
    client.DefaultRequestHeaders.Accept.ParseAdd("application/json");
});
builder.Services.AddScoped<ProdutoFiscalService>();
builder.Services.AddScoped<FiscalCalculationService>();
builder.Services.AddScoped<ProdutoService>();
builder.Services.AddScoped<ProdutoImagemStorageService>();
builder.Services.AddScoped<ProdutoCampoPadraoService>();
builder.Services.AddScoped<TransportadoraService>();
builder.Services.AddHttpClient<ProdutoCatalogoExternoService>();
builder.Services.AddScoped<ClienteService>();
builder.Services.AddHttpClient<CnpjLookupService>(client =>
{
    client.BaseAddress = new Uri("https://brasilapi.com.br/api/cnpj/v1/");
    client.Timeout = TimeSpan.FromSeconds(10);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("PDV.Api/1.0");
});
builder.Services.AddHttpClient<CepLookupService>(client =>
{
    client.BaseAddress = new Uri("https://viacep.com.br/");
    client.Timeout = TimeSpan.FromSeconds(8);
});
builder.Services.AddHttpClient<MunicipioCatalogService>(client =>
{
    client.BaseAddress = new Uri("https://servicodados.ibge.gov.br/api/v1/localidades/");
    client.Timeout = TimeSpan.FromSeconds(20);
    client.DefaultRequestHeaders.UserAgent.ParseAdd("PDV.Api/1.0");
    client.DefaultRequestHeaders.Accept.ParseAdd("application/json");
});
builder.Services.AddScoped<CaixaService>();
builder.Services.AddScoped<EstoqueService>();
builder.Services.AddScoped<NotaFiscalService>();
builder.Services.AddScoped<VendaService>();
builder.Services.AddScoped<PedidoService>();
builder.Services.AddScoped<EntregaService>();
builder.Services.AddScoped<PedidoRealtimeNotifier>();
builder.Services.AddScoped<DashboardService>();
builder.Services.AddScoped<RelatorioService>();
builder.Services.AddScoped<FinanceiroService>();
builder.Services.AddScoped<CobrancaDigitalService>();
builder.Services.AddSingleton<ScannerSessaoService>();

var app = builder.Build();
var spaRootPath = Path.Combine(app.Environment.ContentRootPath, "wwwroot");
Directory.CreateDirectory(uploadsRootPath);

app.UseMiddleware<ExceptionMiddleware>();
app.UseCors("frontend");
if (Directory.Exists(spaRootPath))
{
    app.UseDefaultFiles();
    app.UseStaticFiles();
}

app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(uploadsRootPath),
    RequestPath = "/uploads"
});
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHub<ScannerHub>("/hubs/scanner");
app.MapHub<PedidosHub>("/hubs/pedidos");

Console.WriteLine("=== PDV API: INICIO ===");
Console.WriteLine($"Environment: {app.Environment.EnvironmentName}");
Console.WriteLine($"ContentRoot: {app.Environment.ContentRootPath}");
Console.WriteLine($"DatabaseProvider: {databaseProvider}");
Console.WriteLine($"AppData: {appDataRootPath}");
Console.WriteLine($"Config: {machineConfigRootPath}");
Console.WriteLine($"Uploads: {uploadsRootPath}");
Console.WriteLine($"Keys: {dataProtectionKeysRootPath}");
Console.WriteLine($"Downloads: {downloadsRootPath}");
Console.WriteLine("=== PDV API: ANTES DO DATABASE SEED ===");

await using (var scope = app.Services.CreateAsyncScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var passwordHasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher<Usuario>>();
    var municipioCatalogService = scope.ServiceProvider.GetRequiredService<MunicipioCatalogService>();
    await DatabaseSeeder.SeedAsync(dbContext, passwordHasher, app.Environment);
    await municipioCatalogService.EnsureCatalogLoadedAsync();
}

if (File.Exists(Path.Combine(spaRootPath, "index.html")))
{
    app.MapFallbackToFile("index.html");
}
Console.WriteLine("=== PDV API: ANTES DO APP.RUN ===");

app.MapGet("/health", () => Results.Ok(new
{
    status = "ok",
    service = "PDV.Api"
}));

app.Run();
