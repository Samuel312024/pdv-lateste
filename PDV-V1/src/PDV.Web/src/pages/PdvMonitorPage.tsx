import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import TvRoundedIcon from '@mui/icons-material/TvRounded';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableContainer,
  TableRow,
  Typography
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import { ListFilterField } from '../components/common/ListFilterField';
import { Loading } from '../components/common/Loading';
import { useAuth } from '../contexts/AuthContext';
import { dashboardService } from '../services/dashboardService';
import type { MonitorOperacionalSnapshot } from '../types';
import { formatCurrency, formatDateTime } from '../utils/format';
import { getErrorMessage } from '../utils/http';

const AUTO_REFRESH_MS = 5000;

export function PdvMonitorPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pdvFilter, setPdvFilter] = useState('');
  const [saleFilter, setSaleFilter] = useState('');
  const [snapshot, setSnapshot] = useState<MonitorOperacionalSnapshot | null>(null);
  const { enqueueSnackbar } = useSnackbar();
  const { hasPermission } = useAuth();
  const canViewMonitor = hasPermission('VisualizarMonitorOperacional');

  useEffect(() => {
    if (!canViewMonitor) {
      setLoading(false);
      return;
    }

    let active = true;

    async function bootstrap() {
      await loadSnapshot(false, active);
    }

    void bootstrap();

    const timer = window.setInterval(() => {
      void loadSnapshot(true, active);
    }, AUTO_REFRESH_MS);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [canViewMonitor]);

  async function loadSnapshot(silent: boolean, activeOverride = true) {
    if (!silent) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const result = await dashboardService.monitorOperacional();
      if (!activeOverride) {
        return;
      }

      setSnapshot(result);
    } catch (error) {
      if (activeOverride) {
        enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
      }
    } finally {
      if (activeOverride) {
        if (!silent) {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    }
  }

  if (!canViewMonitor) {
    return (
      <Card sx={{ borderRadius: 5 }}>
        <CardContent>
          <Typography variant="h5">Operacao ao vivo</Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Seu perfil nao possui acesso ao monitor operacional dos PDVs.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return <Loading message="Carregando monitor operacional..." />;
  }

  if (!snapshot) {
    return (
      <Card sx={{ borderRadius: 5 }}>
        <CardContent>
          <Typography variant="h5">Operacao ao vivo</Typography>
          <Typography color="text.secondary" sx={{ mt: 1, mb: 2 }}>
            Nao foi possivel carregar os dados do monitor operacional agora.
          </Typography>
          <Button variant="contained" onClick={() => void loadSnapshot(false)} startIcon={<RefreshRoundedIcon />}>
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  const cards = [
    { label: 'PDVs abertos', value: snapshot.resumo.pdvsAbertos.toString() },
    { label: 'Operadores com sessao ativa', value: snapshot.resumo.operadoresOnline.toString() },
    { label: 'Vendas em PDVs abertos', value: snapshot.resumo.vendasNosPdvsAbertos.toString() },
    { label: 'Itens vendidos', value: snapshot.resumo.itensVendidosNosPdvsAbertos.toFixed(3) },
    { label: 'Total em operacao', value: formatCurrency(snapshot.resumo.totalVendidoNosPdvsAbertos) },
    { label: 'Ticket medio', value: formatCurrency(snapshot.resumo.ticketMedioNosPdvsAbertos) }
  ];
  const filteredPdvs = snapshot.pdvs.filter((pdv) => matchesMonitorFilter(
    pdvFilter,
    pdv.pdvNumero.toString().padStart(2, '0'),
    pdv.usuarioNome,
    pdv.usuarioEmail,
    pdv.perfil,
    buildPaymentMix(pdv)
  ));
  const filteredRecentSales = snapshot.vendasRecentes.filter((sale) => matchesMonitorFilter(
    saleFilter,
    sale.pdvNumero.toString().padStart(2, '0'),
    sale.numeroVenda,
    sale.usuarioNome,
    sale.formasPagamento
  ));

  return (
    <Stack spacing={3}>
      <Card
        sx={{
          borderRadius: 6,
          color: '#0f172a',
          background:
            'radial-gradient(circle at top left, rgba(18,113,255,0.18), transparent 26%), radial-gradient(circle at right center, rgba(14,165,233,0.16), transparent 20%), linear-gradient(135deg, #f8fbff, #eef5ff 46%, #ffffff)'
        }}
      >
        <CardContent sx={{ p: { xs: 3, md: 4 } }}>
          <Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" spacing={2}>
            <Box>
              <Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap" useFlexGap>
                <TvRoundedIcon color="primary" />
                <Typography variant="h4">Operacao ao vivo dos PDVs</Typography>
                <Chip label="Atualizacao automatica" color="primary" size="small" />
              </Stack>
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                Acompanhe caixas abertos, produtividade por PDV e as ultimas vendas da operacao em tempo quase real.
              </Typography>
            </Box>
            <Stack alignItems={{ xs: 'flex-start', lg: 'flex-end' }} spacing={1}>
              <Typography variant="body2" color="text.secondary">
                Ultima atualizacao: {formatDateTime(snapshot.resumo.ultimaAtualizacaoUtc)}
              </Typography>
              <Button
                variant="outlined"
                startIcon={<RefreshRoundedIcon />}
                onClick={() => void loadSnapshot(true)}
                disabled={refreshing}
              >
                {refreshing ? 'Atualizando...' : 'Atualizar agora'}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Grid container spacing={2.5}>
        {cards.map((card) => (
          <Grid item xs={12} sm={6} xl={4} key={card.label}>
            <Card sx={{ borderRadius: 5, height: '100%' }}>
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
        <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" mb={2}>
            <Typography variant="h6">
              PDVs ativos
            </Typography>
            <ListFilterField
              label="Filtrar PDVs"
              value={pdvFilter}
              onChange={(event) => setPdvFilter(event.target.value)}
              placeholder="PDV, operador, email ou pagamento"
              sx={{ width: { xs: '100%', md: 320 } }}
            />
          </Stack>
          <TableContainer
            component={Paper}
            sx={{
              borderRadius: 4,
              maxHeight: 360,
              overflowX: 'auto',
              overflowY: 'auto',
              scrollbarGutter: 'stable both-edges'
            }}
          >
            <Table stickyHeader sx={{ minWidth: 1080 }}>
              <TableHead>
                <TableRow>
                  <TableCell>PDV</TableCell>
                  <TableCell>Operador</TableCell>
                  <TableCell>Abertura</TableCell>
                  <TableCell>Tempo aberto</TableCell>
                  <TableCell align="right">Vendas</TableCell>
                  <TableCell align="right">Itens</TableCell>
                  <TableCell align="right">Ticket medio</TableCell>
                  <TableCell align="right">Total</TableCell>
                  <TableCell>Mix de pagamento</TableCell>
                  <TableCell>Ultima venda</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {snapshot.pdvs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10}>
                      <Typography color="text.secondary">Nenhum PDV esta com caixa aberto neste momento.</Typography>
                    </TableCell>
                  </TableRow>
                ) : filteredPdvs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10}>
                      <Typography color="text.secondary">Nenhum PDV ativo combina com o filtro informado.</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPdvs.map((pdv) => (
                    <TableRow key={pdv.caixaId} hover>
                      <TableCell>
                        <Chip
                          label={`PDV ${pdv.pdvNumero.toString().padStart(2, '0')}`}
                          color={pdv.usuarioSessaoAtiva ? 'success' : 'primary'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Stack spacing={0.5}>
                          <Typography sx={{ fontWeight: 700 }}>{pdv.usuarioNome}</Typography>
                          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                            <Typography variant="body2" color="text.secondary">
                              {pdv.usuarioEmail} · {pdv.perfil}
                            </Typography>
                            <Chip
                              label={pdv.usuarioSessaoAtiva ? 'Logado agora' : 'Sem sessao ativa'}
                              color={pdv.usuarioSessaoAtiva ? 'success' : 'primary'}
                              size="small"
                              variant={pdv.usuarioSessaoAtiva ? 'filled' : 'outlined'}
                            />
                          </Stack>
                          <Typography variant="caption" color="text.secondary">
                            {buildPresenceMessage(pdv.usuarioAtivo, pdv.usuarioUltimaPresencaUtc)}
                          </Typography>
                        </Stack>
                      </TableCell>
                      <TableCell>{formatDateTime(pdv.dataAbertura)}</TableCell>
                      <TableCell>{formatOpenTime(pdv.tempoAbertoMinutos)}</TableCell>
                      <TableCell align="right">{pdv.quantidadeVendas}</TableCell>
                      <TableCell align="right">{pdv.quantidadeItens.toFixed(3)}</TableCell>
                      <TableCell align="right">{formatCurrency(pdv.ticketMedio)}</TableCell>
                      <TableCell align="right">{formatCurrency(pdv.valorTotalVendas)}</TableCell>
                      <TableCell>
                        <Typography variant="body2">{buildPaymentMix(pdv)}</Typography>
                      </TableCell>
                      <TableCell>{formatDateTime(pdv.ultimaVendaEm)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Card sx={{ borderRadius: 5 }}>
        <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" mb={2}>
            <Typography variant="h6">
              Vendas recentes em operacao
            </Typography>
            <ListFilterField
              label="Filtrar vendas"
              value={saleFilter}
              onChange={(event) => setSaleFilter(event.target.value)}
              placeholder="PDV, numero da venda, operador ou pagamento"
              sx={{ width: { xs: '100%', md: 360 } }}
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
            <Table stickyHeader size="small" sx={{ minWidth: 860 }}>
              <TableHead>
                <TableRow>
                  <TableCell>PDV</TableCell>
                  <TableCell>Venda</TableCell>
                  <TableCell>Operador</TableCell>
                  <TableCell>Pagamento</TableCell>
                  <TableCell align="right">Itens</TableCell>
                  <TableCell align="right">Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {snapshot.vendasRecentes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Typography color="text.secondary">Nenhuma venda registrada nos caixas abertos ate agora.</Typography>
                    </TableCell>
                  </TableRow>
                ) : filteredRecentSales.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Typography color="text.secondary">Nenhuma venda em operacao combina com o filtro informado.</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRecentSales.map((sale) => (
                    <TableRow key={sale.vendaId} hover>
                      <TableCell>
                        <Chip label={`PDV ${sale.pdvNumero.toString().padStart(2, '0')}`} size="small" />
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ fontWeight: 700 }}>{sale.numeroVenda}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {formatDateTime(sale.dataVenda)}
                        </Typography>
                      </TableCell>
                      <TableCell>{sale.usuarioNome}</TableCell>
                      <TableCell>{sale.formasPagamento}</TableCell>
                      <TableCell align="right">{sale.quantidadeItens.toFixed(3)}</TableCell>
                      <TableCell align="right">{formatCurrency(sale.total)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Stack>
  );
}

function formatOpenTime(totalMinutes: number) {
  if (totalMinutes <= 0) {
    return 'Agora';
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes} min`;
  }

  return `${hours}h ${minutes.toString().padStart(2, '0')}min`;
}

function buildPaymentMix(pdv: MonitorOperacionalSnapshot['pdvs'][number]) {
  const parts = [
    pdv.valorDinheiro > 0 ? `Dinheiro ${formatCurrency(pdv.valorDinheiro)}` : null,
    pdv.valorPix > 0 ? `Pix ${formatCurrency(pdv.valorPix)}` : null,
    pdv.valorCartaoDebito > 0 ? `Debito ${formatCurrency(pdv.valorCartaoDebito)}` : null,
    pdv.valorCartaoCredito > 0 ? `Credito ${formatCurrency(pdv.valorCartaoCredito)}` : null,
    pdv.valorVoucher > 0 ? `Voucher ${formatCurrency(pdv.valorVoucher)}` : null
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' · ') : 'Sem recebimentos';
}

function buildPresenceMessage(usuarioAtivo: boolean, ultimaPresencaUtc: string | null) {
  if (!usuarioAtivo) {
    return 'Conta do operador inativa.';
  }

  if (!ultimaPresencaUtc) {
    return 'Sem heartbeat recente do sistema.';
  }

  return `Ultima presenca: ${formatDateTime(ultimaPresencaUtc)}`;
}

function matchesMonitorFilter(filter: string, ...values: Array<string | number | null | undefined>) {
  const normalizedFilter = normalizeMonitorFilterValue(filter);
  if (!normalizedFilter) {
    return true;
  }

  return normalizeMonitorFilterValue(values.filter((value) => value != null).join(' ')).includes(normalizedFilter);
}

function normalizeMonitorFilterValue(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
