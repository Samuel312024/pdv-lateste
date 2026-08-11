import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import LocationOnRoundedIcon from '@mui/icons-material/LocationOnRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
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
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { DetachableDialog } from '../components/common/DetachableDialog';
import { ListFilterField } from '../components/common/ListFilterField';
import { Loading } from '../components/common/Loading';
import { useAuth } from '../contexts/AuthContext';
import { cepService, type MunicipioLookupResult } from '../services/cepService';
import { cnpjService, type CnpjLookupResult } from '../services/cnpjService';
import { clientService, type ClientePayload } from '../services/clientService';
import type { Cliente, ClienteHistorico } from '../types';
import { readDetachedDialogSession, removeDetachedDialogSession } from '../utils/detachedDialogSession';
import { formatCurrency, formatDateTime } from '../utils/format';
import { detectDocumentType, formatCep, formatCpfCnpj, formatPhone, isValidCnpj, isValidCpf, isValidEmail, onlyDigits } from '../utils/br';
import { getErrorMessage } from '../utils/http';
import { ufOptions } from '../utils/ufs';

const emptyForm: ClientePayload = {
  nome: '',
  documento: null,
  segmento: null,
  telefone: null,
  email: null,
  cep: null,
  logradouro: null,
  numero: null,
  complemento: null,
  bairro: null,
  cidade: null,
  uf: null,
  codigoMunicipioIbge: null,
  endereco: null,
  ehFornecedor: false,
  ativo: true
};

const segmentoSuggestions = [
  'Consumidor final',
  'Mercado',
  'Papelaria',
  'Restaurante',
  'Distribuidora',
  'Loja de roupas',
  'Farmacia',
  'Conveniencia',
  'Atacado',
  'E-commerce',
  'Prestacao de servicos'
];

const clientFieldMaxLengths = {
  nome: 150,
  segmento: 80,
  telefone: 20,
  email: 150,
  logradouro: 180,
  numero: 20,
  complemento: 120,
  bairro: 80,
  cidade: 80,
  uf: 2,
  codigoMunicipioIbge: 7
} as const;

type ClientFormErrors = Partial<Record<keyof ClientePayload, string>>;

interface ClientDetachedSession {
  editingClient: Cliente | null;
  form: ClientePayload;
  saveAttempted: boolean;
  dialogError: string | null;
  cnpjLookupMessage: string | null;
  lastFetchedCnpj: string | null;
  cepLookupMessage: string | null;
  lastFetchedCep: string | null;
  municipioLookupMessage: string | null;
  lastResolvedMunicipioKey: string | null;
}

const CLIENT_DIALOG_PATH = '/clientes';

