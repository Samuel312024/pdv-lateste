using PDV.Api.Common;
using PDV.Api.Fiscal.DTOs;

namespace PDV.Api.Fiscal.Validators;

public static class NFeRequestValidator
{
    public static void ValidateOrThrow(NFeRequest request)
    {
        if (request.Itens.Count == 0)
        {
            throw new AppException("A NF-e precisa possuir pelo menos um item antes do envio ao provider fiscal.");
        }

        if (request.Pagamentos.Count == 0)
        {
            throw new AppException("A NF-e precisa possuir pelo menos um pagamento antes do envio ao provider fiscal.");
        }

        if (string.IsNullOrWhiteSpace(request.Emitente.Cnpj))
        {
            throw new AppException("O emitente da NF-e esta sem CNPJ.");
        }

        if (string.IsNullOrWhiteSpace(request.Emitente.Endereco.CodigoMunicipioIbge))
        {
            throw new AppException("O emitente da NF-e esta sem codigo IBGE do municipio.");
        }

        if (string.IsNullOrWhiteSpace(request.Destinatario.Nome))
        {
            throw new AppException("O destinatario da NF-e esta sem nome.");
        }

        foreach (var item in request.Itens)
        {
            if (string.IsNullOrWhiteSpace(item.Ncm))
            {
                throw new AppException($"O item {item.Nome} esta sem NCM.");
            }

            if (string.IsNullOrWhiteSpace(item.Cfop))
            {
                throw new AppException($"O item {item.Nome} esta sem CFOP.");
            }

            if (string.IsNullOrWhiteSpace(item.UnidadeComercial))
            {
                throw new AppException($"O item {item.Nome} esta sem unidade comercial.");
            }
        }
    }
}
