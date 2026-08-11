using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using PDV.Api.Authorization;
using PDV.Api.Common;
using PDV.Api.Domain;
using PDV.Api.DTOs;
using PDV.Api.Services;

namespace PDV.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/produtos")]
public class ProdutosController(
    ProdutoService produtoService,
    ProdutoFiscalService produtoFiscalService,
    ProdutoCampoPadraoService produtoCampoPadraoService,
    ProdutoCatalogoExternoService produtoCatalogoExternoService,
    ProdutoImagemStorageService produtoImagemStorageService,
    ProdutoImagemReconhecimentoService produtoImagemReconhecimentoService) : ControllerBase
{
    [HttpGet("fiscal/assistente")]
    [RequirePermission(Permissoes.VisualizarProduto)]
    public async Task<ActionResult<ApiResponse<ProdutoFiscalAssistenteContextoDto>>> GetFiscalAssistente(CancellationToken cancellationToken)
    {
        var response = await produtoFiscalService.GetContextoAsync(cancellationToken);
        return Ok(ApiResponse<ProdutoFiscalAssistenteContextoDto>.Ok(response));
    }

    [HttpGet("fiscal/ncms")]
    [RequirePermission(Permissoes.VisualizarProduto)]
    public async Task<ActionResult<ApiResponse<IReadOnlyCollection<FiscalNcmDto>>>> BuscarNcms([FromQuery] string? termo, CancellationToken cancellationToken)
    {
        var response = await produtoFiscalService.BuscarNcmsAsync(termo, cancellationToken);
        return Ok(ApiResponse<IReadOnlyCollection<FiscalNcmDto>>.Ok(response));
    }

    [HttpPost("fiscal/ncms/cadastro-rapido")]
    [RequirePermission(Permissoes.EditarProduto)]
    public async Task<ActionResult<ApiResponse<FiscalNcmDto>>> CadastrarNcmRapido(
        [FromBody] FiscalNcmCadastroRapidoRequest request,
        CancellationToken cancellationToken)
    {
        var response = await produtoFiscalService.CadastrarNcmRapidoAsync(request, cancellationToken);
        return Ok(ApiResponse<FiscalNcmDto>.Ok(response, "NCM cadastrado rapidamente com sucesso."));
    }

    [HttpPost("fiscal/ncms/importar")]
    [RequirePermission(Permissoes.GerenciarEmpresaFiscal)]
    public async Task<ActionResult<ApiResponse<FiscalNcmImportacaoResultadoDto>>> ImportarTabelaNcm(
        [FromForm] IFormFile arquivo,
        CancellationToken cancellationToken)
    {
        var response = await produtoFiscalService.ImportarTabelaNcmAsync(arquivo, cancellationToken);
        return Ok(ApiResponse<FiscalNcmImportacaoResultadoDto>.Ok(response, "Tabela NCM importada com sucesso."));
    }

    [HttpGet("fiscal/cests")]
    [RequirePermission(Permissoes.VisualizarProduto)]
    public async Task<ActionResult<ApiResponse<IReadOnlyCollection<FiscalCestDto>>>> BuscarCests([FromQuery] string? termo, [FromQuery] string? ncm, CancellationToken cancellationToken)
    {
        var response = await produtoFiscalService.BuscarCestsAsync(termo, ncm, cancellationToken);
        return Ok(ApiResponse<IReadOnlyCollection<FiscalCestDto>>.Ok(response));
    }

    [HttpGet("fiscal/sugestao-ncm")]
    [RequirePermission(Permissoes.VisualizarProduto)]
    public async Task<ActionResult<ApiResponse<ProdutoFiscalSugestaoNcmDto>>> BuscarSugestaoFiscalPorNcm(
        [FromQuery] ProdutoFiscalSugestaoNcmRequest request,
        CancellationToken cancellationToken)
    {
        var response = await produtoFiscalService.SugerirTributacaoPorNcmAsync(request, cancellationToken);
        return Ok(ApiResponse<ProdutoFiscalSugestaoNcmDto>.Ok(response));
    }

    [HttpGet]
    [RequirePermission(Permissoes.VisualizarProduto)]
    public async Task<ActionResult<ApiResponse<IReadOnlyCollection<ProdutoDto>>>> GetAll([FromQuery] string? termo, [FromQuery] bool? somenteAtivos)
    {
        var response = await produtoService.GetAllAsync(termo, somenteAtivos);
        return Ok(ApiResponse<IReadOnlyCollection<ProdutoDto>>.Ok(response));
    }

    [HttpGet("catalogo")]
    [RequirePermission(Permissoes.VisualizarCatalogoProdutos)]
    public async Task<ActionResult<ApiResponse<IReadOnlyCollection<ProdutoCatalogoItemDto>>>> GetCatalogo(
        [FromQuery] string? termo,
        [FromQuery] bool somenteDisponiveis = false,
        [FromQuery] bool visaoComprador = false)
    {
        var response = await produtoService.GetCatalogoAsync(termo, somenteDisponiveis, visaoComprador);
        return Ok(ApiResponse<IReadOnlyCollection<ProdutoCatalogoItemDto>>.Ok(response));
    }

    [HttpGet("buscar")]
    [RequirePermission(Permissoes.VisualizarProduto)]
    public async Task<ActionResult<ApiResponse<IReadOnlyCollection<ProdutoDto>>>> Buscar([FromQuery] string? termo)
    {
        var response = await produtoService.SearchAsync(termo);
        return Ok(ApiResponse<IReadOnlyCollection<ProdutoDto>>.Ok(response));
    }

    [HttpGet("codigo-barras/{codigo}")]
    [RequirePermission(Permissoes.VisualizarProduto)]
    public async Task<ActionResult<ApiResponse<ProdutoDto>>> GetByCodigoBarras(string codigo, [FromQuery] bool incluirInativos = false)
    {
        var response = await produtoService.GetByBarcodeAsync(codigo, incluirInativos);
        return Ok(ApiResponse<ProdutoDto>.Ok(response));
    }

    [HttpGet("campos-padrao")]
    [RequirePermission(Permissoes.VisualizarProduto)]
    public async Task<ActionResult<ApiResponse<IReadOnlyCollection<ProdutoCampoPadraoDto>>>> GetCamposPadrao()
    {
        var response = await produtoCampoPadraoService.GetAllAsync();
        return Ok(ApiResponse<IReadOnlyCollection<ProdutoCampoPadraoDto>>.Ok(response));
    }

    [HttpPut("campos-padrao")]
    [RequirePermission(Permissoes.EditarProduto)]
    public async Task<ActionResult<ApiResponse<IReadOnlyCollection<ProdutoCampoPadraoDto>>>> ReplaceCamposPadrao(
        [FromBody] IReadOnlyCollection<ProdutoCampoPadraoRequest>? request)
    {
        var response = await produtoCampoPadraoService.ReplaceAllAsync(request);
        return Ok(ApiResponse<IReadOnlyCollection<ProdutoCampoPadraoDto>>.Ok(response, "Campos padrao salvos com sucesso."));
    }

    [HttpGet("base-externa/status")]
    [RequirePermission(Permissoes.VisualizarProduto)]
    public ActionResult<ApiResponse<ProdutoBaseExternaStatusDto>> GetBaseExternaStatus()
    {
        var response = produtoCatalogoExternoService.GetStatus();
        return Ok(ApiResponse<ProdutoBaseExternaStatusDto>.Ok(response));
    }

    [HttpGet("base-externa/gtin/{gtin}")]
    [RequirePermission(Permissoes.VisualizarProduto)]
    public async Task<ActionResult<ApiResponse<ProdutoCatalogoExternoConsultaDto>>> ConsultarPorGtin(string gtin, CancellationToken cancellationToken)
    {
        var response = await produtoCatalogoExternoService.ConsultarPorGtinAsync(gtin, cancellationToken);
        return Ok(ApiResponse<ProdutoCatalogoExternoConsultaDto>.Ok(response));
    }

    [HttpGet("base-externa/busca")]
    [RequirePermission(Permissoes.VisualizarProduto)]
    public async Task<ActionResult<ApiResponse<ProdutoCatalogoExternoConsultaDto>>> ConsultarPorDescricao(
        [FromQuery] string termo,
        CancellationToken cancellationToken)
    {
        var response = await produtoCatalogoExternoService.ConsultarPorDescricaoAsync(termo, cancellationToken);
        return Ok(ApiResponse<ProdutoCatalogoExternoConsultaDto>.Ok(response));
    }

    [HttpGet("base-externa/comparativo")]
    [RequirePermission(Permissoes.VisualizarProduto)]
    public async Task<ActionResult<ApiResponse<ProdutoPesquisaPrecosDto>>> CompararPrecosPorDescricao(
        [FromQuery] string termo,
        CancellationToken cancellationToken)
    {
        var response = await produtoCatalogoExternoService.CompararPrecosPorDescricaoAsync(termo, cancellationToken);
        return Ok(ApiResponse<ProdutoPesquisaPrecosDto>.Ok(response));
    }

    [HttpPost("imagem-upload")]
    public async Task<ActionResult<ApiResponse<ProdutoImagemUploadDto>>> UploadImagemProduto(
        [FromForm] IFormFile arquivo,
        [FromForm] string? termoBusca,
        CancellationToken cancellationToken)
    {
        var storedImage = await produtoImagemStorageService.SaveAsync(arquivo, cancellationToken);
        var recognition = await produtoImagemReconhecimentoService.IdentificarAsync(
            storedImage,
            NormalizeOptionalSearchTerm(termoBusca),
            cancellationToken);
        var response = new ProdutoImagemUploadDto(
            BuildAbsoluteUrl(storedImage.CaminhoRelativo),
            storedImage.NomeArquivoOriginal,
            storedImage.TamanhoBytes,
            recognition.TermoBuscaEfetivo,
            recognition.TermoBuscaOrigem,
            recognition.DiagnosticoReconhecimento);

        return Ok(ApiResponse<ProdutoImagemUploadDto>.Ok(response, "Imagem do produto enviada com sucesso."));
    }

    [HttpGet("{id:guid}")]
    [RequirePermission(Permissoes.VisualizarProduto)]
    public async Task<ActionResult<ApiResponse<ProdutoDto>>> GetById(Guid id)
    {
        var response = await produtoService.GetByIdAsync(id);
        return Ok(ApiResponse<ProdutoDto>.Ok(response));
    }

    [HttpPost]
    [RequirePermission(Permissoes.CriarProduto)]
    public async Task<ActionResult<ApiResponse<ProdutoDto>>> Create([FromBody] ProdutoRequest request)
    {
        var response = await produtoService.CreateAsync(request);
        return Ok(ApiResponse<ProdutoDto>.Ok(response, "Produto criado com sucesso."));
    }

    [HttpPut("{id:guid}")]
    [RequirePermission(Permissoes.EditarProduto)]
    public async Task<ActionResult<ApiResponse<ProdutoDto>>> Update(Guid id, [FromBody] ProdutoRequest request)
    {
        var response = await produtoService.UpdateAsync(id, request);
        return Ok(ApiResponse<ProdutoDto>.Ok(response, "Produto atualizado com sucesso."));
    }

    [HttpDelete("{id:guid}")]
    [RequirePermission(Permissoes.ExcluirProduto)]
    public async Task<ActionResult<ApiResponse<object>>> Delete(Guid id, [FromQuery] bool permanente = false)
    {
        if (permanente)
        {
            await produtoService.DeletePermanentlyAsync(id);
            return Ok(ApiResponse<object>.Ok(null, "Produto excluido permanentemente com sucesso."));
        }

        await produtoService.ArchiveAsync(id);
        return Ok(ApiResponse<object>.Ok(null, "Produto inativado com sucesso."));
    }

    private string BuildAbsoluteUrl(string relativePath)
        => $"{Request.Scheme}://{Request.Host}{relativePath}";

    private static string? NormalizeOptionalSearchTerm(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
