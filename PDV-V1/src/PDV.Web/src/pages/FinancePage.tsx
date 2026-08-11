import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import PaymentsRoundedIcon from '@mui/icons-material/PaymentsRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  FormControlLabel,
  Grid,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableContainer,
  TextField,
  Typography
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DetachableDialog } from '../components/common/DetachableDialog';
import { ListFilterField } from '../components/common/ListFilterField';
import { Loading } from '../components/common/Loading';
import { MoneyInput } from '../components/common/MoneyInput';
import { useAuth } from '../contexts/AuthContext';
import { digitalChargeService } from '../services/digitalChargeService';
import { clientService } from '../services/clientService';
import { financialService, type FinanceiroFiltros, type LancamentoFinanceiroPayload } from '../services/financialService';
import type { Cliente, CobrancaDigital, FinanceiroResumo, FinanceiroStatus, FinanceiroTipo, LancamentoFinanceiro } from '../types';
import { readDetachedDialogSession, removeDetachedDialogSession } from '../utils/detachedDialogSession';
import { formatCurrency, formatDateTime } from '../utils/format';
import { canAccessClientsFeature } from '../utils/featureAccess';
import { getErrorMessage } from '../utils/http';

const today = new Date().toISOString().slice(0, 10);

const emptyResumo: FinanceiroResumo = {
  entradasLiquidadas: 0,
  saidasLiquidadas: 0,
  saldoPeriodo: 0,
  contasReceberPendentes: 0,
  contasPagarPendentes: 0,
  lucroBrutoVendas: 0,
  lancamentosPendentes: 0,
  lancamentosLiquidados: 0
};

const emptyForm: LancamentoFinanceiroPayload = {
  descricao: '',
  documentoReferencia: null,
  clienteId: null,
  fornecedorId: null,
  dataCompetencia: today,
  dataVencimento: today,
  valorOriginal: 0,
  valorDesconto: 0,
  valorAcrescimo: 0,
  observacao: null,
  liquidado: false
};

const emptyDigitalChargeForm = {
  descricao: '',
  documentoReferencia: null as string | null,
  clienteId: null as string | null,
  dataVencimento: today as string | null,
  valorOriginal: 0,
  observacao: null as string | null
};

type DigitalChargeFormState = typeof emptyDigitalChargeForm;

interface FinanceDetachedSession {
  dialogType: FinanceiroTipo;
  form: LancamentoFinanceiroPayload;
}

const FINANCE_DIALOG_PATH = '/financeiro';

function getInitialFinanceFilters(): FinanceiroFiltros {
  return {
    dataInicial: today,
    dataFinal: today,
    termo: '',
    tipo: '',
    status: '',
    clienteId: ''
  };
}

