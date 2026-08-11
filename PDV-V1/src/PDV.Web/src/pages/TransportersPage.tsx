import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import LocalShippingRoundedIcon from '@mui/icons-material/LocalShippingRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ListFilterField } from '../components/common/ListFilterField';
import { Loading } from '../components/common/Loading';
import { cepService } from '../services/cepService';
import { cnpjService, type CnpjLookupResult } from '../services/cnpjService';
import { transportService, type TransportadoraPayload } from '../services/transportService';
import type { Transportadora } from '../types';
import { formatCep, formatCpfCnpj, formatPhone, isValidCnpj, isValidEmail, onlyDigits } from '../utils/br';
import { getErrorMessage } from '../utils/http';
import { ufOptions } from '../utils/ufs';

const emptyForm: TransportadoraPayload = {
  nome: '',
  nomeFantasia: null,
  documento: null,
  inscricaoEstadual: null,
  telefone: null,
  email: null,
  responsavel: null,
  cep: null,
  logradouro: null,
  numero: null,
  complemento: null,
  bairro: null,
  cidade: null,
  uf: null,
  codigoMunicipioIbge: null,
  endereco: null,
  corTemaHex: '#1D4ED8',
  prazoMedioEntregaMinutos: 60,
  observacao: null,
  ativo: true
};

const transporterFieldMaxLengths = {
  nome: 150,
  nomeFantasia: 150,
  inscricaoEstadual: 20,
  telefone: 20,
  email: 150,
  responsavel: 120,
  logradouro: 180,
  numero: 20,
  complemento: 120,
  bairro: 80,
  cidade: 80,
  uf: 2,
  codigoMunicipioIbge: 7,
  endereco: 220,
  observacao: 500
} as const;

type TransportadoraFormErrors = Partial<Record<keyof TransportadoraPayload, string>>;

