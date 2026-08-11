import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import KeyboardRoundedIcon from '@mui/icons-material/KeyboardRounded';
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  IconButton,
  Stack,
  Typography
} from '@mui/material';
import { useCallback, useState } from 'react';
import type { ScannerTipoLeitura } from '../../types';
import { canUseLiveCamera, getLiveCameraUnavailableMessage, getScannerManualLabel, getScannerScreenTitle } from '../../utils/scanner';
import { ImageCaptureScannerButton } from './ImageCaptureScannerButton';
import { LiveBarcodeScanner } from './LiveBarcodeScanner';
import { ManualScannerEntryDialog } from './ManualScannerEntryDialog';

interface CameraScannerDialogProps {
  open: boolean;
  mode: ScannerTipoLeitura;
  title: string;
  description: string;
  onClose: () => void;
  onDetected: (code: string, format?: string | null) => void;
}

export function CameraScannerDialog({
  open,
  mode,
  title,
  description,
  onClose,
  onDetected
}: CameraScannerDialogProps) {
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const liveCameraSupported = canUseLiveCamera();

  const handleDetected = useCallback(
    (code: string, format?: string | null) => {
      onDetected(code, format);
      onClose();
    },
    [onClose, onDetected]
  );

  return (
    <>
      <Dialog open={open} onClose={onClose} fullScreen>
        <DialogContent
          sx={{
            p: 0,
            bgcolor: '#03060d',
            color: 'common.white',
            display: 'flex',
            flexDirection: 'column',
            minHeight: '100vh'
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
            <IconButton onClick={onClose} sx={{ color: 'common.white' }}>
              <ArrowBackRoundedIcon />
            </IconButton>
            <Stack spacing={0.25} sx={{ textAlign: 'center', px: 1, flex: 1 }}>
              <Typography variant="h5" sx={{ fontWeight: 700, color: 'common.white' }}>
                {getScannerScreenTitle(mode)}
              </Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.72)' }}>
                {title}
              </Typography>
            </Stack>
            <Box sx={{ width: 40, height: 40 }} />
          </Box>

          <Box
            sx={{
              flex: 1,
              px: { xs: 2, sm: 3.5 },
              display: 'grid',
              alignItems: 'center'
            }}
          >
            <Stack spacing={3} sx={{ width: '100%', maxWidth: 1080, mx: 'auto' }}>
              {liveCameraSupported ? (
                <LiveBarcodeScanner
                  active={open}
                  mode={mode}
                  onDetected={handleDetected}
                  performanceMode={mode === 'QrCode' ? 'precision' : 'default'}
                  height={420}
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
                    <Typography variant="h6" sx={{ fontWeight: 700, textAlign: 'center' }}>
                      Camera ao vivo indisponivel nesta pagina
                    </Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,0.72)', textAlign: 'center' }}>
                      {getLiveCameraUnavailableMessage()}
                    </Typography>
                    <ImageCaptureScannerButton
                      mode={mode}
                      label="Abrir camera ou foto do aparelho"
                      variant="contained"
                      size="large"
                      fullWidth
                      onDetected={handleDetected}
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
                <Button
                  variant="contained"
                  startIcon={<KeyboardRoundedIcon />}
                  onClick={() => setManualDialogOpen(true)}
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
                  {getScannerManualLabel(mode)}
                </Button>

                <ImageCaptureScannerButton
                  mode={mode}
                  label={liveCameraSupported ? 'Usar camera ou foto como apoio' : 'Abrir novamente a camera ou galeria'}
                  variant={liveCameraSupported ? 'text' : 'outlined'}
                  onDetected={handleDetected}
                  sx={{
                    color: 'rgba(255,255,255,0.78)',
                    '&:hover': {
                      bgcolor: 'rgba(255,255,255,0.06)'
                    }
                  }}
                />

                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.58)', textAlign: 'center', maxWidth: 720 }}>
                  {description}
                </Typography>
                {mode === 'QrCode' && (
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', maxWidth: 720 }}>
                    Para QR pequeno, afaste um pouco a camera para reduzir ofuscamento e use a opcao de foto se o navegador ainda perder foco.
                  </Typography>
                )}
              </Stack>
            </Stack>
          </Box>

          {!window.isSecureContext && (
            <Box sx={{ px: { xs: 2, sm: 3.5 }, pb: 2.5 }}>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.62)' }}>
                Paginas HTTP podem limitar video ao vivo em alguns navegadores. Se isso acontecer, use a opcao de foto logo acima.
              </Typography>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      <ManualScannerEntryDialog
        open={manualDialogOpen}
        mode={mode}
        title={getScannerManualLabel(mode)}
        onClose={() => setManualDialogOpen(false)}
        onDetected={handleDetected}
      />
    </>
  );
}
