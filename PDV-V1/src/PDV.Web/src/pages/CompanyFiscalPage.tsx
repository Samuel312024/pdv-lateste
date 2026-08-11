import axios from 'axios';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import VerifiedRoundedIcon from '@mui/icons-material/VerifiedRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  FormControlLabel,
  Grid,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { type ChangeEvent, useDeferredValue, useEffect, useRef, useState } from 'react';
import { Loading } from '../components/common/Loading';
import { useAuth } from '../contexts/AuthContext';
import { cepService, type MunicipioLookupResult } from '../services/cepService';
import { cnpjService, type CnpjLookupResult } from '../services/cnpjService';
import {
  companyService,
  type EmpresaFiscalCertificadoTeste,
  type EmpresaFiscalSefazDiagnostico,
  type EmpresaFiscalPayload,
  type EmpresaFiscalSefazStatus
} from '../services/companyService';
import type { AmbienteFiscal, CobrancaDigitalProvider, EmpresaFiscal, EmpresaRegimeTributario, FiscalProvider } from '../types';
import { formatCep, formatCpfCnpj, formatPhone, isValidCnpj, onlyDigits } from '../utils/br';
import { getErrorMessage } from '../utils/http';
import { ufOptions } from '../utils/ufs';

const regimeOptions: Array<{ value: EmpresaRegimeTributario; label: string; helper: string }> = [
  { value: 'SimplesNacional', label: 'Simples Nacional', helper: 'Escolha mais comum para empresas enquadradas no Simples. Define CRT 1 na NF-e.' },
  { value: 'SimplesExcessoSublimite', label: 'Simples excesso sublimite', helper: 'Use quando a empresa continua no Simples, mas ultrapassou o sublimite do ICMS. Define CRT 2.' },
  { value: 'LucroPresumido', label: 'Lucro Presumido', helper: 'Regime fora do Simples com apuracao presumida. Afeta CST, ICMS, PIS e COFINS da nota.' },
  { value: 'LucroReal', label: 'Lucro Real', helper: 'Regime fora do Simples com apuracao real. Tambem altera CST, PIS, COFINS e validacoes fiscais.' },
  { value: 'RegimeNormal', label: 'Regime normal legado', helper: 'Use so como transicao quando a contabilidade ainda nao confirmou se a empresa esta em lucro presumido ou real.' }
];

const ambienteOptions: Array<{ value: AmbienteFiscal; label: string; helper: string }> = [
  { value: 'Homologacao', label: 'Homologacao', helper: 'Envia para a SEFAZ de testes. Serve para validar XML e fluxo sem gerar nota fiscal real.' },
  { value: 'Producao', label: 'Producao', helper: 'Envia para a SEFAZ oficial. Toda NF-e autorizada aqui passa a ter validade fiscal.' }
];

const providerOptions: Array<{ value: FiscalProvider; label: string; helper: string }> = [
  { value: 'NuvemFiscal', label: 'Nuvem Fiscal', helper: 'Provider REST recomendado para a fase 1 desta arquitetura. Mantem a base pronta para evoluir para SEFAZ direta depois.' },
  { value: 'FocusNFe', label: 'Focus NFe', helper: 'Provider ja previsto na arquitetura. O encaixe fino de payload permanece pronto para a proxima fase.' },
  { value: 'PlugNotas', label: 'PlugNotas / TecnoSpeed', helper: 'Provider ja previsto na arquitetura. O encaixe fino de payload permanece pronto para a proxima fase.' },
  { value: 'SefazDirect', label: 'SEFAZ direta', helper: 'Usa a integracao SOAP/XML propria do sistema. Mantenha esta opcao para a trilha direta.' }
];

const digitalChargeProviderOptions: Array<{ value: CobrancaDigitalProvider; label: string; helper: string }> = [
  { value: 'Efi', label: 'Efí Cobranças', helper: 'Gera cobrança profissional com QR Pix, linha digitável, link responsivo e PDF no mesmo fluxo.' },
  { value: 'Nenhum', label: 'Desabilitado', helper: 'Mantém o PDV apenas com registro manual ou assistido, sem geração de cobrança digital.' }
];

const emptyForm: EmpresaFiscalPayload = {
  nome: '',
  nomeFantasia: null,
  cnpj: null,
  inscricaoEstadual: null,
  inscricaoEstadualIsento: false,
  inscricaoMunicipal: null,
  cnaePrincipal: null,
  telefone: null,
  emailFiscal: null,
  cep: null,
  logradouro: null,
  numero: null,
  complemento: null,
  bairro: null,
  cidade: null,
  uf: null,
  codigoMunicipioIbge: null,
  certificadoDigitalCaminho: null,
  senhaCertificadoDigital: null,
  regimeTributario: 'SimplesNacional',
  ambienteNfe: 'Homologacao',
  providerFiscal: 'SefazDirect',
  usaIntegracaoDiretaSefaz: true,
  apiFiscalClientId: null,
  apiFiscalClientSecret: null,
  urlApiFiscal: null,
  tokenApiFiscal: null,
  cobrancaDigitalProvider: 'Nenhum',
  ambienteCobrancaDigital: 'Homologacao',
  apiCobrancaClientId: null,
  apiCobrancaClientSecret: null,
  urlApiCobranca: null,
  diasVencimentoCobranca: 3,
  serieNfe: 1,
  proximoNumeroNfe: 1
};