export function TransportersPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [transportadoras, setTransportadoras] = useState<Transportadora[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTransportadora, setEditingTransportadora] = useState<Transportadora | null>(null);
  const [form, setForm] = useState<TransportadoraPayload>(emptyForm);
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [cnpjLookupLoading, setCnpjLookupLoading] = useState(false);
  const [cnpjLookupMessage, setCnpjLookupMessage] = useState<string | null>(null);
  const [lastFetchedCnpj, setLastFetchedCnpj] = useState<string | null>(null);
  const [cepLookupLoading, setCepLookupLoading] = useState(false);
  const [cepLookupMessage, setCepLookupMessage] = useState<string | null>(null);
  const [lastFetchedCep, setLastFetchedCep] = useState<string | null>(null);
  const { enqueueSnackbar } = useSnackbar();
  const deferredSearch = useDeferredValue(search);
  const validationErrors = useMemo(() => validateTransportadoraForm(form), [form]);

  useEffect(() => {
    void loadTransportadoras();
  }, []);

  const filteredTransportadoras = useMemo(
    () => transportadoras.filter((transportadora) => matchesTransportadoraFilter(
      deferredSearch,
      transportadora.nome,
      transportadora.nomeFantasia,
      transportadora.documento,
      transportadora.inscricaoEstadual,
      transportadora.responsavel,
      transportadora.telefone,
      transportadora.email,
      transportadora.cidade,
      transportadora.uf,
      transportadora.endereco
    )),
    [deferredSearch, transportadoras]
  );

  async function loadTransportadoras() {
    setLoading(true);
    try {
      const result = await transportService.list(true);
      setTransportadoras(result.sort((left, right) => {
        if (left.ativo !== right.ativo) {
          return left.ativo ? -1 : 1;
        }

        return resolveTransportadoraTitulo(left).localeCompare(resolveTransportadoraTitulo(right), 'pt-BR');
      }));
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  function updateForm<Key extends keyof TransportadoraPayload>(key: Key, value: TransportadoraPayload[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetDialogState(nextForm: TransportadoraPayload, editing: Transportadora | null, nextFetchedCnpj: string | null, nextFetchedCep: string | null) {
    setEditingTransportadora(editing);
    setForm(nextForm);
    setSaveAttempted(false);
    setCnpjLookupLoading(false);
    setCnpjLookupMessage(null);
    setLastFetchedCnpj(nextFetchedCnpj);
    setCepLookupLoading(false);
    setCepLookupMessage(nextFetchedCep ? `CEP carregado: ${formatCep(nextFetchedCep)}` : null);
    setLastFetchedCep(nextFetchedCep);
    setDialogOpen(true);
  }

  function openCreateDialog() {
    resetDialogState(emptyForm, null, null, null);
  }

  function openEditDialog(transportadora: Transportadora) {
    resetDialogState(
      {
        nome: transportadora.nome,
        nomeFantasia: transportadora.nomeFantasia,
        documento: transportadora.documento,
        inscricaoEstadual: transportadora.inscricaoEstadual,
        telefone: transportadora.telefone,
        email: transportadora.email,
        responsavel: transportadora.responsavel,
        cep: transportadora.cep,
        logradouro: transportadora.logradouro,
        numero: transportadora.numero,
        complemento: transportadora.complemento,
        bairro: transportadora.bairro,
        cidade: transportadora.cidade,
        uf: transportadora.uf,
        codigoMunicipioIbge: transportadora.codigoMunicipioIbge,
        endereco: transportadora.endereco,
        corTemaHex: transportadora.corTemaHex,
        prazoMedioEntregaMinutos: transportadora.prazoMedioEntregaMinutos,
        observacao: transportadora.observacao,
        ativo: transportadora.ativo
      },
      transportadora,
      onlyDigits(transportadora.documento) || null,
      onlyDigits(transportadora.cep) || null
    );
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
    setCnpjLookupMessage('Consultando CNPJ da transportadora...');

    try {
      const result = await cnpjService.lookup(digits);
      setForm((current) => mergeTransportadoraFormWithCnpjResult(current, result, force));
      setLastFetchedCnpj(digits);
      setCnpjLookupMessage(buildCnpjLookupMessage(result));
      setLastFetchedCep(onlyDigits(result.cep) || null);
      setCepLookupMessage(result.cep ? `CEP preenchido a partir do CNPJ: ${result.cep}` : null);
    } catch (error) {
      setLastFetchedCnpj(null);
      setCnpjLookupMessage('Nao foi possivel completar os dados da transportadora com esse CNPJ.');
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
      setCepLookupMessage(`Endereco localizado: ${result.cidade}/${result.uf}`);
    } catch (error) {
      setLastFetchedCep(null);
      setCepLookupMessage('Nao foi possivel preencher o endereco com esse CEP.');
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setCepLookupLoading(false);
    }
  }

  async function saveTransportadora() {
    setSaveAttempted(true);
    const firstError = Object.values(validationErrors).find(Boolean);
    if (firstError) {
      enqueueSnackbar(firstError, { variant: 'warning' });
      return;
    }

    setSaving(true);
    try {
      const payload = normalizePayload(form);

      if (editingTransportadora) {
        await transportService.update(editingTransportadora.transportadoraId, payload);
        enqueueSnackbar('Transportadora atualizada.', { variant: 'success' });
      } else {
        await transportService.create(payload);
        enqueueSnackbar('Transportadora criada.', { variant: 'success' });
      }

      setDialogOpen(false);
      await loadTransportadoras();
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function archiveTransportadora(id: string) {
    try {
      await transportService.archive(id);
      enqueueSnackbar('Transportadora inativada.', { variant: 'success' });
      await loadTransportadoras();
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    }
  }

  if (loading) {
    return <Loading message="Carregando transportadoras..." />;
  }

  const activeCount = transportadoras.filter((item) => item.ativo).length;
  const withDocumentCount = transportadoras.filter((item) => item.documento).length;

  return (
    <>
      <Stack spacing={3}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}>
          <Box>
            <Typography variant="h4">Transportadoras</Typography>
            <Typography color="text.secondary">
              Cadastre parceiros com CNPJ, endereco operacional, dados fiscais e SLA para a entrega ficar com cara de operacao real.
            </Typography>
          </Box>
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={openCreateDialog}>
            Nova transportadora
          </Button>
        </Stack>

        <Card sx={{ borderRadius: 5 }}>
          <CardContent>
            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ lg: 'center' }}>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip label={`${activeCount} ativas`} color="success" />
                <Chip label={`${withDocumentCount} com CNPJ`} color="primary" variant="outlined" />
                <Chip label={`${transportadoras.length} cadastradas`} variant="outlined" />
              </Stack>
              <ListFilterField
                label="Filtrar transportadoras"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nome, CNPJ, IE, cidade, telefone..."
                sx={{ width: { xs: '100%', lg: 360 } }}
              />
            </Stack>
          </CardContent>
        </Card>

        {transportadoras.length === 0 ? (
          <Alert severity="info" sx={{ borderRadius: 4 }}>
            Nenhuma transportadora cadastrada ainda.
          </Alert>
        ) : filteredTransportadoras.length === 0 ? (
          <Alert severity="info" sx={{ borderRadius: 4 }}>
            Nenhuma transportadora combina com o filtro informado.
          </Alert>
        ) : (
          <Grid container spacing={2}>
            {filteredTransportadoras.map((transportadora) => {
              const titulo = resolveTransportadoraTitulo(transportadora);
              const razaoDiferente = Boolean(
                transportadora.nomeFantasia &&
                normalizeCompareValue(transportadora.nomeFantasia) !== normalizeCompareValue(transportadora.nome)
              );

              return (
                <Grid item xs={12} md={6} xl={4} key={transportadora.transportadoraId}>
                  <Card sx={{ borderRadius: 5, height: '100%' }}>
                    <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, height: '100%' }}>
                      <Stack direction="row" justifyContent="space-between" spacing={1}>
                        <Stack direction="row" spacing={1.25} alignItems="flex-start">
                          <LocalShippingRoundedIcon sx={{ color: transportadora.corTemaHex ?? 'primary.main', mt: 0.2 }} />
                          <Box>
                            <Typography sx={{ fontWeight: 900 }}>{titulo}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              {razaoDiferente ? transportadora.nome : transportadora.responsavel ?? 'Sem responsavel principal'}
                            </Typography>
                          </Box>
                        </Stack>
                        <Chip label={transportadora.ativo ? 'Ativa' : 'Inativa'} color={transportadora.ativo ? 'success' : 'default'} />
                      </Stack>

                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        {transportadora.documento ? <Chip label={transportadora.documento} size="small" variant="outlined" /> : null}
                        {transportadora.inscricaoEstadual ? <Chip label={`IE ${transportadora.inscricaoEstadual}`} size="small" variant="outlined" /> : null}
                        {transportadora.cidade && transportadora.uf ? <Chip label={`${transportadora.cidade}/${transportadora.uf}`} size="small" /> : null}
                      </Stack>

                      <Stack spacing={0.5}>
                        <Typography variant="body2" color="text.secondary">
                          {[transportadora.telefone, transportadora.email].filter(Boolean).join(' · ') || 'Sem contato cadastrado'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {transportadora.prazoMedioEntregaMinutos
                            ? `Prazo medio: ${transportadora.prazoMedioEntregaMinutos} min`
                            : 'Prazo medio nao informado'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {transportadora.endereco ?? 'Endereco operacional nao informado'}
                        </Typography>
                      </Stack>

                      {transportadora.observacao ? (
                        <Alert severity="info" sx={{ borderRadius: 3 }}>
                          {transportadora.observacao}
                        </Alert>
                      ) : null}

                      <Stack direction="row" spacing={1} sx={{ mt: 'auto' }}>
                        <Button variant="outlined" startIcon={<EditRoundedIcon />} onClick={() => openEditDialog(transportadora)}>
                          Editar
                        </Button>
                        {transportadora.ativo ? (
                          <Button color="error" variant="text" startIcon={<DeleteOutlineRoundedIcon />} onClick={() => void archiveTransportadora(transportadora.transportadoraId)}>
                            Inativar
                          </Button>
                        ) : null}
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        )}
      </Stack>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>{editingTransportadora ? 'Editar transportadora' : 'Nova transportadora'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={3} sx={{ pt: 1 }}>
            <Alert severity="info" sx={{ borderRadius: 3 }}>
              Use o CNPJ para completar razao social, fantasia, IE e endereco, como em um cadastro corporativo de operacao real.
            </Alert>

            <Box>
              <Typography variant="overline" color="text.secondary">
                Identificacao empresarial
              </Typography>
              <Grid container spacing={1.5} sx={{ mt: 0.25 }}>
                <Grid item xs={12} md={8}>
                  <TextField
                    label="Razao social"
                    value={form.nome}
                    onChange={(event) => updateForm('nome', event.target.value)}
                    error={Boolean(saveAttempted && validationErrors.nome)}
                    helperText={saveAttempted ? validationErrors.nome ?? 'Nome principal da transportadora.' : 'Nome principal da transportadora.'}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Nome fantasia"
                    value={form.nomeFantasia ?? ''}
                    onChange={(event) => updateForm('nomeFantasia', event.target.value || null)}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="CNPJ"
                    value={formatCpfCnpj(form.documento)}
                    onChange={(event) => {
                      updateForm('documento', event.target.value || null);
                      setLastFetchedCnpj(null);
                    }}
                    onBlur={() => void lookupCnpj(false)}
                    error={Boolean(shouldShowError(saveAttempted, form.documento) && validationErrors.documento)}
                    helperText={
                      shouldShowError(saveAttempted, form.documento) && validationErrors.documento
                        ? validationErrors.documento
                        : cnpjLookupLoading
                          ? 'Consultando CNPJ...'
                          : cnpjLookupMessage ?? 'Busque o CNPJ para preencher os dados automaticamente.'
                    }
                    fullWidth
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <Button
                            size="small"
                            variant="text"
                            onClick={() => void lookupCnpj(true)}
                            disabled={onlyDigits(form.documento).length !== 14 || !isValidCnpj(form.documento)}
                            startIcon={cnpjLookupLoading ? <CircularProgress size={16} /> : <SearchRoundedIcon fontSize="small" />}
                          >
                            Buscar
                          </Button>
                        </InputAdornment>
                      )
                    }}
                  />
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    label="Inscricao estadual"
                    value={form.inscricaoEstadual ?? ''}
                    onChange={(event) => updateForm('inscricaoEstadual', event.target.value || null)}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    label="Responsavel"
                    value={form.responsavel ?? ''}
                    onChange={(event) => updateForm('responsavel', event.target.value || null)}
                    fullWidth
                  />
                </Grid>
              </Grid>
            </Box>

            <Divider />

            <Box>
              <Typography variant="overline" color="text.secondary">
                Contato e endereco operacional
              </Typography>
              <Grid container spacing={1.5} sx={{ mt: 0.25 }}>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Telefone"
                    value={formatPhone(form.telefone)}
                    onChange={(event) => updateForm('telefone', event.target.value || null)}
                    error={Boolean(shouldShowError(saveAttempted, form.telefone) && validationErrors.telefone)}
                    helperText={showHelper(saveAttempted, form.telefone, validationErrors.telefone, 'Telefone principal da operacao.')}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="E-mail"
                    value={form.email ?? ''}
                    onChange={(event) => updateForm('email', event.target.value || null)}
                    error={Boolean(shouldShowError(saveAttempted, form.email) && validationErrors.email)}
                    helperText={showHelper(saveAttempted, form.email, validationErrors.email, 'Contato comercial ou operacional.')}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="CEP"
                    value={formatCep(form.cep)}
                    onChange={(event) => {
                      updateForm('cep', event.target.value || null);
                      setLastFetchedCep(null);
                    }}
                    onBlur={() => void lookupCep(false)}
                    error={Boolean(shouldShowError(saveAttempted, form.cep) && validationErrors.cep)}
                    helperText={
                      shouldShowError(saveAttempted, form.cep) && validationErrors.cep
                        ? validationErrors.cep
                        : cepLookupLoading
                          ? 'Consultando CEP...'
                          : cepLookupMessage ?? 'Informe o CEP para completar o endereco.'
                    }
                    fullWidth
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <Button
                            size="small"
                            variant="text"
                            onClick={() => void lookupCep(true)}
                            disabled={onlyDigits(form.cep).length !== 8}
                            startIcon={cepLookupLoading ? <CircularProgress size={16} /> : <SearchRoundedIcon fontSize="small" />}
                          >
                            CEP
                          </Button>
                        </InputAdornment>
                      )
                    }}
                  />
                </Grid>
                <Grid item xs={12} md={8}>
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
                <Grid item xs={12} md={2}>
                  <TextField
                    label="UF"
                    select
                    value={form.uf ?? ''}
                    onChange={(event) => updateForm('uf', event.target.value || null)}
                    error={Boolean(shouldShowError(saveAttempted, form.uf) && validationErrors.uf)}
                    helperText={showHelper(saveAttempted, form.uf, validationErrors.uf, 'UF operacional.')}
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
                    label="Complemento"
                    value={form.complemento ?? ''}
                    onChange={(event) => updateForm('complemento', event.target.value || null)}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Bairro"
                    value={form.bairro ?? ''}
                    onChange={(event) => updateForm('bairro', event.target.value || null)}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Cidade"
                    value={form.cidade ?? ''}
                    onChange={(event) => updateForm('cidade', event.target.value || null)}
                    error={Boolean(shouldShowError(saveAttempted, form.cidade) && validationErrors.cidade)}
                    helperText={showHelper(saveAttempted, form.cidade, validationErrors.cidade, 'Cidade operacional.')}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField
                    label="Codigo IBGE do municipio"
                    value={form.codigoMunicipioIbge ?? ''}
                    onChange={(event) => updateForm('codigoMunicipioIbge', event.target.value || null)}
                    error={Boolean(shouldShowError(saveAttempted, form.codigoMunicipioIbge) && validationErrors.codigoMunicipioIbge)}
                    helperText={showHelper(saveAttempted, form.codigoMunicipioIbge, validationErrors.codigoMunicipioIbge, 'Usado para cadastro fiscal mais completo.')}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={8}>
                  <TextField
                    label="Endereco resumido"
                    value={buildAddressPreview(form) ?? ''}
                    InputProps={{ readOnly: true }}
                    helperText="Montado automaticamente a partir do endereco estruturado."
                    fullWidth
                  />
                </Grid>
              </Grid>
            </Box>

            <Divider />

            <Box>
              <Typography variant="overline" color="text.secondary">
                Parametros da operacao
              </Typography>
              <Grid container spacing={1.5} sx={{ mt: 0.25 }}>
                <Grid item xs={12} md={3}>
                  <TextField
                    label="Cor da marca"
                    value={form.corTemaHex ?? ''}
                    onChange={(event) => updateForm('corTemaHex', event.target.value || null)}
                    error={Boolean(shouldShowError(saveAttempted, form.corTemaHex) && validationErrors.corTemaHex)}
                    helperText={showHelper(saveAttempted, form.corTemaHex, validationErrors.corTemaHex, 'Formato hexadecimal, ex.: #1D4ED8')}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={3}>
                  <TextField
                    label="Prazo medio em minutos"
                    type="number"
                    value={form.prazoMedioEntregaMinutos ?? ''}
                    onChange={(event) => updateForm('prazoMedioEntregaMinutos', event.target.value ? Number(event.target.value) : null)}
                    error={Boolean(validationErrors.prazoMedioEntregaMinutos)}
                    helperText={validationErrors.prazoMedioEntregaMinutos ?? 'SLA previsto para a entrega.'}
                    fullWidth
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField
                    label="Observacao operacional"
                    value={form.observacao ?? ''}
                    onChange={(event) => updateForm('observacao', event.target.value || null)}
                    fullWidth
                  />
                </Grid>
              </Grid>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={() => void saveTransportadora()} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function validateTransportadoraForm(form: TransportadoraPayload): TransportadoraFormErrors {
  const errors: TransportadoraFormErrors = {};
  const nome = (form.nome ?? '').trim();
  const nomeFantasia = (form.nomeFantasia ?? '').trim();
  const documento = onlyDigits(form.documento);
  const inscricaoEstadual = (form.inscricaoEstadual ?? '').trim();
  const telefone = onlyDigits(form.telefone);
  const email = (form.email ?? '').trim();
  const responsavel = (form.responsavel ?? '').trim();
  const cep = onlyDigits(form.cep);
  const logradouro = (form.logradouro ?? '').trim();
  const numero = (form.numero ?? '').trim();
  const complemento = (form.complemento ?? '').trim();
  const bairro = (form.bairro ?? '').trim();
  const cidade = (form.cidade ?? '').trim();
  const uf = (form.uf ?? '').trim();
  const codigoMunicipioIbge = onlyDigits(form.codigoMunicipioIbge);
  const observacao = (form.observacao ?? '').trim();

  if (!nome) {
    errors.nome = 'Informe a razao social da transportadora.';
  } else if (nome.length < 3) {
    errors.nome = 'Razao social deve ter pelo menos 3 caracteres.';
  } else if (nome.length > transporterFieldMaxLengths.nome) {
    errors.nome = `Razao social acima do limite de ${transporterFieldMaxLengths.nome} caracteres.`;
  }

  if (nomeFantasia.length > transporterFieldMaxLengths.nomeFantasia) {
    errors.nomeFantasia = `Nome fantasia acima do limite de ${transporterFieldMaxLengths.nomeFantasia} caracteres.`;
  }

  if (documento && (documento.length !== 14 || !isValidCnpj(documento))) {
    errors.documento = 'CNPJ invalido.';
  }

  if (inscricaoEstadual.length > transporterFieldMaxLengths.inscricaoEstadual) {
    errors.inscricaoEstadual = 'Inscricao estadual acima do limite permitido.';
  }

  if (telefone && ![10, 11].includes(telefone.length)) {
    errors.telefone = 'Telefone deve conter DDD e 10 ou 11 digitos.';
  } else if ((form.telefone ?? '').trim().length > transporterFieldMaxLengths.telefone) {
    errors.telefone = `Telefone acima do limite de ${transporterFieldMaxLengths.telefone} caracteres.`;
  }

  if (email && !isValidEmail(email)) {
    errors.email = 'E-mail invalido.';
  } else if (email.length > transporterFieldMaxLengths.email) {
    errors.email = `E-mail acima do limite de ${transporterFieldMaxLengths.email} caracteres.`;
  }

  if (responsavel.length > transporterFieldMaxLengths.responsavel) {
    errors.responsavel = 'Responsavel acima do limite permitido.';
  }

  if (cep && cep.length !== 8) {
    errors.cep = 'CEP deve conter 8 digitos.';
  }

  if (logradouro.length > transporterFieldMaxLengths.logradouro) {
    errors.logradouro = 'Logradouro acima do limite permitido.';
  }

  if (numero.length > transporterFieldMaxLengths.numero) {
    errors.numero = 'Numero acima do limite permitido.';
  }

  if (complemento.length > transporterFieldMaxLengths.complemento) {
    errors.complemento = 'Complemento acima do limite permitido.';
  }

  if (bairro.length > transporterFieldMaxLengths.bairro) {
    errors.bairro = 'Bairro acima do limite permitido.';
  }

  if (cidade && !uf) {
    errors.uf = 'Selecione a UF para a cidade informada.';
  }

  if (uf && !cidade) {
    errors.cidade = 'Informe a cidade para a UF selecionada.';
  }

  if (cidade.length > transporterFieldMaxLengths.cidade) {
    errors.cidade = 'Cidade acima do limite permitido.';
  }

  if (uf.length > transporterFieldMaxLengths.uf) {
    errors.uf = 'UF acima do limite permitido.';
  }

  if (codigoMunicipioIbge && codigoMunicipioIbge.length !== transporterFieldMaxLengths.codigoMunicipioIbge) {
    errors.codigoMunicipioIbge = 'Codigo IBGE do municipio deve conter 7 digitos.';
  }

  if ((form.corTemaHex ?? '').trim() && !/^#[0-9A-Fa-f]{6}$/.test((form.corTemaHex ?? '').trim())) {
    errors.corTemaHex = 'Use o formato hexadecimal, ex.: #1D4ED8.';
  }

  if ((form.prazoMedioEntregaMinutos ?? 0) < 0) {
    errors.prazoMedioEntregaMinutos = 'Prazo medio nao pode ser negativo.';
  }

  if (observacao.length > transporterFieldMaxLengths.observacao) {
    errors.observacao = 'Observacao acima do limite permitido.';
  }

  return errors;
}

function normalizePayload(form: TransportadoraPayload): TransportadoraPayload {
  return {
    nome: form.nome.trim(),
    nomeFantasia: emptyToNull(form.nomeFantasia),
    documento: emptyToNull(formatCpfCnpj(form.documento)),
    inscricaoEstadual: emptyToNull(form.inscricaoEstadual),
    telefone: emptyToNull(formatPhone(form.telefone)),
    email: emptyToNull(form.email),
    responsavel: emptyToNull(form.responsavel),
    cep: emptyToNull(formatCep(form.cep)),
    logradouro: emptyToNull(form.logradouro),
    numero: emptyToNull(form.numero),
    complemento: emptyToNull(form.complemento),
    bairro: emptyToNull(form.bairro),
    cidade: emptyToNull(form.cidade),
    uf: emptyToNull(form.uf)?.toUpperCase() ?? null,
    codigoMunicipioIbge: emptyToNull(form.codigoMunicipioIbge),
    endereco: buildAddressPreview(form),
    corTemaHex: emptyToNull(form.corTemaHex)?.toUpperCase() ?? null,
    prazoMedioEntregaMinutos: form.prazoMedioEntregaMinutos,
    observacao: emptyToNull(form.observacao),
    ativo: form.ativo
  };
}

function buildAddressPreview(form: TransportadoraPayload) {
  const firstLine = [emptyToNull(form.logradouro), emptyToNull(form.numero), emptyToNull(form.complemento)].filter(Boolean).join(', ');
  const secondLine = [emptyToNull(form.bairro), emptyToNull(form.cidade), emptyToNull(form.uf)].filter(Boolean).join(' - ');
  const parts = [firstLine, secondLine, emptyToNull(form.cep) ? `CEP ${formatCep(form.cep)}` : null].filter(Boolean);
  return parts.length > 0 ? parts.join(' | ') : null;
}

function mergeTransportadoraFormWithCnpjResult(form: TransportadoraPayload, result: CnpjLookupResult, overwriteOfficialData: boolean): TransportadoraPayload {
  const razaoSocial = fitImportedText(result.razaoSocial || result.nomeFantasia, transporterFieldMaxLengths.nome);

  return {
    ...form,
    nome: pickImportedValue(form.nome, razaoSocial, overwriteOfficialData) ?? form.nome,
    nomeFantasia: pickImportedValue(form.nomeFantasia, fitImportedText(result.nomeFantasia, transporterFieldMaxLengths.nomeFantasia), overwriteOfficialData),
    inscricaoEstadual: pickImportedValue(form.inscricaoEstadual, fitImportedText(result.inscricaoEstadual, transporterFieldMaxLengths.inscricaoEstadual), overwriteOfficialData),
    telefone: pickImportedValue(form.telefone, fitImportedText(result.telefone, transporterFieldMaxLengths.telefone), overwriteOfficialData),
    email: pickImportedValue(form.email, fitImportedText(result.email, transporterFieldMaxLengths.email), overwriteOfficialData),
    cep: pickImportedValue(form.cep, result.cep, overwriteOfficialData),
    logradouro: pickImportedValue(form.logradouro, fitImportedText(result.logradouro, transporterFieldMaxLengths.logradouro), overwriteOfficialData),
    numero: pickImportedValue(form.numero, fitImportedText(result.numero, transporterFieldMaxLengths.numero), overwriteOfficialData),
    complemento: pickImportedValue(form.complemento, fitImportedText(result.complemento, transporterFieldMaxLengths.complemento), overwriteOfficialData),
    bairro: pickImportedValue(form.bairro, fitImportedText(result.bairro, transporterFieldMaxLengths.bairro), overwriteOfficialData),
    cidade: pickImportedValue(form.cidade, fitImportedText(result.cidade, transporterFieldMaxLengths.cidade), overwriteOfficialData),
    uf: pickImportedValue(form.uf, fitImportedText(result.uf, transporterFieldMaxLengths.uf), overwriteOfficialData),
    codigoMunicipioIbge: pickImportedValue(form.codigoMunicipioIbge, fitImportedText(result.codigoMunicipioIbge, transporterFieldMaxLengths.codigoMunicipioIbge), overwriteOfficialData)
  };
}

function buildCnpjLookupMessage(result: CnpjLookupResult) {
  const parts = [`CNPJ localizado: ${result.razaoSocial}.`];

  if (result.nomeFantasia && normalizeCompareValue(result.nomeFantasia) !== normalizeCompareValue(result.razaoSocial)) {
    parts.push(`Fantasia: ${result.nomeFantasia}.`);
  }

  if (result.inscricaoEstadual) {
    parts.push(`IE: ${result.inscricaoEstadual}.`);
  }

  if (result.telefone) {
    parts.push(`Telefone principal: ${result.telefone}.`);
  }

  if (result.email) {
    parts.push(`E-mail: ${result.email}.`);
  }

  return parts.join(' ');
}

function resolveTransportadoraTitulo(transportadora: Transportadora) {
  return transportadora.nomeFantasia ?? transportadora.nome;
}

function emptyToNull(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function shouldShowError(saveAttempted: boolean, value: string | null | undefined) {
  return saveAttempted || Boolean(value?.trim());
}

function showHelper(saveAttempted: boolean, value: string | null | undefined, error: string | undefined, fallback: string) {
  if (shouldShowError(saveAttempted, value) && error) {
    return error;
  }

  return fallback;
}

function pickImportedValue(currentValue: string | null | undefined, importedValue: string | null | undefined, overwriteOfficialData: boolean) {
  const current = emptyToNull(currentValue);
  const imported = emptyToNull(importedValue);

  if (overwriteOfficialData) {
    return imported ?? current;
  }

  return current ?? imported;
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

function matchesTransportadoraFilter(filter: string, ...values: Array<string | null | undefined>) {
  const normalizedFilter = normalizeCompareValue(filter);
  if (!normalizedFilter) {
    return true;
  }

  return normalizeCompareValue(values.filter(Boolean).join(' ')).includes(normalizedFilter);
}

function normalizeCompareValue(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
