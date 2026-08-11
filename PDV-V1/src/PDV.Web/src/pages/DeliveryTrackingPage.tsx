import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import DeliveryDiningRoundedIcon from '@mui/icons-material/DeliveryDiningRounded';
import FmdGoodRoundedIcon from '@mui/icons-material/FmdGoodRounded';
import MyLocationRoundedIcon from '@mui/icons-material/MyLocationRounded';
import PauseCircleRoundedIcon from '@mui/icons-material/PauseCircleRounded';
import PlayCircleRoundedIcon from '@mui/icons-material/PlayCircleRounded';
import RouteRoundedIcon from '@mui/icons-material/RouteRounded';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import WifiTetheringRoundedIcon from '@mui/icons-material/WifiTetheringRounded';
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
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { Loading } from '../components/common/Loading';
import { deliveryPublicService } from '../services/deliveryPublicService';
import type { PainelEntregaPublico, RegistrarEntregaLocalizacaoPayload } from '../types';
import { getErrorMessage } from '../utils/http';

export function DeliveryTrackingPage() {
  const { codigoAcesso } = useParams<{ codigoAcesso: string }>();
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<PainelEntregaPublico | null>(null);
  const [sharing, setSharing] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const autoStartAttemptRef = useRef<string | null>(null);
  const { enqueueSnackbar } = useSnackbar();

  useEffect(() => {
    void loadPanel();

    return () => {
      stopSharing();
    };
  }, [codigoAcesso]);

  async function loadPanel() {
    if (!codigoAcesso) {
      return;
    }

    setLoading(true);
    try {
      const result = await deliveryPublicService.getPanel(codigoAcesso);
      setPanel(result);
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const shouldAutoStart =
      Boolean(codigoAcesso) &&
      panel?.pedidoStatus === 'SaiuParaEntrega' &&
      Boolean(panel.entrega?.compartilhamentoAtivo);

    if (!shouldAutoStart || !codigoAcesso) {
      return;
    }

    if (sharing || watchIdRef.current != null || autoStartAttemptRef.current === codigoAcesso) {
      return;
    }

    autoStartAttemptRef.current = codigoAcesso;
    startSharing(true);
  }, [codigoAcesso, panel?.pedidoStatus, panel?.entrega?.compartilhamentoAtivo, sharing]);

  function startSharing(automatic = false) {
    if (!codigoAcesso) {
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

        void sendLocation(payload);
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

  async function sendLocation(payload: RegistrarEntregaLocalizacaoPayload) {
    if (!codigoAcesso) {
      return;
    }

    try {
      const result = await deliveryPublicService.sendLocation(codigoAcesso, payload);
      setPanel(result);
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    }
  }

  if (loading) {
    return <Loading message="Carregando painel da entrega..." />;
  }

  if (!panel) {
    return (
      <Alert severity="error" sx={{ borderRadius: 4 }}>
        Nao foi possivel abrir o painel desta entrega.
      </Alert>
    );
  }

  const latestLocation = panel.entrega?.localizacaoAtual ?? null;
  const journey = buildDeliveryJourney(panel.pedidoStatus);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        px: { xs: 2, md: 4 },
        py: { xs: 3, md: 5 },
        background: 'radial-gradient(circle at top right, rgba(59, 130, 246, 0.16), transparent 26%), linear-gradient(180deg, #f8fbff 0%, #eef4fb 100%)'
      }}
    >
      <Stack spacing={3} maxWidth="lg" sx={{ mx: 'auto' }}>
        <Box>
          <Typography variant="h4">Painel do entregador</Typography>
          <Typography color="text.secondary">
            Compartilhe sua localizacao em tempo real para atualizar automaticamente o comprador e a operacao.
          </Typography>
        </Box>

        {!window.isSecureContext ? (
          <Alert severity="warning" sx={{ borderRadius: 4 }}>
            O GPS do navegador costuma exigir contexto seguro. Abra este link em `https` ou em um ambiente confiavel do dispositivo.
          </Alert>
        ) : null}

        <Card
          sx={{
            borderRadius: 6,
            overflow: 'hidden',
            background: 'radial-gradient(circle at top right, rgba(59, 130, 246, 0.18), transparent 26%), radial-gradient(circle at bottom left, rgba(251, 191, 36, 0.18), transparent 24%), linear-gradient(180deg, #ffffff 0%, #f1f6ff 100%)'
          }}
        >
          <CardContent sx={{ p: { xs: 2.25, md: 3.5 } }}>
            <Grid container spacing={2.5}>
              <Grid item xs={12} lg={7}>
                <Stack spacing={2.25}>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Chip icon={<DeliveryDiningRoundedIcon />} label="Entrega monitorada" color="primary" />
                    <Chip icon={<ShieldRoundedIcon />} label="Atualiza comprador e operacao" variant="outlined" />
                  </Stack>

                  <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1.5}>
                    <Box>
                      <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: '-0.03em' }}>{panel.codigoAcompanhamento}</Typography>
                      <Typography color="text.secondary">
                        {panel.clienteNome} · {panel.entrega?.transportadoraNome ?? 'Entrega da loja'}
                      </Typography>
                    </Box>
                    <Chip label={labelForStatus(panel.pedidoStatus)} color={panel.pedidoStatus === 'Entregue' ? 'success' : 'primary'} />
                  </Stack>

                  <Alert severity="info" sx={{ borderRadius: 3 }}>
                    {panel.enderecoEntregaResumo ?? 'Endereco de entrega indisponivel'}
                    {panel.observacaoPedido ? ` · ${panel.observacaoPedido}` : ''}
                  </Alert>

                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25}>
                    <Button
                      variant="contained"
                      size="large"
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
                      {sharing ? 'Pausar compartilhamento' : 'Iniciar GPS em tempo real'}
                    </Button>
                    {latestLocation ? (
                      <Button
                        variant="outlined"
                        size="large"
                        startIcon={<MyLocationRoundedIcon />}
                        href={latestLocation.linkMapa}
                        target="_blank"
                        rel="noreferrer"
                        sx={{ borderRadius: 3 }}
                      >
                        Ver ultima posicao no mapa
                      </Button>
                    ) : null}
                  </Stack>

                  <Typography variant="body2" color="text.secondary">
                    {sharing
                      ? 'GPS ativo. Mantenha esta tela aberta durante a rota para alimentar o painel do comprador sem intervencao manual.'
                      : panel.entrega?.compartilhamentoAtivo
                        ? 'A operacao ja liberou o rastreio. Se o navegador permitir, o GPS inicia automaticamente nesta tela.'
                        : 'Assim que a operacao colocar a entrega na rua, o rastreio sera liberado automaticamente.'}
                  </Typography>

                  <Grid container spacing={1.25}>
                    <Grid item xs={12} sm={4}>
                      <TrackingStatCard
                        icon={<WifiTetheringRoundedIcon color={sharing ? 'success' : 'disabled'} />}
                        label="Status do GPS"
                        value={sharing ? 'Ao vivo' : latestLocation ? 'Ultima posicao salva' : 'Aguardando inicio'}
                        detail={sharing ? 'Compartilhando agora' : 'Sem transmissao continua no momento'}
                      />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <TrackingStatCard
                        icon={<AccessTimeRoundedIcon color="primary" />}
                        label="Ultima sincronizacao"
                        value={latestLocation ? formatRelativeTime(latestLocation.dataCaptura) : 'Sem registro'}
                        detail={latestLocation ? formatDateTime(latestLocation.dataCaptura) : 'Nenhum ponto enviado ainda'}
                      />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <TrackingStatCard
                        icon={<FmdGoodRoundedIcon sx={{ color: '#b45309' }} />}
                        label="Precisao"
                        value={latestLocation?.precisaoMetros ? `${latestLocation.precisaoMetros.toFixed(0)} m` : 'Nao informada'}
                        detail={latestLocation?.velocidadeKmh ? `Velocidade ${latestLocation.velocidadeKmh.toFixed(0)} km/h` : 'Velocidade indisponivel'}
                      />
                    </Grid>
                  </Grid>
                </Stack>
              </Grid>

              <Grid item xs={12} lg={5}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderRadius: 5,
                    height: '100%',
                    bgcolor: 'rgba(255,255,255,0.84)',
                    backdropFilter: 'blur(10px)'
                  }}
                >
                  <Stack spacing={1.25}>
                    <Typography variant="h6">Status da rota</Typography>
                    {journey.map((step) => (
                      <Paper
                        key={step.key}
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
                        <Stack spacing={0.4}>
                          <Typography variant="overline" sx={{ fontWeight: 800, letterSpacing: '0.08em' }}>
                            {step.badge}
                          </Typography>
                          <Typography sx={{ fontWeight: 800 }}>{step.title}</Typography>
                          <Typography variant="body2" color="text.secondary">{step.description}</Typography>
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                </Paper>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {latestLocation ? (
          <Card sx={{ borderRadius: 5 }}>
            <CardContent sx={{ p: { xs: 2, md: 3 } }}>
              <Stack spacing={1.5}>
                <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1.25}>
                  <Box>
                    <Typography variant="h6">Mapa da entrega</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Ultima leitura em {formatDateTime(latestLocation.dataCaptura)}.
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {latestLocation.precisaoMetros ? <Chip size="small" label={`Precisao ${latestLocation.precisaoMetros.toFixed(0)} m`} variant="outlined" /> : null}
                    {latestLocation.velocidadeKmh ? <Chip size="small" label={`Velocidade ${latestLocation.velocidadeKmh.toFixed(0)} km/h`} variant="outlined" /> : null}
                  </Stack>
                </Stack>

                <Box
                  component="iframe"
                  src={`${latestLocation.linkMapa}&z=16&output=embed`}
                  title="Mapa da entrega"
                  sx={{ width: '100%', height: 340, border: 0, borderRadius: 4, bgcolor: 'rgba(15, 23, 42, 0.04)' }}
                />
              </Stack>
            </CardContent>
          </Card>
        ) : (
          <Alert severity="warning" sx={{ borderRadius: 3 }}>
            Nenhuma localizacao foi enviada ainda por este dispositivo.
          </Alert>
        )}
      </Stack>
    </Box>
  );
}

interface TrackingStatCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}

function TrackingStatCard({ icon, label, value, detail }: TrackingStatCardProps) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3, height: '100%' }}>
      <Stack spacing={1}>
        <Box>{icon}</Box>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
        <Typography sx={{ fontWeight: 900 }}>{value}</Typography>
        <Typography variant="body2" color="text.secondary">{detail}</Typography>
      </Stack>
    </Paper>
  );
}

function buildDeliveryJourney(status: PainelEntregaPublico['pedidoStatus']) {
  const steps = [
    { key: 'Recebido', title: 'Pedido recebido', description: 'A operacao liberou o pedido para acompanhamento.' },
    { key: 'EmPreparacao', title: 'Pedido em preparo', description: 'A loja esta separando e finalizando o despacho.' },
    { key: 'SaiuParaEntrega', title: 'Rota iniciada', description: 'O rastreio por GPS e liberado automaticamente quando a rota entra na rua.' },
    { key: 'Entregue', title: 'Entrega concluida', description: 'Finalize a rota assim que o pedido for entregue.' }
  ] as const;

  const currentIndex = steps.findIndex((step) => step.key === status);

  return steps.map((step, index) => ({
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

function labelForStatus(status: PainelEntregaPublico['pedidoStatus']) {
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
