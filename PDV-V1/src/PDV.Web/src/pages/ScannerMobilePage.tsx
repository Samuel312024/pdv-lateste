import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ImageSearchRoundedIcon from '@mui/icons-material/ImageSearchRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import KeyboardRoundedIcon from '@mui/icons-material/KeyboardRounded';
import PhotoCameraBackRoundedIcon from '@mui/icons-material/PhotoCameraBackRounded';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { InstallPwaButton } from '../components/pwa/InstallPwaButton';
import { ImageCaptureScannerButton } from '../components/scanner/ImageCaptureScannerButton';
import { LiveBarcodeScanner } from '../components/scanner/LiveBarcodeScanner';
import { ManualScannerEntryDialog } from '../components/scanner/ManualScannerEntryDialog';
import { useScannerSession } from '../contexts/ScannerSessionContext';
import { scannerService } from '../services/scannerService';
import { getErrorMessage } from '../utils/http';
import { canUseLiveCamera, formatScannerMode, getLiveCameraUnavailableMessage, getScannerScreenTitle } from '../utils/scanner';
import { isProductImageScannerContext, optimizeProductImageFile } from '../utils/productImageCapture';

type LocalActivity = { type: 'info' | 'warning' | 'error'; message: string; at: string };

export function ScannerMobilePage() {
  const { sessaoId: routeSessionId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [activityLogs, setActivityLogs] = useState<LocalActivity[]>([]);
  const [selectedProductImageFile, setSelectedProductImageFile] = useState<File | null>(null);
  const [selectedProductImagePreviewUrl, setSelectedProductImagePreviewUrl] = useState<string | null>(null);
  const [uploadedProductImageUrl, setUploadedProductImageUrl] = useState<string | null>(null);
  const [uploadedProductImageName, setUploadedProductImageName] = useState<string | null>(null);
  const [productImageSearchTerm, setProductImageSearchTerm] = useState('');
  const [productImageUploading, setProductImageUploading] = useState(false);
  const { enqueueSnackbar } = useSnackbar();
  const {
    publicSession,
    connectionState,
    status,
    connectMobileSession,
    sendCode,
    disconnectScanner
  } = useScannerSession();

  const querySessionId = searchParams.get('sessao') ?? '';
  const accessKey = searchParams.get('chave') ?? '';
  const sessionId = querySessionId || routeSessionId;
  const liveCameraSupported = canUseLiveCamera();
  const lastLocalLogRef = useRef<{ type: string; message: string; at: number } | null>(null);
  const isProductImageMode = isProductImageScannerContext(publicSession?.contexto);

  const appendLocalLog = useCallback((type: 'info' | 'warning' | 'error', message: string, force = false) => {
    const now = Date.now();
    const previous = lastLocalLogRef.current;
    if (!force && previous && previous.type === type && previous.message === message && now - previous.at < 2200) {
      return;
    }

    lastLocalLogRef.current = { type, message, at: now };
    setActivityLogs((current) => [{ type, message, at: new Date().toISOString() }, ...current].slice(0, 14));
  }, []);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      setLoading(true);
      try {
        await connectMobileSession(sessionId, accessKey);
        if (!mounted) {
          return;
        }

        appendLocalLog('info', 'Celular conectado ao scanner global.', true);

        if (!window.isSecureContext) {
          appendLocalLog(
            'warning',
            'Pagina aberta em HTTP. Alguns navegadores podem limitar o video ao vivo e exigir captura por foto.',
            true
          );
        }

        if (!liveCameraSupported) {
          appendLocalLog('warning', getLiveCameraUnavailableMessage(), true);
        }
      } catch (error) {
        if (!mounted) {
          return;
        }

        const message = getErrorMessage(error);
        enqueueSnackbar(message, { variant: 'error' });
        appendLocalLog('error', message, true);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    if (sessionId && accessKey) {
      void bootstrap();
    } else {
      setLoading(false);
    }

    return () => {
      mounted = false;
    };
  }, [accessKey, appendLocalLog, connectMobileSession, enqueueSnackbar, liveCameraSupported, sessionId]);

  useEffect(() => {
    return () => {
      void disconnectScanner(false);
    };
  }, [disconnectScanner]);

  useEffect(() => {
    if (!selectedProductImageFile) {
      setSelectedProductImagePreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(selectedProductImageFile);
    setSelectedProductImagePreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedProductImageFile]);

  useEffect(() => {
    if (!status?.mensagem) {
      return;
    }

    appendLocalLog(status.mobileConectado ? 'info' : 'warning', status.mensagem);
  }, [appendLocalLog, status]);

  const sendScannedCode = useCallback(
    async (code: string, format?: string | null) => {
      if (!code.trim()) {
        return;
      }

      setSubmitting(true);
      try {
        await sendCode(code.trim(), format);
        setSentCount((current) => current + 1);
        enqueueSnackbar(`Codigo enviado: ${code.trim()}`, { variant: 'success' });
        appendLocalLog('info', `Leitura enviada com sucesso: ${code.trim()}`, true);
        navigator.vibrate?.([50, 30, 50]);
        playScanFeedback();
      } catch (error) {
        const message = getErrorMessage(error);
        enqueueSnackbar(message, { variant: 'error' });
        appendLocalLog('error', `Falha ao enviar codigo: ${message}`, true);
      } finally {
        setSubmitting(false);
      }
    },
    [appendLocalLog, enqueueSnackbar, sendCode]
  );

  const handleProductImageSelected = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      appendLocalLog('warning', 'Nenhuma foto foi selecionada para o produto.', true);
      return;
    }

    setSelectedProductImageFile(file);
    appendLocalLog('info', `Foto pronta para envio: ${file.name}`, true);
    event.target.value = '';
  }, [appendLocalLog]);

  const sendProductImage = useCallback(async () => {
    if (!selectedProductImageFile) {
      enqueueSnackbar('Selecione ou fotografe o produto antes de enviar.', { variant: 'warning' });
      return;
    }

    setProductImageUploading(true);
    try {
      const optimizedFile = await optimizeProductImageFile(selectedProductImageFile);
      const result = await scannerService.uploadProductImage(
        sessionId,
        accessKey,
        optimizedFile,
        productImageSearchTerm.trim() || null
      );

      setUploadedProductImageUrl(result.imagemUrl);
      setUploadedProductImageName(result.nomeArquivoOriginal);
      setSelectedProductImageFile(null);
      setSentCount((current) => current + 1);
      enqueueSnackbar('Foto do produto enviada ao cadastro com sucesso.', { variant: 'success' });
      appendLocalLog(
        'info',
        result.termoBusca
          ? `Imagem enviada com o termo "${result.termoBusca}".`
          : 'Imagem enviada ao cadastro sem termo adicional.',
        true
      );
      navigator.vibrate?.([50, 30, 50]);
      playScanFeedback();
    } catch (error) {
      const message = getErrorMessage(error);
      enqueueSnackbar(message, { variant: 'error' });
      appendLocalLog('error', `Falha ao enviar a foto do produto: ${message}`, true);
    } finally {
      setProductImageUploading(false);
    }
  }, [accessKey, appendLocalLog, enqueueSnackbar, productImageSearchTerm, selectedProductImageFile, sessionId]);

  const handleCaptureStatus = useCallback(
    (type: 'info' | 'warning' | 'error', message: string) => {
      appendLocalLog(type, message, type !== 'info');
    },
    [appendLocalLog]
  );

  const connectionLabel = useMemo(() => {
    switch (connectionState) {
      case 'conectado':
        return 'Conectado';
      case 'conectando':
        return 'Conectando';
      case 'reconectando':
        return 'Reconectando';
      default:
        return 'Desconectado';
    }
  }, [connectionState]);

  if (!sessionId || !accessKey) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 3, bgcolor: '#05080f' }}>
        <Alert severity="error" sx={{ borderRadius: 3 }}>
          Link do scanner invalido. Gere uma nova sessao pelo PDV.
        </Alert>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 3, bgcolor: '#05080f' }}>
        <Alert severity="info" sx={{ borderRadius: 3 }}>
          Preparando o scanner global no celular...
        </Alert>
      </Box>
    );
  }

  if (!publicSession) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 3, bgcolor: '#05080f' }}>
        <Alert severity="error" sx={{ borderRadius: 3 }}>
          A sessao do scanner nao esta disponivel. Gere uma nova no PDV.
        </Alert>
      </Box>
    );
  }

  return (
    <>
      <Box
        sx={{
          minHeight: '100vh',
          bgcolor: '#05080f',
          color: 'common.white',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <Box
          sx={{
            px: { xs: 2, sm: 3.5 },
            pt: { xs: 2, sm: 3 },
            pb: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <IconButton onClick={() => window.history.back()} sx={{ color: 'common.white' }}>
            <ArrowBackRoundedIcon />
          </IconButton>

          <Stack spacing={0.25} sx={{ textAlign: 'center', px: 1, flex: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 700, color: 'common.white' }}>
              {isProductImageMode ? 'Envie a foto do produto' : getScannerScreenTitle(publicSession.tipoLeitura)}
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.72)' }}>
              {publicSession.contexto}
            </Typography>
          </Stack>

          <Stack direction="row" spacing={0.75}>
            <IconButton
              onClick={() => setDetailsOpen(true)}
              sx={{
                color: 'rgba(255,255,255,0.9)',
                border: '1px solid rgba(255,255,255,0.14)'
              }}
            >
              <InfoOutlinedIcon />
            </IconButton>
          </Stack>
        </Box>

        <Box
          sx={{
            flex: 1,
            px: { xs: 2, sm: 3.5 },
            display: 'grid',
            alignItems: 'center'
          }}
        >
          <Stack spacing={3} sx={{ width: '100%', maxWidth: 900, mx: 'auto' }}>
            {isProductImageMode ? (
              <Box
                sx={{
                  minHeight: 420,
                  borderRadius: 5,
                  border: '1px solid rgba(255,255,255,0.12)',
                  bgcolor: '#070b14',
                  boxShadow: '0 18px 46px rgba(0,0,0,0.45)',
                  p: { xs: 2.5, sm: 4 },
                  display: 'grid',
                  placeItems: 'center'
                }}
              >
                <Stack spacing={2.25} sx={{ width: '100%', maxWidth: 620 }}>
                  <Alert severity="info" sx={{ borderRadius: 3 }}>
                    Fotografe a frente da embalagem e envie a imagem direto para o cadastro aberto no PDV.
                  </Alert>

                  <Box
                    sx={{
                      minHeight: 260,
                      borderRadius: 4,
                      border: '1px dashed rgba(255,255,255,0.18)',
                      bgcolor: 'rgba(255,255,255,0.04)',
                      overflow: 'hidden',
                      display: 'grid',
                      placeItems: 'center'
                    }}
                  >
                    {selectedProductImagePreviewUrl || uploadedProductImageUrl ? (
                      <Box
                        component="img"
                        src={selectedProductImagePreviewUrl ?? uploadedProductImageUrl ?? ''}
                        alt="Preview do produto"
                        sx={{
                          width: '100%',
                          maxHeight: 360,
                          objectFit: 'contain',
                          bgcolor: '#ffffff'
                        }}
                      />
                    ) : (
                      <Stack spacing={1} alignItems="center" sx={{ px: 3, py: 4, textAlign: 'center' }}>
                        <ImageSearchRoundedIcon sx={{ fontSize: 42, color: 'rgba(255,255,255,0.78)' }} />
                        <Typography sx={{ color: 'rgba(255,255,255,0.84)', fontWeight: 700 }}>
                          Nenhuma foto selecionada ainda
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.58)' }}>
                          Abra a camera ou a galeria do celular para capturar a imagem do produto.
                        </Typography>
                      </Stack>
                    )}
                  </Box>

                  <TextField
                    label="Nome curto para cruzar com o catalogo"
                    value={productImageSearchTerm}
                    onChange={(event) => setProductImageSearchTerm(event.target.value)}
                    placeholder="Ex.: sabonete suave 85g"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    sx={{
                      '& .MuiInputBase-root': {
                        bgcolor: 'rgba(255,255,255,0.92)'
                      }
                    }}
                    helperText="Opcional. Se voce informar um nome curto, o PDV usa esse termo para cruzar a foto com sites externos e sugerir marca, descricao e imagem, mantendo a edicao no cadastro."
                  />

                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                    <Button
                      component="label"
                      variant="outlined"
                      startIcon={<PhotoCameraBackRoundedIcon />}
                      fullWidth
                      sx={{
                        minHeight: 56,
                        borderRadius: 999,
                        color: 'rgba(255,255,255,0.92)',
                        borderColor: 'rgba(255,255,255,0.22)',
                        '&:hover': {
                          bgcolor: 'rgba(255,255,255,0.08)',
                          borderColor: 'rgba(255,255,255,0.34)'
                        }
                      }}
                    >
                      Abrir camera ou galeria
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        hidden
                        onChange={handleProductImageSelected}
                      />
                    </Button>
                    <Button
                      variant="contained"
                      startIcon={<ImageSearchRoundedIcon />}
                      onClick={() => void sendProductImage()}
                      disabled={!selectedProductImageFile || productImageUploading}
                      fullWidth
                      sx={{
                        minHeight: 56,
                        borderRadius: 999,
                        bgcolor: 'rgba(255,255,255,0.92)',
                        color: '#0f1726',
                        '&:hover': {
                          bgcolor: '#ffffff'
                        }
                      }}
                    >
                      {productImageUploading ? 'Enviando foto...' : 'Enviar foto ao cadastro'}
                    </Button>
                  </Stack>

                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.58)', textAlign: 'center' }}>
                    {selectedProductImageFile
                      ? `Arquivo pronto: ${selectedProductImageFile.name} · ${formatFileSize(selectedProductImageFile.size)}.`
                      : uploadedProductImageName
                        ? `Ultima foto enviada: ${uploadedProductImageName}.`
                        : 'A foto enviada aparece imediatamente no cadastro do produto aberto no sistema.'}
                  </Typography>
                </Stack>
              </Box>
            ) : liveCameraSupported ? (
              <LiveBarcodeScanner
                active={connectionState !== 'desconectado' && !submitting}
                mode={publicSession.tipoLeitura}
                onDetected={sendScannedCode}
                onLog={(type, message) => appendLocalLog(type, message)}
                continuous
                height={420}
                performanceMode={publicSession.tipoLeitura === 'QrCode' ? 'precision' : 'light'}
                variant="immersive"
              />
            ) : (
              <Box
                sx={{
                  minHeight: 420,
                  borderRadius: 5,
                  border: '1px solid rgba(255,255,255,0.12)',
                  bgcolor: '#070b14',
                  boxShadow: '0 18px 46px rgba(0,0,0,0.45)',
                  p: { xs: 2.5, sm: 4 },
                  display: 'grid',
                  placeItems: 'center'
                }}
              >
                <Stack spacing={2} alignItems="center" sx={{ maxWidth: 560 }}>
                  <Alert severity="warning" sx={{ borderRadius: 3, width: '100%' }}>
                    {getLiveCameraUnavailableMessage()}
                  </Alert>
                  <Typography sx={{ color: 'rgba(255,255,255,0.72)', textAlign: 'center' }}>
                    No celular, esta pagina vai funcionar em modo compativel. Toque no botao abaixo para abrir a camera nativa ou escolher uma foto com o codigo.
                  </Typography>
                  <ImageCaptureScannerButton
                    mode={publicSession.tipoLeitura}
                    label={publicSession.tipoLeitura === 'QrCode' ? 'Abrir camera do celular para QR Code' : 'Abrir camera do celular para codigo'}
                    variant="contained"
                    size="large"
                    fullWidth
                    onDetected={sendScannedCode}
                    onStatus={handleCaptureStatus}
                    sx={{
                      minHeight: 56,
                      maxWidth: 420,
                      borderRadius: 999,
                      px: 4,
                      bgcolor: 'rgba(255,255,255,0.92)',
                      color: '#0f1726',
                      '&:hover': {
                        bgcolor: '#ffffff'
                      }
                    }}
                  />
                </Stack>
              </Box>
            )}

            <Stack spacing={1.25} alignItems="center">
              <InstallPwaButton
                label="Instalar scanner no celular"
                variant="outlined"
                color="inherit"
                fullWidth
                sx={{
                  maxWidth: 320,
                  borderRadius: 999,
                  color: 'rgba(255,255,255,0.9)',
                  borderColor: 'rgba(255,255,255,0.18)',
                  '&:hover': {
                    bgcolor: 'rgba(255,255,255,0.06)',
                    borderColor: 'rgba(255,255,255,0.28)'
                  }
                }}
              />

              {isProductImageMode ? (
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.58)', textAlign: 'center', maxWidth: 720 }}>
                  A imagem segue para o cadastro do produto em tempo real e pode acionar a busca externa quando houver nome suficiente para cruzamento.
                </Typography>
              ) : (
                <>
                  <Button
                    variant="contained"
                    startIcon={<KeyboardRoundedIcon />}
                    onClick={() => setManualDialogOpen(true)}
                    disabled={submitting}
                    sx={{
                      minWidth: 260,
                      minHeight: 56,
                      borderRadius: 999,
                      px: 4,
                      bgcolor: 'rgba(17,17,17,0.88)',
                      color: 'common.white',
                      boxShadow: '0 14px 36px rgba(0,0,0,0.36)',
                      '&:hover': {
                        bgcolor: 'rgba(29,29,29,0.94)'
                      }
                    }}
                  >
                    {publicSession.tipoLeitura === 'QrCode' ? 'Digitar QR Code' : 'Digitar codigo de barras'}
                  </Button>

                  <ImageCaptureScannerButton
                    mode={publicSession.tipoLeitura}
                    label={liveCameraSupported ? 'Usar camera ou foto como apoio' : 'Abrir novamente a camera ou galeria'}
                    variant={liveCameraSupported ? 'text' : 'outlined'}
                    onDetected={sendScannedCode}
                    onStatus={handleCaptureStatus}
                    sx={{
                      color: 'rgba(255,255,255,0.78)',
                      borderColor: liveCameraSupported ? undefined : 'rgba(255,255,255,0.18)',
                      '&:hover': {
                        bgcolor: 'rgba(255,255,255,0.06)'
                      }
                    }}
                  />

                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.58)', textAlign: 'center', maxWidth: 720 }}>
                    O codigo lido entra direto na sessao global do sistema em modo {formatScannerMode(publicSession.tipoLeitura).toLowerCase()}.
                  </Typography>
                </>
              )}
            </Stack>
          </Stack>
        </Box>
      </Box>

      {!isProductImageMode ? (
        <ManualScannerEntryDialog
          open={manualDialogOpen}
          mode={publicSession.tipoLeitura}
          title={publicSession.tipoLeitura === 'QrCode' ? 'Digitar QR Code' : 'Digitar codigo de barras'}
          onClose={() => setManualDialogOpen(false)}
          onDetected={(code, format) => {
            void sendScannedCode(code, format);
            setManualDialogOpen(false);
          }}
        />
      ) : null}

      <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Detalhes da sessao</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Box sx={{ p: 2, borderRadius: 4, bgcolor: 'rgba(23, 75, 138, 0.06)' }}>
              <Typography variant="body2" color="text.secondary">
                Contexto
              </Typography>
              <Typography sx={{ fontWeight: 700 }}>{publicSession.contexto}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Modo: {isProductImageMode ? 'Imagem do produto' : formatScannerMode(publicSession.tipoLeitura)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Status da conexao: {connectionLabel}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Leituras enviadas: {sentCount}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                PDV conectado: {status?.conexoesPdv ?? 0} · Celular conectado: {status?.conexoesMobile ?? 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Expira em {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(publicSession.expiraEmUtc))}
              </Typography>
            </Box>

            <Stack spacing={1}>
              <Typography sx={{ fontWeight: 700 }}>Atividade do scanner</Typography>
              {activityLogs.length === 0 ? (
                <Typography color="text.secondary">Nenhum evento registrado ainda.</Typography>
              ) : (
                activityLogs.map((entry, index) => (
                  <Alert key={`${entry.at}-${index}`} severity={entry.type} sx={{ borderRadius: 3 }}>
                    <Typography sx={{ fontWeight: 700 }}>
                      {new Intl.DateTimeFormat('pt-BR', { timeStyle: 'medium' }).format(new Date(entry.at))}
                    </Typography>
                    <Typography variant="body2">{entry.message}</Typography>
                  </Alert>
                ))
              )}
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button
            color="inherit"
            onClick={() => void disconnectScanner(false)}
          >
            Desconectar
          </Button>
          <Button onClick={() => setDetailsOpen(false)}>Fechar</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function playScanFeedback() {
  if (typeof window === 'undefined') {
    return;
  }

  const AudioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    return;
  }

  try {
    const audioContext = new AudioContextCtor();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = 960;
    gainNode.gain.value = 0.03;

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.08);
    oscillator.onended = () => {
      void audioContext.close();
    };
  } catch {
    // O feedback visual e a vibracao continuam suficientes se o audio falhar.
  }
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (sizeBytes >= 1024) {
    return `${Math.round(sizeBytes / 1024)} KB`;
  }

  return `${sizeBytes} B`;
}
