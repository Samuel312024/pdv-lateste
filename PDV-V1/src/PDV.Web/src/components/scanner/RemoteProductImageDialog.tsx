import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import ImageSearchRoundedIcon from '@mui/icons-material/ImageSearchRounded';
import LinkOffRoundedIcon from '@mui/icons-material/LinkOffRounded';
import PhoneIphoneRoundedIcon from '@mui/icons-material/PhoneIphoneRounded';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  Stack,
  Typography
} from '@mui/material';
import QRCode from 'qrcode';
import { useSnackbar } from 'notistack';
import { useEffect, useMemo, useState } from 'react';
import { useScannerSession } from '../../contexts/ScannerSessionContext';
import { getErrorMessage } from '../../utils/http';
import { parseProductImageCapturePayload } from '../../utils/productImageCapture';

interface RemoteProductImageDialogProps {
  open: boolean;
  contexto: string;
  title: string;
  description: string;
  onClose: () => void;
}

export function RemoteProductImageDialog({
  open,
  contexto,
  title,
  description,
  onClose
}: RemoteProductImageDialogProps) {
  const [loading, setLoading] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [originWarning, setOriginWarning] = useState<string | null>(null);
  const {
    active,
    session,
    pairUrl,
    status,
    connectionState,
    lastCode,
    startDesktopSession,
    disconnectScanner
  } = useScannerSession();
  const { enqueueSnackbar } = useSnackbar();
  const currentOrigin = window.location.origin;
  const lastImagePayload = useMemo(
    () => (lastCode ? parseProductImageCapturePayload(lastCode.codigoBarras, lastCode.formato) : null),
    [lastCode]
  );

  const isCurrentSessionReusable = useMemo(
    () => active && connectionState !== 'desconectado' && session?.contexto === contexto && session?.tipoLeitura === 'Auto',
    [active, connectionState, contexto, session?.contexto, session?.tipoLeitura]
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setOriginWarning(buildScannerOriginWarning(window.location));

    let mounted = true;

    async function ensureSession() {
      if (isCurrentSessionReusable && pairUrl) {
        return;
      }

      setLoading(true);
      try {
        await startDesktopSession(contexto, 'Auto');
      } catch (error) {
        if (mounted) {
          enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void ensureSession();

    return () => {
      mounted = false;
    };
  }, [contexto, enqueueSnackbar, isCurrentSessionReusable, open, pairUrl, startDesktopSession]);

  useEffect(() => {
    let mounted = true;

    async function generateQr() {
      if (!pairUrl) {
        setQrDataUrl(null);
        return;
      }

      try {
        const qr = await QRCode.toDataURL(pairUrl, {
          width: 280,
          margin: 1,
          color: {
            dark: '#17324f',
            light: '#ffffff'
          }
        });

        if (mounted) {
          setQrDataUrl(qr);
        }
      } catch {
        if (mounted) {
          setQrDataUrl(null);
        }
      }
    }

    void generateQr();

    return () => {
      mounted = false;
    };
  }, [pairUrl]);

  async function copyText(value: string | null, successMessage: string) {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      enqueueSnackbar(successMessage, { variant: 'success' });
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <PhoneIphoneRoundedIcon color="primary" />
        {title}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2.5}>
          <Typography color="text.secondary">{description}</Typography>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip icon={<ImageSearchRoundedIcon />} color="primary" variant="outlined" label="Imagem do produto" />
            <Chip variant="outlined" label="Camera ou galeria do celular" />
            <Chip
              color={status?.mobileConectado ? 'success' : connectionState === 'conectado' ? 'primary' : 'default'}
              label={status?.mobileConectado ? 'Celular conectado' : mapConnectionState(connectionState)}
            />
          </Stack>

          {originWarning ? <Alert severity="warning">{originWarning}</Alert> : null}
          {loading ? <Alert severity="info">Criando sessao visual para receber a foto do celular...</Alert> : null}

          {session && pairUrl ? (
            <>
              {shouldShowDeviceTrustHint(window.location) ? (
                <Alert severity="info" sx={{ borderRadius: 3 }}>
                  No celular, abra primeiro <strong>{currentOrigin}</strong>, aceite o certificado local se o navegador pedir e so depois leia o QR Code abaixo.
                </Alert>
              ) : null}

              <Box
                sx={{
                  borderRadius: 5,
                  border: '1px solid rgba(23, 75, 138, 0.12)',
                  bgcolor: 'rgba(255,255,255,0.92)',
                  p: 2.5,
                  display: 'grid',
                  placeItems: 'center',
                  gap: 2
                }}
              >
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="QR Code para abrir o envio de foto do produto"
                    style={{ width: 240, height: 240, maxWidth: '100%' }}
                  />
                ) : (
                  <Chip icon={<ImageSearchRoundedIcon />} label="Gerando QR Code..." />
                )}

                <Stack spacing={0.75} sx={{ textAlign: 'center' }}>
                  <Typography sx={{ fontWeight: 700 }}>Abra este QR Code no celular</Typography>
                  <Typography variant="body2" color="text.secondary">
                    O telefone abre a captura visual do produto, envia a foto e atualiza o cadastro desta tela em tempo real.
                  </Typography>
                  <Typography variant="body2">
                    Expira em {new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(new Date(session.expiraEmUtc))}
                  </Typography>
                </Stack>
              </Box>

              <Alert severity="info" sx={{ borderRadius: 3 }}>
                Fluxo profissional: fotografe a embalagem, envie para o sistema e, se quiser, informe um nome curto no celular para o cadastro cruzar com sites externos como Carrefour, Buscape e Open Facts, sem perder a edicao local.
              </Alert>

              <Box sx={{ p: 2, borderRadius: 4, bgcolor: 'rgba(23, 75, 138, 0.05)' }}>
                <Typography variant="body2" color="text.secondary">
                  Link direto
                </Typography>
                <Link
                  href={pairUrl}
                  target="_blank"
                  rel="noreferrer"
                  sx={{ display: 'block', mt: 0.75, wordBreak: 'break-all' }}
                >
                  {pairUrl}
                </Link>
              </Box>

              {status ? (
                <Alert severity={status.mobileConectado ? 'success' : 'info'} sx={{ borderRadius: 3 }}>
                  {status.mensagem} PDV: {status.conexoesPdv} · Celular: {status.conexoesMobile}
                </Alert>
              ) : null}

              {lastImagePayload ? (
                <Alert severity="success" sx={{ borderRadius: 3 }}>
                  Ultima imagem recebida: <strong>{lastImagePayload.fileName}</strong>
                  {lastImagePayload.searchTerm ? ` · termo enviado: ${lastImagePayload.searchTerm}` : ''}
                </Alert>
              ) : null}

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                <Button
                  variant="outlined"
                  startIcon={<ContentCopyRoundedIcon />}
                  onClick={() => void copyText(pairUrl, 'Link do envio visual copiado.')}
                >
                  Copiar link
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<ContentCopyRoundedIcon />}
                  onClick={() => void copyText(currentOrigin, 'Origem do frontend copiada.')}
                >
                  Copiar origem
                </Button>
                <Button
                  color="inherit"
                  variant="outlined"
                  startIcon={<LinkOffRoundedIcon />}
                  onClick={() => void disconnectScanner(true)}
                >
                  Desconectar
                </Button>
              </Stack>
            </>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={onClose}>Fechar</Button>
      </DialogActions>
    </Dialog>
  );
}

function mapConnectionState(value: 'desconectado' | 'conectando' | 'conectado' | 'reconectando') {
  switch (value) {
    case 'conectado':
      return 'Sessao pronta';
    case 'conectando':
      return 'Conectando';
    case 'reconectando':
      return 'Reconectando';
    default:
      return 'Desconectado';
  }
}

function buildScannerOriginWarning(location: Location) {
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    return 'Para usar o celular no envio de foto, abra o frontend pelo IP da rede local ou por HTTPS confiavel em vez de localhost.';
  }

  if (shouldShowDeviceTrustHint(location)) {
    return 'Este frontend esta em HTTPS local com certificado de desenvolvimento. Alguns celulares so entram na sessao depois que voce abre esse mesmo endereco no navegador do telefone e aceita o certificado.';
  }

  return null;
}

function shouldShowDeviceTrustHint(location: Location) {
  return import.meta.env.DEV && location.protocol === 'https:' && isLikelyLocalNetworkHost(location.hostname);
}

function isLikelyLocalNetworkHost(hostname: string) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)
    || hostname.endsWith('.local')
    || hostname.endsWith('.lan');
}
