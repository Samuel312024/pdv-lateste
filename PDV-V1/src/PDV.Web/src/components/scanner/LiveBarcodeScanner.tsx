import FlashOffRoundedIcon from '@mui/icons-material/FlashOffRounded';
import FlashOnRoundedIcon from '@mui/icons-material/FlashOnRounded';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { Html5Qrcode, type Html5QrcodeResult } from 'html5-qrcode';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ScannerTipoLeitura } from '../../types';
import {
  buildPreferredCameraConstraints,
  canUseLiveCamera,
  formatScannerMode,
  getHtml5CameraScanConfig,
  getHtml5QrcodeFormats,
  getLiveCameraUnavailableMessage,
  getScannerFocusFrame,
  getScannerPrompt,
  getVideoConstraints,
  isBackCameraLabel,
  isScannerFormatAccepted,
  pickPreferredCamera,
  savePreferredCameraId,
  type ScannerPerformanceMode
} from '../../utils/scanner';

interface LiveBarcodeScannerProps {
  active: boolean;
  mode?: ScannerTipoLeitura;
  onDetected: (code: string, format?: string | null) => void;
  onLog?: (type: 'info' | 'warning' | 'error', message: string) => void;
  continuous?: boolean;
  height?: number;
  performanceMode?: ScannerPerformanceMode;
  variant?: 'default' | 'immersive';
}

