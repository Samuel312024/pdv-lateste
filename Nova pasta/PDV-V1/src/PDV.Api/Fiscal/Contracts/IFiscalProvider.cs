using PDV.Api.Domain;
using PDV.Api.Fiscal.DTOs;

namespace PDV.Api.Fiscal.Contracts;

public interface IFiscalProvider
{
    FiscalProvider Kind { get; }
    string DisplayName { get; }
    Task<EmitirNFeResult> EmitirNFeAsync(EmitirNFeRequest request);
    Task<ConsultarNFeResult> ConsultarNFeAsync(string referenciaOuId);
    Task<ConsultarNFeResult> SincronizarNFeAsync(string referenciaOuId);
    Task<CancelarNFeResult> CancelarNFeAsync(CancelarNFeRequest request);
    Task<FiscalEventoNFeResult> SolicitarCartaCorrecaoNFeAsync(CartaCorrecaoNFeRequest request);
    Task<EnviarEmailNFeResult> EnviarEmailNFeAsync(EnviarEmailNFeRequest request);
    Task<BaixarNFeDocumentoResult> BaixarDocumentoNFeAsync(BaixarNFeDocumentoRequest request);
    Task<InutilizarNFeResult> InutilizarNumeracaoNFeAsync(InutilizarNFeRequest request);
    Task<StatusServicoResult> ConsultarStatusServicoAsync();
}
