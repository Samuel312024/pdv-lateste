import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import DeliveryDiningRoundedIcon from '@mui/icons-material/DeliveryDiningRounded';
import FmdGoodRoundedIcon from '@mui/icons-material/FmdGoodRounded';
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded';
import LocalMallRoundedIcon from '@mui/icons-material/LocalMallRounded';
import RouteRoundedIcon from '@mui/icons-material/RouteRounded';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useEffect, useState, type ReactNode } from 'react';
import { AccessDeniedCard } from '../components/common/AccessDeniedCard';
import { Loading } from '../components/common/Loading';
import { useAuth } from '../contexts/AuthContext';
import { orderRealtimeService } from '../services/orderRealtimeService';
import { orderService } from '../services/orderService';
import type { PedidoDetalhe, PedidoStatus, PedidoResumo } from '../types';
import { formatCurrency } from '../utils/format';
import { getErrorMessage } from '../utils/http';

export function MyOrdersPage({ mode = 'internal' }: { mode?: 'internal' | 'buyer' }) {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<PedidoResumo[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<PedidoDetalhe | null>(null);
  const { enqueueSnackbar } = useSnackbar();
  const { session } = useAuth();
  const buyerExperience = mode === 'buyer';
  const linkedClientId = session?.usuario.clienteId ?? null;
  const linkedClientName = session?.usuario.clienteNome ?? null;
  const activeOrdersCount = orders.filter((item) => !['Entregue', 'Cancelado'].includes(item.pedidoStatus)).length;
  const liveDeliveryCount = orders.filter((item) => item.entrega?.localizacaoAtual).length;
  const deliveredCount = orders.filter((item) => item.pedidoStatus === 'Entregue').length;

  useEffect(() => {
    if (!linkedClientId) {
      setLoading(false);
      return;
    }

    async function bootstrap() {
      try {
        await Promise.all([loadOrders(), orderRealtimeService.connect('cliente')]);
      } catch (error) {
        enqueueSnackbar(getErrorMessage(error), { variant: 'warning' });
      }
    }

    const unsubscribe = orderRealtimeService.subscribe((event) => {
      if (event.tipoEvento === 'Localizacao') {
        setOrders((current) => current.map((item) => item.vendaId === event.vendaId ? {
          ...item,
          entrega: event.entrega ?? item.entrega,
          dataUltimaAtualizacao: event.atualizadoEm
        } : item));
        setSelectedOrder((current) => current?.vendaId === event.vendaId ? {
          ...current,
          entrega: event.entrega ?? current.entrega,
          dataUltimaAtualizacao: event.atualizadoEm
        } : current);
        return;
      }

      void loadOrders(selectedOrderId ?? event.vendaId);
      if (selectedOrderId === event.vendaId) {
        void loadOrderDetail(event.vendaId);
      }
    });

    void bootstrap();

    return () => {
      unsubscribe();
      void orderRealtimeService.disconnect();
    };
  }, [linkedClientId]);

  async function loadOrders(preferredOrderId?: string | null) {
    setLoading(true);
    try {
      const result = await orderService.listMine();
      setOrders(result);
      const nextSelectedId = preferredOrderId ?? selectedOrderId ?? result[0]?.vendaId ?? null;
      setSelectedOrderId(nextSelectedId);
      if (nextSelectedId) {
        await loadOrderDetail(nextSelectedId);
      } else {
        setSelectedOrder(null);
      }
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function loadOrderDetail(vendaId: string) {
    try {
      const detail = await orderService.getMineById(vendaId);
      setSelectedOrder(detail);
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    }
  }

  if (!linkedClientId) {
    return (
      <AccessDeniedCard
        title="Area do comprador indisponivel"
        message="Este usuario ainda nao esta vinculado a um cadastro de cliente. Peca ao administrador para ligar a conta ao comprador."
      />
    );
  }

  if (loading && orders.length === 0) {
    return <Loading message="Carregando seus pedidos..." />;
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">Meus pedidos</Typography>
        <Typography color="text.secondary">
          {linkedClientName
            ? `${linkedClientName}, ${buyerExperience ? 'acompanhe sua compra e a entrega em tempo real.' : 'aqui voce acompanha o preparo, retirada ou entrega em tempo real.'}`
            : 'Acompanhe o andamento dos seus pedidos em tempo real.'}
        </Typography>
      </Box>

      {orders.length > 0 ? (
        <Grid container spacing={1.5}>
          <Grid item xs={12} md={4}>
            <OrderMetricCard
              icon={<Inventory2RoundedIcon color="primary" />}
              label="Pedidos ativos"
              value={formatQuantity(activeOrdersCount)}
              detail="Em preparacao, retirada ou entrega"
              background="linear-gradient(135deg, rgba(29, 78, 216, 0.12), rgba(255,255,255,0.92))"
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <OrderMetricCard
              icon={<RouteRoundedIcon sx={{ color: '#b45309' }} />}
              label="Entrega ao vivo"
              value={formatQuantity(liveDeliveryCount)}
              detail="Pedidos com localizacao atualizada"
              background="linear-gradient(135deg, rgba(245, 158, 11, 0.16), rgba(255,255,255,0.94))"
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <OrderMetricCard
              icon={<CheckCircleRoundedIcon color="success" />}
              label="Pedidos concluidos"
              value={formatQuantity(deliveredCount)}
              detail="Historico recente da conta"
              background="linear-gradient(135deg, rgba(22, 163, 74, 0.14), rgba(255,255,255,0.94))"
            />
          </Grid>
        </Grid>
      ) : null}

      {orders.length === 0 ? (
        <Alert severity="info" sx={{ borderRadius: 4 }}>
          Ainda nao existe nenhum pedido vinculado a este comprador.
        </Alert>
      ) : (
        <Grid container spacing={2.5}>
          <Grid item xs={12} lg={5}>
            <Stack spacing={1.5}>
              {orders.map((order) => (
                <Paper
                  key={order.vendaId}
                  variant="outlined"
                  onClick={() => {
                    setSelectedOrderId(order.vendaId);
                    void loadOrderDetail(order.vendaId);
                  }}
                  sx={{
                    p: 2,
                    borderRadius: 4,
                    cursor: 'pointer',
                    borderColor: selectedOrderId === order.vendaId ? 'primary.main' : 'rgba(23, 75, 138, 0.12)',
                    background: selectedOrderId === order.vendaId
                      ? 'linear-gradient(135deg, rgba(239,246,255,0.96), rgba(255,255,255,0.98))'
                      : 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.96))',
                    boxShadow: selectedOrderId === order.vendaId
                      ? '0 18px 40px rgba(29, 78, 216, 0.12)'
                      : '0 10px 24px rgba(15, 23, 42, 0.04)'
                  }}
                >
                  <Stack spacing={1}>
                    <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
                      <Box>
                        <Typography sx={{ fontWeight: 900 }}>{order.codigoAcompanhamento}</Typography>
                        <Typography variant="body2" color="text.secondary">{order.numeroVenda}</Typography>
                      </Box>
                      <Chip label={labelForStatus(order.pedidoStatus)} color={colorForStatus(order.pedidoStatus)} />
                    </Stack>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <Chip
                        size="small"
                        icon={order.atendimentoTipo === 'Entrega' ? <DeliveryDiningRoundedIcon /> : <LocalMallRoundedIcon />}
                        label={order.atendimentoTipo === 'Entrega' ? 'Entrega' : 'Retirada'}
                        variant="outlined"
                      />
                      <Chip size="small" label={formatCurrency(order.total)} variant="outlined" />
                      {order.entrega?.localizacaoAtual ? <Chip size="small" icon={<FmdGoodRoundedIcon />} label="Ao vivo" color="success" /> : null}
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      {order.enderecoEntregaResumo ?? 'Retirada no local'} · atualizado em {formatDateTime(order.dataUltimaAtualizacao ?? order.dataVenda)}
                    </Typography>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </Grid>

          <Grid item xs={12} lg={7}>
            {selectedOrder ? (
              <Card sx={{ borderRadius: 5 }}>
                <CardContent sx={{ p: { xs: 2, md: 3 } }}>
                  <Stack spacing={2}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} justifyContent="space-between">
                      <Box>
                        <Typography variant="h5" sx={{ fontWeight: 900 }}>{selectedOrder.codigoAcompanhamento}</Typography>
                        <Typography color="text.secondary">
                          {selectedOrder.atendimentoTipo === 'Entrega' ? 'Entrega em domicilio' : 'Retirada no local'}
                        </Typography>
                      </Box>
                      <Chip label={labelForStatus(selectedOrder.pedidoStatus)} color={colorForStatus(selectedOrder.pedidoStatus)} />
                    </Stack>

                    <Grid container spacing={1.25}>
                      <Grid item xs={12} sm={4}>
                        <OrderMetricCard
                          icon={<LocalMallRoundedIcon color="primary" />}
                          label="Itens"
                          value={formatQuantity(selectedOrder.itens.length)}
                          detail="Linhas neste pedido"
                          background="linear-gradient(135deg, rgba(29, 78, 216, 0.12), rgba(255,255,255,0.96))"
                        />
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <OrderMetricCard
                          icon={<CheckCircleRoundedIcon color="success" />}
                          label="Total"
                          value={formatCurrency(selectedOrder.total)}
                          detail="Valor fechado no pedido"
                          background="linear-gradient(135deg, rgba(22, 163, 74, 0.12), rgba(255,255,255,0.96))"
                        />
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <OrderMetricCard
                          icon={<AccessTimeRoundedIcon sx={{ color: '#b45309' }} />}
                          label="Atualizado"
                          value={formatRelativeTime(selectedOrder.dataUltimaAtualizacao ?? selectedOrder.dataVenda)}
                          detail="Ultimo movimento visivel"
                          background="linear-gradient(135deg, rgba(245, 158, 11, 0.16), rgba(255,255,255,0.96))"
                        />
                      </Grid>
                    </Grid>

                    <Alert severity="info" sx={{ borderRadius: 3 }}>
                      {selectedOrder.enderecoEntregaResumo ?? 'Retirada no local'}
                      {selectedOrder.observacaoPedido ? ` · ${selectedOrder.observacaoPedido}` : ''}
                    </Alert>

                    {selectedOrder.pedidoStatus === 'Cancelado' ? (
                      <Alert severity="error" sx={{ borderRadius: 3 }}>
                        Este pedido foi cancelado. Se precisar, fale com a operacao para entender o motivo ou criar uma nova compra.
                      </Alert>
                    ) : null}

                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 4 }}>
                      <Stack spacing={1.5}>
                        <Typography variant="h6">Status da rota</Typography>
                        <Grid container spacing={1.25}>
                          {buildOrderJourney(selectedOrder.atendimentoTipo, selectedOrder.pedidoStatus).map((step) => (
                            <Grid item xs={12} sm={6} key={step.key}>
                              <Paper
                                variant="outlined"
                                sx={{
                                  p: 1.5,
                                  borderRadius: 3,
                                  borderColor: step.state === 'current'
                                    ? 'primary.main'
                                    : step.state === 'done'
                                      ? 'success.main'
                                      : step.state === 'blocked'
                                        ? 'error.main'
                                        : 'rgba(15, 23, 42, 0.08)',
                                  bgcolor: step.state === 'current'
                                    ? 'rgba(239,246,255,0.86)'
                                    : step.state === 'done'
                                      ? 'rgba(240,253,244,0.92)'
                                      : step.state === 'blocked'
                                        ? 'rgba(254,242,242,0.92)'
                                        : 'rgba(248,250,252,0.92)'
                                }}
                              >
                                <Stack spacing={0.5}>
                                  <Typography variant="overline" sx={{ fontWeight: 800, letterSpacing: '0.08em' }}>
                                    {step.badge}
                                  </Typography>
                                  <Typography sx={{ fontWeight: 800 }}>{step.title}</Typography>
                                  <Typography variant="body2" color="text.secondary">{step.description}</Typography>
                                </Stack>
                              </Paper>
                            </Grid>
                          ))}
                        </Grid>
                      </Stack>
                    </Paper>

                    {selectedOrder.entrega?.localizacaoAtual ? (
                      <Paper
                        variant="outlined"
                        sx={{
                          p: 2,
                          borderRadius: 4,
                          overflow: 'hidden',
                          background: 'radial-gradient(circle at top right, rgba(59, 130, 246, 0.12), transparent 30%), linear-gradient(180deg, rgba(255,255,255,0.98), rgba(243,248,255,0.98))'
                        }}
                      >
                        <Stack spacing={1.5}>
                          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1}>
                            <Box>
                              <Typography sx={{ fontWeight: 800 }}>Entrega ao vivo</Typography>
                              <Typography variant="body2" color="text.secondary">
                                {selectedOrder.entrega.transportadoraNome ?? 'Entrega dedicada'} · atualizado em {formatDateTime(selectedOrder.entrega.localizacaoAtual.dataCaptura)}
                              </Typography>
                            </Box>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                              <Chip size="small" icon={<RouteRoundedIcon />} label={formatRelativeTime(selectedOrder.entrega.localizacaoAtual.dataCaptura)} color="primary" />
                              <Button
                                variant="outlined"
                                size="small"
                                href={selectedOrder.entrega.localizacaoAtual.linkMapa}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Abrir no mapa
                              </Button>
                            </Stack>
                          </Stack>

                          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            {selectedOrder.entrega.nomeEntregador ? <Chip size="small" label={`Entregador: ${selectedOrder.entrega.nomeEntregador}`} variant="outlined" /> : null}
                            {selectedOrder.entrega.localizacaoAtual.precisaoMetros ? <Chip size="small" label={`Precisao ${selectedOrder.entrega.localizacaoAtual.precisaoMetros.toFixed(0)} m`} variant="outlined" /> : null}
                            {selectedOrder.entrega.localizacaoAtual.velocidadeKmh ? <Chip size="small" label={`Velocidade ${selectedOrder.entrega.localizacaoAtual.velocidadeKmh.toFixed(0)} km/h`} variant="outlined" /> : null}
                          </Stack>

                          <Box
                            component="iframe"
                            src={`${selectedOrder.entrega.localizacaoAtual.linkMapa}&z=16&output=embed`}
                            title="Mapa da entrega"
                            sx={{
                              width: '100%',
                              height: 260,
                              border: 0,
                              borderRadius: 3,
                              bgcolor: 'rgba(15, 23, 42, 0.04)'
                            }}
                          />

                          <Typography variant="body2" color="text.secondary">
                            {selectedOrder.entrega.nomeEntregador ? `Entregador: ${selectedOrder.entrega.nomeEntregador}` : 'Entregador em rota'}
                            {selectedOrder.entrega.localizacaoAtual.precisaoMetros ? ` · precisao ${selectedOrder.entrega.localizacaoAtual.precisaoMetros.toFixed(0)} m` : ''}
                            {selectedOrder.entrega.localizacaoAtual.velocidadeKmh ? ` · velocidade ${selectedOrder.entrega.localizacaoAtual.velocidadeKmh.toFixed(0)} km/h` : ''}
                          </Typography>
                        </Stack>
                      </Paper>
                    ) : selectedOrder.atendimentoTipo === 'Entrega' && selectedOrder.entrega?.compartilhamentoAtivo ? (
                      <Alert severity="info" sx={{ borderRadius: 3 }}>
                        O compartilhamento da entrega esta ativo. O mapa aparece aqui assim que o entregador iniciar o envio da localizacao.
                      </Alert>
                    ) : null}

                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Produto</TableCell>
                          <TableCell align="right">Qtd</TableCell>
                          <TableCell align="right">Total</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {selectedOrder.itens.map((item) => (
                          <TableRow key={item.vendaItemId}>
                            <TableCell>{item.produtoNome}</TableCell>
                            <TableCell align="right">{item.quantidade}</TableCell>
                            <TableCell align="right">{formatCurrency(item.total)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>

                    <Divider />

                    <Typography variant="h6">Linha do tempo do pedido</Typography>
                    <Stack spacing={1.25}>
                      {selectedOrder.ocorrencias.filter((event) => event.visivelParaCliente).map((event) => (
                        <Paper key={event.pedidoOcorrenciaId} variant="outlined" sx={{ p: 1.75, borderRadius: 3 }}>
                          <Stack spacing={0.5}>
                            <Stack direction="row" justifyContent="space-between" spacing={1}>
                              <Typography sx={{ fontWeight: 800 }}>{event.titulo}</Typography>
                              <Typography variant="body2" color="text.secondary">{formatDateTime(event.dataOcorrencia)}</Typography>
                            </Stack>
                            {event.descricao ? <Typography variant="body2" color="text.secondary">{event.descricao}</Typography> : null}
                          </Stack>
                        </Paper>
                      ))}
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            ) : (
              <Alert severity="info" sx={{ borderRadius: 4 }}>
                Selecione um pedido para acompanhar a linha do tempo detalhada.
              </Alert>
            )}
          </Grid>
        </Grid>
      )}
    </Stack>
  );
}

function labelForStatus(status: PedidoStatus) {
  switch (status) {
    case 'Recebido': return 'Recebido';
    case 'EmPreparacao': return 'Em preparacao';
    case 'ProntoParaRetirada': return 'Pronto';
    case 'SaiuParaEntrega': return 'Saiu para entrega';
    case 'Entregue': return 'Entregue';
    case 'Cancelado': return 'Cancelado';
    default: return status;
  }
}

function colorForStatus(status: PedidoStatus): 'default' | 'primary' | 'success' | 'warning' | 'error' {
  switch (status) {
    case 'Recebido': return 'warning';
    case 'EmPreparacao': return 'primary';
    case 'ProntoParaRetirada': return 'success';
    case 'SaiuParaEntrega': return 'primary';
    case 'Entregue': return 'success';
    case 'Cancelado': return 'error';
    default: return 'default';
  }
}

interface OrderMetricCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  background: string;
}

function OrderMetricCard({ icon, label, value, detail, background }: OrderMetricCardProps) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        borderRadius: 4,
        height: '100%',
        background
      }}
    >
      <Stack spacing={1.25}>
        <Box>{icon}</Box>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
        <Typography variant="h5" sx={{ fontWeight: 900 }}>{value}</Typography>
        <Typography variant="body2" color="text.secondary">{detail}</Typography>
      </Stack>
    </Paper>
  );
}

