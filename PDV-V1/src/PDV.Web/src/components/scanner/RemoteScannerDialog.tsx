import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import LinkOffRoundedIcon from '@mui/icons-material/LinkOffRounded';
import PhoneIphoneRoundedIcon from '@mui/icons-material/PhoneIphoneRounded';
import QrCode2RoundedIcon from '@mui/icons-material/QrCode2Rounded';
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
import type { ScannerTipoLeitura } from '../../types';
import { useScannerSession } from '../../contexts/ScannerSessionContext';
import { getErrorMessage } from '../../utils/http';
import { formatScannerMode, getScannerModeDescription } from '../../utils/scanner';

interface RemoteScannerDialogProps {
  open: boolean;
  contexto: string;
  mode: ScannerTipoLeitura;
  title: string;
  description: string;
  onClose: () => void;
  onDetected: (code: string, format?: string | null) => void;
}

export function RemoteScannerDialog({
  open,
  contexto,
  mode,
  title,
  description,
  onClose
}: RemoteScannerDialogProps) {
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

  const isCurrentSessionReusable = useMemo(
    () => active && connectionState !== 'desconectado' && session?.contexto === contexto && session?.tipoLeitura === mode,
    [active, connectionState, contexto, mode, session?.contexto, session?.tipoLeitura]
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
        await startDesktopSession(contexto, mode);
        if (!mounted) {
          return;
        }
      } catch (error) {
        enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
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
  }, [contexto, enqueueSnackbar, isCurrentSessionReusable, mode, open, pairUrl, startDesktopSession]);

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
            <Chip icon={<QrCode2RoundedIcon />} color="primary" variant="outlined" label={formatScannerMode(mode)} />
            <Chip variant="outlined" label={getScannerModeDescription(mode)} />
            <Chip
              color={status?.mobileConectado ? 'success' : connectionState === 'conectado' ? 'primary' : 'default'}
              label={status?.mobileConectado ? 'Celular conectado' : mapConnectionState(connectionState)}
            />
          </Stack>

          {originWarning && <Alert severity="warning">{originWarning}</Alert>}
          {loading && <Alert severity="info">Criando sessao global de scanner para o celular...</Alert>}

          {session && pairUrl && (
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
                    alt="QR Code para abrir o scanner global"
                    style={{ width: 240, height: 240, maxWidth: '100%' }}
                  />
                ) : (
                  <Chip icon={<QrCode2RoundedIcon />} label="Gerando QR Code..." />
                )}

                <Stack spacing={0.75} sx={{ textAlign: 'center' }}>
                  <Typography sx={{ fontWeight: 700 }}>Abra este QR Code no celular</Typography>
                  <Typography variant="body2" color="text.secondary">
                    O celular entra na sessao global e passa a enviar codigos para qualquer tela inscrita no sistema.
                  </Typography>
                  <Typography variant="body2">
                    Expira em {new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(new Date(session.expiraEmUtc))}
                  </Typography>
                </Stack>
              </Box>

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

              {status && (
                <Alert severity={status.mobileConectado ? 'success' : 'info'} sx={{ borderRadius: 3 }}>
                  {status.mensagem} PDV: {status.conexoesPdv} · Celular: {status.conexoesMobile}
                </Alert>
              )}

              {lastCode && (
                <Alert severity="success" sx={{ borderRadius: 3 }}>
                  Ultimo codigo recebido: <strong>{lastCode.codigoBarras}</strong>
                </Alert>
              )}

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                <Button
                  variant="outlined"
                  startIcon={<ContentCopyRoundedIcon />}
                  onClick={() => void copyText(pairUrl, 'Link do scanner global copiado.')}
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
                  Desconectar scanner
                </Button>
              </Stack>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={onClose}>Fechar</Button>
      </DialogActions>
    </Dialog>
  );

  function mapConnectionState(value: typeof connectionState) {
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
}

function buildScannerOriginWarning(location: Location) {
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    return 'Para usar o celular como scanner remoto, abra o frontend pelo IP da rede local ou por HTTPS confiavel em vez de localhost.';
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
