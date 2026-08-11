import axios from 'axios';

export function getErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return 'Nao foi possivel acessar a API. Verifique se o backend esta rodando e se o CORS foi liberado para o endereco do front.';
    }

    const apiMessage = error.response?.data?.message;
    const apiErrors = Array.isArray(error.response?.data?.errors)
      ? error.response.data.errors.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];

    if (apiErrors.length > 0) {
      return apiErrors.join(' | ');
    }

    if (typeof apiMessage === 'string' && apiMessage.trim().length > 0) {
      return apiMessage;
    }

    return `Nao foi possivel concluir a operacao. HTTP ${error.response.status}.`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Nao foi possivel concluir a operacao.';
}
