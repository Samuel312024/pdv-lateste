import CameraAltRoundedIcon from '@mui/icons-material/CameraAltRounded';
import KeyboardRoundedIcon from '@mui/icons-material/KeyboardRounded';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { useEffect, useState } from 'react';
import type { ScannerTipoLeitura } from '../../types';
import { getScannerCaptureLabel, getScannerManualLabel, getScannerPrompt } from '../../utils/scanner';
import { ImageCaptureScannerButton } from './ImageCaptureScannerButton';

interface ManualScannerEntryDialogProps {
  open: boolean;
  mode: ScannerTipoLeitura;
  title: string;
  onClose: () => void;
  onDetected: (code: string, format?: string | null) => void;
}

export function ManualScannerEntryDialog({
  open,
  mode,
  title,
  onClose,
  onDetected
}: ManualScannerEntryDialogProps) {
  const [manualCode, setManualCode] = useState('');

  useEffect(() => {
    if (!open) {
      setManualCode('');
    }
  }, [open]);

  function handleSubmit() {
    const code = manualCode.trim();
    if (!code) {
      return;
    }

    onDetected(code, 'Manual');
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <KeyboardRoundedIcon color="primary" />
        {title}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2.25} sx={{ pt: 0.5 }}>
          <Typography color="text.secondary">
            {getScannerPrompt(mode)} Se a camera nao conseguir ler, voce pode digitar ou usar a captura por foto.
          </Typography>

          <TextField
            autoFocus
            label={getScannerManualLabel(mode)}
            value={manualCode}
            onChange={(event) => setManualCode(event.target.value)}
            placeholder="Digite ou cole o codigo aqui"
            fullWidth
          />

          <ImageCaptureScannerButton
            mode={mode}
            label={getScannerCaptureLabel(mode)}
            variant="outlined"
            fullWidth
            onDetected={(code, format) => {
              onDetected(code, format);
              onClose();
            }}
            sx={{ minHeight: 46 }}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={onClose}>Cancelar</Button>
        <Button
          variant="contained"
          startIcon={<CameraAltRoundedIcon />}
          onClick={handleSubmit}
          disabled={!manualCode.trim()}
        >
          Confirmar codigo
        </Button>
      </DialogActions>
    </Dialog>
  );
}
