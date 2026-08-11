import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import {
  Box,
  Card,
  CardContent,
  Grid,
  LinearProgress,
  Stack,
  Typography
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import { Loading } from '../components/common/Loading';
import { dashboardService } from '../services/dashboardService';
import type {
  DashboardProdutoMaisVendido,
  DashboardResumo,
  DashboardVendasPorDia,
  DashboardVendasPorPagamento
} from '../types';
import { formatCurrency } from '../utils/format';
import { getErrorMessage } from '../utils/http';
import { formatPaymentMethod } from '../utils/paymentMethods';

export function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [resumo, setResumo] = useState<DashboardResumo | null>(null);
  const [vendasPorDia, setVendasPorDia] = useState<DashboardVendasPorDia[]>([]);
  const [produtosMaisVendidos, setProdutosMaisVendidos] = useState<DashboardProdutoMaisVendido[]>([]);
  const [vendasPorPagamento, setVendasPorPagamento] = useState<DashboardVendasPorPagamento[]>([]);
  const { enqueueSnackbar } = useSnackbar();

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);

      try {
        const [resumoResult, vendasDiaResult, produtosResult, pagamentosResult] = await Promise.all([
          dashboardService.resumo(),
          dashboardService.vendasPorDia(),
          dashboardService.produtosMaisVendidos(),
          dashboardService.vendasPorFormaPagamento()
        ]);

        setResumo(resumoResult);
        setVendasPorDia(vendasDiaResult);
        setProdutosMaisVendidos(produtosResult);
        setVendasPorPagamento(pagamentosResult);
      } catch (error) {
        enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
      } finally {
        setLoading(false);
      }
    }

    void loadDashboard();
  }, [enqueueSnackbar]);

  if (loading || !resumo) {
    return <Loading message="Carregando dados do dashboard..." />;
  }

  const cards = [
    { label: 'Vendido hoje', value: formatCurrency(resumo.totalVendidoHoje) },
    { label: 'Vendido no mes', value: formatCurrency(resumo.totalVendidoMes) },
    { label: 'Vendas hoje', value: resumo.numeroVendasHoje.toString() },
    { label: 'Ticket medio', value: formatCurrency(resumo.ticketMedioMes) },
    { label: 'Estoque baixo', value: resumo.produtosEstoqueBaixo.toString() },
    { label: 'Canceladas no mes', value: resumo.vendasCanceladasMes.toString() }
  ];

  const maxSalesDay = Math.max(...vendasPorDia.map((item) => item.total), 1);
  const maxBestSeller = Math.max(...produtosMaisVendidos.map((item) => item.quantidade), 1);
  const maxPayment = Math.max(...vendasPorPagamento.map((item) => item.total), 1);

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">Dashboard administrativo</Typography>
        <Typography color="text.secondary">
          Visao rapida do faturamento, ritmo de venda e alertas operacionais.
        </Typography>
      </Box>

      <Grid container spacing={2.5}>
        {cards.map((card) => (
          <Grid key={card.label} item xs={12} sm={6} lg={4}>
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

      <Grid container spacing={2.5}>
        <Grid item xs={12} lg={5}>
          <Card sx={{ borderRadius: 5, height: '100%' }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1} mb={2}>
                <TrendingUpRoundedIcon color="primary" />
                <Typography variant="h6">Vendas por dia</Typography>
              </Stack>
              <Stack spacing={2}>
                {vendasPorDia.map((item) => (
                  <Box key={item.dia}>
                    <Stack direction="row" justifyContent="space-between" mb={0.5}>
                      <Typography>{item.dia}</Typography>
                      <Typography sx={{ fontWeight: 700 }}>{formatCurrency(item.total)}</Typography>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={(item.total / maxSalesDay) * 100}
                      sx={{ height: 10, borderRadius: 999 }}
                    />
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} lg={7}>
          <Card sx={{ borderRadius: 5, height: '100%' }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1} mb={2}>
                <WarningAmberRoundedIcon color="secondary" />
                <Typography variant="h6">Produtos mais vendidos</Typography>
              </Stack>
              <Stack spacing={2}>
                {produtosMaisVendidos.map((item) => (
                  <Box key={item.produtoId}>
                    <Stack direction="row" justifyContent="space-between" mb={0.5}>
                      <Typography>{item.produtoNome}</Typography>
                      <Typography sx={{ fontWeight: 700 }}>{item.quantidade.toFixed(3)}</Typography>
                    </Stack>
                    <LinearProgress
                      color="secondary"
                      variant="determinate"
                      value={(item.quantidade / maxBestSeller) * 100}
                      sx={{ height: 10, borderRadius: 999 }}
                    />
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card sx={{ borderRadius: 5 }}>
        <CardContent>
          <Typography variant="h6" mb={2}>
            Vendas por forma de pagamento
          </Typography>
          <Grid container spacing={2}>
            {vendasPorPagamento.map((item) => (
              <Grid key={item.formaPagamento} item xs={12} md={6} lg={4}>
                <Box sx={{ p: 2.5, borderRadius: 4, bgcolor: 'rgba(23, 75, 138, 0.05)' }}>
                  <Typography color="text.secondary">{formatPaymentMethod(item.formaPagamento)}</Typography>
                  <Typography variant="h6">{formatCurrency(item.total)}</Typography>
                  <LinearProgress
                    variant="determinate"
                    value={(item.total / maxPayment) * 100}
                    sx={{ height: 10, borderRadius: 999, mt: 1.5 }}
                  />
                </Box>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>
    </Stack>
  );
}
