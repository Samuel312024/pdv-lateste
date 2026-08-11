import AssessmentRoundedIcon from '@mui/icons-material/AssessmentRounded';
import FilterAltRoundedIcon from '@mui/icons-material/FilterAltRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
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
import { useEffect, useMemo, useState } from 'react';
import { ListFilterField } from '../components/common/ListFilterField';
import { Loading } from '../components/common/Loading';
import { reportService, type RelatorioFiltros } from '../services/reportService';
import type {
  FormaPagamento,
  RelatorioCaixa,
  RelatorioEstoqueBaixo,
  RelatorioFiltrosOpcoes,
  RelatorioResumo,
  RelatorioVendaLinha,
  VendaStatus
} from '../types';
import { formatCurrency, formatDateTime } from '../utils/format';
import { getErrorMessage } from '../utils/http';
import { formatPaymentMethod } from '../utils/paymentMethods';

const paymentOptions: Array<FormaPagamento> = ['Dinheiro', 'CartaoCredito', 'CartaoDebito', 'Pix', 'Voucher'];
const statusOptions: Array<VendaStatus> = ['Aberta', 'Finalizada', 'Cancelada'];

function getInitialFilters(): RelatorioFiltros {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  return {
    dataInicial: monthStart.toISOString().slice(0, 10),
    dataFinal: today.toISOString().slice(0, 10),
    usuarioId: '',
    produtoId: '',
    clienteId: '',
    formaPagamento: '',
    statusVenda: ''
  };
}