export function FinancePage() {
  const [loading, setLoading] = useState(true);
  const [refreshingEntries, setRefreshingEntries] = useState(false);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<FinanceiroResumo>(emptyResumo);
  const [entries, setEntries] = useState<LancamentoFinanceiro[]>([]);
  const [clients, setClients] = useState<Cliente[]>([]);
  const [financeSuggestions, setFinanceSuggestions] = useState<LancamentoFinanceiro[]>([]);
  const [financeSuggestionsLoading, setFinanceSuggestionsLoading] = useState(false);
  const [digitalCharges, setDigitalCharges] = useState<CobrancaDigital[]>([]);
  const [digitalChargeDialogOpen, setDigitalChargeDialogOpen] = useState(false);
  const [digitalChargeForm, setDigitalChargeForm] = useState<DigitalChargeFormState>(emptyDigitalChargeForm);
  const [creatingDigitalCharge, setCreatingDigitalCharge] = useState(false);
  const [refreshingDigitalChargeId, setRefreshingDigitalChargeId] = useState<string | null>(null);
  const [filters, setFilters] = useState<FinanceiroFiltros>(getInitialFinanceFilters);
  const [dialogType, setDialogType] = useState<FinanceiroTipo | null>(null);
  const [form, setForm] = useState<LancamentoFinanceiroPayload>(emptyForm);
  const { enqueueSnackbar } = useSnackbar();
  const { hasPermission, session } = useAuth();
  const [searchParams] = useSearchParams();
  const detachedWindow = searchParams.get('detachedWindow') === '1';
  const detachedSessionKey = searchParams.get('detachedSession');
  const hydratedDetachedSessionRef = useRef<string | null>(null);
  const deferredFinanceSearch = useDeferredValue(filters.termo ?? '');

  const canManage = hasPermission('GerenciarFinanceiro');
  const canUseClientDirectory = canAccessClientsFeature(session);

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (loading || !detachedWindow || !detachedSessionKey || hydratedDetachedSessionRef.current === detachedSessionKey) {
      return;
    }

    const sessionData = readDetachedDialogSession<FinanceDetachedSession>(detachedSessionKey);
    hydratedDetachedSessionRef.current = detachedSessionKey;

    if (!sessionData) {
      return;
    }

    setDialogType(sessionData.dialogType);
    setForm(sessionData.form);
  }, [detachedSessionKey, detachedWindow, loading]);

  useEffect(() => {
    let active = true;
    const normalizedTerm = deferredFinanceSearch.trim();

    if (!normalizedTerm) {
      setFinanceSuggestions([]);
      setFinanceSuggestionsLoading(false);
      return;
    }

    async function loadSuggestions() {
      setFinanceSuggestionsLoading(true);
      try {
        const result = await financialService.lancamentos({
          ...filters,
          termo: normalizedTerm
        });

        if (active) {
          setFinanceSuggestions(result.slice(0, 12));
        }
      } catch {
        if (active) {
          setFinanceSuggestions([]);
        }
      } finally {
        if (active) {
          setFinanceSuggestionsLoading(false);
        }
      }
    }

    void loadSuggestions();
    return () => {
      active = false;
    };
  }, [
    deferredFinanceSearch,
    filters.clienteId,
    filters.dataFinal,
    filters.dataInicial,
    filters.status,
    filters.tipo
  ]);

  async function bootstrap() {
    setLoading(true);
    try {
      const [summaryResult, entriesResult, clientsResult, digitalChargesResult] = await Promise.all([
        financialService.resumo(filters),
        financialService.lancamentos(filters),
        canUseClientDirectory ? clientService.list() : Promise.resolve([] as Cliente[]),
        digitalChargeService.list({ origem: 'Financeiro', limite: 20 }).catch(() => [] as CobrancaDigital[])
      ]);

      setSummary(summaryResult);
      setEntries(entriesResult);
      setClients(clientsResult.filter((item) => item.ativo));
      setDigitalCharges(digitalChargesResult);
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function reloadData(nextFilters = filters) {
    setRefreshingEntries(true);
    try {
      const [summaryResult, entriesResult, digitalChargesResult] = await Promise.all([
        financialService.resumo(nextFilters),
        financialService.lancamentos(nextFilters),
        digitalChargeService.list({ origem: 'Financeiro', limite: 20 }).catch(() => [] as CobrancaDigital[])
      ]);

      setSummary(summaryResult);
      setEntries(entriesResult);
      setDigitalCharges(digitalChargesResult);
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setRefreshingEntries(false);
    }
  }

  function openDialog(type: FinanceiroTipo) {
    setDialogType(type);
    setForm({
      ...emptyForm,
      dataCompetencia: today,
      dataVencimento: today
    });
  }

  function closeDialog() {
    setDialogType(null);

    if (!detachedWindow) {
      return;
    }

    removeDetachedDialogSession(detachedSessionKey);
    window.close();
  }

  function openDigitalChargeDialog() {
    setDigitalChargeDialogOpen(true);
    setDigitalChargeForm({
      ...emptyDigitalChargeForm,
      dataVencimento: today
    });
  }

  function closeDigitalChargeDialog() {
    setDigitalChargeDialogOpen(false);
  }

  async function handleSave() {
    if (!dialogType) {
      return;
    }

    if (!form.descricao.trim()) {
      enqueueSnackbar('Informe a descricao do lancamento.', { variant: 'warning' });
      return;
    }

    if (form.valorOriginal <= 0) {
      enqueueSnackbar('Informe um valor valido para o lancamento.', { variant: 'warning' });
      return;
    }

    setSaving(true);
    try {
      if (dialogType === 'Receber') {
        await financialService.criarContaReceber(form);
        enqueueSnackbar('Conta a receber criada com sucesso.', { variant: 'success' });
      } else {
        await financialService.criarContaPagar(form);
        enqueueSnackbar('Conta a pagar criada com sucesso.', { variant: 'success' });
      }

      await reloadData();
      closeDialog();
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function handleLiquidar(entry: LancamentoFinanceiro) {
    try {
      await financialService.liquidar(entry.lancamentoFinanceiroId, 'Liquidado pela tela financeira.');
      enqueueSnackbar('Lancamento liquidado com sucesso.', { variant: 'success' });
      await reloadData();
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    }
  }

  async function handleApplyFilters() {
    await reloadData(filters);
  }

  async function handleCreateDigitalCharge() {
    if (!digitalChargeForm.descricao.trim()) {
      enqueueSnackbar('Informe a descricao da cobranca digital.', { variant: 'warning' });
      return;
    }

    if (!digitalChargeForm.clienteId) {
      enqueueSnackbar('Selecione um cliente com cadastro completo para emitir Pix/boleto.', { variant: 'warning' });
      return;
    }

    if (digitalChargeForm.valorOriginal <= 0) {
      enqueueSnackbar('Informe um valor valido para a cobranca digital.', { variant: 'warning' });
      return;
    }

    setCreatingDigitalCharge(true);
    try {
      await digitalChargeService.createFinance({
        clienteId: digitalChargeForm.clienteId,
        descricao: digitalChargeForm.descricao.trim(),
        documentoReferencia: digitalChargeForm.documentoReferencia,
        dataVencimento: digitalChargeForm.dataVencimento,
        valorOriginal: digitalChargeForm.valorOriginal,
        observacao: digitalChargeForm.observacao
      });

      enqueueSnackbar('Cobranca digital criada com QR Pix, boleto e PDF.', { variant: 'success' });
      closeDigitalChargeDialog();
      await reloadData();
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setCreatingDigitalCharge(false);
    }
  }

  async function handleRefreshDigitalCharge(id: string) {
    setRefreshingDigitalChargeId(id);
    try {
      const updated = await digitalChargeService.getById(id, true);
      setDigitalCharges((current) => current.map((item) => (item.cobrancaDigitalId === id ? updated : item)));
      if (updated.lancamentoFinanceiroId) {
        await reloadData();
      }
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setRefreshingDigitalChargeId(null);
    }
  }

  async function handleCopyValue(value: string | null | undefined, successMessage: string) {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      enqueueSnackbar(successMessage, { variant: 'success' });
    } catch {
      enqueueSnackbar('Nao foi possivel copiar agora.', { variant: 'warning' });
    }
  }

  function handleResetFilters() {
    const initial = getInitialFinanceFilters();
    setFilters(initial);
    void reloadData(initial);
  }

  if (loading) {
    return <Loading message="Carregando financeiro..." />;
  }

  const cards = [
    {
      label: 'Entradas liquidadas',
      value: formatCurrency(summary.entradasLiquidadas),
      helper: 'Recebimentos efetivados no periodo.',
      icon: <TrendingUpRoundedIcon color="success" />
    },
    {
      label: 'Saidas liquidadas',
      value: formatCurrency(summary.saidasLiquidadas),
      helper: 'Pagamentos e estornos concluídos.',
      icon: <TrendingDownRoundedIcon color="error" />
    },
    {
      label: 'Saldo do periodo',
      value: formatCurrency(summary.saldoPeriodo),
      helper: 'Entradas menos saídas.',
      icon: <PaymentsRoundedIcon color="primary" />
    },
    {
      label: 'Lucro operacional',
      value: formatCurrency(summary.lucroBrutoVendas),
      helper: 'Impacto estimado dos lançamentos liquidados.',
      icon: <TaskAltRoundedIcon color="warning" />
    },
    {
      label: 'Receber pendente',
      value: formatCurrency(summary.contasReceberPendentes),
      helper: `${summary.lancamentosPendentes} pendencias monitoradas.`,
      icon: <TrendingUpRoundedIcon color="primary" />
    },
    {
      label: 'Pagar pendente',
      value: formatCurrency(summary.contasPagarPendentes),
      helper: `${summary.lancamentosLiquidados} lancamentos liquidados no recorte.`,
      icon: <TrendingDownRoundedIcon color="warning" />
    }
  ];

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">Financeiro</Typography>
        <Typography color="text.secondary">
          Fluxo de caixa, contas a receber, contas a pagar e reflexo automatico das vendas no caixa financeiro.
        </Typography>
      </Box>

      <Grid container spacing={2}>
        {cards.map((card) => (
          <Grid key={card.label} item xs={12} md={6} xl={4}>
            <Card sx={{ borderRadius: 5, height: '100%' }}>
              <CardContent>
                <Stack spacing={1.25}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography color="text.secondary">{card.label}</Typography>
                    {card.icon}
                  </Stack>
                  <Typography variant="h5" sx={{ fontWeight: 800 }}>
                    {card.value}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {card.helper}
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card sx={{ borderRadius: 5 }}>
        <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
          <Stack spacing={2.5}>
            <Grid container spacing={2} alignItems="flex-start">
              <Grid item xs={12} md={3} lg={2}>
              <TextField
                label="Data inicial"
                type="date"
                value={filters.dataInicial ?? ''}
                onChange={(event) => setFilters((current) => ({ ...current, dataInicial: event.target.value || null }))}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              </Grid>
              <Grid item xs={12} md={3} lg={2}>
              <TextField
                label="Data final"
                type="date"
                value={filters.dataFinal ?? ''}
                onChange={(event) => setFilters((current) => ({ ...current, dataFinal: event.target.value || null }))}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              </Grid>
              <Grid item xs={12} md={6} lg={4}>
              <Autocomplete
                fullWidth
                freeSolo
                value={null}
                options={financeSuggestions}
                inputValue={filters.termo ?? ''}
                filterOptions={(options) => options}
                onInputChange={(_, nextValue) => setFilters((current) => ({ ...current, termo: nextValue }))}
                onChange={(_, entry) => {
                  if (!entry || typeof entry === 'string') {
                    return;
                  }

                  const nextFilters: FinanceiroFiltros = {
                    ...filters,
                    termo: entry.descricao
                  };

                  setFilters(nextFilters);
                  void reloadData(nextFilters);
                }}
                getOptionLabel={(option) => (typeof option === 'string' ? option : option.descricao)}
                noOptionsText={filters.termo?.trim() ? 'Nenhum lancamento encontrado.' : 'Digite para buscar no financeiro.'}
                renderOption={(props, option) => (
                  <Box component="li" {...props} sx={{ py: 1.25 }}>
                    <Box>
                      <Typography sx={{ fontWeight: 700 }}>{option.descricao}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {[option.clienteNome, option.numeroVenda ? `Venda ${option.numeroVenda}` : null, option.documentoReferencia, formatCurrency(option.valorFinal)]
                          .filter(Boolean)
                          .join(' · ')}
                      </Typography>
                    </Box>
                  </Box>
                )}
                renderInput={(params) => (
                  <ListFilterField
                    {...params}
                    label="Buscar lancamento"
                    placeholder="Descricao, cliente, venda ou documento"
                    loading={financeSuggestionsLoading}
                    helperText={
                      financeSuggestionsLoading
                        ? 'Buscando lancamentos parecidos...'
                        : 'Digite e pressione Enter para aplicar.'
                    }
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void handleApplyFilters();
                      }
                    }}
                  />
                )}
              />
              </Grid>
              <Grid item xs={12} md={6} lg={2}>
              <TextField
                select
                label="Tipo"
                value={filters.tipo ?? ''}
                onChange={(event) => setFilters((current) => ({ ...current, tipo: event.target.value as FinanceiroTipo | '' }))}
                fullWidth
              >
                <MenuItem value="">Todos</MenuItem>
                <MenuItem value="Receber">Receber</MenuItem>
                <MenuItem value="Pagar">Pagar</MenuItem>
              </TextField>
              </Grid>
              <Grid item xs={12} md={6} lg={2}>
              <TextField
                select
                label="Status"
                value={filters.status ?? ''}
                onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as FinanceiroStatus | '' }))}
                fullWidth
              >
                <MenuItem value="">Todos</MenuItem>
                <MenuItem value="Pendente">Pendente</MenuItem>
                <MenuItem value="Liquidado">Liquidado</MenuItem>
                <MenuItem value="Cancelado">Cancelado</MenuItem>
              </TextField>
              </Grid>
              <Grid item xs={12} lg={7}>
              <Autocomplete
                fullWidth
                options={clients}
                value={clients.find((client) => client.clienteId === filters.clienteId) ?? null}
                onChange={(_, client) => setFilters((current) => ({ ...current, clienteId: client?.clienteId ?? '' }))}
                isOptionEqualToValue={(option, value) => option.clienteId === value.clienteId}
                getOptionLabel={(option) => option.nome}
                noOptionsText="Nenhum cliente ativo encontrado"
                renderOption={(props, option) => (
                  <Box component="li" {...props} sx={{ py: 1.25 }}>
                    <Box>
                      <Typography sx={{ fontWeight: 700 }}>{option.nome}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {[option.documento, option.telefone, option.cidade].filter(Boolean).join(' · ') || 'Cadastro sem documento ou telefone.'}
                      </Typography>
                    </Box>
                  </Box>
                )}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Cliente"
                    placeholder="Todos os clientes"
                    helperText={
                      canUseClientDirectory
                        ? 'Opcional: filtre o financeiro por cliente.'
                        : 'A base de clientes nao esta liberada para este usuario.'
                    }
                  />
                )}
                disabled={!canUseClientDirectory}
              />
              </Grid>
              <Grid item xs={12} lg={5}>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1.25}
                  justifyContent={{ lg: 'flex-end' }}
                  sx={{ pt: { lg: 0.5 } }}
                >
                  <Button variant="contained" fullWidth onClick={() => void handleApplyFilters()} disabled={refreshingEntries}>
                    Atualizar
                  </Button>
                  <Button variant="outlined" fullWidth onClick={handleResetFilters} disabled={refreshingEntries}>
                    Limpar filtros
                  </Button>
                </Stack>
              </Grid>
            </Grid>

            {refreshingEntries && (
              <Typography variant="body2" color="primary.main">
                Atualizando os lancamentos e o resumo financeiro...
              </Typography>
            )}

            {canManage && (
              <Alert severity="info" sx={{ borderRadius: 4 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                  Quando usar cada lancamento manual
                </Typography>
                <Typography variant="body2">
                  Conta a receber registra um valor que ainda vai entrar no caixa, como cobranca, venda externa ou pagamento combinado
                  para depois. Conta a pagar registra uma saida futura ou imediata, como fornecedor, aluguel, imposto ou despesa operacional.
                </Typography>
              </Alert>
            )}

            {canManage && (
              <Stack
                direction={{ xs: 'column', lg: 'row' }}
                spacing={1.25}
                justifyContent="space-between"
                alignItems={{ lg: 'center' }}
              >
                <Typography variant="body2" color="text.secondary">
                  Use os atalhos abaixo quando o lancamento nao nasceu automaticamente de uma venda ou rotina do sistema.
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                  <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => openDialog('Receber')}>
                    Nova conta a receber
                  </Button>
                  <Button variant="outlined" startIcon={<AddRoundedIcon />} onClick={() => openDialog('Pagar')}>
                    Nova conta a pagar
                  </Button>
                </Stack>
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ borderRadius: 5 }}>
        <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
          <Stack spacing={2}>
            <Stack
              direction={{ xs: 'column', lg: 'row' }}
              spacing={1.25}
              justifyContent="space-between"
              alignItems={{ lg: 'center' }}
            >
              <Box>
                <Typography variant="h6">Cobranças digitais</Typography>
                <Typography color="text.secondary">
                  Gere um fluxo profissional com QR Pix, linha digitável, link do boleto e PDF a partir do financeiro.
                </Typography>
              </Box>
              {canManage && (
                <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={openDigitalChargeDialog}>
                  Nova cobrança Pix/boleto
                </Button>
              )}
            </Stack>

            <Alert severity="info" sx={{ borderRadius: 4 }}>
              Essa área cria uma conta a receber pendente e já emite a cobrança digital. Quando o status vier como pago, o financeiro pode ser liquidado automaticamente na próxima atualização.
            </Alert>

            <TableContainer component={Paper} sx={{ borderRadius: 4, overflowX: 'auto' }}>
              <Table sx={{ minWidth: 940 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Descrição</TableCell>
                    <TableCell>Cliente</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Vencimento</TableCell>
                    <TableCell align="right">Valor</TableCell>
                    <TableCell width={280}>Ações</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {digitalCharges.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <Typography color="text.secondary">Nenhuma cobrança digital criada ainda.</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    digitalCharges.map((charge) => (
                      <TableRow key={charge.cobrancaDigitalId} hover>
                        <TableCell>
                          <Typography sx={{ fontWeight: 700 }}>{charge.descricao}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {[charge.documentoReferencia, charge.chargeIdExterno ? `Charge ${charge.chargeIdExterno}` : null]
                              .filter(Boolean)
                              .join(' · ') || 'Sem referencia adicional'}
                          </Typography>
                        </TableCell>
                        <TableCell>{charge.clienteNome ?? 'Sem cliente'}</TableCell>
                        <TableCell>{charge.status}</TableCell>
                        <TableCell>{formatDateTime(charge.dataVencimento)}</TableCell>
                        <TableCell align="right">{formatCurrency(charge.valorOriginal)}</TableCell>
                        <TableCell>
                          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ flexWrap: 'wrap' }}>
                            <Button
                              size="small"
                              startIcon={<RefreshRoundedIcon />}
                              onClick={() => void handleRefreshDigitalCharge(charge.cobrancaDigitalId)}
                              disabled={refreshingDigitalChargeId === charge.cobrancaDigitalId}
                            >
                              {refreshingDigitalChargeId === charge.cobrancaDigitalId ? 'Atualizando...' : 'Atualizar'}
                            </Button>
                            <Button
                              size="small"
                              startIcon={<ContentCopyRoundedIcon />}
                              onClick={() => void handleCopyValue(charge.pixCopiaECola, 'Pix copia e cola copiado.')}
                              disabled={!charge.pixCopiaECola}
                            >
                              Copiar Pix
                            </Button>
                            <Button
                              size="small"
                              startIcon={<OpenInNewRoundedIcon />}
                              component="a"
                              href={charge.linkBoleto ?? charge.linkCobranca ?? undefined}
                              target="_blank"
                              rel="noreferrer"
                              disabled={!charge.linkBoleto && !charge.linkCobranca}
                            >
                              Abrir cobrança
                            </Button>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Stack>
        </CardContent>
      </Card>

      <TableContainer component={Paper} sx={{ borderRadius: 5, overflowX: 'auto' }}>
        <Table sx={{ minWidth: 1040 }}>
          <TableHead>
            <TableRow>
              <TableCell>Descricao</TableCell>
              <TableCell>Tipo</TableCell>
              <TableCell>Origem</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Cliente</TableCell>
              <TableCell>Competencia</TableCell>
              <TableCell>Vencimento</TableCell>
              <TableCell align="right">Valor</TableCell>
              <TableCell width={120}></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9}>
                  <Typography color="text.secondary">Nenhum lancamento encontrado para os filtros atuais.</Typography>
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => (
                <TableRow key={entry.lancamentoFinanceiroId} hover>
                  <TableCell>
                    <Typography sx={{ fontWeight: 700 }}>{entry.descricao}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {entry.numeroVenda ? `Venda ${entry.numeroVenda}` : entry.observacao ?? entry.documentoReferencia ?? 'Sem observacoes adicionais'}
                    </Typography>
                  </TableCell>
                  <TableCell>{entry.tipo}</TableCell>
                  <TableCell>{entry.origem}</TableCell>
                  <TableCell>{entry.status}</TableCell>
                  <TableCell>
                    <Typography sx={{ fontWeight: 700 }}>
                      {entry.clienteNome ?? (entry.origem === 'Venda' ? 'Consumidor final' : 'Sem cliente vinculado')}
                    </Typography>
                    {!entry.clienteNome && entry.origem === 'Venda' ? (
                      <Typography variant="body2" color="text.secondary">
                        Venda concluida sem cliente selecionado no PDV.
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell>{formatDateTime(entry.dataCompetencia)}</TableCell>
                  <TableCell>{formatDateTime(entry.dataVencimento)}</TableCell>
                  <TableCell align="right">{formatCurrency(entry.valorFinal)}</TableCell>
                  <TableCell>
                    {canManage && entry.status === 'Pendente' ? (
                      <Button size="small" onClick={() => void handleLiquidar(entry)}>
                        Liquidar
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <DetachableDialog
        open={dialogType !== null}
        onClose={closeDialog}
        title={dialogType === 'Receber' ? 'Nova conta a receber' : 'Nova conta a pagar'}
        maxWidth="sm"
        contentDividers
        detachedWindow={detachedWindow}
        detachPath={FINANCE_DIALOG_PATH}
        detachPayload={
          dialogType
            ? ({
                dialogType,
                form
              } satisfies FinanceDetachedSession)
            : undefined
        }
        onDetach={closeDialog}
        actionsSx={{ px: 3, py: 2 }}
        windowTitle={dialogType === 'Receber' ? 'Nova conta a receber' : 'Nova conta a pagar'}
        actions={
          <>
            <Button onClick={closeDialog}>Cancelar</Button>
            <Button variant="contained" onClick={() => void handleSave()} disabled={saving}>
              Salvar lancamento
            </Button>
          </>
        }
      >
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <TextField
                label="Descricao"
                value={form.descricao}
                onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))}
                fullWidth
                required
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Documento de referencia"
                value={form.documentoReferencia ?? ''}
                onChange={(event) => setForm((current) => ({ ...current, documentoReferencia: event.target.value || null }))}
                fullWidth
              />
            </Grid>
            {dialogType === 'Receber' && (
              <Grid item xs={12} md={6}>
                <TextField
                  select
                  label="Cliente"
                  value={form.clienteId ?? ''}
                  onChange={(event) => setForm((current) => ({ ...current, clienteId: event.target.value || null }))}
                  fullWidth
                >
                  <MenuItem value="">Sem cliente vinculado</MenuItem>
                  {clients.map((client) => (
                    <MenuItem key={client.clienteId} value={client.clienteId}>
                      {client.nome}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
            )}
            <Grid item xs={12} md={6}>
              <TextField
                label="Data de competencia"
                type="date"
                value={form.dataCompetencia ?? ''}
                onChange={(event) => setForm((current) => ({ ...current, dataCompetencia: event.target.value || null }))}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Data de vencimento"
                type="date"
                value={form.dataVencimento ?? ''}
                onChange={(event) => setForm((current) => ({ ...current, dataVencimento: event.target.value || null }))}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <MoneyInput
                label="Valor original"
                value={form.valorOriginal}
                onChange={(value) => setForm((current) => ({ ...current, valorOriginal: value }))}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <MoneyInput
                label="Desconto"
                value={form.valorDesconto}
                onChange={(value) => setForm((current) => ({ ...current, valorDesconto: value }))}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <MoneyInput
                label="Acrescimo"
                value={form.valorAcrescimo}
                onChange={(value) => setForm((current) => ({ ...current, valorAcrescimo: value }))}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Observacao"
                value={form.observacao ?? ''}
                onChange={(event) => setForm((current) => ({ ...current, observacao: event.target.value || null }))}
                fullWidth
                multiline
                minRows={2}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.liquidado}
                    onChange={(event) => setForm((current) => ({ ...current, liquidado: event.target.checked }))}
                  />
                }
                label="Ja registrar como liquidado"
              />
            </Grid>
          </Grid>
      </DetachableDialog>

      <DetachableDialog
        open={digitalChargeDialogOpen}
        onClose={closeDigitalChargeDialog}
        title="Nova cobrança digital"
        maxWidth="sm"
        contentDividers
        actionsSx={{ px: 3, py: 2 }}
        actions={
          <>
            <Button onClick={closeDigitalChargeDialog}>Cancelar</Button>
            <Button variant="contained" onClick={() => void handleCreateDigitalCharge()} disabled={creatingDigitalCharge}>
              Emitir cobrança
            </Button>
          </>
        }
      >
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid item xs={12}>
            <TextField
              label="Descrição"
              value={digitalChargeForm.descricao}
              onChange={(event) => setDigitalChargeForm((current) => ({ ...current, descricao: event.target.value }))}
              fullWidth
              required
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              label="Documento de referência"
              value={digitalChargeForm.documentoReferencia ?? ''}
              onChange={(event) => setDigitalChargeForm((current) => ({ ...current, documentoReferencia: event.target.value || null }))}
              fullWidth
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              select
              label="Cliente"
              value={digitalChargeForm.clienteId ?? ''}
              onChange={(event) => setDigitalChargeForm((current) => ({ ...current, clienteId: event.target.value || null }))}
              fullWidth
            >
              <MenuItem value="">Selecione</MenuItem>
              {clients.map((client) => (
                <MenuItem key={client.clienteId} value={client.clienteId}>
                  {client.nome}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              label="Data de vencimento"
              type="date"
              value={digitalChargeForm.dataVencimento ?? ''}
              onChange={(event) => setDigitalChargeForm((current) => ({ ...current, dataVencimento: event.target.value || null }))}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <MoneyInput
              label="Valor"
              value={digitalChargeForm.valorOriginal}
              onChange={(value) => setDigitalChargeForm((current) => ({ ...current, valorOriginal: value }))}
              fullWidth
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              label="Observação"
              value={digitalChargeForm.observacao ?? ''}
              onChange={(event) => setDigitalChargeForm((current) => ({ ...current, observacao: event.target.value || null }))}
              fullWidth
              multiline
              minRows={2}
            />
          </Grid>
        </Grid>
      </DetachableDialog>
    </Stack>
  );
}