function buildOrderJourney(atendimentoTipo: 'Retirada' | 'Entrega', status: PedidoStatus) {
  const deliveryFlow = [
    { key: 'Recebido', title: 'Pedido recebido', description: 'Sua compra entrou na fila operacional.' },
    { key: 'EmPreparacao', title: 'Em preparacao', description: 'O time esta separando os itens do pedido.' },
    { key: 'SaiuParaEntrega', title: 'Saiu para entrega', description: 'O entregador esta em rota ate voce.' },
    { key: 'Entregue', title: 'Entrega concluida', description: 'Pedido finalizado com comprovacao de entrega.' }
  ] as const;
  const pickupFlow = [
    { key: 'Recebido', title: 'Pedido recebido', description: 'Sua compra entrou na fila operacional.' },
    { key: 'EmPreparacao', title: 'Em preparacao', description: 'O time esta preparando sua retirada.' },
    { key: 'ProntoParaRetirada', title: 'Pronto para retirada', description: 'Pode ir buscar o pedido no local.' },
    { key: 'Entregue', title: 'Retirada concluida', description: 'Pedido retirado e encerrado com sucesso.' }
  ] as const;

  const flow = atendimentoTipo === 'Entrega' ? deliveryFlow : pickupFlow;
  const currentIndex = flow.findIndex((step) => step.key === status);

  return flow.map((step, index) => ({
    ...step,
    badge: `Etapa ${index + 1}`,
    state: status === 'Cancelado'
      ? 'blocked'
      : currentIndex > index
        ? 'done'
        : currentIndex === index
          ? 'current'
          : 'upcoming'
  }));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}

function formatRelativeTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMinutes = Math.max(Math.round(diffMs / 60000), 0);

  if (diffMinutes < 1) {
    return 'agora';
  }

  if (diffMinutes < 60) {
    return `ha ${diffMinutes} min`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `ha ${diffHours} h`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `ha ${diffDays} dia(s)`;
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}