export function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [filters, setFilters] = useState<RelatorioFiltros>(getInitialFilters);
  const [options, setOptions] = useState<RelatorioFiltrosOpcoes | null>(null);
  const [summary, setSummary] = useState<RelatorioResumo | null>(null);
  const [sales, setSales] = useState<RelatorioVendaLinha[]>([]);
  const [cash, setCash] = useState<RelatorioCaixa[]>([]);
  const [lowStock, setLowStock] = useState<RelatorioEstoqueBaixo[]>([]);
  const [salesFilter, setSalesFilter] = useState('');
  const [cashFilter, setCashFilter] = useState('');
  const { enqueueSnackbar } = useSnackbar();

  useEffect(() => {
    async function bootstrap() {
      setLoading(true);

      try {
        const filterOptions = await reportService.filtros();
        setOptions(filterOptions);
        await loadReports(getInitialFilters());
      } catch (error) {
        enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
      } finally {
        setLoading(false);
      }
    }

    void bootstrap();
  }, [enqueueSnackbar]);

  async function loadReports(nextFilters: RelatorioFiltros) {
    setRunning(true);
    try {
      const [summaryResult, salesResult, cashResult, lowStockResult] = await Promise.all([
        reportService.resumo(nextFilters),
        reportService.vendas(nextFilters),
        reportService.caixa(nextFilters),
        reportService.estoqueBaixo(nextFilters)
      ]);

      setSummary(summaryResult);
      setSales(salesResult);
      setCash(cashResult);
      setLowStock(lowStockResult);
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setRunning(false);
    }
  }

  function handleFilterChange<Key extends keyof RelatorioFiltros>(key: Key, value: RelatorioFiltros[Key]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function handleReset() {
    const initial = getInitialFilters();
    setFilters(initial);
    void loadReports(initial);
  }

  const cards = useMemo(() => {
    if (!summary) {
      return [];
    }

    return [
      { label: 'Total vendido', value: formatCurrency(summary.totalVendido) },
      { label: 'Quantidade de vendas', value: summary.quantidadeVendas.toString() },
      { label: 'Ticket medio', value: formatCurrency(summary.ticketMedio) },
      { label: 'Vendas canceladas', value: summary.vendasCanceladas.toString() },
      { label: 'Dinheiro', value: formatCurrency(summary.totalDinheiro) },
      { label: 'Pix', value: formatCurrency(summary.totalPix) },
      { label: 'Cartao de debito', value: formatCurrency(summary.totalCartaoDebito) },
      { label: 'Cartao de credito', value: formatCurrency(summary.totalCartaoCredito) },
      { label: 'Voucher / beneficio', value: formatCurrency(summary.totalVoucher) }
    ];
  }, [summary]);

  const filteredSales = useMemo(() => {
    const query = normalizeSearchTerm(salesFilter);

    if (!query) {
      return sales;
    }

    return sales.filter((sale) =>
      [
        sale.numeroVenda,
        sale.clienteNome ?? 'Consumidor final',
        sale.usuarioNome,
        sale.formasPagamento,
        sale.status
      ].some((value) => normalizeSearchTerm(value).includes(query))
    );
  }, [sales, salesFilter]);

  const filteredCash = useMemo(() => {
    const query = normalizeSearchTerm(cashFilter);

    if (!query) {
      return cash;
    }

    return cash.filter((cashItem) =>
      [
        cashItem.usuarioNome,
        cashItem.status,
        buildCashBreakdownItems(cashItem)
          .map((item) => item.label)
          .join(' ')
      ].some((value) => normalizeSearchTerm(value).includes(query))
    );
  }, [cash, cashFilter]);

  if (loading || !summary || !options) {
    return <Loading message="Carregando relatorios..." />;
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">Relatorios avancados</Typography>
        <Typography color="text.secondary">
          Filtros operacionais por periodo, usuario, produto, cliente, pagamento e status.
        </Typography>
      </Box>

      <Card
        sx={{
          borderRadius: 5,
          background:
            'radial-gradient(circle at top left, rgba(209,127,52,0.14), transparent 28%), linear-gradient(135deg, #ffffff, #f5f8fb)'
        }}
      >
        <CardContent>
          <Stack direction="row" alignItems="center" spacing={1.5} mb={2.5}>
            <FilterAltRoundedIcon color="primary" />
            <Typography variant="h6">Filtros do relatorio</Typography>
          </Stack>

          <Grid container spacing={2}>
            <Grid item xs={12} md={3}>
              <TextField
                label="Data inicial"
                type="date"
                value={filters.dataInicial ?? ''}
                onChange={(event) => handleFilterChange('dataInicial', event.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                label="Data final"
                type="date"
                value={filters.dataFinal ?? ''}
                onChange={(event) => handleFilterChange('dataFinal', event.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                select
                label="Usuario"
                value={filters.usuarioId ?? ''}
                onChange={(event) => handleFilterChange('usuarioId', event.target.value)}
                fullWidth
              >
                <MenuItem value="">Todos</MenuItem>
                {options.usuarios.map((option) => (
                  <MenuItem key={option.id} value={option.id}>
                    {option.nome}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                select
                label="Produto"
                value={filters.produtoId ?? ''}
                onChange={(event) => handleFilterChange('produtoId', event.target.value)}
                fullWidth
              >
                <MenuItem value="">Todos</MenuItem>
                {options.produtos.map((option) => (
                  <MenuItem key={option.id} value={option.id}>
                    {option.nome}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                select
                label="Cliente"
                value={filters.clienteId ?? ''}
                onChange={(event) => handleFilterChange('clienteId', event.target.value)}
                fullWidth
              >
                <MenuItem value="">Todos</MenuItem>
                {options.clientes.map((option) => (
                  <MenuItem key={option.id} value={option.id}>
                    {option.nome}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                select
                label="Forma de pagamento"
                value={filters.formaPagamento ?? ''}
                onChange={(event) => handleFilterChange('formaPagamento', event.target.value as FormaPagamento | '')}
                fullWidth
              >
                <MenuItem value="">Todas</MenuItem>
                {paymentOptions.map((option) => (
                  <MenuItem key={option} value={option}>
                    {formatPaymentMethod(option)}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                select
                label="Status da venda"
                value={filters.statusVenda ?? ''}
                onChange={(event) => handleFilterChange('statusVenda', event.target.value as VendaStatus | '')}
                fullWidth
              >
                <MenuItem value="">Todos</MenuItem>
                {statusOptions.map((option) => (
                  <MenuItem key={option} value={option}>
                    {option}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={3}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ height: '100%', alignItems: 'stretch' }}>
                <Button
                  variant="contained"
                  fullWidth
                  startIcon={<AssessmentRoundedIcon />}
                  onClick={() => void loadReports(filters)}
                  disabled={running}
                >
                  Atualizar
                </Button>
                <Button variant="outlined" fullWidth startIcon={<RestartAltRoundedIcon />} onClick={handleReset} disabled={running}>
                  Limpar
                </Button>
              </Stack>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Grid container spacing={2.5}>
        {cards.map((card) => (
          <Grid item xs={12} sm={6} lg={4} key={card.label}>
            <Card sx={{ borderRadius: 5 }}>
              <CardContent>
                <Typography color="text.secondary">{card.label}</Typography>
                <Typography variant="h5" sx={{ mt: 1 }}>
                  {card.value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card sx={{ borderRadius: 5 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" mb={2}>
            <Typography variant="h6">Vendas detalhadas</Typography>
            <ListFilterField
              label="Filtrar vendas"
              value={salesFilter}
              onChange={(event) => setSalesFilter(event.target.value)}
              placeholder="Venda, cliente, operador ou pagamento"
              sx={{ width: { xs: '100%', md: 340 } }}
            />
          </Stack>
          <TableContainer
            component={Paper}
            sx={{
              borderRadius: 4,
              maxHeight: 460,
              overflowX: 'auto',
              overflowY: 'auto',
              scrollbarGutter: 'stable both-edges'
            }}
          >
            <Table stickyHeader size="small" sx={{ minWidth: 1140 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Venda</TableCell>
                  <TableCell>Cliente</TableCell>
                  <TableCell>Operador</TableCell>
                  <TableCell>Pagamento</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Itens</TableCell>
                  <TableCell align="right">Troco</TableCell>
                  <TableCell align="right">Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sales.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <Typography color="text.secondary">Nenhuma venda encontrada para os filtros atuais.</Typography>
                    </TableCell>
                  </TableRow>
                ) : filteredSales.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <Typography color="text.secondary">Nenhuma venda detalhada combina com o filtro informado.</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSales.map((sale) => (
                    <TableRow key={sale.vendaId} hover>
                      <TableCell>
                        <Typography sx={{ fontWeight: 700 }}>{sale.numeroVenda}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {formatDateTime(sale.dataVenda)}
                        </Typography>
                      </TableCell>
                      <TableCell>{sale.clienteNome ?? 'Consumidor final'}</TableCell>
                      <TableCell>{sale.usuarioNome}</TableCell>
                      <TableCell sx={{ minWidth: 260 }}>
                        <Stack spacing={0.5}>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {sale.formasPagamento}
                          </Typography>
                          <PaymentBreakdownChips items={buildSalePaymentBreakdownItems(sale)} emptyLabel="Sem detalhamento adicional" />
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={sale.status}
                          color={resolveSaleStatusColor(sale.status)}
                          variant={sale.status === 'Finalizada' ? 'filled' : 'outlined'}
                        />
                      </TableCell>
                      <TableCell align="right">{sale.quantidadeItens.toFixed(3)}</TableCell>
                      <TableCell align="right">{formatCurrency(sale.trocoTotal)}</TableCell>
                      <TableCell align="right">{formatCurrency(sale.total)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Grid container spacing={2.5}>
        <Grid item xs={12} xl={7}>
          <Card sx={{ borderRadius: 5, height: '100%' }}>
            <CardContent>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" mb={2}>
                <Typography variant="h6">Movimento de caixa</Typography>
                <ListFilterField
                  label="Filtrar caixas"
                  value={cashFilter}
                  onChange={(event) => setCashFilter(event.target.value)}
                  placeholder="Operador, status ou tipo de recebimento"
                  sx={{ width: { xs: '100%', md: 340 } }}
                />
              </Stack>
              <TableContainer
                component={Paper}
                sx={{
                  borderRadius: 4,
                  maxHeight: 460,
                  overflowX: 'auto',
                  overflowY: 'auto',
                  scrollbarGutter: 'stable both-edges'
                }}
              >
                <Table stickyHeader size="small" sx={{ minWidth: 1040 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Operador</TableCell>
                      <TableCell>Abertura</TableCell>
                      <TableCell>Fechamento</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Detalhamento</TableCell>
                      <TableCell align="right">Vendas</TableCell>
                      <TableCell align="right">Esperado em dinheiro</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {cash.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7}>
                          <Typography color="text.secondary">Nenhum caixa encontrado para os filtros atuais.</Typography>
                        </TableCell>
                      </TableRow>
                    ) : filteredCash.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7}>
                          <Typography color="text.secondary">Nenhum movimento de caixa combina com o filtro informado.</Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredCash.map((cashItem) => (
                        <TableRow key={cashItem.caixaId} hover>
                          <TableCell sx={{ minWidth: 180 }}>
                            <Typography sx={{ fontWeight: 700 }}>{cashItem.usuarioNome}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              Caixa {cashItem.status.toLowerCase()}
                            </Typography>
                          </TableCell>
                          <TableCell>{formatDateTime(cashItem.dataAbertura)}</TableCell>
                          <TableCell>{formatDateTime(cashItem.dataFechamento)}</TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={cashItem.status}
                              color={cashItem.status === 'Aberto' ? 'success' : 'default'}
                              variant={cashItem.status === 'Aberto' ? 'filled' : 'outlined'}
                            />
                          </TableCell>
                          <TableCell sx={{ minWidth: 280 }}>
                            <PaymentBreakdownChips items={buildCashBreakdownItems(cashItem)} emptyLabel="Sem detalhamento do caixa" />
                          </TableCell>
                          <TableCell align="right">{formatCurrency(cashItem.valorTotalVendas)}</TableCell>
                          <TableCell align="right">{formatCurrency(cashItem.valorEsperadoEmDinheiro)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} xl={5}>
          <Card sx={{ borderRadius: 5, height: '100%' }}>
            <CardContent>
              <Typography variant="h6" mb={2}>
                Estoque baixo
              </Typography>
              <TableContainer component={Paper} sx={{ borderRadius: 4, overflowX: 'auto' }}>
                <Table size="small" sx={{ minWidth: 420 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Produto</TableCell>
                      <TableCell align="right">Atual</TableCell>
                      <TableCell align="right">Minimo</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {lowStock.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3}>
                          <Typography color="text.secondary">Nenhum item com estoque baixo.</Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      lowStock.map((item) => (
                        <TableRow key={item.produtoId} hover>
                          <TableCell>
                            <Typography sx={{ fontWeight: 700 }}>{item.nome}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              {item.codigoBarras ?? 'Sem codigo de barras'}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            {item.estoqueAtual.toFixed(3)} {item.unidadeMedida}
                          </TableCell>
                          <TableCell align="right">
                            {item.estoqueMinimo.toFixed(3)} {item.unidadeMedida}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}

function PaymentBreakdownChips({
  items,
  emptyLabel
}: {
  items: Array<{ key: string; label: string }>;
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        {emptyLabel}
      </Typography>
    );
  }

  return (
    <Stack direction="row" flexWrap="wrap" gap={0.75}>
      {items.map((item) => (
        <Chip key={item.key} size="small" variant="outlined" label={item.label} />
      ))}
    </Stack>
  );
}

function buildSalePaymentBreakdownItems(sale: RelatorioVendaLinha) {
  return [
    sale.valorDinheiro > 0 ? { key: 'dinheiro', label: `Dinheiro ${formatCurrency(sale.valorDinheiro)}` } : null,
    sale.valorPix > 0 ? { key: 'pix', label: `Pix ${formatCurrency(sale.valorPix)}` } : null,
    sale.valorCartaoDebito > 0 ? { key: 'debito', label: `Debito ${formatCurrency(sale.valorCartaoDebito)}` } : null,
    sale.valorCartaoCredito > 0 ? { key: 'credito', label: `Credito ${formatCurrency(sale.valorCartaoCredito)}` } : null,
    sale.valorVoucher > 0 ? { key: 'voucher', label: `Voucher ${formatCurrency(sale.valorVoucher)}` } : null
  ].filter((item): item is { key: string; label: string } => item !== null);
}

function buildCashBreakdownItems(cashItem: RelatorioCaixa) {
  return [
    { key: 'dinheiro', label: `Dinheiro ${formatCurrency(cashItem.valorDinheiro)}` },
    { key: 'pix', label: `Pix ${formatCurrency(cashItem.valorPix)}` },
    { key: 'debito', label: `Debito ${formatCurrency(cashItem.valorCartaoDebito)}` },
    { key: 'credito', label: `Credito ${formatCurrency(cashItem.valorCartaoCredito)}` },
    { key: 'voucher', label: `Voucher ${formatCurrency(cashItem.valorVoucher)}` }
  ];
}

function normalizeSearchTerm(value: string | null | undefined) {
  return value?.toLocaleLowerCase('pt-BR').trim() ?? '';
}

function resolveSaleStatusColor(status: VendaStatus): 'success' | 'warning' | 'default' {
  if (status === 'Finalizada') {
    return 'success';
  }

  if (status === 'Aberta') {
    return 'warning';
  }

  return 'default';
}
