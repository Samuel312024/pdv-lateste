import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import DeliveryDiningRoundedIcon from '@mui/icons-material/DeliveryDiningRounded';
import FmdGoodRoundedIcon from '@mui/icons-material/FmdGoodRounded';
import MyLocationRoundedIcon from '@mui/icons-material/MyLocationRounded';
import PauseCircleRoundedIcon from '@mui/icons-material/PauseCircleRounded';
import PlayCircleRoundedIcon from '@mui/icons-material/PlayCircleRounded';
import RouteRoundedIcon from '@mui/icons-material/RouteRounded';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Paper,
  Stack,
  Typography
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Loading } from '../components/common/Loading';
import { deliveryPublicService } from '../services/deliveryPublicService';
import { orderRealtimeService } from '../services/orderRealtimeService';
import { orderService } from '../services/orderService';
import type { PainelEntregaPublico, PedidoDetalhe, PedidoResumo, RegistrarEntregaLocalizacaoPayload } from '../types';
import { formatCurrency } from '../utils/format';
import { getErrorMessage } from '../utils/http';

export function CourierDeliveriesPage() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<PedidoResumo[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<PedidoDetalhe | null>(null);
  const [sharing, setSharing] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const autoStartAttemptRef = useRef<string | null>(null);
  const { enqueueSnackbar } = useSnackbar();

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        await Promise.all([loadOrders(), orderRealtimeService.connect('entregador')]);
      } catch (error) {
        if (active) {
          enqueueSnackbar(getErrorMessage(error), { variant: 'warning' });
        }
      }
    }

    const unsubscribe = orderRealtimeService.subscribe((event) => {
      if (event.tipoEvento === 'Localizacao') {
        setOrders((current) => current.map((item) => item.vendaId === event.vendaId ? {
          ...item,
          entrega: event.entrega ?? item.entrega,
          pedidoStatus: event.pedidoStatus,
          dataUltimaAtualizacao: event.atualizadoEm
        } : item));
        setSelectedOrder((current) => current?.vendaId === event.vendaId ? {
          ...current,
          entrega: event.entrega ?? current.entrega,
          pedidoStatus: event.pedidoStatus,
          dataUltimaAtualizacao: event.atualizadoEm
        } : current);
        return;
      }

      void loadOrders(selectedOrderId ?? event.vendaId);
      if (selectedOrderId === event.vendaId) {
        void loadDetail(event.vendaId);
      }
    });

    void bootstrap();

    return () => {
      active = false;
      unsubscribe();
      stopSharing();
      void orderRealtimeService.disconnect();
    };
  }, []);

  async function loadOrders(preferredOrderId?: string | null) {
    setLoading(true);
    try {
      const result = await orderService.listAssigned();
      setOrders(result);
      const nextSelectedId = preferredOrderId ?? selectedOrderId ?? result[0]?.vendaId ?? null;
      setSelectedOrderId(nextSelectedId);
      if (nextSelectedId) {
        await loadDetail(nextSelectedId);
      } else {
        setSelectedOrder(null);
      }
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(vendaId: string) {
    try {
      const detail = await orderService.getAssignedById(vendaId);
      setSelectedOrder(detail);
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    }
  }

  useEffect(() => {
    const codigoAcesso = extractDeliveryCode(selectedOrder?.entrega?.linkPainelEntregador);
    const shouldAutoStart =
      selectedOrder?.pedidoStatus === 'SaiuParaEntrega' &&
      Boolean(selectedOrder.entrega?.compartilhamentoAtivo) &&
      Boolean(codigoAcesso);

    if (!shouldAutoStart || !codigoAcesso) {
      return;
    }

    const autoStartKey = `${selectedOrder.vendaId}:${codigoAcesso}`;
    if (sharing || watchIdRef.current != null || autoStartAttemptRef.current === autoStartKey) {
      return;
    }

    autoStartAttemptRef.current = autoStartKey;
    startSharing(true);
  }, [
    selectedOrder?.vendaId,
    selectedOrder?.pedidoStatus,
    selectedOrder?.entrega?.compartilhamentoAtivo,
    selectedOrder?.entrega?.linkPainelEntregador,
    sharing
  ]);

  function startSharing(automatic = false) {
    const codigoAcesso = extractDeliveryCode(selectedOrder?.entrega?.linkPainelEntregador);
    if (!codigoAcesso) {
      if (!automatic) {
        enqueueSnackbar('Esta entrega ainda nao possui link de rastreio liberado.', { variant: 'warning' });
      }
      return;
    }

    if (!('geolocation' in navigator)) {
      if (!automatic) {
        enqueueSnackbar('Este dispositivo nao oferece geolocalizacao para rastrear a entrega.', { variant: 'error' });
      }
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const payload: RegistrarEntregaLocalizacaoPayload = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          precisaoMetros: position.coords.accuracy ?? null,
          velocidadeKmh: position.coords.speed != null ? Math.max(position.coords.speed * 3.6, 0) : null,
          direcaoGraus: position.coords.heading ?? null
        };

        void sendLocation(codigoAcesso, payload);
      },
      (error) => {
        enqueueSnackbar(error.message || 'Nao foi possivel ler o GPS deste aparelho.', { variant: 'error' });
        stopSharing();
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000
      }
    );

    watchIdRef.current = watchId;
    setSharing(true);
  }

  function stopSharing() {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setSharing(false);
  }

  async function sendLocation(codigoAcesso: string, payload: RegistrarEntregaLocalizacaoPayload) {
    if (!selectedOrder) {
      return;
    }

    try {
      const result = await deliveryPublicService.sendLocation(codigoAcesso, payload);
      applyPublicPanelUpdate(selectedOrder.vendaId, result);
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    }
  }

  function applyPublicPanelUpdate(vendaId: string, panel: PainelEntregaPublico) {
    setOrders((current) => current.map((item) => item.vendaId === vendaId ? {
      ...item,
      pedidoStatus: panel.pedidoStatus,
      entrega: panel.entrega,
      observacaoPedido: panel.observacaoPedido,
      enderecoEntregaResumo: panel.enderecoEntregaResumo,
      dataUltimaAtualizacao: panel.entrega?.localizacaoAtual?.dataCaptura ?? item.dataUltimaAtualizacao
    } : item));

    setSelectedOrder((current) => current?.vendaId === vendaId ? {
      ...current,
      pedidoStatus: panel.pedidoStatus,
      entrega: panel.entrega,
      observacaoPedido: panel.observacaoPedido,
      enderecoEntregaResumo: panel.enderecoEntregaResumo,
      dataUltimaAtualizacao: panel.entrega?.localizacaoAtual?.dataCaptura ?? current.dataUltimaAtualizacao
    } : current);
  }

  const activeCount = useMemo(
    () => orders.filter((item) => !['Entregue', 'Cancelado'].includes(item.pedidoStatus)).length,
    [orders]
  );
  const liveCount = useMemo(
    () => orders.filter((item) => item.entrega?.localizacaoAtual).length,
    [orders]
  );

  if (loading && orders.length === 0) {
    return <Loading message="Carregando entregas designadas..." />;
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">Minhas entregas</Typography>
        <Typography color="text.secondary">
          Veja as entregas vinculadas ao seu usuario e compartilhe o GPS em tempo real durante a rota.
        </Typography>
      </Box>

      <Grid container spacing={1.5}>
        <Grid item xs={12} md={6}>
          <MetricPaper
            icon={<DeliveryDiningRoundedIcon color="primary" />}
            label="Entregas ativas"
            value={formatQuantity(activeCount)}
            detail="Pedidos em rota ou aguardando despacho"
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <MetricPaper
            icon={<RouteRoundedIcon sx={{ color: '#b45309' }} />}
            label="GPS ao vivo"
            value={formatQuantity(liveCount)}
            detail="Entregas com localizacao ja sincronizada"
          />
        </Grid>
      </Grid>

      {orders.length === 0 ? (
        <Alert severity="info" sx={{ borderRadius: 4 }}>
          Nenhuma entrega esta vinculada ao seu usuario neste momento.
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
                    void loadDetail(order.vendaId);
                  }}
                  sx={{
                    p: 2,
                    borderRadius: 4,
                    cursor: 'pointer',
                    borderColor: selectedOrderId === order.vendaId ? 'primary.main' : 'rgba(23, 75, 138, 0.12)',
                    background: selectedOrderId === order.vendaId
                      ? 'linear-gradient(135deg, rgba(239,246,255,0.96), rgba(255,255,255,0.98))'
                      : 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.96))'
                  }}
                >
                  <Stack spacing={1}>
                    <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
                      <Box>
                        <Typography sx={{ fontWeight: 900 }}>{order.codigoAcompanhamento}</Typography>
                        <Typography variant="body2" color="text.secondary">{order.clienteNome}</Typography>
                      </Box>
                      <Chip label={labelForStatus(order.pedidoStatus)} color={colorForStatus(order.pedidoStatus)} />
                    </Stack>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <Chip size="small" icon={<RouteRoundedIcon />} label={order.entrega?.transportadoraNome ?? 'Entrega da loja'} variant="outlined" />
                      <Chip size="small" label={formatCurrency(order.total)} variant="outlined" />
                      {order.entrega?.localizacaoAtual ? <Chip size="small" icon={<FmdGoodRoundedIcon />} label="GPS ativo" color="success" /> : null}
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      {order.enderecoEntregaResumo ?? 'Endereco indisponivel'} · atualizado em {formatDateTime(order.dataUltimaAtualizacao ?? order.dataVenda)}
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
                          {selectedOrder.clienteNome} · {selectedOrder.entrega?.transportadoraNome ?? 'Entrega da loja'}
                        </Typography>
                      </Box>
                      <Chip label={labelForStatus(selectedOrder.pedidoStatus)} color={colorForStatus(selectedOrder.pedidoStatus)} />
                    </Stack>

                    <Alert severity="info" sx={{ borderRadius: 3 }}>
                      {selectedOrder.enderecoEntregaResumo ?? 'Endereco de entrega indisponivel'}
                      {selectedOrder.observacaoPedido ? ` · ${selectedOrder.observacaoPedido}` : ''}
                    </Alert>

                    {!window.isSecureContext ? (
                      <Alert severity="warning" sx={{ borderRadius: 3 }}>
                        O GPS do navegador costuma exigir contexto seguro. Abra este portal em `https` ou em um ambiente confiavel do dispositivo.
                      </Alert>
                    ) : null}

                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25}>
                      <Button
                        variant="contained"
                        startIcon={sharing ? <PauseCircleRoundedIcon /> : <PlayCircleRoundedIcon />}
                        onClick={() => {
                          if (sharing) {
                            stopSharing();
                            return;
                          }

                          startSharing();
                        }}
                        sx={{ borderRadius: 3 }}
                      >
                        {sharing ? 'Pausar GPS' : 'Iniciar GPS em tempo real'}
                      </Button>
                      {selectedOrder.entrega?.localizacaoAtual ? (
                        <Button
                          variant="outlined"
                          startIcon={<MyLocationRoundedIcon />}
                          href={selectedOrder.entrega.localizacaoAtual.linkMapa}
                          target="_blank"
                          rel="noreferrer"
                          sx={{ borderRadius: 3 }}
                        >
                          Abrir no mapa
                        </Button>
                      ) : null}
                    </Stack>

                    <Grid container spacing={1.25}>
                      <Grid item xs={12} sm={4}>
                        <MetricPaper
                          icon={<AccessTimeRoundedIcon color="primary" />}
                          label="Ultima atualizacao"
                          value={selectedOrder.entrega?.localizacaoAtual ? formatRelativeTime(selectedOrder.entrega.localizacaoAtual.dataCaptura) : 'Sem posicao'}
                          detail={selectedOrder.entrega?.localizacaoAtual ? formatDateTime(selectedOrder.entrega.localizacaoAtual.dataCaptura) : 'Nenhuma leitura enviada'}
                        />
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <MetricPaper
                          icon={<FmdGoodRoundedIcon sx={{ color: '#b45309' }} />}
                          label="Precisao"
                          value={selectedOrder.entrega?.localizacaoAtual?.precisaoMetros ? `${selectedOrder.entrega.localizacaoAtual.precisaoMetros.toFixed(0)} m` : 'Nao informada'}
                          detail={selectedOrder.entrega?.localizacaoAtual?.velocidadeKmh ? `Velocidade ${selectedOrder.entrega.localizacaoAtual.velocidadeKmh.toFixed(0)} km/h` : 'Velocidade indisponivel'}
                        />
                      </Grid>
                      <Grid item xs={12} sm={4}>
                        <MetricPaper
                          icon={<RouteRoundedIcon color="success" />}
                          label="Compartilhamento"
                          value={sharing ? 'Ao vivo' : selectedOrder.entrega?.compartilhamentoAtivo ? 'Liberado' : 'Pausado'}
                          detail={
                            sharing
                              ? 'Esta tela esta enviando GPS agora'
                              : selectedOrder.entrega?.compartilhamentoAtivo
                                ? 'Rastreio liberado pela operacao para iniciar automaticamente'
                                : 'Aguardando a operacao iniciar a rota'
                          }
                        />
                      </Grid>
                    </Grid>

                    {selectedOrder.entrega?.localizacaoAtual ? (
                      <Box
                        component="iframe"
                        src={`${selectedOrder.entrega.localizacaoAtual.linkMapa}&z=16&output=embed`}
                        title="Mapa da entrega"
                        sx={{ width: '100%', height: 320, border: 0, borderRadius: 4, bgcolor: 'rgba(15, 23, 42, 0.04)' }}
                      />
                    ) : (
                      <Alert severity="warning" sx={{ borderRadius: 3 }}>
                        Nenhuma localizacao foi enviada ainda para esta entrega.
                      </Alert>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            ) : (
              <Alert severity="info" sx={{ borderRadius: 4 }}>
                Selecione uma entrega para abrir o painel de GPS.
              </Alert>
            )}
          </Grid>
        </Grid>
      )}
    </Stack>
  );
}

function extractDeliveryCode(linkPath: string | null | undefined) {
  if (!linkPath) {
    return null;
  }

  const match = linkPath.match(/\/entrega\/([^/?#]+)/i);
  return match?.[1] ?? null;
}

function labelForStatus(status: string) {
  switch (status) {
    case 'Recebido': return 'Recebido';
    case 'EmPreparacao': return 'Em preparacao';
    case 'ProntoParaRetirada': return 'Pronto';
    case 'SaiuParaEntrega': return 'Na rua';
    case 'Entregue': return 'Entregue';
    case 'Cancelado': return 'Cancelado';
    default: return status;
  }
}

function colorForStatus(status: string): 'default' | 'primary' | 'success' | 'warning' | 'error' {
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

  return `ha ${Math.round(diffHours / 24)} dia(s)`;
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value);
}

function MetricPaper({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 4, height: '100%' }}>
      <Stack spacing={1}>
        <Box>{icon}</Box>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
        <Typography variant="h6" sx={{ fontWeight: 900 }}>{value}</Typography>
        <Typography variant="body2" color="text.secondary">{detail}</Typography>
      </Stack>
    </Paper>
  );
}