export function LiveBarcodeScanner({
  active,
  mode = 'Auto',
  onDetected,
  onLog,
  continuous = false,
  height = 320,
  performanceMode = 'default',
  variant = 'default'
}: LiveBarcodeScannerProps) {
  const containerId = `pdv-scanner-${useId().replace(/:/g, '')}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const stoppingRef = useRef(false);
  const onDetectedRef = useRef(onDetected);
  const onLogRef = useRef(onLog);
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);
  const lastLogRef = useRef<{ type: string; message: string; at: number } | null>(null);
  const [status, setStatus] = useState('Preparando camera...');
  const [engine, setEngine] = useState<'html5-qrcode' | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [torchBusy, setTorchBusy] = useState(false);

  const frameStyle = useMemo(() => getScannerFocusFrame(mode, performanceMode), [mode, performanceMode]);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    onLogRef.current = onLog;
  }, [onLog]);

  useEffect(() => {
    if (!active) {
      setTorchSupported(false);
      setTorchEnabled(false);
      setTorchBusy(false);
      return;
    }

    if (!canUseLiveCamera()) {
      updateStatus(getLiveCameraUnavailableMessage(), 'error', { forceLog: true });
      return;
    }

    let cancelled = false;
    let scanner: Html5Qrcode | null = null;

    const startScanner = async () => {
      try {
        updateStatus('Solicitando camera traseira...', 'info', { forceLog: true });

        const preferredCamera = await resolvePreferredCamera();
        scanner = new Html5Qrcode(containerId, {
          verbose: false,
          formatsToSupport: getHtml5QrcodeFormats(mode),
          useBarCodeDetectorIfSupported: true
        });

        scannerRef.current = scanner;
        setEngine('html5-qrcode');

        await scanner.start(
          buildPreferredCameraConstraints(preferredCamera.cameraId),
          getHtml5CameraScanConfig(mode, performanceMode),
          (decodedText, result) => {
            if (cancelled || stoppingRef.current) {
              return;
            }

            void handleDetected(scanner, decodedText, result, continuous);
          },
          (errorMessage, error) => {
            if (cancelled || shouldIgnoreScannerError(errorMessage, error)) {
              return;
            }

            updateStatus('Camera ativa. Ajuste foco, distancia ou iluminacao para melhorar a leitura.', 'warning');
          }
        );

        try {
          await scanner.applyVideoConstraints(getVideoConstraints(performanceMode));
        } catch {
          // Alguns navegadores ignoram ajustes finos de resolucao/frame rate apos iniciar a camera.
        }

        try {
          const runtimeConstraints = buildRuntimeScannerConstraints(scanner, mode, performanceMode);
          if (Object.keys(runtimeConstraints).length > 0) {
            await scanner.applyVideoConstraints(runtimeConstraints);
          }
        } catch {
          // Ajustes de foco e exposicao variam por navegador; a leitura continua mesmo sem suporte.
        }

        if (cancelled || !scanner) {
          return;
        }

        const runningSettings = safeGetTrackSettings(scanner);
        const activeDeviceId = runningSettings?.deviceId ?? preferredCamera.cameraId ?? null;
        const capabilities = safeGetTrackCapabilities(scanner) as ({ torch?: boolean } | null);
        setTorchSupported(Boolean(capabilities && typeof capabilities.torch === 'boolean'));
        setTorchEnabled(false);
        if (activeDeviceId) {
          savePreferredCameraId(activeDeviceId);
        }

        if (preferredCamera.isBackCamera) {
          updateStatus(buildScannerReadyMessage(mode, performanceMode), 'info', { forceLog: true });
        } else {
          updateStatus(
            `${getScannerPrompt(mode)} O navegador abriu a camera disponivel no aparelho.`,
            'warning',
            { forceLog: true }
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setTorchSupported(false);
        setTorchEnabled(false);
        updateStatus(`Nao foi possivel iniciar a camera: ${message}`, 'error', { forceLog: true });
      }
    };

    void startScanner();

    return () => {
      cancelled = true;
      void stopScannerInstance(scanner ?? scannerRef.current);
    };
  }, [active, containerId, continuous, mode, performanceMode]);

  return (
    <Stack spacing={1.5}>
      <Box
        sx={{
          position: 'relative',
          borderRadius: variant === 'immersive' ? 5 : 4,
          overflow: 'hidden',
          bgcolor: variant === 'immersive' ? '#05080f' : '#0d1726',
          minHeight: height,
          border: variant === 'immersive' ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(23, 75, 138, 0.16)',
          boxShadow: variant === 'immersive' ? '0 18px 46px rgba(0,0,0,0.45)' : 'none'
        }}
      >
        <Box
          id={containerId}
          sx={{
            width: '100%',
            height: `${height}px`,
            '& > div': {
              width: '100%',
              height: '100%',
              position: 'relative',
              overflow: 'hidden'
            },
            '& video, & canvas': {
              width: '100% !important',
              height: '100% !important',
              objectFit: 'cover',
              display: 'block'
            },
            '& #qr-shaded-region': {
              borderWidth: '0 !important',
              background: 'transparent !important'
            }
          }}
        />

        {torchSupported ? (
          <Button
            variant="contained"
            size="small"
            startIcon={torchEnabled ? <FlashOffRoundedIcon /> : <FlashOnRoundedIcon />}
            disabled={torchBusy}
            onClick={() => void toggleTorch()}
            sx={{
              position: 'absolute',
              top: 12,
              right: 12,
              zIndex: 3,
              minHeight: 38,
              borderRadius: 999,
              px: 1.5,
              textTransform: 'none',
              fontWeight: 800,
              bgcolor: torchEnabled ? 'rgba(255, 214, 102, 0.94)' : 'rgba(12, 19, 33, 0.84)',
              color: torchEnabled ? '#5a3c10' : '#ffffff',
              boxShadow: '0 10px 26px rgba(0,0,0,0.24)',
              '&:hover': {
                bgcolor: torchEnabled ? 'rgba(255, 214, 102, 1)' : 'rgba(24, 33, 52, 0.92)'
              }
            }}
          >
            {torchEnabled ? 'Apagar lanterna' : 'Acender lanterna'}
          </Button>
        ) : null}

        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            display: 'grid',
            placeItems: 'center',
            background: variant === 'immersive'
              ? 'linear-gradient(180deg, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0.06) 26%, rgba(0,0,0,0.06) 74%, rgba(0,0,0,0.32) 100%)'
              : 'transparent'
          }}
        >
          <Box
            sx={{
              width: `${frameStyle.widthPercent}%`,
              height: `${frameStyle.heightPercent}%`,
              maxWidth: mode === 'QrCode' ? 320 : 460,
              borderRadius: `${frameStyle.borderRadius}px`,
              position: 'relative',
              '&::after': {
                content: '""',
                position: 'absolute',
                left: mode === 'CodigoBarras' ? '4%' : '0',
                right: mode === 'CodigoBarras' ? '4%' : '0',
                top: '50%',
                height: variant === 'immersive' ? '3px' : '2px',
                background: variant === 'immersive' ? 'rgba(255,255,255,0.98)' : 'rgba(53, 230, 160, 0.92)',
                boxShadow: variant === 'immersive'
                  ? '0 0 16px rgba(255,255,255,0.55)'
                  : '0 0 12px rgba(53, 230, 160, 0.72)'
              }
            }}
          >
            {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((corner) => (
              <Box
                key={corner}
                sx={getCornerStyle(corner, variant === 'immersive' ? 5 : 4, mode === 'QrCode' ? 34 : 28)}
              />
            ))}
          </Box>
        </Box>
      </Box>

      {variant === 'immersive' ? (
        <Stack spacing={0.75} alignItems="center">
          <Box
            sx={{
              px: 2,
              py: 1,
              borderRadius: 999,
              bgcolor: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.12)',
              backdropFilter: 'blur(10px)',
              maxWidth: '100%'
            }}
          >
            <Typography variant="body2" sx={{ color: 'common.white', textAlign: 'center' }}>
              {status}
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.72)', textAlign: 'center' }}>
            {formatScannerMode(mode)} · {engine === 'html5-qrcode'
              ? 'Leitura direta pela camera com foco central.'
              : 'Preparando motor de leitura.'}
          </Typography>
        </Stack>
      ) : (
        <>
          <Typography variant="body2" color="text.secondary">
            {status}
          </Typography>

          <Alert severity="info" sx={{ borderRadius: 3 }}>
            {formatScannerMode(mode)} · {engine === 'html5-qrcode'
              ? 'Leitura direta pela camera com foco central.'
              : 'Preparando motor de leitura.'}
          </Alert>
        </>
      )}
    </Stack>
  );

  async function handleDetected(
    scannerInstance: Html5Qrcode | null,
    decodedText: string,
    result: Html5QrcodeResult,
    keepReading: boolean
  ) {
    const code = decodedText.trim();
    const format = extractFormat(result);
    if (!code) {
      return;
    }

    if (!isScannerFormatAccepted(format, mode)) {
      updateStatus(`Foi detectado um codigo fora do modo ${formatScannerMode(mode)}.`, 'warning');
      return;
    }

    if (shouldIgnoreRepeatedScan(code)) {
      return;
    }

    updateStatus(`Leitura capturada: ${code}`, 'info', { forceLog: true });
    navigator.vibrate?.(35);
    onDetectedRef.current(code, format);

    if (!keepReading) {
      await stopScannerInstance(scannerInstance);
    }
  }

  function shouldIgnoreRepeatedScan(code: string) {
    const now = Date.now();
    const lastScan = lastScanRef.current;
    if (lastScan && lastScan.code === code && now - lastScan.at < 1800) {
      return true;
    }

    lastScanRef.current = { code, at: now };
    return false;
  }

  function updateStatus(message: string, type?: 'info' | 'warning' | 'error', options?: { forceLog?: boolean }) {
    setStatus(message);
    if (type) {
      reportLog(type, message, options?.forceLog ?? false);
    }
  }

  function reportLog(type: 'info' | 'warning' | 'error', message: string, force = false) {
    const logger = onLogRef.current;
    if (!logger) {
      return;
    }

    const now = Date.now();
    const previous = lastLogRef.current;
    if (!force && previous && previous.type === type && previous.message === message && now - previous.at < 2500) {
      return;
    }

    lastLogRef.current = { type, message, at: now };
    logger(type, message);
  }

  async function toggleTorch() {
    if (!scannerRef.current || torchBusy) {
      return;
    }

    const nextEnabled = !torchEnabled;
    setTorchBusy(true);

    try {
      await applyTorchConstraint(scannerRef.current, nextEnabled);
      setTorchEnabled(nextEnabled);
      updateStatus(
        nextEnabled ? 'Lanterna ligada para melhorar a leitura.' : 'Lanterna desligada.',
        'info',
        { forceLog: true }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateStatus(`Nao foi possivel ajustar a lanterna: ${message}`, 'warning', { forceLog: true });
    } finally {
      setTorchBusy(false);
    }
  }
}

async function resolvePreferredCamera() {
  try {
    const cameras = await Html5Qrcode.getCameras();
    const preferredCamera = pickPreferredCamera(cameras);

    return {
      cameraId: preferredCamera?.id ?? null,
      isBackCamera: preferredCamera ? isBackCameraLabel(preferredCamera.label) : true
    };
  } catch {
    return {
      cameraId: null,
      isBackCamera: true
    };
  }
}

async function stopScannerInstance(scanner: Html5Qrcode | null) {
  if (!scanner) {
    return;
  }

  try {
    if (scanner.isScanning) {
      await scanner.stop();
    }
  } catch {
    // Ignora falhas de encerramento; o importante e liberar a interface.
  }

  try {
    scanner.clear();
  } catch {
    // Alguns navegadores descartam a arvore antes do clear. Podemos seguir.
  }
}

async function applyTorchConstraint(scanner: Html5Qrcode, enabled: boolean) {
  try {
    await scanner.applyVideoConstraints({ advanced: [{ torch: enabled }] } as unknown as MediaTrackConstraints);
    return;
  } catch {
    await scanner.applyVideoConstraints({ torch: enabled } as MediaTrackConstraints);
  }
}

function extractFormat(result: Html5QrcodeResult) {
  return result.result.format?.formatName?.toUpperCase()
    ?? result.result.format?.toString?.().toUpperCase()
    ?? null;
}

function safeGetTrackSettings(scanner: Html5Qrcode) {
  try {
    return scanner.getRunningTrackSettings();
  } catch {
    return null;
  }
}

function safeGetTrackCapabilities(scanner: Html5Qrcode) {
  try {
    return scanner.getRunningTrackCapabilities();
  } catch {
    return null;
  }
}

function buildRuntimeScannerConstraints(
  scanner: Html5Qrcode,
  mode: ScannerTipoLeitura,
  performanceMode: ScannerPerformanceMode
) {
  const capabilities = safeGetTrackCapabilities(scanner) as ({
    focusMode?: string[];
    exposureMode?: string[];
    torch?: boolean;
    zoom?: { min?: number; max?: number };
  } | null);

  if (!capabilities || (mode !== 'QrCode' && performanceMode !== 'precision')) {
    return {} as MediaTrackConstraints;
  }

  const constraints: Record<string, unknown> = {};
  if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes('continuous')) {
    constraints.focusMode = 'continuous';
  }

  if (Array.isArray(capabilities.exposureMode) && capabilities.exposureMode.includes('continuous')) {
    constraints.exposureMode = 'continuous';
  }

  if (typeof capabilities.torch === 'boolean') {
    constraints.torch = false;
  }

  if (performanceMode === 'precision' && capabilities.zoom) {
    const minZoom = typeof capabilities.zoom.min === 'number' ? capabilities.zoom.min : 1;
    const maxZoom = typeof capabilities.zoom.max === 'number' ? capabilities.zoom.max : 1;
    constraints.zoom = Math.min(maxZoom, Math.max(minZoom, 1));
  }

  return constraints as MediaTrackConstraints;
}

function buildScannerReadyMessage(mode: ScannerTipoLeitura, performanceMode: ScannerPerformanceMode) {
  if (mode === 'QrCode' && performanceMode === 'precision') {
    return 'QR pequeno: mantenha a camera firme, afaste um pouco o aparelho e centralize o codigo no quadro menor.';
  }

  return `${getScannerPrompt(mode)} Camera traseira ativa.`;
}

function shouldIgnoreScannerError(errorMessage: string, error?: { type?: number } | null) {
  if (!errorMessage) {
    return true;
  }

  const normalizedMessage = errorMessage.toLowerCase();
  if (normalizedMessage.includes('no multiformat readers were able to detect the code')
    || normalizedMessage.includes('no code found')
    || normalizedMessage.includes('not found')) {
    return true;
  }

  return error?.type === 2;
}

function getCornerStyle(
  corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right',
  borderWidth: number,
  cornerSize: number
) {
  const isTop = corner.startsWith('top');
  const isLeft = corner.endsWith('left');

  return {
    position: 'absolute',
    width: cornerSize,
    height: cornerSize,
    borderColor: 'rgba(255,255,255,0.98)',
    borderStyle: 'solid',
    borderTopWidth: isTop ? borderWidth : 0,
    borderBottomWidth: isTop ? 0 : borderWidth,
    borderLeftWidth: isLeft ? borderWidth : 0,
    borderRightWidth: isLeft ? 0 : borderWidth,
    borderTopLeftRadius: corner === 'top-left' ? 16 : 0,
    borderTopRightRadius: corner === 'top-right' ? 16 : 0,
    borderBottomLeftRadius: corner === 'bottom-left' ? 16 : 0,
    borderBottomRightRadius: corner === 'bottom-right' ? 16 : 0,
    top: isTop ? 0 : 'auto',
    bottom: isTop ? 'auto' : 0,
    left: isLeft ? 0 : 'auto',
    right: isLeft ? 'auto' : 0
  } as const;
}