export function CompanyFiscalPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [certificateUploading, setCertificateUploading] = useState(false);
  const [certificateTesting, setCertificateTesting] = useState(false);
  const [sefazStatusTesting, setSefazStatusTesting] = useState(false);
  const [certificateSelectedName, setCertificateSelectedName] = useState<string | null>(null);
  const [certificateTestResult, setCertificateTestResult] = useState<EmpresaFiscalCertificadoTeste | null>(null);
  const [sefazStatusResult, setSefazStatusResult] = useState<EmpresaFiscalSefazStatus | null>(null);
  const [company, setCompany] = useState<EmpresaFiscal | null>(null);
  const [form, setForm] = useState<EmpresaFiscalPayload>(emptyForm);
  const [cnpjLookupLoading, setCnpjLookupLoading] = useState(false);
  const [cnpjLookupMessage, setCnpjLookupMessage] = useState<string | null>(null);
  const [lastFetchedCnpj, setLastFetchedCnpj] = useState<string | null>(null);
  const [cepLookupLoading, setCepLookupLoading] = useState(false);
  const [cepLookupMessage, setCepLookupMessage] = useState<string | null>(null);
  const [lastFetchedCep, setLastFetchedCep] = useState<string | null>(null);
  const [municipioSuggestions, setMunicipioSuggestions] = useState<MunicipioLookupResult[]>([]);
  const [municipioSuggestionsLoading, setMunicipioSuggestionsLoading] = useState(false);
  const [municipioResolveLoading, setMunicipioResolveLoading] = useState(false);
  const [municipioLookupMessage, setMunicipioLookupMessage] = useState<string | null>(null);
  const [lastResolvedMunicipioKey, setLastResolvedMunicipioKey] = useState<string | null>(null);
  const certificateInputRef = useRef<HTMLInputElement | null>(null);
  const fiscalCredentialsInputRef = useRef<HTMLInputElement | null>(null);
  const chargeCredentialsInputRef = useRef<HTMLInputElement | null>(null);
  const { enqueueSnackbar } = useSnackbar();
  const { hasPermission } = useAuth();
  const deferredMunicipioTerm = useDeferredValue(form.cidade ?? '');

  useEffect(() => {
    void loadCompanyFiscal();
  }, []);

  useEffect(() => {
    let active = true;
    const cidade = deferredMunicipioTerm.trim();
    const uf = (form.uf ?? '').trim().toUpperCase();

    if (!uf || cidade.length < 2) {
      setMunicipioSuggestions([]);
      setMunicipioSuggestionsLoading(false);
      return;
    }

    async function loadMunicipios() {
      setMunicipioSuggestionsLoading(true);
      try {
        const result = await cepService.searchMunicipios(cidade, uf, 12);
        if (active) {
          setMunicipioSuggestions(result);
        }
      } catch {
        if (active) {
          setMunicipioSuggestions([]);
        }
      } finally {
        if (active) {
          setMunicipioSuggestionsLoading(false);
        }
      }
    }

    void loadMunicipios();
    return () => {
      active = false;
    };
  }, [deferredMunicipioTerm, form.uf]);

  async function loadCompanyFiscal() {
    setLoading(true);
    try {
      const result = await companyService.getFiscal();
      setCompany(result);
      setForm(mapToPayload(result));
      setCertificateSelectedName(getCertificateFileName(result.certificadoDigitalCaminho));
      setLastFetchedCnpj(onlyDigits(result.cnpj) || null);
      setLastFetchedCep(onlyDigits(result.cep) || null);
      setCnpjLookupMessage(null);
      setCepLookupMessage(result.cep ? `CEP fiscal carregado: ${result.cep}` : null);
      setMunicipioSuggestions([]);
      setMunicipioSuggestionsLoading(false);
      setMunicipioResolveLoading(false);
      setMunicipioLookupMessage(
        result.codigoMunicipioIbge && result.cidade && result.uf
          ? `Municipio atual: ${result.cidade}/${result.uf} (${result.codigoMunicipioIbge}).`
          : null
      );
      setLastResolvedMunicipioKey(
        result.codigoMunicipioIbge && result.cidade && result.uf
          ? buildMunicipioResolutionKey(result.cidade, result.uf, result.codigoMunicipioIbge)
          : null
      );
      setCertificateTestResult(null);
      setSefazStatusResult(null);
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!hasPermission('GerenciarEmpresaFiscal')) {
      enqueueSnackbar('Seu perfil nao possui permissao para alterar a configuracao fiscal da empresa.', { variant: 'warning' });
      return;
    }

    setSaving(true);
    try {
      const result = await companyService.updateFiscal(form);
      setCompany(result);
      setForm(mapToPayload(result));
      setCertificateSelectedName(getCertificateFileName(result.certificadoDigitalCaminho));
      setLastFetchedCnpj(onlyDigits(result.cnpj) || null);
      setLastFetchedCep(onlyDigits(result.cep) || null);
      setCepLookupMessage(result.cep ? `CEP fiscal confirmado: ${result.cep}` : null);
      setMunicipioLookupMessage(
        result.codigoMunicipioIbge && result.cidade && result.uf
          ? `Municipio confirmado: ${result.cidade}/${result.uf} (${result.codigoMunicipioIbge}).`
          : null
      );
      setLastResolvedMunicipioKey(
        result.codigoMunicipioIbge && result.cidade && result.uf
          ? buildMunicipioResolutionKey(result.cidade, result.uf, result.codigoMunicipioIbge)
          : null
      );
      setCertificateTestResult(null);
      setSefazStatusResult(null);
      enqueueSnackbar('Configuracao fiscal da empresa salva com sucesso.', { variant: 'success' });
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  function updateForm<Key extends keyof EmpresaFiscalPayload>(key: Key, value: EmpresaFiscalPayload[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
    setSefazStatusResult(null);
  }

  function applyMunicipioSelection(municipio: MunicipioLookupResult) {
    setForm((current) => ({
      ...current,
      cidade: municipio.nome,
      uf: municipio.uf,
      codigoMunicipioIbge: municipio.codigoIbge
    }));
    setMunicipioLookupMessage(`Municipio confirmado pelo IBGE: ${municipio.nome}/${municipio.uf} (${municipio.codigoIbge}).`);
    setLastResolvedMunicipioKey(buildMunicipioResolutionKey(municipio.nome, municipio.uf, municipio.codigoIbge));
  }

  function clearMunicipioResolution() {
    setMunicipioLookupMessage(null);
    setLastResolvedMunicipioKey(null);
  }

  function handleCidadeInputChange(nextValue: string | null) {
    setForm((current) => ({
      ...current,
      cidade: nextValue,
      codigoMunicipioIbge: null
    }));
    clearMunicipioResolution();
  }

  function handleUfChange(nextValue: string | null) {
    setForm((current) => ({
      ...current,
      uf: nextValue,
      codigoMunicipioIbge: null
    }));
    clearMunicipioResolution();
  }

  async function resolveMunicipioValues(
    cidadeValue: string | null | undefined,
    ufValue: string | null | undefined,
    codigoValue: string | null | undefined,
    force = false
  ) {
    const cidade = emptyToNull(cidadeValue);
    const uf = emptyToNull(ufValue)?.toUpperCase() ?? null;
    const codigoIbge = onlyDigits(codigoValue);
    const hasQuery = Boolean(codigoIbge) || Boolean(cidade && uf);
    const resolutionKey = buildMunicipioResolutionKey(cidade, uf, codigoIbge);

    if (!hasQuery) {
      return;
    }

    if (!force && resolutionKey === lastResolvedMunicipioKey) {
      return;
    }

    setMunicipioResolveLoading(true);
    try {
      const result = await cepService.resolveMunicipio({
        cidade,
        uf,
        codigoIbge
      });

      if (result) {
        applyMunicipioSelection(result);
        return;
      }

      setLastResolvedMunicipioKey(null);
      setMunicipioLookupMessage(
        cidade && uf
          ? `Nao encontramos ${cidade}/${uf} na base do IBGE. Escolha a cidade da lista para confirmar o codigo.`
          : 'Nao foi possivel confirmar o municipio informado.'
      );
    } catch (error) {
      setLastResolvedMunicipioKey(null);
      setMunicipioLookupMessage('Nao foi possivel validar o municipio agora.');
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setMunicipioResolveLoading(false);
    }
  }

  async function resolveMunicipio(force = false) {
    await resolveMunicipioValues(form.cidade, form.uf, form.codigoMunicipioIbge, force);
  }

  function openCertificatePicker() {
    certificateInputRef.current?.click();
  }

  function openCredentialFilePicker(target: 'fiscal' | 'cobranca') {
    if (target === 'fiscal') {
      fiscalCredentialsInputRef.current?.click();
      return;
    }

    chargeCredentialsInputRef.current?.click();
  }

  async function handleCertificateSelected(event: ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];
    event.target.value = '';

    if (!arquivo) {
      return;
    }

    setCertificateUploading(true);

    try {
      const result = await companyService.uploadFiscalCertificate(arquivo);
      updateForm('certificadoDigitalCaminho', result.caminho);
      setCertificateSelectedName(arquivo.name);
      setCertificateTestResult(null);
      enqueueSnackbar('Arquivo do certificado enviado. Agora confirme a senha e salve a configuracao fiscal.', { variant: 'success' });
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setCertificateUploading(false);
    }
  }

  function clearSelectedCertificate() {
    updateForm('certificadoDigitalCaminho', null);
    setCertificateSelectedName(null);
    setCertificateTestResult(null);
  }

  async function handleCredentialCsvSelected(event: ChangeEvent<HTMLInputElement>, target: 'fiscal' | 'cobranca') {
    const arquivo = event.target.files?.[0];
    event.target.value = '';

    if (!arquivo) {
      return;
    }

    try {
      const conteudo = await arquivo.text();
      const credentials = parseCredentialCsvText(conteudo, target === 'fiscal' ? form.ambienteNfe : form.ambienteCobrancaDigital);
      if (target === 'fiscal') {
        setForm((current) => ({
          ...current,
          providerFiscal: 'NuvemFiscal',
          usaIntegracaoDiretaSefaz: false,
          apiFiscalClientId: credentials.clientId,
          apiFiscalClientSecret: credentials.clientSecret
        }));
        setSefazStatusResult(null);
        enqueueSnackbar('CSV importado na configuracao da Nuvem Fiscal. Revise o ambiente e salve para testar.', { variant: 'success' });
        return;
      }

      setForm((current) => ({
        ...current,
        cobrancaDigitalProvider: 'Efi',
        apiCobrancaClientId: credentials.clientId,
        apiCobrancaClientSecret: credentials.clientSecret
      }));
      enqueueSnackbar(`CSV importado na configuracao de cobranca Efí para ${form.ambienteCobrancaDigital.toLowerCase()}. Salve para ativar o checkout real.`, { variant: 'success' });
    } catch (error) {
      enqueueSnackbar(error instanceof Error ? error.message : 'Nao foi possivel importar o CSV de credenciais.', { variant: 'error' });
    }
  }

  async function handleTestCertificate() {
    if (!form.certificadoDigitalCaminho) {
      enqueueSnackbar('Selecione um arquivo PFX antes de testar o certificado.', { variant: 'warning' });
      return;
    }

    setCertificateTesting(true);
    try {
      const result = await companyService.testFiscalCertificate({
        caminho: form.certificadoDigitalCaminho,
        senha: form.senhaCertificadoDigital
      });

      setCertificateTestResult(result);
      enqueueSnackbar(result.mensagem, {
        variant: result.valido && result.provavelmenteCompativelIcpBrasilA1 ? 'success' : 'warning'
      });
    } catch (error) {
      const message =
        axios.isAxiosError(error) && error.response?.status === 404
          ? 'A API em execucao ainda nao carregou o endpoint de teste do certificado. Reinicie o backend e tente novamente.'
          : getErrorMessage(error);
      setCertificateTestResult({
        valido: false,
        mensagem: message,
        caminho: form.certificadoDigitalCaminho,
        validoAte: null,
        provavelmenteCompativelIcpBrasilA1: false,
        certificadoDesenvolvimento: false,
        cnpjCertificado: null,
        cnpjConfereComEmpresa: null,
        diagnosticoCompatibilidade: null
      });
      enqueueSnackbar(message, { variant: axios.isAxiosError(error) && error.response?.status === 404 ? 'warning' : 'error' });
    } finally {
      setCertificateTesting(false);
    }
  }

  async function handleTestSefazStatus() {
    if (!company) {
      enqueueSnackbar('Carregue a configuracao fiscal da empresa antes de testar o canal fiscal.', { variant: 'warning' });
      return;
    }

    const savedDirectIntegration = company.usaIntegracaoDiretaSefaz || company.providerFiscal === 'SefazDirect';
    const savedUsesNuvemFiscalOauth = !savedDirectIntegration && company.providerFiscal === 'NuvemFiscal';

    if (savedDirectIntegration && !company.certificadoDigitalCaminho) {
      enqueueSnackbar('Salve um certificado digital na empresa antes de testar a integracao direta com a SEFAZ.', { variant: 'warning' });
      return;
    }

    if (savedUsesNuvemFiscalOauth && !company.tokenApiFiscalConfigurado && (!company.apiFiscalClientId || !company.apiFiscalClientSecretConfigurado)) {
      enqueueSnackbar('Salve o Client ID e o Client Secret da Nuvem Fiscal antes de testar o provider REST.', { variant: 'warning' });
      return;
    }

    if (savedUsesNuvemFiscalOauth && !company.certificadoDigitalCaminho) {
      enqueueSnackbar('Salve tambem o certificado digital local da empresa. A Nuvem Fiscal precisa dele para sincronizar o emitente antes do status e da emissao.', { variant: 'warning' });
      return;
    }

    if (!savedDirectIntegration && !savedUsesNuvemFiscalOauth && !company.tokenApiFiscalConfigurado) {
      enqueueSnackbar('Salve o token da API fiscal antes de testar o provider REST.', { variant: 'warning' });
      return;
    }

    if (!sefazConfigMatchesSaved) {
      enqueueSnackbar('Salve a configuracao fiscal atual antes de testar o canal fiscal, para garantir que ambiente, provider e credenciais estejam sincronizados.', {
        variant: 'warning'
      });
      return;
    }

    setSefazStatusTesting(true);
    try {
      const result = await companyService.testSefazStatus();
      setSefazStatusResult(result);
      enqueueSnackbar(result.mensagem, { variant: result.disponivel ? 'success' : 'warning' });
    } catch (error) {
      const message =
        axios.isAxiosError(error) && error.response?.status === 404
          ? 'A API em execucao ainda nao carregou o endpoint de teste do canal fiscal. Reinicie o backend e tente novamente.'
          : getErrorMessage(error);

      setSefazStatusResult({
        disponivel: false,
        codigoStatus: null,
        mensagem: message,
        providerFiscal: company.providerFiscal,
        usaIntegracaoDiretaSefaz: company.usaIntegracaoDiretaSefaz,
        ambiente: company.ambienteNfe,
        uf: company.uf ?? form.uf ?? '',
        url: resolveFiscalStatusFallbackUrl(company),
        dataRecebimento: null,
        consultadoEmUtc: new Date().toISOString(),
        diagnostico: null
      });
      enqueueSnackbar(message, { variant: axios.isAxiosError(error) && error.response?.status === 404 ? 'warning' : 'error' });
    } finally {
      setSefazStatusTesting(false);
    }
  }

  async function lookupCnpj(force = false) {
    const digits = onlyDigits(form.cnpj);
    if (!digits || digits.length !== 14 || !isValidCnpj(digits)) {
      return;
    }

    if (!force && lastFetchedCnpj === digits) {
      return;
    }

    setCnpjLookupLoading(true);
    setCnpjLookupMessage('Consultando CNPJ da empresa...');

    try {
      const result = await cnpjService.lookup(digits);
      setForm((current) => mergeFiscalFormWithCnpjResult(current, result));
      setLastFetchedCnpj(digits);
      setCnpjLookupMessage(buildCompanyCnpjLookupMessage(result));
      setLastFetchedCep(onlyDigits(result.cep) || null);
      setCepLookupMessage(result.cep ? `CEP preenchido a partir do CNPJ: ${result.cep}` : null);
      setMunicipioLookupMessage(
        result.codigoMunicipioIbge && result.cidade && result.uf
          ? `Municipio confirmado pelo cadastro oficial: ${result.cidade}/${result.uf} (${result.codigoMunicipioIbge}).`
          : null
      );
      setLastResolvedMunicipioKey(
        result.codigoMunicipioIbge && result.cidade && result.uf
          ? buildMunicipioResolutionKey(result.cidade, result.uf, result.codigoMunicipioIbge)
          : null
      );
    } catch (error) {
      setLastFetchedCnpj(null);
      setCnpjLookupMessage('Nao foi possivel preencher os dados fiscais com esse CNPJ.');
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setCnpjLookupLoading(false);
    }
  }

  async function lookupCep(force = false) {
    const digits = onlyDigits(form.cep);
    if (!digits || digits.length !== 8) {
      return;
    }

    if (!force && lastFetchedCep === digits) {
      return;
    }

    setCepLookupLoading(true);
    setCepLookupMessage('Consultando CEP fiscal...');

    try {
      const result = await cepService.lookup(digits);
      setForm((current) => ({
        ...current,
        cep: result.cep,
        logradouro: result.logradouro,
        complemento: current.complemento ?? result.complemento,
        bairro: result.bairro,
        cidade: result.cidade,
        uf: result.uf,
        codigoMunicipioIbge: result.codigoMunicipioIbge
      }));
      setLastFetchedCep(onlyDigits(result.cep));
      setCepLookupMessage(`CEP localizado: ${result.cidade}/${result.uf}`);

      if (result.codigoMunicipioIbge) {
        setMunicipioLookupMessage(`Municipio confirmado pelo CEP: ${result.cidade}/${result.uf} (${result.codigoMunicipioIbge}).`);
        setLastResolvedMunicipioKey(buildMunicipioResolutionKey(result.cidade, result.uf, result.codigoMunicipioIbge));
      } else {
        clearMunicipioResolution();
        await resolveMunicipioValues(result.cidade, result.uf, null, true);
      }
    } catch (error) {
      setLastFetchedCep(null);
      setCepLookupMessage('Nao foi possivel preencher o endereco fiscal com esse CEP.');
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setCepLookupLoading(false);
    }
  }

  if (loading) {
    return <Loading message="Carregando configuracao fiscal da empresa..." />;
  }

  if (!hasPermission('GerenciarEmpresaFiscal')) {
    return (
      <Alert severity="error" sx={{ borderRadius: 4 }}>
        Seu perfil nao possui acesso a configuracao fiscal da empresa.
      </Alert>
    );
  }

  const readinessAlert = company?.prontaParaNfe ? (
    <Alert severity="success" icon={<VerifiedRoundedIcon fontSize="inherit" />} sx={{ borderRadius: 4 }}>
      Base fiscal pronta para iniciar o modulo de NF-e. O proximo passo passa a ser certificado, XML e integracao com a SEFAZ.
    </Alert>
  ) : (
    <Alert severity="warning" icon={<WarningAmberRoundedIcon fontSize="inherit" />} sx={{ borderRadius: 4 }}>
      Ainda faltam ajustes antes de partir para a NF-e real. Revise as pendencias abaixo e salve novamente.
    </Alert>
  );
  const digitalChargeReadinessAlert = company?.cobrancaDigitalPronta ? (
    <Alert severity="success" icon={<VerifiedRoundedIcon fontSize="inherit" />} sx={{ borderRadius: 4 }}>
      Cobrança digital pronta para gerar QR Pix, link de boleto e PDF com a Efí.
    </Alert>
  ) : (
    <Alert severity="info" icon={<WarningAmberRoundedIcon fontSize="inherit" />} sx={{ borderRadius: 4 }}>
      Pix e boleto integrados ainda dependem de configuração. Preencha o provider de cobrança digital abaixo para liberar geração real no PDV e no financeiro.
    </Alert>
  );

  const certificateDisplayPath = form.certificadoDigitalCaminho ?? '';
  const certificateHelperText = buildCertificateHelperText(form.certificadoDigitalCaminho, certificateSelectedName, certificateUploading);
  const certificateError = company?.certificadoDigitalErroValidacao ?? null;
  const certificatePathMatchesSaved = company?.certificadoDigitalCaminho === form.certificadoDigitalCaminho;
  const directIntegrationSelected = form.usaIntegracaoDiretaSefaz || form.providerFiscal === 'SefazDirect';
  const usesNuvemFiscalOauth = !directIntegrationSelected && form.providerFiscal === 'NuvemFiscal';
  const secretFieldsDirty = Boolean(
    form.senhaCertificadoDigital?.trim()
    || form.tokenApiFiscal?.trim()
    || form.apiFiscalClientSecret?.trim()
  );
  const sefazConfigMatchesSaved = Boolean(
    company
    && company.ambienteNfe === form.ambienteNfe
    && company.providerFiscal === form.providerFiscal
    && company.usaIntegracaoDiretaSefaz === form.usaIntegracaoDiretaSefaz
    && company.uf === form.uf
    && company.apiFiscalClientId === form.apiFiscalClientId
    && company.urlApiFiscal === form.urlApiFiscal
    && (!directIntegrationSelected || company.certificadoDigitalCaminho === form.certificadoDigitalCaminho)
    && !secretFieldsDirty
  );
  const certificateValidationAlert = buildCertificateValidationAlert(company, form, certificateTestResult, certificateTesting);
  const certificateStatusLabel = resolveCertificateStatusLabel(
    company,
    form,
    certificateTestResult,
    certificateTesting);
  const sefazStatusSeverity = resolveSefazStatusSeverity(sefazStatusResult);
  const sefazDiagnostic = sefazStatusResult?.diagnostico ?? null;
  const statusTestDisabled = !company
    || certificateUploading
    || certificateTesting
    || sefazStatusTesting
    || (directIntegrationSelected
      ? !company.certificadoDigitalCaminho
      : usesNuvemFiscalOauth
        ? ((!company.apiFiscalClientId || !company.apiFiscalClientSecretConfigurado) && !company.tokenApiFiscalConfigurado) || !company.certificadoDigitalCaminho
        : !company.tokenApiFiscalConfigurado);

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">Configuracao fiscal da empresa</Typography>
        <Typography color="text.secondary">
          Centralize os dados cadastrais e fiscais que vao sustentar a emissao real de NF-e nos proximos passos.
        </Typography>
      </Box>

      {readinessAlert}
      {digitalChargeReadinessAlert}

      <Grid container spacing={2.5}>
        <Grid item xs={12} xl={9}>
          <Card sx={{ borderRadius: 5 }}>
            <CardContent sx={{ p: { xs: 2, md: 3 } }}>
              <Stack spacing={3}>
                <input
                  ref={fiscalCredentialsInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  hidden
                  onChange={(event) => void handleCredentialCsvSelected(event, 'fiscal')}
                />
                <input
                  ref={chargeCredentialsInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  hidden
                  onChange={(event) => void handleCredentialCsvSelected(event, 'cobranca')}
                />
                <Box>
                  <Typography variant="h6">Identificacao fiscal</Typography>
                  <Typography color="text.secondary">
                    Razao social, documento, regime e contatos principais usados na emissao.
                  </Typography>
                </Box>

                <Grid container spacing={2} alignItems="flex-start">
                  <Grid item xs={12} lg={7}>
                    <TextField
                      label="Razao social"
                      value={form.nome}
                      onChange={(event) => updateForm('nome', event.target.value)}
                      fullWidth
                      required
                    />
                  </Grid>
                  <Grid item xs={12} lg={5}>
                    <TextField
                      label="CNPJ"
                      value={formatCpfCnpj(form.cnpj)}
                      onChange={(event) => {
                        const nextValue = formatCpfCnpj(event.target.value) || null;
                        updateForm('cnpj', nextValue);

                        if (onlyDigits(nextValue) !== lastFetchedCnpj) {
                          setCnpjLookupMessage(null);
                        }
                      }}
                      onBlur={() => void lookupCnpj()}
                      helperText={cnpjLookupLoading ? 'Consultando CNPJ...' : cnpjLookupMessage ?? 'Use o CNPJ para completar razao social, IE, CNAE e endereco fiscal.'}
                      fullWidth
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            {cnpjLookupLoading ? (
                              <CircularProgress size={18} />
                            ) : (
                              <IconButton
                                edge="end"
                                size="small"
                                onClick={() => void lookupCnpj(true)}
                                disabled={onlyDigits(form.cnpj).length !== 14 || !isValidCnpj(form.cnpj)}
                              >
                                <SearchRoundedIcon fontSize="small" />
                              </IconButton>
                            )}
                          </InputAdornment>
                        )
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} md={6} lg={4}>
                    <TextField
                      label="Nome fantasia"
                      value={form.nomeFantasia ?? ''}
                      onChange={(event) => updateForm('nomeFantasia', event.target.value || null)}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={6} lg={4}>
                    <TextField
                      label="Inscricao estadual"
                      value={form.inscricaoEstadual ?? ''}
                      onChange={(event) => updateForm('inscricaoEstadual', event.target.value || null)}
                      fullWidth
                      disabled={form.inscricaoEstadualIsento}
                      helperText={form.inscricaoEstadualIsento ? 'Marque apenas se a empresa realmente for isenta de IE.' : 'Tentamos preencher automaticamente quando o provedor retorna a IE.'}
                    />
                  </Grid>
                  <Grid item xs={12} md={6} lg={4}>
                    <TextField
                      label="Inscricao municipal"
                      value={form.inscricaoMunicipal ?? ''}
                      onChange={(event) => updateForm('inscricaoMunicipal', event.target.value || null)}
                      helperText="Use quando houver cadastro municipal para servicos ou exigencia local."
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={6} lg={4}>
                    <Box
                      sx={{
                        minHeight: 56,
                        px: 1.5,
                        display: 'flex',
                        alignItems: 'center',
                        border: '1px solid rgba(23, 75, 138, 0.18)',
                        borderRadius: 3,
                        bgcolor: '#ffffff'
                      }}
                    >
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={form.inscricaoEstadualIsento}
                            onChange={(event) => updateForm('inscricaoEstadualIsento', event.target.checked)}
                          />
                        }
                        label="Empresa isenta de IE"
                        sx={{ m: 0 }}
                      />
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                      Marque apenas se a empresa realmente nao possuir inscricao estadual.
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={6} lg={4}>
                    <TextField
                      label="CNAE principal"
                      value={form.cnaePrincipal ?? ''}
                      onChange={(event) => updateForm('cnaePrincipal', event.target.value || null)}
                      helperText="Quando disponivel, o codigo vem automaticamente da consulta do CNPJ."
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={6} lg={4}>
                    <TextField
                      label="Telefone fiscal"
                      value={form.telefone ?? ''}
                      onChange={(event) => updateForm('telefone', formatPhone(event.target.value) || null)}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={6} lg={4}>
                    <TextField
                      label="E-mail fiscal"
                      value={form.emailFiscal ?? ''}
                      onChange={(event) => updateForm('emailFiscal', event.target.value || null)}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={6} lg={4}>
                    <Stack spacing={0.75}>
                      <TextField
                        select
                        label="Regime tributario"
                        value={form.regimeTributario}
                        onChange={(event) => updateForm('regimeTributario', event.target.value as EmpresaRegimeTributario)}
                        fullWidth
                      >
                        {regimeOptions.map((option) => (
                          <MenuItem key={option.value} value={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </TextField>
                      <Typography variant="body2" color="text.secondary">
                        {regimeOptions.find((option) => option.value === form.regimeTributario)?.helper}
                      </Typography>
                    </Stack>
                  </Grid>
                  <Grid item xs={12} md={6} lg={4}>
                    <Stack spacing={0.75}>
                      <TextField
                        select
                        label="Ambiente NF-e"
                        value={form.ambienteNfe}
                        onChange={(event) => updateForm('ambienteNfe', event.target.value as AmbienteFiscal)}
                        fullWidth
                      >
                        {ambienteOptions.map((option) => (
                          <MenuItem key={option.value} value={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </TextField>
                      <Typography variant="body2" color="text.secondary">
                        {ambienteOptions.find((option) => option.value === form.ambienteNfe)?.helper}
                      </Typography>
                    </Stack>
                  </Grid>
                  <Grid item xs={12}>
                    <Alert severity="info" sx={{ borderRadius: 4 }}>
                      O regime tributario muda a base fiscal da NF-e e deve seguir a orientacao da contabilidade. O ambiente NF-e define se a nota
                      vai para testes da SEFAZ ou para emissao real em producao.
                    </Alert>
                  </Grid>
                </Grid>

                <Box>
                  <Typography variant="h6">Integracao fiscal</Typography>
                  <Typography color="text.secondary">
                    Escolha se a emissao vai sair por provider REST nesta fase ou pela trilha direta com a SEFAZ.
                  </Typography>
                </Box>

                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <Stack spacing={0.75}>
                      <TextField
                        select
                        label="Provider fiscal"
                        value={form.providerFiscal}
                        onChange={(event) => {
                          const value = event.target.value as FiscalProvider;
                          setForm((current) => ({
                            ...current,
                            providerFiscal: value,
                            usaIntegracaoDiretaSefaz: value === 'SefazDirect' ? true : current.usaIntegracaoDiretaSefaz
                          }));
                          setSefazStatusResult(null);
                        }}
                        fullWidth
                      >
                        {providerOptions.map((option) => (
                          <MenuItem key={option.value} value={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </TextField>
                      <Typography variant="body2" color="text.secondary">
                        {providerOptions.find((option) => option.value === form.providerFiscal)?.helper}
                      </Typography>
                    </Stack>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Box
                      sx={{
                        minHeight: 56,
                        px: 1.5,
                        display: 'flex',
                        alignItems: 'center',
                        border: '1px solid rgba(23, 75, 138, 0.18)',
                        borderRadius: 3,
                        bgcolor: '#ffffff'
                      }}
                    >
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={directIntegrationSelected}
                            disabled={form.providerFiscal === 'SefazDirect'}
                            onChange={(event) => updateForm('usaIntegracaoDiretaSefaz', event.target.checked)}
                          />
                        }
                        label="Usar integracao direta com a SEFAZ"
                        sx={{ m: 0 }}
                      />
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                      {directIntegrationSelected
                        ? 'O sistema usa certificado local, assinatura interna e transporte direto.'
                        : usesNuvemFiscalOauth
                          ? 'O sistema usa Client ID + Client Secret da Nuvem Fiscal para gerar e renovar o access_token automaticamente.'
                          : 'O sistema usa token REST do provider fiscal agora, mantendo a trilha direta preparada para a proxima fase.'}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="URL da API fiscal"
                      value={form.urlApiFiscal ?? ''}
                      onChange={(event) => updateForm('urlApiFiscal', event.target.value || null)}
                      helperText={resolveProviderUrlHint(form.providerFiscal, form.ambienteNfe)}
                      disabled={directIntegrationSelected}
                      fullWidth
                    />
                  </Grid>
                  {usesNuvemFiscalOauth ? (
                    <>
                      <Grid item xs={12} md={6}>
                        <TextField
                          label="Client ID da Nuvem Fiscal"
                          value={form.apiFiscalClientId ?? ''}
                          onChange={(event) => updateForm('apiFiscalClientId', event.target.value || null)}
                          helperText={
                            company?.apiFiscalClientId
                              ? 'Ja existe Client ID salvo. Altere apenas se trocar a aplicacao da Nuvem Fiscal ou o ambiente da credencial.'
                              : form.ambienteNfe === 'Homologacao'
                                ? 'Em homologacao, use um Client ID da credencial Sandbox da Nuvem Fiscal.'
                                : 'Em producao, use um Client ID da credencial de Producao da Nuvem Fiscal.'
                          }
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <TextField
                          label="Client Secret da Nuvem Fiscal"
                          type="password"
                          value={form.apiFiscalClientSecret ?? ''}
                          onChange={(event) => updateForm('apiFiscalClientSecret', event.target.value || null)}
                          helperText={
                            company?.apiFiscalClientSecretConfigurado
                              ? 'Ja existe Client Secret salvo. Preencha novamente apenas se quiser trocar o valor.'
                              : form.ambienteNfe === 'Homologacao'
                                ? 'Use o Client Secret da mesma credencial Sandbox importada ou gerada no console.'
                                : 'Use o Client Secret da mesma credencial de Producao importada ou gerada no console.'
                          }
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                          <Button variant="outlined" onClick={() => openCredentialFilePicker('fiscal')}>
                            Importar CSV da Nuvem Fiscal
                          </Button>
                          <Alert severity="info" sx={{ flex: 1, borderRadius: 4 }}>
                            Homologacao usa credencial <strong>Sandbox</strong> e Producao usa credencial <strong>Producao</strong>.
                            Se o token voltar com <strong>invalid_client</strong>, normalmente o par foi trocado, e o CSV ajuda a evitar erro de copia.
                          </Alert>
                        </Stack>
                      </Grid>
                      <Grid item xs={12}>
                        <Alert severity={company?.tokenApiFiscalConfigurado ? 'warning' : 'info'} sx={{ borderRadius: 4 }}>
                          {company?.tokenApiFiscalConfigurado
                            ? 'Existe um token manual legado salvo, mas quando Client ID e Client Secret estiverem configurados a Nuvem Fiscal passa a usar o fluxo OAuth automatico como prioridade.'
                            : 'Com Client ID e Client Secret salvos, o sistema gera e renova o token sozinho. Voce nao precisa colar access_token manualmente nesta tela.'}
                        </Alert>
                      </Grid>
                    </>
                  ) : !directIntegrationSelected ? (
                    <Grid item xs={12} md={6}>
                      <TextField
                        label="Token da API fiscal"
                        type="password"
                        value={form.tokenApiFiscal ?? ''}
                        onChange={(event) => updateForm('tokenApiFiscal', event.target.value || null)}
                        helperText={
                          company?.tokenApiFiscalConfigurado
                            ? 'Ja existe token salvo. Preencha novamente apenas se quiser trocar o valor.'
                            : 'Obrigatorio para providers REST externos.'
                        }
                        fullWidth
                      />
                    </Grid>
                  ) : null}
                  <Grid item xs={12}>
                    <Alert severity={directIntegrationSelected ? 'info' : 'success'} sx={{ borderRadius: 4 }}>
                      {directIntegrationSelected
                        ? 'Modo atual: integracao direta. O provider selecionado fica salvo como trilha futura, mas a emissao desta empresa continua indo direto para a SEFAZ.'
                        : usesNuvemFiscalOauth
                          ? 'Modo atual: provider REST Nuvem Fiscal com OAuth automatico. O PDV continua desacoplado e preparado para migrar para SEFAZ direta sem reescrever as telas.'
                          : `Modo atual: provider REST ${providerOptions.find((option) => option.value === form.providerFiscal)?.label ?? form.providerFiscal}. O PDV continua desacoplado e preparado para migrar para SEFAZ direta sem reescrever as telas.`}
                    </Alert>
                  </Grid>
                </Grid>

                <Box>
                  <Typography variant="h6">Cobranca digital</Typography>
                  <Typography color="text.secondary">
                    Configure o provider que vai gerar QR Pix, linha digitavel, link do boleto e PDF da cobranca.
                  </Typography>
                </Box>

                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <Stack spacing={0.75}>
                      <TextField
                        select
                        label="Provider de cobranca"
                        value={form.cobrancaDigitalProvider}
                        onChange={(event) => updateForm('cobrancaDigitalProvider', event.target.value as CobrancaDigitalProvider)}
                        fullWidth
                      >
                        {digitalChargeProviderOptions.map((option) => (
                          <MenuItem key={option.value} value={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </TextField>
                      <Typography variant="body2" color="text.secondary">
                        {digitalChargeProviderOptions.find((option) => option.value === form.cobrancaDigitalProvider)?.helper}
                      </Typography>
                    </Stack>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Stack spacing={0.75}>
                      <TextField
                        select
                        label="Ambiente da cobranca"
                        value={form.ambienteCobrancaDigital}
                        onChange={(event) => updateForm('ambienteCobrancaDigital', event.target.value as AmbienteFiscal)}
                        disabled={form.cobrancaDigitalProvider === 'Nenhum'}
                        fullWidth
                      >
                        {ambienteOptions.map((option) => (
                          <MenuItem key={option.value} value={option.value}>
                            {option.label}
                          </MenuItem>
                        ))}
                      </TextField>
                      <Typography variant="body2" color="text.secondary">
                        Use homologacao para validar QR, boleto e retorno sem depender do ambiente real.
                      </Typography>
                    </Stack>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <TextField
                      label="Dias padrao de vencimento"
                      type="number"
                      value={form.diasVencimentoCobranca}
                      onChange={(event) => updateForm('diasVencimentoCobranca', Math.max(1, Number(event.target.value) || 1))}
                      helperText="Padrao usado nas cobrancas criadas pelo financeiro."
                      inputProps={{ min: 1, max: 120 }}
                      disabled={form.cobrancaDigitalProvider === 'Nenhum'}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="Client ID da cobranca"
                      value={form.apiCobrancaClientId ?? ''}
                      onChange={(event) => updateForm('apiCobrancaClientId', event.target.value || null)}
                      helperText={
                        company?.apiCobrancaClientId
                          ? 'Ja existe Client ID salvo. Altere apenas se trocar a aplicacao da Efí.'
                          : form.ambienteCobrancaDigital === 'Homologacao'
                            ? 'Use o Client ID da aplicacao de homologacao da Efí.'
                            : 'Use o Client ID da aplicacao de producao da Efí.'
                      }
                      disabled={form.cobrancaDigitalProvider === 'Nenhum'}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      label="Client Secret da cobranca"
                      type="password"
                      value={form.apiCobrancaClientSecret ?? ''}
                      onChange={(event) => updateForm('apiCobrancaClientSecret', event.target.value || null)}
                      helperText={
                        company?.apiCobrancaClientSecretConfigurado
                          ? 'Ja existe Client Secret salvo. Preencha novamente apenas se quiser trocar o valor.'
                          : form.ambienteCobrancaDigital === 'Homologacao'
                            ? 'Use o Client Secret da mesma aplicacao de homologacao.'
                            : 'Use o Client Secret da mesma aplicacao de producao.'
                      }
                      disabled={form.cobrancaDigitalProvider === 'Nenhum'}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                      <Button
                        variant="outlined"
                        onClick={() => openCredentialFilePicker('cobranca')}
                        disabled={form.cobrancaDigitalProvider === 'Nenhum'}
                      >
                        Importar CSV da Efí
                      </Button>
                      <Alert severity="info" sx={{ flex: 1, borderRadius: 4 }}>
                        Pix e boleto funcionam logo apos a configuracao. Para cartao de credito por link da Efí, a conta precisa
                        estar com KYC/habilitacao liberados no provider.
                      </Alert>
                    </Stack>
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      label="URL da API de cobranca"
                      value={form.urlApiCobranca ?? ''}
                      onChange={(event) => updateForm('urlApiCobranca', event.target.value || null)}
                      helperText={
                        form.cobrancaDigitalProvider === 'Nenhum'
                          ? 'Ative um provider para configurar a rota.'
                          : form.ambienteCobrancaDigital === 'Producao'
                            ? 'Se deixar em branco, usamos https://cobrancas.api.efipay.com.br.'
                            : 'Se deixar em branco, usamos https://cobrancas-h.api.efipay.com.br.'
                      }
                      disabled={form.cobrancaDigitalProvider === 'Nenhum'}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Alert severity={company?.cobrancaDigitalPronta ? 'success' : 'warning'} sx={{ borderRadius: 4 }}>
                      {company?.cobrancaDigitalPronta
                        ? 'A configuracao salva ja esta pronta para o PDV criar QR Pix integrado, link seguro de cartao e para o Financeiro emitir boleto/Pix profissional.'
                        : company?.cobrancaDigitalPendencias.length
                          ? company.cobrancaDigitalPendencias.join(' ')
                          : 'Salve um provider, Client ID e Client Secret para habilitar a cobranca digital.'}
                    </Alert>
                  </Grid>
                </Grid>

                <Box>
                  <Typography variant="h6">Endereco fiscal</Typography>
                  <Typography color="text.secondary">
                    Esses dados entram na identificacao do emitente e ajudam no preparo do XML da NF-e.
                  </Typography>
                </Box>

                <Grid container spacing={2}>
                  <Grid item xs={12} md={3}>
                    <TextField
                      label="CEP"
                      value={formatCep(form.cep)}
                      onChange={(event) => {
                        const nextValue = formatCep(event.target.value) || null;
                        updateForm('cep', nextValue);
                        updateForm('codigoMunicipioIbge', null);
                        clearMunicipioResolution();

                        if (onlyDigits(nextValue) !== lastFetchedCep) {
                          setCepLookupMessage(null);
                        }
                      }}
                      onBlur={() => void lookupCep()}
                      helperText={cepLookupLoading ? 'Consultando CEP fiscal...' : cepLookupMessage ?? 'Ao sair do campo, tentamos preencher o endereco fiscal automaticamente.'}
                      fullWidth
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            {cepLookupLoading ? (
                              <CircularProgress size={18} />
                            ) : (
                              <IconButton edge="end" size="small" onClick={() => void lookupCep(true)}>
                                <SearchRoundedIcon fontSize="small" />
                              </IconButton>
                            )}
                          </InputAdornment>
                        )
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} md={7}>
                    <TextField
                      label="Logradouro"
                      value={form.logradouro ?? ''}
                      onChange={(event) => updateForm('logradouro', event.target.value || null)}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <TextField
                      label="Numero"
                      value={form.numero ?? ''}
                      onChange={(event) => updateForm('numero', event.target.value || null)}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField
                      label="Complemento"
                      value={form.complemento ?? ''}
                      onChange={(event) => updateForm('complemento', event.target.value || null)}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <TextField
                      label="Bairro"
                      value={form.bairro ?? ''}
                      onChange={(event) => updateForm('bairro', event.target.value || null)}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Autocomplete
                      fullWidth
                      freeSolo
                      value={null}
                      inputValue={form.cidade ?? ''}
                      options={municipioSuggestions}
                      filterOptions={(options) => options}
                      loading={municipioSuggestionsLoading}
                      onInputChange={(_, nextValue, reason) => {
                        if (reason === 'input' || reason === 'clear') {
                          handleCidadeInputChange(nextValue || null);
                        }
                      }}
                      onChange={(_, municipio) => {
                        if (municipio && typeof municipio !== 'string') {
                          applyMunicipioSelection(municipio);
                        }
                      }}
                      getOptionLabel={(option) => (typeof option === 'string' ? option : option.nome)}
                      noOptionsText={
                        !form.uf
                          ? 'Selecione a UF para buscar cidades.'
                          : (form.cidade ?? '').trim().length < 2
                            ? 'Digite pelo menos 2 letras para buscar no IBGE.'
                            : 'Nenhum municipio encontrado.'
                      }
                      renderOption={(props, option) => (
                        <Box component="li" {...props} sx={{ py: 1.25 }}>
                          <Box>
                            <Typography sx={{ fontWeight: 700 }}>{option.nome}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              {option.uf} · IBGE {option.codigoIbge}
                            </Typography>
                          </Box>
                        </Box>
                      )}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Cidade"
                          onBlur={() => void resolveMunicipio()}
                          helperText={
                            !form.uf
                              ? 'Selecione a UF para ativar a busca do municipio.'
                              : municipioSuggestionsLoading
                                ? 'Buscando municipios do IBGE...'
                                : 'Escolha a cidade da lista para preencher o codigo automaticamente.'
                          }
                          InputProps={{
                            ...params.InputProps,
                            endAdornment: (
                              <>
                                {municipioSuggestionsLoading ? <CircularProgress size={18} color="inherit" sx={{ mr: 1 }} /> : null}
                                {params.InputProps.endAdornment}
                              </>
                            )
                          }}
                        />
                      )}
                    />
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <TextField
                      select
                      label="UF"
                      value={form.uf ?? ''}
                      onChange={(event) => handleUfChange(event.target.value || null)}
                      fullWidth
                    >
                      <MenuItem value="">Selecione</MenuItem>
                      {ufOptions.map((uf) => (
                        <MenuItem key={uf} value={uf}>
                          {uf}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField
                      label="Codigo IBGE do municipio"
                      value={form.codigoMunicipioIbge ?? ''}
                      onChange={(event) => {
                        updateForm('codigoMunicipioIbge', event.target.value || null);
                        clearMunicipioResolution();
                      }}
                      onBlur={() => void resolveMunicipio(true)}
                      helperText={
                        municipioResolveLoading
                          ? 'Validando municipio informado...'
                          : municipioLookupMessage ?? 'Usado na identificacao fiscal do emitente e no XML da NF-e.'
                      }
                      fullWidth
                    />
                  </Grid>
                </Grid>

                <Box>
                  <Typography variant="h6">Numeracao e ambiente da NF-e</Typography>
                  <Typography color="text.secondary">
                    Base de controle para a serie atual e o proximo numero que sera usado no emissor.
                  </Typography>
                </Box>

                <Grid container spacing={2}>
                  <Grid item xs={12} md={3}>
                    <TextField
                      label="Serie padrao"
                      type="number"
                      value={form.serieNfe}
                      onChange={(event) => updateForm('serieNfe', Number(event.target.value) || 0)}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <TextField
                      label="Proximo numero NF-e"
                      type="number"
                      value={form.proximoNumeroNfe}
                      onChange={(event) => updateForm('proximoNumeroNfe', Number(event.target.value) || 0)}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Alert severity="info" sx={{ borderRadius: 4 }}>
                      O certificado digital agora pode ser escolhido por arquivo nesta tela. A senha so e reaplicada quando voce quiser trocar ou validar outro certificado.
                    </Alert>
                  </Grid>
                </Grid>

                <Box>
                  <Typography variant="h6">Certificado digital da NF-e</Typography>
                  <Typography color="text.secondary">
                    Clique no campo ou no botao para selecionar o arquivo PFX. O sistema copia o certificado para uma pasta segura do servidor e usa esse caminho gerenciado.
                  </Typography>
                </Box>

                <Grid container spacing={2}>
                  <Grid item xs={12} md={8}>
                    <input
                      ref={certificateInputRef}
                      type="file"
                      accept=".pfx,.p12,application/x-pkcs12"
                      hidden
                      onChange={(event) => void handleCertificateSelected(event)}
                    />
                    <TextField
                      label="Arquivo do certificado digital"
                      value={certificateDisplayPath}
                      onClick={openCertificatePicker}
                      helperText={certificateHelperText}
                      fullWidth
                      InputProps={{
                        readOnly: true,
                        sx: { cursor: 'pointer' },
                        endAdornment: (
                          <InputAdornment position="end">
                            {certificateUploading ? (
                              <CircularProgress size={18} />
                            ) : (
                              <IconButton
                                edge="end"
                                size="small"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  openCertificatePicker();
                                }}
                              >
                                <FolderOpenRoundedIcon fontSize="small" />
                              </IconButton>
                            )}
                          </InputAdornment>
                        )
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField
                      label="Senha do certificado"
                      type="password"
                      value={form.senhaCertificadoDigital ?? ''}
                      onChange={(event) => {
                        updateForm('senhaCertificadoDigital', event.target.value || null);
                        setCertificateTestResult(null);
                      }}
                      helperText="Preencha para cadastrar, trocar ou testar outro certificado."
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                      <Button
                        variant="outlined"
                        startIcon={<UploadFileRoundedIcon />}
                        onClick={openCertificatePicker}
                        disabled={certificateUploading}
                      >
                        Selecionar arquivo PFX
                      </Button>
                      <Button
                        variant="contained"
                        color="secondary"
                        startIcon={certificateTesting ? <CircularProgress size={16} color="inherit" /> : <VerifiedRoundedIcon />}
                        onClick={() => void handleTestCertificate()}
                        disabled={!form.certificadoDigitalCaminho || certificateUploading || certificateTesting}
                      >
                        Testar certificado
                      </Button>
                      <Button
                        variant="outlined"
                        color="secondary"
                        startIcon={sefazStatusTesting ? <CircularProgress size={16} color="inherit" /> : <SearchRoundedIcon />}
                        onClick={() => void handleTestSefazStatus()}
                        disabled={statusTestDisabled}
                      >
                        Testar status fiscal
                      </Button>
                      <Button
                        variant="text"
                        color="inherit"
                        onClick={clearSelectedCertificate}
                        disabled={!form.certificadoDigitalCaminho || certificateUploading || certificateTesting || sefazStatusTesting}
                      >
                        Limpar certificado
                      </Button>
                    </Stack>
                  </Grid>
                  <Grid item xs={12}>
                    <Alert severity={certificateValidationAlert.severity} sx={{ borderRadius: 4 }}>
                      {certificateValidationAlert.message}
                    </Alert>
                  </Grid>
                  <Grid item xs={12}>
                    <Alert severity={sefazStatusSeverity} sx={{ borderRadius: 4 }}>
                      {sefazStatusTesting
                        ? 'Consultando o status do canal fiscal com a configuracao salva da empresa...'
                        : sefazStatusResult
                          ? `${sefazStatusResult.mensagem} Provider ${sefazStatusResult.providerFiscal} · Ambiente ${sefazStatusResult.ambiente} · UF ${sefazStatusResult.uf} · URL ${sefazStatusResult.url}`
                          : sefazConfigMatchesSaved
                            ? directIntegrationSelected
                              ? 'Use o teste de status para validar se a SEFAZ direta esta acessivel com o ambiente e certificado ja salvos na empresa.'
                              : 'Use o teste de status para validar se o provider fiscal REST esta acessivel com o ambiente e token ja salvos na empresa.'
                            : 'Salve a configuracao fiscal atual antes de testar o canal fiscal, para garantir que ambiente, provider e credenciais estejam alinhados.'}
                    </Alert>
                  </Grid>
                </Grid>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="flex-end">
                  <Button
                    variant="contained"
                    startIcon={<SaveRoundedIcon />}
                    onClick={() => void handleSave()}
                    disabled={saving}
                  >
                    Salvar configuracao fiscal
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} xl={3}>
          <Stack spacing={2.5}>
            <Card sx={{ borderRadius: 5 }}>
              <CardContent>
                <Stack spacing={2}>
                  <Typography variant="h6">Resumo de prontidao</Typography>
                  <Stack direction="row" flexWrap="wrap" gap={1}>
                    <Chip
                      color={company?.prontaParaNfe ? 'success' : 'warning'}
                      icon={company?.prontaParaNfe ? <VerifiedRoundedIcon /> : <WarningAmberRoundedIcon />}
                      label={company?.prontaParaNfe ? 'Base pronta para NF-e' : 'Base ainda incompleta'}
                    />
                    <Chip
                      variant="outlined"
                      label={`Serie ${form.serieNfe} · Proximo ${form.proximoNumeroNfe}`}
                    />
                  </Stack>
                  <Typography color="text.secondary">
                    Ambiente atual: {form.ambienteNfe === 'Homologacao' ? 'Homologacao' : 'Producao'}
                  </Typography>
                  <Typography color="text.secondary">
                    Certificado: {certificateStatusLabel}
                    {company?.certificadoDigitalValidoAte ? ` · validade ${new Date(company.certificadoDigitalValidoAte).toLocaleDateString('pt-BR')}` : ''}
                  </Typography>
                  {certificateTestResult && !certificatePathMatchesSaved ? (
                    <Alert severity={certificateTestResult.valido ? 'info' : 'warning'} sx={{ borderRadius: 3 }}>
                      {certificateTestResult.valido
                        ? 'O arquivo atual ja foi testado, mas a configuracao ainda nao foi salva na empresa.'
                        : 'O arquivo atual foi testado e apresentou pendencias antes mesmo de salvar a configuracao.'}
                    </Alert>
                  ) : null}
                  {certificateError ? (
                    <Alert severity="error" sx={{ borderRadius: 3 }}>
                      {certificateError}
                    </Alert>
                  ) : null}
                </Stack>
              </CardContent>
            </Card>

            <Card sx={{ borderRadius: 5 }}>
              <CardContent>
                <Stack spacing={1.5}>
                  <Typography variant="h6">Conectividade fiscal</Typography>
                  <Typography color="text.secondary">
                    Este teste usa a configuracao salva da empresa para verificar se o provider fiscal ou o autorizador direto responde antes da transmissao da NF-e.
                  </Typography>
                  {sefazStatusResult ? (
                    <Alert severity={sefazStatusSeverity} sx={{ borderRadius: 3 }}>
                      <Typography sx={{ fontWeight: 700 }}>
                        {sefazStatusResult.codigoStatus ? `${sefazStatusResult.providerFiscal} ${sefazStatusResult.codigoStatus}` : 'Sem codigo de retorno'}
                      </Typography>
                      <Typography variant="body2">{sefazStatusResult.mensagem}</Typography>
                    </Alert>
                  ) : (
                    <Alert severity="info" sx={{ borderRadius: 3 }}>
                      Nenhum teste de status fiscal foi executado nesta sessao.
                    </Alert>
                  )}
                  <Typography color="text.secondary">
                    Provider salvo: {company?.providerFiscal ?? 'Nao informado'}
                  </Typography>
                  <Typography color="text.secondary">
                    Ambiente salvo: {company?.ambienteNfe === 'Homologacao' ? 'Homologacao' : 'Producao'}
                  </Typography>
                  <Typography color="text.secondary">
                    UF salva: {company?.uf ?? 'Nao informada'}
                  </Typography>
                  <Typography color="text.secondary">
                    Ultima URL consultada: {sefazStatusResult?.url ?? 'Ainda nao consultada'}
                  </Typography>
                  <Typography color="text.secondary">
                    Ultima consulta: {formatSefazStatusTimestamp(sefazStatusResult?.consultadoEmUtc)}
                  </Typography>
                  {sefazDiagnostic ? (
                    <Alert severity={sefazStatusSeverity} sx={{ borderRadius: 3 }}>
                      <Stack spacing={0.75}>
                        <Typography sx={{ fontWeight: 700 }}>
                          Etapa analisada: {formatDiagnosticStage(sefazDiagnostic.etapa)}
                        </Typography>
                        <Typography variant="body2">{sefazDiagnostic.resumo}</Typography>
                        {sefazDiagnostic.causaProvavel ? (
                          <Typography variant="body2">
                            Causa provavel: {sefazDiagnostic.causaProvavel}
                          </Typography>
                        ) : null}
                      </Stack>
                    </Alert>
                  ) : null}
                  {sefazDiagnostic ? (
                    <Stack spacing={0.75}>
                      <Typography color="text.secondary">
                        Handshake TLS: {sefazDiagnostic.tlsHandshakeSucesso ? 'concluido' : 'nao concluido'}
                      </Typography>
                      <Typography color="text.secondary">
                        Protocolo TLS: {sefazDiagnostic.tlsProtocol ?? 'Nao identificado'}
                      </Typography>
                      <Typography color="text.secondary">
                        Cipher suite: {sefazDiagnostic.cipherSuite ?? 'Nao identificada'}
                      </Typography>
                      <Typography color="text.secondary">
                        HTTP retornado: {formatHttpStatus(sefazDiagnostic.httpStatusCode)}
                      </Typography>
                      <Typography color="text.secondary">
                        Modo da chave: {sefazDiagnostic.modoArmazenamentoChave ?? 'Nao identificado'}
                      </Typography>
                      <Typography color="text.secondary">
                        Usuario Windows: {sefazDiagnostic.usuarioExecucaoWindows ?? 'Nao identificado'}
                      </Typography>
                      <Typography color="text.secondary">
                        Certificado cliente: {formatCertificateLabel(sefazDiagnostic.certificadoClienteAssunto, sefazDiagnostic.certificadoClienteValidoAte)}
                      </Typography>
                      <Typography color="text.secondary">
                        Certificado servidor: {formatCertificateLabel(sefazDiagnostic.certificadoServidorAssunto, sefazDiagnostic.certificadoServidorValidoAte)}
                      </Typography>
                      {sefazDiagnostic.errosCertificadoServidor ? (
                        <Typography color="text.secondary">
                          Validacao do certificado do servidor: {sefazDiagnostic.errosCertificadoServidor}
                        </Typography>
                      ) : null}
                      {sefazDiagnostic.detalheTecnico ? (
                        <Alert severity="info" sx={{ borderRadius: 3 }}>
                          <Typography sx={{ fontWeight: 700 }}>Detalhe tecnico</Typography>
                          <Typography variant="body2">{sefazDiagnostic.detalheTecnico}</Typography>
                        </Alert>
                      ) : null}
                    </Stack>
                  ) : null}
                  <Button
                    variant="contained"
                    color="secondary"
                    startIcon={sefazStatusTesting ? <CircularProgress size={16} color="inherit" /> : <SearchRoundedIcon />}
                    onClick={() => void handleTestSefazStatus()}
                    disabled={statusTestDisabled}
                  >
                    Testar status fiscal
                  </Button>
                </Stack>
              </CardContent>
            </Card>

            <Card sx={{ borderRadius: 5 }}>
              <CardContent>
                <Stack spacing={1.5}>
                  <Typography variant="h6">Pendencias para emissao</Typography>
                  {company?.pendenciasEmissao.length ? (
                    company.pendenciasEmissao.map((pendencia) => (
                      <Alert key={pendencia} severity="warning" sx={{ borderRadius: 3 }}>
                        {pendencia}
                      </Alert>
                    ))
                  ) : (
                    <Alert severity="success" sx={{ borderRadius: 3 }}>
                      Nenhuma pendencia critica encontrada para a fase de preparacao do emitente.
                    </Alert>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>
    </Stack>
  );
}

function mapToPayload(company: EmpresaFiscal): EmpresaFiscalPayload {
  return {
    nome: company.nome,
    nomeFantasia: company.nomeFantasia,
    cnpj: company.cnpj,
    inscricaoEstadual: company.inscricaoEstadual,
    inscricaoEstadualIsento: company.inscricaoEstadualIsento,
    inscricaoMunicipal: company.inscricaoMunicipal,
    cnaePrincipal: company.cnaePrincipal,
    telefone: company.telefone,
    emailFiscal: company.emailFiscal,
    cep: company.cep,
    logradouro: company.logradouro,
    numero: company.numero,
    complemento: company.complemento,
    bairro: company.bairro,
    cidade: company.cidade,
    uf: company.uf,
    codigoMunicipioIbge: company.codigoMunicipioIbge,
    certificadoDigitalCaminho: company.certificadoDigitalCaminho,
    senhaCertificadoDigital: null,
    regimeTributario: company.regimeTributario,
    ambienteNfe: company.ambienteNfe,
    providerFiscal: company.providerFiscal,
    usaIntegracaoDiretaSefaz: company.usaIntegracaoDiretaSefaz,
    apiFiscalClientId: company.apiFiscalClientId,
    apiFiscalClientSecret: null,
    urlApiFiscal: company.urlApiFiscal,
    tokenApiFiscal: null,
    cobrancaDigitalProvider: company.cobrancaDigitalProvider,
    ambienteCobrancaDigital: company.ambienteCobrancaDigital,
    apiCobrancaClientId: company.apiCobrancaClientId,
    apiCobrancaClientSecret: null,
    urlApiCobranca: company.urlApiCobranca,
    diasVencimentoCobranca: company.diasVencimentoCobranca,
    serieNfe: company.serieNfe,
    proximoNumeroNfe: company.proximoNumeroNfe
  };
}

function resolveSefazStatusSeverity(result: EmpresaFiscalSefazStatus | null) {
  if (!result) {
    return 'info' as const;
  }

  if (result.disponivel) {
    return 'success' as const;
  }

  if (result.codigoStatus === 108 || result.codigoStatus === 109) {
    return 'warning' as const;
  }

  return 'error' as const;
}

function formatSefazStatusTimestamp(value: string | null | undefined) {
  if (!value) {
    return 'Ainda nao consultada';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString('pt-BR');
}

function formatDiagnosticStage(value: string | null | undefined) {
  switch (value) {
    case 'Preparacao':
      return 'Preparacao';
    case 'TlsHandshake':
      return 'Handshake TLS';
    case 'CredencialCliente':
      return 'Credencial do certificado';
    case 'HttpRequest':
      return 'Requisicao HTTPS';
    case 'RespostaHttp':
      return 'Resposta HTTP';
    case 'RespostaFiscal':
      return 'Resposta fiscal';
    default:
      return value ?? 'Nao identificado';
  }
}

function formatHttpStatus(value: number | null | undefined) {
  return value ? `HTTP ${value}` : 'Sem retorno HTTP';
}

function formatCertificateLabel(subject: string | null | undefined, validTo: string | null | undefined) {
  if (!subject) {
    return 'Nao identificado';
  }

  const expiry = validTo ? new Date(validTo) : null;
  const validity = expiry && !Number.isNaN(expiry.getTime())
    ? ` · validade ${expiry.toLocaleDateString('pt-BR')}`
    : '';

  return `${subject}${validity}`;
}

function buildCertificateValidationAlert(
  company: EmpresaFiscal | null,
  form: EmpresaFiscalPayload,
  testResult: EmpresaFiscalCertificadoTeste | null,
  testing: boolean
) {
  const directIntegration = form.usaIntegracaoDiretaSefaz || form.providerFiscal === 'SefazDirect';
  const usesNuvemFiscalOauth = !directIntegration && form.providerFiscal === 'NuvemFiscal';

  if (testing) {
    return {
      severity: 'info' as const,
      message: 'Testando o certificado e a chave privada no servidor...'
    };
  }

  if (testResult && testResult.caminho === form.certificadoDigitalCaminho) {
    return {
      severity: resolveCertificateTestSeverity(testResult),
      message: buildCertificateTestAlertMessage(testResult)
    };
  }

  if (company && company.certificadoDigitalCaminho === form.certificadoDigitalCaminho && company.certificadoDigitalErroValidacao) {
    return {
      severity: 'error' as const,
      message: company.certificadoDigitalErroValidacao
    };
  }

  if (usesNuvemFiscalOauth) {
    return {
      severity: company?.certificadoDigitalConfigurado || form.certificadoDigitalCaminho ? ('info' as const) : ('warning' as const),
      message: company?.certificadoDigitalConfigurado || form.certificadoDigitalCaminho
        ? 'Na Nuvem Fiscal, este certificado local sera sincronizado automaticamente com o provider antes do status e da emissao da NF-e.'
        : 'Na Nuvem Fiscal, o certificado local deixou de ser opcional: ele sera sincronizado automaticamente com o provider antes do status e da emissao.'
    };
  }

  if (!directIntegration) {
    return {
      severity: 'info' as const,
      message: 'Na fase REST externa o certificado local fica opcional nesta tela. Configure-o apenas se quiser manter a trilha pronta para migrar depois para SEFAZ direta.'
    };
  }

  if (!form.certificadoDigitalCaminho) {
    return {
      severity: 'info' as const,
      message: 'Selecione um arquivo PFX e informe a senha para o sistema validar a chave privada antes da transmissao.'
    };
  }

  if (company && company.certificadoDigitalCaminho === form.certificadoDigitalCaminho && company.certificadoDigitalConfigurado) {
    return {
      severity: 'success' as const,
      message: 'Certificado carregado, chave privada acessivel e pronto para assinatura local da NF-e.'
    };
  }

  if (form.senhaCertificadoDigital?.trim()) {
    return {
      severity: 'info' as const,
      message: 'Arquivo e senha informados. Teste agora para validar a chave privada sem precisar salvar ou emitir NF-e.'
    };
  }

  return {
    severity: 'warning' as const,
    message: 'Arquivo selecionado. Informe a senha e use o botao de teste para validar se a chave privada pode ser usada pela API.'
  };
}

function resolveCertificateStatusLabel(
  company: EmpresaFiscal | null,
  form: EmpresaFiscalPayload,
  testResult: EmpresaFiscalCertificadoTeste | null,
  testing: boolean
) {
  const directIntegration = form.usaIntegracaoDiretaSefaz || form.providerFiscal === 'SefazDirect';
  const usesNuvemFiscalOauth = !directIntegration && form.providerFiscal === 'NuvemFiscal';

  if (testing) {
    return 'teste em andamento';
  }

  if (testResult && testResult.caminho === form.certificadoDigitalCaminho) {
    if (testResult.valido && testResult.provavelmenteCompativelIcpBrasilA1) {
      return company?.certificadoDigitalCaminho === form.certificadoDigitalCaminho
        ? 'configurado e validado'
        : 'teste aprovado - falta salvar';
    }

    if (testResult.valido) {
      return testResult.certificadoDesenvolvimento
        ? 'teste local aprovado - certificado de desenvolvimento'
        : 'teste local aprovado com alerta';
    }

    return 'teste com problema';
  }

  if (usesNuvemFiscalOauth) {
    return company?.certificadoDigitalConfigurado ? 'necessario e configurado' : 'necessario para sincronizar';
  }

  if (!directIntegration) {
    return company?.certificadoDigitalConfigurado ? 'opcional e configurado' : 'opcional nesta fase';
  }

  if (company?.certificadoDigitalErroValidacao) {
    return 'configurado com problema';
  }

  if (company?.certificadoDigitalConfigurado) {
    return 'configurado e validado';
  }

  return 'nao configurado';
}

function resolveCertificateTestSeverity(testResult: EmpresaFiscalCertificadoTeste) {
  if (!testResult.valido) {
    return 'error' as const;
  }

  if (!testResult.provavelmenteCompativelIcpBrasilA1) {
    return 'warning' as const;
  }

  return 'success' as const;
}

function buildCertificateTestAlertMessage(testResult: EmpresaFiscalCertificadoTeste) {
  const details = new Set<string>();
  const hasCompatibilityDiagnostic = Boolean(testResult.diagnosticoCompatibilidade?.trim());

  if (testResult.diagnosticoCompatibilidade) {
    details.add(testResult.diagnosticoCompatibilidade.trim());
  } else {
    if (testResult.certificadoDesenvolvimento) {
      details.add('Este arquivo parece um certificado de desenvolvimento/self-signed. Ele serve para testar a UI e a assinatura local, mas nao sera aceito pela Nuvem Fiscal ou pela SEFAZ.');
    }

    if (!testResult.provavelmenteCompativelIcpBrasilA1) {
      details.add('Para NF-e real ou homologacao do provider, use um certificado ICP-Brasil A1 em PFX/P12 emitido por certificadora credenciada.');
    }
  }

  if (testResult.cnpjCertificado && testResult.cnpjConfereComEmpresa === false && !hasCompatibilityDiagnostic) {
    details.add(`O CNPJ do certificado (${formatCpfCnpj(testResult.cnpjCertificado)}) nao confere com o CNPJ fiscal da empresa.`);
  }

  const detailText = [...details].join(' ');
  return detailText ? `${testResult.mensagem} ${detailText}` : testResult.mensagem;
}

function resolveProviderUrlHint(provider: FiscalProvider, ambiente: AmbienteFiscal) {
  if (provider === 'NuvemFiscal') {
    return ambiente === 'Homologacao'
      ? 'Padrao em homologacao: https://api.sandbox.nuvemfiscal.com.br. Preencha apenas se precisar sobrescrever a URL padrao.'
      : 'Padrao em producao: https://api.nuvemfiscal.com.br. Preencha apenas se precisar sobrescrever a URL padrao.';
  }

  if (provider === 'FocusNFe') {
    return ambiente === 'Homologacao'
      ? 'Padrao: https://homologacao.focusnfe.com.br'
      : 'Padrao: https://api.focusnfe.com.br';
  }

  if (provider === 'PlugNotas') {
    return ambiente === 'Homologacao'
      ? 'Padrao: https://api.sandbox.plugnotas.com.br'
      : 'Padrao: https://api.plugnotas.com.br';
  }

  return 'Em integracao direta esta URL nao e usada.';
}

function resolveFiscalStatusFallbackUrl(company: EmpresaFiscal) {
  const provider = company.providerFiscal;
  const ambiente = company.ambienteNfe;
  const customBaseUrl = normalizeProviderBaseUrl(company.urlApiFiscal);

  if (provider === 'NuvemFiscal') {
    const baseUrl = customBaseUrl
      ?? (ambiente === 'Homologacao'
        ? 'https://api.sandbox.nuvemfiscal.com.br'
        : 'https://api.nuvemfiscal.com.br');
    return `${baseUrl}/nfe/sefaz/status`;
  }

  if (provider === 'FocusNFe') {
    const baseUrl = customBaseUrl
      ?? (ambiente === 'Homologacao'
        ? 'https://homologacao.focusnfe.com.br'
        : 'https://api.focusnfe.com.br');
    return `${baseUrl}/v2/nfe/{referencia}`;
  }

  if (provider === 'PlugNotas') {
    const baseUrl = customBaseUrl
      ?? (ambiente === 'Homologacao'
        ? 'https://api.sandbox.plugnotas.com.br'
        : 'https://api.plugnotas.com.br');
    return `${baseUrl}/nfe/consulta/periodo`;
  }

  return 'URL dependente da UF/autorizador da SEFAZ direta';
}

function normalizeProviderBaseUrl(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  return normalized.replace(/\/+$/, '');
}

function mergeFiscalFormWithCnpjResult(
  form: EmpresaFiscalPayload,
  result: CnpjLookupResult
): EmpresaFiscalPayload {
  const nomeOficial = fitImportedText(result.razaoSocial || result.nomeFantasia, 150);
  const inscricaoEstadual = fitImportedText(result.inscricaoEstadual, 20);
  const cnaePrincipal = fitImportedText(result.cnaePrincipalCodigo, 20);
  const codigoMunicipioIbge = fitImportedText(result.codigoMunicipioIbge, 7);

  return {
    ...form,
    nome: nomeOficial ?? form.nome,
    nomeFantasia: pickImportedValue(form.nomeFantasia, fitImportedText(result.nomeFantasia, 150), true),
    cnpj: result.cnpj,
    inscricaoEstadual: pickImportedValue(form.inscricaoEstadual, inscricaoEstadual, true),
    inscricaoEstadualIsento: inscricaoEstadual ? false : form.inscricaoEstadualIsento,
    cnaePrincipal: pickImportedValue(form.cnaePrincipal, cnaePrincipal, true),
    telefone: pickImportedValue(form.telefone, fitImportedText(result.telefone, 20), true),
    emailFiscal: pickImportedValue(form.emailFiscal, fitImportedText(result.email, 150), true),
    cep: pickImportedValue(form.cep, result.cep, true),
    logradouro: pickImportedValue(form.logradouro, fitImportedText(result.logradouro, 180), true),
    numero: pickImportedValue(form.numero, fitImportedText(result.numero, 20), true),
    complemento: pickImportedValue(form.complemento, fitImportedText(result.complemento, 120), true),
    bairro: pickImportedValue(form.bairro, fitImportedText(result.bairro, 80), true),
    cidade: pickImportedValue(form.cidade, fitImportedText(result.cidade, 80), true),
    uf: pickImportedValue(form.uf, fitImportedText(result.uf, 2), true),
    codigoMunicipioIbge: pickImportedValue(form.codigoMunicipioIbge, codigoMunicipioIbge, true)
  };
}

function pickImportedValue(currentValue: string | null | undefined, importedValue: string | null | undefined, overwriteOfficialData: boolean) {
  const current = emptyToNull(currentValue);
  const imported = emptyToNull(importedValue);

  if (overwriteOfficialData) {
    return imported ?? current;
  }

  return current ?? imported;
}

function emptyToNull(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function parseCredentialCsvText(content: string, preferredEnvironment?: AmbienteFiscal) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error('O CSV de credenciais esta vazio.');
  }

  const headerValues = parseCredentialCsvLine(lines[0]);
  const hasHeader = lines.length > 1 && headerValues.some((value) => /client/i.test(value));
  const candidateValues = hasHeader
    ? parseCredentialCsvLine(lines[1])
    : headerValues;

  if (hasHeader) {
    const resolvedByEnvironment = resolveCredentialPairByHeader(headerValues, candidateValues, preferredEnvironment);
    if (resolvedByEnvironment) {
      return resolvedByEnvironment;
    }
  }

  const values = candidateValues.filter(Boolean);

  if (values.length < 2) {
    throw new Error('Nao foi possivel localizar Client ID e Client Secret no CSV informado.');
  }

  return {
    clientId: values[0],
    clientSecret: values[1]
  };
}

function parseCredentialCsvLine(line: string) {
  const delimiter = line.includes(';') ? ';' : ',';
  return line
    .split(delimiter)
    .map((value) => value.trim().replace(/^\uFEFF/, '').replace(/^"|"$/g, ''));
}

function resolveCredentialPairByHeader(headers: string[], values: string[], preferredEnvironment?: AmbienteFiscal) {
  const normalizedHeaders = headers.map(normalizeCredentialHeader);
  const environmentTokens = preferredEnvironment === 'Producao'
    ? ['producao', 'produc', 'production', 'prod']
    : ['homologacao', 'homolog', 'sandbox', 'teste', 'test', 'development', 'dev'];

  const environmentMatch = buildCredentialPairFromIndexes(
    values,
    normalizedHeaders.findIndex((header) => header.includes('clientid') && environmentTokens.some((token) => header.includes(token))),
    normalizedHeaders.findIndex((header) => header.includes('clientsecret') && environmentTokens.some((token) => header.includes(token)))
  );

  if (environmentMatch) {
    return environmentMatch;
  }

  return buildCredentialPairFromIndexes(
    values,
    normalizedHeaders.findIndex((header) => header.includes('clientid')),
    normalizedHeaders.findIndex((header) => header.includes('clientsecret'))
  );
}

function buildCredentialPairFromIndexes(values: string[], clientIdIndex: number, clientSecretIndex: number) {
  if (clientIdIndex < 0 || clientSecretIndex < 0) {
    return null;
  }

  const clientId = values[clientIdIndex]?.trim();
  const clientSecret = values[clientSecretIndex]?.trim();
  if (!clientId || !clientSecret) {
    return null;
  }

  return { clientId, clientSecret };
}

function normalizeCredentialHeader(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function buildMunicipioResolutionKey(
  cidade: string | null | undefined,
  uf: string | null | undefined,
  codigoMunicipioIbge: string | null | undefined
) {
  const cidadeNormalizada = emptyToNull(cidade)?.toLocaleUpperCase('pt-BR') ?? '';
  const ufNormalizada = emptyToNull(uf)?.toUpperCase() ?? '';
  const codigoNormalizado = onlyDigits(codigoMunicipioIbge) ?? '';
  return `${cidadeNormalizada}|${ufNormalizada}|${codigoNormalizado}`;
}

function fitImportedText(value: string | null | undefined, maxLength: number) {
  const normalized = emptyToNull(value);
  if (!normalized || normalized.length <= maxLength) {
    return normalized;
  }

  const truncated = normalized.slice(0, maxLength).trimEnd();
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace >= Math.floor(maxLength * 0.6)) {
    return truncated.slice(0, lastSpace).trimEnd();
  }

  return truncated;
}

function buildCompanyCnpjLookupMessage(result: CnpjLookupResult) {
  const parts = [`CNPJ localizado: ${result.razaoSocial}.`];

  if (result.nomeFantasia && normalizeCompareValue(result.nomeFantasia) !== normalizeCompareValue(result.razaoSocial)) {
    parts.push(`Fantasia: ${result.nomeFantasia}.`);
  }

  if (result.inscricaoEstadual) {
    parts.push(`IE: ${result.inscricaoEstadual}.`);
  }

  if (result.cnaePrincipalCodigo) {
    parts.push(`CNAE: ${result.cnaePrincipalCodigo}.`);
  }

  if (result.codigoMunicipioIbge) {
    parts.push(`Municipio IBGE: ${result.codigoMunicipioIbge}.`);
  }

  if (result.telefone) {
    parts.push(`Telefone: ${formatPhone(result.telefone)}.`);
  }

  if (result.email) {
    parts.push(`E-mail: ${result.email}.`);
  }

  return parts.join(' ');
}

function normalizeCompareValue(value: string | null | undefined) {
  return emptyToNull(value)?.toLocaleLowerCase('pt-BR') ?? null;
}

function buildCertificateHelperText(
  certificatePath: string | null | undefined,
  selectedName: string | null,
  uploading: boolean
) {
  if (uploading) {
    return 'Enviando certificado para o servidor...';
  }

  if (selectedName && certificatePath) {
    return `Arquivo selecionado: ${selectedName}. Caminho salvo no servidor: ${certificatePath}`;
  }

  if (certificatePath) {
    return `Clique para trocar o certificado atual. Caminho salvo no servidor: ${certificatePath}`;
  }

  return 'Clique para abrir o seletor de arquivo e enviar o certificado PFX ou P12.';
}

function getCertificateFileName(path: string | null | undefined) {
  const normalized = emptyToNull(path);
  if (!normalized) {
    return null;
  }

  const segments = normalized.split(/[\\/]/);
  const fileName = segments[segments.length - 1]?.trim();
  return fileName || null;
}
