import QrCode2RoundedIcon from '@mui/icons-material/QrCode2Rounded';
import StraightenRoundedIcon from '@mui/icons-material/StraightenRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import { Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import type { ScannerTipoLeitura } from '../../types';
import { scannerModeOptions } from '../../utils/scanner';

interface ScannerModeSelectorProps {
  value: ScannerTipoLeitura;
  onChange: (mode: ScannerTipoLeitura) => void;
  availableModes?: ScannerTipoLeitura[];
  label?: string;
}

export function ScannerModeSelector({
  value,
  onChange,
  availableModes = ['CodigoBarras', 'QrCode', 'Auto'],
  label = 'Tipo de leitura'
}: ScannerModeSelectorProps) {
  const options = scannerModeOptions.filter((item) => availableModes.includes(item.value));

  return (
    <Stack spacing={1}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <ToggleButtonGroup
        value={value}
        exclusive
        onChange={(_, nextValue: ScannerTipoLeitura | null) => {
          if (nextValue) {
            onChange(nextValue);
          }
        }}
        color="primary"
        sx={{ flexWrap: 'wrap', gap: 1 }}
      >
        {options.map((option) => (
          <ToggleButton key={option.value} value={option.value} sx={{ borderRadius: 999, px: 2.25, textTransform: 'none' }}>
            {option.value === 'QrCode' ? (
              <QrCode2RoundedIcon fontSize="small" sx={{ mr: 1 }} />
            ) : option.value === 'CodigoBarras' ? (
              <StraightenRoundedIcon fontSize="small" sx={{ mr: 1 }} />
            ) : (
              <TuneRoundedIcon fontSize="small" sx={{ mr: 1 }} />
            )}
            {option.shortLabel}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Stack>
  );
}
