import SensorsRoundedIcon from '@mui/icons-material/SensorsRounded';
import SensorsOffRoundedIcon from '@mui/icons-material/SensorsOffRounded';
import { Button, Chip, Stack, Typography } from '@mui/material';
import { useScannerSession } from '../../contexts/ScannerSessionContext';

export function ScannerStatusIndicator() {
  const { active, connectionState, status, disconnectScanner } = useScannerSession();

  if (!active) {
    return (
      <Chip
        icon={<SensorsOffRoundedIcon />}
        label="Scanner offline"
        variant="outlined"
        sx={{ borderColor: 'rgba(23, 75, 138, 0.12)' }}
      />
    );
  }

  const label = connectionState === 'conectado'
    ? status?.mobileConectado
      ? 'Scanner conectado'
      : 'Aguardando celular'
    : connectionState === 'reconectando'
      ? 'Reconectando scanner'
      : connectionState === 'conectando'
        ? 'Conectando scanner'
        : 'Scanner desconectado';

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Chip
        icon={<SensorsRoundedIcon />}
        label={label}
        color={status?.mobileConectado ? 'success' : connectionState === 'conectado' ? 'primary' : 'default'}
        variant={status?.mobileConectado ? 'filled' : 'outlined'}
      />
      {status && (
        <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', xl: 'block' } }}>
          PDV {status.conexoesPdv} · Celular {status.conexoesMobile}
        </Typography>
      )}
      <Button color="inherit" size="small" onClick={() => void disconnectScanner(true)}>
        Desconectar
      </Button>
    </Stack>
  );
}