export function ClientsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshingClients, setRefreshingClients] = useState(false);
  const [clients, setClients] = useState<Cliente[]>([]);
  const [search, setSearch] = useState('');
  const [clientSuggestions, setClientSuggestions] = useState<Cliente[]>([]);
  const [clientSuggestionsLoading, setClientSuggestionsLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Cliente | null>(null);
  const [deleteClient, setDeleteClient] = useState<Cliente | null>(null);
  const [deletePermanent, setDeletePermanent] = useState(false);
  const [form, setForm] = useState<ClientePayload>(emptyForm);
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
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
  const [historyLoading, setHistoryLoading] = useState(false);
  const [clientHistory, setClientHistory] = useState<ClienteHistorico | null>(null);
  const { enqueueSnackbar } = useSnackbar();
  const { hasPermission } = useAuth();
  const [searchParams] = useSearchParams();
  const detachedWindow = searchParams.get('detachedWindow') === '1';
  const detachedSessionKey = searchParams.get('detachedSession');
  const hydratedDetachedSessionRef = useRef<string | null>(null);
  const deferredSearch = useDeferredValue(search);
  const deferredMunicipioTerm = useDeferredValue(form.cidade ?? '');
  const canManageClients = hasPermission('GerenciarClientes');

  const validationErrors = useMemo(() => validateClientForm(form), [form]);
  const documentType = detectDocumentType(form.documento);

  useEffect(() => {
    void loadClients(undefined, true);
  }, []);

  useEffect(() => {
    if (loading || !detachedWindow || !detachedSessionKey || hydratedDetachedSessionRef.current === detachedSessionKey) {
      return;
    }

    const sessionData = readDetachedDialogSession<ClientDetachedSession>(detachedSessionKey);
    hydratedDetachedSessionRef.current = detachedSessionKey;

    if (!sessionData) {
      return;
    }

    setEditingClient(sessionData.editingClient);
    setForm(sessionData.form);
    setSaveAttempted(sessionData.saveAttempted);
    setDialogError(sessionData.dialogError);
    setCnpjLookupLoading(false);
    setCnpjLookupMessage(sessionData.cnpjLookupMessage);
    setLastFetchedCnpj(sessionData.lastFetchedCnpj);
    setCepLookupLoading(false);
    setCepLookupMessage(sessionData.cepLookupMessage);
    setLastFetchedCep(sessionData.lastFetchedCep);
    setMunicipioSuggestions([]);
    setMunicipioSuggestionsLoading(false);
    setMunicipioResolveLoading(false);
    setMunicipioLookupMessage(sessionData.municipioLookupMessage);
    setLastResolvedMunicipioKey(sessionData.lastResolvedMunicipioKey);
    setClientHistory(null);
    setHistoryLoading(Boolean(sessionData.editingClient));
    setDialogOpen(true);

    if (sessionData.editingClient) {
      void loadClientHistory(sessionData.editingClient.clienteId);
    }
  }, [detachedSessionKey, detachedWindow, loading]);

  useEffect(() => {
    let active = true;
    const normalizedTerm = deferredSearch.trim();

    if (!normalizedTerm) {
      setClientSuggestions([]);
      setClientSuggestionsLoading(false);
      return;
    }

    async function loadSuggestions() {
      setClientSuggestionsLoading(true);
      try {
        const result = await clientService.list(normalizedTerm);
        if (active) {
          setClientSuggestions(result.slice(0, 12));
        }
      } catch {
        if (active) {
          setClientSuggestions([]);
        }
      } finally {
        if (active) {
          setClientSuggestionsLoading(false);
        }
      }
    }

    void loadSuggestions();
    return () => {
      active = false;
    };
  }, [deferredSearch]);

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

  async function loadClients(term?: string, showPageLoader = false) {
    if (showPageLoader) {
      setLoading(true);
    } else {
      setRefreshingClients(true);
    }

    try {
      const result = await clientService.list(term?.trim() || undefined);
      setClients(result);
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      if (showPageLoader) {
        setLoading(false);
      } else {
        setRefreshingClients(false);
      }
    }
  }

  function updateForm<Key extends keyof ClientePayload>(key: Key, value: ClientePayload[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
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
          ? `Nao encontramos ${cidade}/${uf} na base do IBGE. Escolha uma cidade da lista para preencher o codigo automaticamente.`
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

  async function lookupCnpj(force = false) {
    const digits = onlyDigits(form.documento);
    if (!digits || digits.length !== 14 || !isValidCnpj(digits)) {
      return;
    }

    if (!force && lastFetchedCnpj === digits) {
      return;
    }

    setCnpjLookupLoading(true);
    setCnpjLookupMessage('Consultando CNPJ...');

    try {
      const result = await cnpjService.lookup(digits);
      setForm((current) => mergeClientFormWithCnpjResult(current, result, force));
      setLastFetchedCnpj(digits);
      setCnpjLookupMessage(buildCnpjLookupMessage(result));
      setLastResolvedMunicipioKey(
        result.codigoMunicipioIbge && result.cidade && result.uf
          ? buildMunicipioResolutionKey(result.cidade, result.uf, result.codigoMunicipioIbge)
          : null
      );
      setMunicipioLookupMessage(
        result.codigoMunicipioIbge && result.cidade && result.uf
          ? `Municipio confirmado pelo cadastro oficial: ${result.cidade}/${result.uf} (${result.codigoMunicipioIbge}).`
          : null
      );

      const fetchedCep = onlyDigits(result.cep);
      setLastFetchedCep(fetchedCep || null);
      setCepLookupMessage(result.cep ? `CEP preenchido a partir do CNPJ: ${result.cep}` : null);
    } catch (error) {
      setLastFetchedCnpj(null);
      setCnpjLookupMessage('Nao foi possivel preencher os dados com esse CNPJ.');
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
    setCepLookupMessage('Consultando CEP...');

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
      setCepLookupMessage('Nao foi possivel preencher o endereco com esse CEP.');
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setCepLookupLoading(false);
    }
  }

  function openCreateDialog() {
    if (!canManageClients) {
      enqueueSnackbar('Seu usuario possui acesso somente de leitura no modulo de clientes.', { variant: 'warning' });
      return;
    }

    setEditingClient(null);
    setForm(emptyForm);
    setSaveAttempted(false);
    setCnpjLookupLoading(false);
    setCnpjLookupMessage(null);
    setLastFetchedCnpj(null);
    setCepLookupLoading(false);
    setCepLookupMessage(null);
    setLastFetchedCep(null);
    setMunicipioSuggestions([]);
    setMunicipioSuggestionsLoading(false);
    setMunicipioResolveLoading(false);
    setMunicipioLookupMessage(null);
    setLastResolvedMunicipioKey(null);
    setClientHistory(null);
    setHistoryLoading(false);
    setDialogError(null);
    setDialogOpen(true);
  }

  function openEditDialog(client: Cliente) {
    setEditingClient(client);
    setForm({
      nome: client.nome,
      documento: client.documento,
      segmento: client.segmento,
      telefone: client.telefone,
      email: client.email,
      cep: client.cep,
      logradouro: client.logradouro ?? client.endereco,
      numero: client.numero,
      complemento: client.complemento,
      bairro: client.bairro,
      cidade: client.cidade,
      uf: client.uf,
      codigoMunicipioIbge: client.codigoMunicipioIbge,
      endereco: client.endereco,
      ehFornecedor: client.ehFornecedor,
      ativo: client.ativo
    });
    setSaveAttempted(false);
    setCnpjLookupLoading(false);
    setCnpjLookupMessage(null);
    setLastFetchedCnpj(detectDocumentType(client.documento) === 'CNPJ' ? onlyDigits(client.documento) : null);
    setCepLookupLoading(false);
    setCepLookupMessage(client.cep ? `CEP carregado: ${client.cep}` : null);
    setLastFetchedCep(onlyDigits(client.cep));
    setMunicipioSuggestions([]);
    setMunicipioSuggestionsLoading(false);
    setMunicipioResolveLoading(false);
    setMunicipioLookupMessage(
      client.codigoMunicipioIbge && client.cidade && client.uf
        ? `Municipio atual: ${client.cidade}/${client.uf} (${client.codigoMunicipioIbge}).`
        : null
    );
    setLastResolvedMunicipioKey(
      client.codigoMunicipioIbge && client.cidade && client.uf
        ? buildMunicipioResolutionKey(client.cidade, client.uf, client.codigoMunicipioIbge)
        : null
    );
    setClientHistory(null);
    setHistoryLoading(true);
    setDialogError(null);
    setDialogOpen(true);
    void loadClientHistory(client.clienteId);
  }

  function closeDialog() {
    setDialogOpen(false);

    if (!detachedWindow) {
      return;
    }

    removeDetachedDialogSession(detachedSessionKey);
    window.close();
  }

  async function loadClientHistory(clientId: string) {
    setHistoryLoading(true);
    try {
      const result = await clientService.history(clientId);
      setClientHistory(result);
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setHistoryLoading(false);
    }
  }

  async function handleSave() {
    if (!canManageClients) {
      enqueueSnackbar('Seu usuario nao possui permissao para salvar clientes.', { variant: 'warning' });
      return;
    }

    setSaveAttempted(true);
    setDialogError(null);

    const firstError = Object.values(validationErrors).find(Boolean);
    if (firstError) {
      enqueueSnackbar(firstError, { variant: 'warning' });
      return;
    }

    const payload = normalizePayload(form);

    try {
      if (editingClient) {
        await clientService.update(editingClient.clienteId, payload);
        enqueueSnackbar('Cliente atualizado com sucesso.', { variant: 'success' });
      } else {
        await clientService.create(payload);
        enqueueSnackbar('Cliente criado com sucesso.', { variant: 'success' });
      }

      if (detachedWindow) {
        closeDialog();
        return;
      }

      await loadClients(search);
      closeDialog();
    } catch (error) {
      const message = getErrorMessage(error);
      setDialogError(message);
      enqueueSnackbar(message, { variant: 'error' });
    }
  }

  async function handleDelete() {
    if (!deleteClient) {
      return;
    }

    if (!canManageClients) {
      enqueueSnackbar('Seu usuario nao possui permissao para inativar ou excluir clientes.', { variant: 'warning' });
      return;
    }

    try {
      await clientService.remove(deleteClient.clienteId, deletePermanent);
      enqueueSnackbar(deletePermanent ? 'Cliente excluido permanentemente com sucesso.' : 'Cliente inativado com sucesso.', { variant: 'success' });
      setDeleteClient(null);
      setDeletePermanent(false);
      await loadClients(search);
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    }
  }

  if (loading) {
    return <Loading message="Carregando clientes..." />;
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">Clientes</Typography>
        <Typography color="text.secondary">
          Cadastro com documento validado, contato estruturado, CEP e endereco detalhado para uso real no PDV.
        </Typography>
      </Box>

      <Card
        sx={{
          borderRadius: 5,
          background:
            'radial-gradient(circle at top left, rgba(23,75,138,0.12), transparent 30%), linear-gradient(135deg, #ffffff, #f6f8fc)'
        }}
      >
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} lg={7}>
              <Stack spacing={0.75}>
                <Typography variant="h6">Base de clientes</Typography>
                <Typography color="text.secondary">
                  Consulte rapidamente por nome, documento, telefone, cidade, UF ou segmento antes de vender.
                </Typography>
              </Stack>
            </Grid>
            <Grid item xs={12} md={8} lg={3}>
              <Autocomplete
                fullWidth
                freeSolo
                value={null}
                options={clientSuggestions}
                inputValue={search}
                filterOptions={(options) => options}
                onInputChange={(_, nextValue) => setSearch(nextValue)}
                onChange={(_, client) => {
                  if (!client || typeof client === 'string') {
                    return;
                  }

                  setSearch(client.nome);
                  setClients([client]);
                }}
                getOptionLabel={(option) =>
                  typeof option === 'string'
                    ? option
                    : option.nome
                }
                noOptionsText={search.trim() ? 'Nenhum cliente encontrado.' : 'Digite para buscar clientes.'}
                renderOption={(props, option) => (
                  <Box component="li" {...props} sx={{ py: 1.25 }}>
                    <Box>
                      <Typography sx={{ fontWeight: 700 }}>{option.nome}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {[option.documento, option.telefone, option.cidade && option.uf ? `${option.cidade}/${option.uf}` : option.cidade, option.segmento]
                          .filter(Boolean)
                          .join(' · ') || 'Cadastro sem documento ou contato.'}
                      </Typography>
                    </Box>
                  </Box>
                )}
                renderInput={(params) => (
                  <ListFilterField
                    {...params}
                    label="Buscar cliente"
                    placeholder="Nome, CPF/CNPJ, telefone..."
                    loading={clientSuggestionsLoading}
                    helperText={
                      clientSuggestionsLoading
                        ? 'Buscando clientes parecidos...'
                        : 'As sugestoes aparecem enquanto voce digita. Pressione Enter para filtrar a tabela.'
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void loadClients(search);
                      }
                    }}
                  />
                )}
              />
            </Grid>
            <Grid item xs={12} md={4} lg={2}>
              <Stack direction={{ xs: 'column', sm: 'row', md: 'column', lg: 'row' }} spacing={1.25}>
                <Button variant="outlined" fullWidth onClick={() => void loadClients(search)} disabled={refreshingClients}>
                  Buscar
                </Button>
                <Button variant="contained" fullWidth startIcon={<AddRoundedIcon />} onClick={openCreateDialog} disabled={!canManageClients}>
                  Novo cliente
                </Button>
              </Stack>
            </Grid>
          </Grid>

          {refreshingClients && (
            <Typography variant="body2" color="primary.main" sx={{ mt: 1.5 }}>
              Atualizando a lista de clientes...
            </Typography>
          )}
        </CardContent>
      </Card>

      <Paper sx={{ borderRadius: 5, overflow: 'hidden' }}>
        <TableContainer sx={{ overflowX: 'auto' }}>
        <Table
          sx={{
            minWidth: 1120,
            tableLayout: 'fixed',
            '& th': {
              whiteSpace: 'nowrap',
              fontWeight: 700
            },
            '& td': {
              verticalAlign: 'top',
              py: 2.25
            }
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: '34%' }}>Cliente</TableCell>
              <TableCell sx={{ width: '22%' }}>Segmento</TableCell>
              <TableCell sx={{ width: '13%' }}>Documento</TableCell>
              <TableCell sx={{ width: '15%' }}>Contato</TableCell>
              <TableCell sx={{ width: '10%' }}>Localidade</TableCell>
              <TableCell sx={{ width: '8%' }}>Status</TableCell>
              <TableCell sx={{ width: 88 }}></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {clients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <Typography color="text.secondary">Nenhum cliente encontrado para o filtro atual.</Typography>
                </TableCell>
              </TableRow>
            ) : (
              clients.map((client) => (
                <TableRow key={client.clienteId} hover>
                  <TableCell>
                    <Stack spacing={0.75}>
                      <Typography sx={{ fontWeight: 800, lineHeight: 1.3, wordBreak: 'break-word' }}>{client.nome}</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55 }}>
                        {client.endereco ?? 'Sem endereco detalhado'}
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                      <Chip label={client.segmento ?? 'Nao informado'} size="small" color="primary" variant="outlined" />
                      {client.ehFornecedor && (
                        <Chip label="Fornecedor" size="small" color="warning" variant="outlined" />
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ wordBreak: 'break-word' }}>{client.documento ?? '-'}</Typography>
                  </TableCell>
                  <TableCell>
                    <Stack spacing={0.5}>
                      <Typography>{client.telefone ?? '-'}</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
                        {client.email ?? 'Sem e-mail'}
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Typography sx={{ wordBreak: 'break-word' }}>
                      {client.cidade && client.uf ? `${client.cidade}/${client.uf}` : '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={client.ativo ? 'Ativo' : 'Inativo'} size="small" color={client.ativo ? 'success' : 'default'} />
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <IconButton onClick={() => openEditDialog(client)} size="small">
                      <EditRoundedIcon />
                    </IconButton>
                    {canManageClients ? (
                      <IconButton onClick={() => { setDeleteClient(client); setDeletePermanent(false); }} color="error" size="small">
                        <DeleteOutlineRoundedIcon />
                      </IconButton>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </TableContainer>
      </Paper>

      <DetachableDialog
        open={dialogOpen}
        onClose={closeDialog}
        title={editingClient ? 'Editar cliente' : 'Novo cliente'}
        maxWidth="lg"
        contentDividers
        detachedWindow={detachedWindow}
        detachPath={CLIENT_DIALOG_PATH}
        detachPayload={{
          editingClient,
          form,
          saveAttempted,
          dialogError,
          cnpjLookupMessage,
          lastFetchedCnpj,
          cepLookupMessage,
          lastFetchedCep,
          municipioLookupMessage,
          lastResolvedMunicipioKey
        } satisfies ClientDetachedSession}
        onDetach={closeDialog}
        actionsSx={{ px: 3, py: 2 }}
        windowTitle={editingClient ? `Editar cliente - ${form.nome || 'Cliente'}` : 'Novo cliente'}
        actions={
          <>
            <Button onClick={closeDialog}>{canManageClients ? 'Cancelar' : 'Fechar'}</Button>
            {canManageClients ? (
              <Button variant="contained" onClick={handleSave}>
                Salvar cadastro
              </Button>
            ) : null}
          </>
        }
      >
          <Stack spacing={3}>
            {dialogError && (
              <Alert severity="error" sx={{ borderRadius: 3 }}>
                {dialogError}
              </Alert>
            )}

            <Box>
              <Typography variant="overline" color="text.secondary">
                Identificacao do cliente
              </Typography>
              <Grid container spacing={2} sx={{ mt: 0.5 }}>
                <Grid item xs={12} md={5}>
                  <TextField
                    label="Nome ou razao social"
                    value={form.nome}
                    onChange={(event) => updateForm('nome', event.target.value)}
                    error={shouldShowError(saveAttempted, form.nome) && Boolean(validationErrors.nome)}
                    helperText={showHelper(saveAttempted, form.nome, validationErrors.nome, 'Campo principal usado em vendas, buscas e relatorios.')}
                    fullWidth
                    required
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Segmento"
                    value={form.segmento ?? ''}
                    onChange={(event) => updateForm('segmento', event.target.value || null)}
                    error={shouldShowError(saveAttempted, form.segmento) && Boolean(validationErrors.segmento)}
                    helperText={showHelper(
                      saveAttempted,
                      form.segmento,
                      validationErrors.segmento,
                      'Ex.: Mercado, Papelaria, Restaurante, Distribuidora ou Consumidor final.'
                    )}
                    placeholder="Digite o segmento"
                    fullWidth
                    required
                  />
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    label="CPF ou CNPJ"
                    value={formatCpfCnpj(form.documento)}
                    onChange={(event) => {
                      const nextValue = formatCpfCnpj(event.target.value) || null;
                      updateForm('documento', nextValue);

                      if (onlyDigits(nextValue) !== lastFetchedCnpj) {
                        setCnpjLookupMessage(null);
                      }
                    }}
                    onBlur={() => void lookupCnpj()}
                    error={shouldShowError(saveAttempted, form.documento) && Boolean(validationErrors.documento)}
                    helperText={showHelper(
                      saveAttempted,
                      form.documento,
                      validationErrors.documento,
                      cnpjLookupLoading
                        ? 'Consultando CNPJ...'
                        : cnpjLookupMessage ?? (
                          form.ehFornecedor
                            ? documentType
                              ? `${documentType} real do fornecedor detectado automaticamente.`
                              : 'Para fornecedor, informe o CPF/CNPJ real. Esse documento pode ser usado para vincular produtos automaticamente.'
                            : documentType
                              ? `${documentType} detectado automaticamente.`
                              : 'Documento opcional, mas validado quando informado.'
                        )
                    )}
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
                              disabled={onlyDigits(form.documento).length !== 14 || !isValidCnpj(form.documento)}
                            >
                              <SearchRoundedIcon fontSize="small" />
                            </IconButton>
                          )}
                        </InputAdornment>
                      )
                    }}
                  />
                </Grid>
              </Grid>
            </Box>

            <Divider />

            <Box>
              <Typography variant="overline" color="text.secondary">
                Contato comercial
              </Typography>
              <Grid container spacing={2} sx={{ mt: 0.5 }}>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Telefone / WhatsApp"
                    value={formatPhone(form.telefone)}
                    onChange={(event) => updateForm('telefone', formatPhone(event.target.value) || null)}
                    error={shouldShowError(saveAttempted, form.telefone) && Boolean(validationErrors.telefone)}
                    helperText={showHelper(saveAttempted, form.telefone, validationErrors.telefone, 'Informe com DDD. Ex.: (11) 99999-9999')}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={5}>
                  <TextField
                    label="E-mail"
                    value={form.email ?? ''}
                    onChange={(event) => updateForm('email', event.target.value || null)}
                    error={shouldShowError(saveAttempted, form.email) && Boolean(validationErrors.email)}
                    helperText={showHelper(saveAttempted, form.email, validationErrors.email, 'Usado para contato, cobranca ou relacionamento.')}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={3}>
                  <Stack spacing={1.25}>
                    <Typography variant="body2" color="text.secondary">
                      Sugestoes de segmento
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {segmentoSuggestions.slice(0, 4).map((segmento) => (
                        <Chip key={segmento} label={segmento} size="small" variant="outlined" onClick={() => updateForm('segmento', segmento)} />
                      ))}
                    </Stack>
                  </Stack>
                </Grid>
              </Grid>
            </Box>

            <Divider />

            <Box>
              <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                <LocationOnRoundedIcon color="primary" fontSize="small" />
                <Typography variant="overline" color="text.secondary">
                  Endereco estruturado
                </Typography>
              </Stack>
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
                    error={shouldShowError(saveAttempted, form.cep) && Boolean(validationErrors.cep)}
                    helperText={showHelper(
                      saveAttempted,
                      form.cep,
                      validationErrors.cep,
                      cepLookupLoading
                        ? 'Consultando CEP...'
                        : cepLookupMessage ?? 'Ao sair do campo, o sistema tenta preencher o endereco automaticamente.'
                    )}
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
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Logradouro"
                    value={form.logradouro ?? ''}
                    onChange={(event) => updateForm('logradouro', event.target.value || null)}
                    error={shouldShowError(saveAttempted, form.logradouro) && Boolean(validationErrors.logradouro)}
                    helperText={showHelper(saveAttempted, form.logradouro, validationErrors.logradouro, 'Rua, avenida, travessa ou nome do endereco principal.')}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    label="Numero"
                    value={form.numero ?? ''}
                    onChange={(event) => updateForm('numero', event.target.value || null)}
                    error={shouldShowError(saveAttempted, form.numero) && Boolean(validationErrors.numero)}
                    helperText={showHelper(saveAttempted, form.numero, validationErrors.numero, 'Ex.: 120, 400A ou S/N')}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Complemento"
                    value={form.complemento ?? ''}
                    onChange={(event) => updateForm('complemento', event.target.value || null)}
                    fullWidth
                    helperText="Bloco, sala, loja, referencia ou ponto comercial."
                  />
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    label="Bairro"
                    value={form.bairro ?? ''}
                    onChange={(event) => updateForm('bairro', event.target.value || null)}
                    error={shouldShowError(saveAttempted, form.bairro) && Boolean(validationErrors.bairro)}
                    helperText={showHelper(saveAttempted, form.bairro, validationErrors.bairro, 'Importante para entrega, rota e organizacao.')}
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
                        error={shouldShowError(saveAttempted, form.cidade) && Boolean(validationErrors.cidade)}
                        helperText={showHelper(
                          saveAttempted,
                          form.cidade,
                          validationErrors.cidade,
                          !form.uf
                            ? 'Selecione a UF para ativar a busca do municipio.'
                            : municipioSuggestionsLoading
                              ? 'Buscando municipios do IBGE...'
                              : 'Escolha a cidade da lista para preencher o codigo IBGE automaticamente.'
                        )}
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
                    error={shouldShowError(saveAttempted, form.uf) && Boolean(validationErrors.uf)}
                    helperText={showHelper(saveAttempted, form.uf, validationErrors.uf, 'Estado do cliente.')}
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
                <Grid item xs={12} md={3}>
                  <TextField
                    label="Codigo IBGE do municipio"
                    value={form.codigoMunicipioIbge ?? ''}
                    onChange={(event) => {
                      updateForm('codigoMunicipioIbge', event.target.value || null);
                      clearMunicipioResolution();
                    }}
                    onBlur={() => void resolveMunicipio(true)}
                    helperText={showHelper(
                      saveAttempted,
                      form.codigoMunicipioIbge,
                      validationErrors.codigoMunicipioIbge,
                      municipioResolveLoading
                        ? 'Validando municipio informado...'
                        : municipioLookupMessage ?? 'Obrigatorio para transmissao real da NF-e.'
                    )}
                    fullWidth
                  />
                </Grid>
              </Grid>
            </Box>

            <FormControlLabel
              control={<Checkbox checked={form.ehFornecedor} onChange={(event) => updateForm('ehFornecedor', event.target.checked)} />}
              label="Usar este cliente tambem como fornecedor e origem de mercadoria"
            />

            {form.ehFornecedor && !onlyDigits(form.documento) && (
              <Alert severity="warning" sx={{ borderRadius: 3 }}>
                Para o fluxo automatico de produtos por QR, codigo de barras e compras, o fornecedor precisa ter CPF/CNPJ real cadastrado.
              </Alert>
            )}

            <FormControlLabel
              control={<Checkbox checked={form.ativo} onChange={(event) => updateForm('ativo', event.target.checked)} />}
              label="Cliente ativo para venda e selecao em operacoes"
            />

            {editingClient && (
              <>
                <Divider />

                <Box>
                  <Stack direction="row" spacing={1} alignItems="center" mb={1.5}>
                    <ReceiptLongRoundedIcon color="primary" fontSize="small" />
                    <Typography variant="overline" color="text.secondary">
                      Historico de compras
                    </Typography>
                  </Stack>

                  {historyLoading ? (
                    <Typography color="text.secondary">Carregando historico do cliente...</Typography>
                  ) : clientHistory ? (
                    <Stack spacing={2}>
                      <Grid container spacing={2}>
                        <Grid item xs={12} md={3}>
                          <Card variant="outlined" sx={{ borderRadius: 4 }}>
                            <CardContent>
                              <Typography color="text.secondary">Total comprado</Typography>
                              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                                {formatCurrency(clientHistory.resumo.totalComprado)}
                              </Typography>
                            </CardContent>
                          </Card>
                        </Grid>
                        <Grid item xs={12} md={3}>
                          <Card variant="outlined" sx={{ borderRadius: 4 }}>
                            <CardContent>
                              <Typography color="text.secondary">Quantidade de vendas</Typography>
                              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                                {clientHistory.resumo.quantidadeVendas}
                              </Typography>
                            </CardContent>
                          </Card>
                        </Grid>
                        <Grid item xs={12} md={3}>
                          <Card variant="outlined" sx={{ borderRadius: 4 }}>
                            <CardContent>
                              <Typography color="text.secondary">Ticket medio</Typography>
                              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                                {formatCurrency(clientHistory.resumo.ticketMedio)}
                              </Typography>
                            </CardContent>
                          </Card>
                        </Grid>
                        <Grid item xs={12} md={3}>
                          <Card variant="outlined" sx={{ borderRadius: 4 }}>
                            <CardContent>
                              <Typography color="text.secondary">Ultima compra</Typography>
                              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                                {formatDateTime(clientHistory.resumo.ultimaCompra)}
                              </Typography>
                            </CardContent>
                          </Card>
                        </Grid>
                      </Grid>

                      <Paper variant="outlined" sx={{ borderRadius: 4, overflow: 'hidden' }}>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Venda</TableCell>
                              <TableCell>Data</TableCell>
                              <TableCell>Status</TableCell>
                              <TableCell>Pagamentos</TableCell>
                              <TableCell align="right">Total</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {clientHistory.vendasRecentes.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={5}>
                                  <Typography color="text.secondary">Este cliente ainda nao possui vendas vinculadas.</Typography>
                                </TableCell>
                              </TableRow>
                            ) : (
                              clientHistory.vendasRecentes.slice(0, 8).map((sale) => (
                                <TableRow key={sale.vendaId} hover>
                                  <TableCell>{sale.numeroVenda}</TableCell>
                                  <TableCell>{formatDateTime(sale.dataVenda)}</TableCell>
                                  <TableCell>{sale.status}</TableCell>
                                  <TableCell>{sale.formasPagamento || '-'}</TableCell>
                                  <TableCell align="right">{formatCurrency(sale.total)}</TableCell>
                                </TableRow>
                              ))
                            )}
                          </TableBody>
                        </Table>
                      </Paper>

                      {clientHistory.produtosRelacionados.length > 0 && (
                        <Paper variant="outlined" sx={{ borderRadius: 4, overflow: 'hidden' }}>
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell>Produto vinculado</TableCell>
                                <TableCell>Codigo fornecedor</TableCell>
                                <TableCell>Ultima NF</TableCell>
                                <TableCell align="right">Custo</TableCell>
                                <TableCell align="right">Estoque</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {clientHistory.produtosRelacionados.map((product) => (
                                <TableRow key={product.produtoId} hover>
                                  <TableCell>
                                    <Typography sx={{ fontWeight: 700 }}>{product.nome}</Typography>
                                    <Typography variant="body2" color="text.secondary">
                                      {product.codigoBarras ?? 'Sem codigo principal'} · {product.ativo ? 'Ativo' : 'Inativo'}
                                    </Typography>
                                  </TableCell>
                                  <TableCell>{product.codigoProdutoFornecedor ?? '-'}</TableCell>
                                  <TableCell>{product.ultimaNotaFiscalCompra ?? '-'}</TableCell>
                                  <TableCell align="right">{formatCurrency(product.precoCusto)}</TableCell>
                                  <TableCell align="right">{product.estoqueAtual.toFixed(3)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </Paper>
                      )}
                    </Stack>
                  ) : (
                    <Typography color="text.secondary">Nenhum historico carregado para este cliente.</Typography>
                  )}
                </Box>
              </>
            )}

            {editingClient && canManageClients && (
              <Box>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                  <Button color="warning" onClick={() => { setDeleteClient(editingClient); setDeletePermanent(false); }}>
                    Inativar cliente
                  </Button>
                  <Button color="error" onClick={() => { setDeleteClient(editingClient); setDeletePermanent(true); }}>
                    Excluir permanente
                  </Button>
                </Stack>
              </Box>
            )}
          </Stack>
      </DetachableDialog>

      <ConfirmDialog
        open={Boolean(deleteClient)}
        title={deletePermanent ? 'Excluir cliente permanentemente' : 'Inativar cliente'}
        description={
          deletePermanent
            ? `Deseja excluir permanentemente o cliente ${deleteClient?.nome ?? ''}? Isso so e permitido quando ele nao participa de vendas, financeiro ou produtos vinculados.`
            : `Deseja inativar o cliente ${deleteClient?.nome ?? ''}? O historico permanece salvo e ele deixa de aparecer nas operacoes.`
        }
        confirmLabel={deletePermanent ? 'Excluir permanente' : 'Inativar'}
        onCancel={() => {
          setDeleteClient(null);
          setDeletePermanent(false);
        }}
        onConfirm={() => void handleDelete()}
      />
    </Stack>
  );
}

function validateClientForm(form: ClientePayload): ClientFormErrors {
  const errors: ClientFormErrors = {};
  const nome = (form.nome ?? '').trim();
  const segmento = (form.segmento ?? '').trim();
  const documento = onlyDigits(form.documento);
  const telefone = onlyDigits(form.telefone);
  const email = (form.email ?? '').trim();
  const cep = onlyDigits(form.cep);
  const logradouro = (form.logradouro ?? '').trim();
  const numero = (form.numero ?? '').trim();
  const bairro = (form.bairro ?? '').trim();
  const cidade = (form.cidade ?? '').trim();
  const uf = (form.uf ?? '').trim();
  const codigoMunicipioIbge = onlyDigits(form.codigoMunicipioIbge);

  if (!nome) {
    errors.nome = 'Informe o nome ou a razao social do cliente.';
  } else if (nome.length < 3) {
    errors.nome = 'Nome deve ter pelo menos 3 caracteres.';
  } else if (nome.length > clientFieldMaxLengths.nome) {
    errors.nome = `Nome acima do limite de ${clientFieldMaxLengths.nome} caracteres.`;
  }

  if (!segmento) {
    errors.segmento = 'Informe o segmento do cliente.';
  } else if (segmento.length > clientFieldMaxLengths.segmento) {
    errors.segmento = `Segmento acima do limite de ${clientFieldMaxLengths.segmento} caracteres.`;
  }

  if (documento) {
    const isCpf = documento.length <= 11;
    const documentValid = isCpf ? documento.length === 11 && isValidCpf(documento) : documento.length === 14 && isValidCnpj(documento);

    if (!documentValid) {
      errors.documento = isCpf ? 'CPF invalido.' : 'CNPJ invalido.';
    }
  }

  if (form.ehFornecedor && !documento) {
    errors.documento = 'Fornecedor precisa ter CPF/CNPJ real cadastrado.';
  }

  if (telefone && ![10, 11].includes(telefone.length)) {
    errors.telefone = 'Telefone deve conter DDD e 10 ou 11 digitos.';
  } else if ((form.telefone ?? '').trim().length > clientFieldMaxLengths.telefone) {
    errors.telefone = `Telefone acima do limite de ${clientFieldMaxLengths.telefone} caracteres.`;
  }

  if (email && !isValidEmail(email)) {
    errors.email = 'E-mail invalido.';
  } else if (email.length > clientFieldMaxLengths.email) {
    errors.email = `E-mail acima do limite de ${clientFieldMaxLengths.email} caracteres.`;
  }

  if (cep && cep.length !== 8) {
    errors.cep = 'CEP deve conter 8 digitos.';
  }

  if (cidade && !uf) {
    errors.uf = 'Selecione a UF para a cidade informada.';
  }

  if (uf && !cidade) {
    errors.cidade = 'Informe a cidade para a UF selecionada.';
  }

  if (logradouro.length > 180) {
    errors.logradouro = 'Logradouro acima do limite permitido.';
  }

  if (numero.length > clientFieldMaxLengths.numero) {
    errors.numero = 'Numero acima do limite permitido.';
  }

  if ((form.complemento ?? '').trim().length > clientFieldMaxLengths.complemento) {
    errors.complemento = 'Complemento acima do limite permitido.';
  }

  if (bairro.length > clientFieldMaxLengths.bairro) {
    errors.bairro = 'Bairro acima do limite permitido.';
  }

  if (cidade.length > clientFieldMaxLengths.cidade) {
    errors.cidade = 'Cidade acima do limite permitido.';
  }

  if (uf.length > clientFieldMaxLengths.uf) {
    errors.uf = 'UF acima do limite permitido.';
  }

  if (codigoMunicipioIbge && codigoMunicipioIbge.length !== clientFieldMaxLengths.codigoMunicipioIbge) {
    errors.codigoMunicipioIbge = 'Codigo IBGE do municipio deve conter 7 digitos.';
  }

  return errors;
}

function normalizePayload(form: ClientePayload): ClientePayload {
  const payload: ClientePayload = {
    nome: form.nome.trim(),
    documento: emptyToNull(formatCpfCnpj(form.documento)),
    segmento: emptyToNull(form.segmento),
    telefone: emptyToNull(formatPhone(form.telefone)),
    email: emptyToNull(form.email),
    cep: emptyToNull(formatCep(form.cep)),
    logradouro: emptyToNull(form.logradouro),
    numero: emptyToNull(form.numero),
    complemento: emptyToNull(form.complemento),
    bairro: emptyToNull(form.bairro),
    cidade: emptyToNull(form.cidade),
    uf: emptyToNull(form.uf)?.toUpperCase() ?? null,
    codigoMunicipioIbge: emptyToNull(form.codigoMunicipioIbge),
    endereco: null,
    ehFornecedor: form.ehFornecedor,
    ativo: form.ativo
  };

  payload.endereco = buildAddressPreview(payload);
  return payload;
}

function buildAddressPreview(form: ClientePayload) {
  const firstLine = [emptyToNull(form.logradouro), emptyToNull(form.numero), emptyToNull(form.complemento)].filter(Boolean).join(', ');
  const secondLine = [emptyToNull(form.bairro), emptyToNull(form.cidade), emptyToNull(form.uf)].filter(Boolean).join(' - ');
  const parts = [firstLine, secondLine, emptyToNull(form.cep) ? `CEP ${formatCep(form.cep)}` : null].filter(Boolean);
  return parts.length > 0 ? parts.join(' | ') : null;
}

function emptyToNull(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function shouldShowError(saveAttempted: boolean, value: string | null | undefined) {
  return saveAttempted || Boolean(value?.trim());
}

function showHelper(
  saveAttempted: boolean,
  value: string | null | undefined,
  error: string | undefined,
  fallback: string
) {
  if (shouldShowError(saveAttempted, value) && error) {
    return error;
  }

  return fallback;
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

function mergeClientFormWithCnpjResult(form: ClientePayload, result: CnpjLookupResult, overwriteOfficialData: boolean): ClientePayload {
  const nomeOficial = fitImportedText(result.razaoSocial || result.nomeFantasia, clientFieldMaxLengths.nome);

  return {
    ...form,
    nome: pickImportedValue(form.nome, nomeOficial, overwriteOfficialData) ?? form.nome,
    segmento: pickImportedValue(form.segmento, fitImportedText(result.segmento, clientFieldMaxLengths.segmento), overwriteOfficialData),
    telefone: pickImportedValue(form.telefone, fitImportedText(result.telefone, clientFieldMaxLengths.telefone), overwriteOfficialData),
    email: pickImportedValue(form.email, fitImportedText(result.email, clientFieldMaxLengths.email), overwriteOfficialData),
    cep: pickImportedValue(form.cep, result.cep, overwriteOfficialData),
    logradouro: pickImportedValue(form.logradouro, fitImportedText(result.logradouro, clientFieldMaxLengths.logradouro), overwriteOfficialData),
    numero: pickImportedValue(form.numero, fitImportedText(result.numero, clientFieldMaxLengths.numero), overwriteOfficialData),
    complemento: pickImportedValue(form.complemento, fitImportedText(result.complemento, clientFieldMaxLengths.complemento), overwriteOfficialData),
    bairro: pickImportedValue(form.bairro, fitImportedText(result.bairro, clientFieldMaxLengths.bairro), overwriteOfficialData),
    cidade: pickImportedValue(form.cidade, fitImportedText(result.cidade, clientFieldMaxLengths.cidade), overwriteOfficialData),
    uf: pickImportedValue(form.uf, fitImportedText(result.uf, clientFieldMaxLengths.uf), overwriteOfficialData),
    codigoMunicipioIbge: pickImportedValue(form.codigoMunicipioIbge, fitImportedText(result.codigoMunicipioIbge, clientFieldMaxLengths.codigoMunicipioIbge), overwriteOfficialData)
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

function buildCnpjLookupMessage(result: CnpjLookupResult) {
  const parts = [`CNPJ localizado: ${result.razaoSocial}.`];

  if (result.nomeFantasia && normalizeCompareValue(result.nomeFantasia) !== normalizeCompareValue(result.razaoSocial)) {
    parts.push(`Fantasia: ${result.nomeFantasia}.`);
  }

  if (result.telefone) {
    parts.push(`Telefone principal: ${result.telefone}.`);
  }

  if (result.telefoneSecundario) {
    parts.push(`Telefone adicional: ${result.telefoneSecundario}.`);
  }

  if (result.email) {
    parts.push(`E-mail: ${result.email}.`);
  }

  return parts.join(' ');
}

function normalizeCompareValue(value: string | null | undefined) {
  return emptyToNull(value)?.toLocaleLowerCase('pt-BR') ?? null;
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
