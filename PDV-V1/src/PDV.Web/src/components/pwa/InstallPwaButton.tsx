import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import { Button, type ButtonProps } from '@mui/material';
import { useSnackbar } from 'notistack';
import { usePwaInstallPrompt } from '../../hooks/usePwaInstallPrompt';

interface InstallPwaButtonProps {
  label?: string;
  sx?: ButtonProps['sx'];
  variant?: ButtonProps['variant'];
  color?: ButtonProps['color'];
  size?: ButtonProps['size'];
  fullWidth?: boolean;
}

export function InstallPwaButton({
  label = 'Instalar app do scanner',
  sx,
  variant = 'outlined',
  color = 'inherit',
  size = 'medium',
  fullWidth = false
}: InstallPwaButtonProps) {
  const { enqueueSnackbar } = useSnackbar();
  const { canInstall, installed, promptInstall } = usePwaInstallPrompt();

  if (installed) {
    return (
      <Button
        disabled
        variant={variant}
        color={color}
        size={size}
        fullWidth={fullWidth}
        sx={sx}
        startIcon={<DownloadRoundedIcon />}
      >
        App instalado
      </Button>
    );
  }

  if (!canInstall) {
    return null;
  }

  return (
    <Button
      variant={variant}
      color={color}
      size={size}
      fullWidth={fullWidth}
      sx={sx}
      startIcon={<DownloadRoundedIcon />}
      onClick={() => void handleInstall()}
    >
      {label}
    </Button>
  );

  async function handleInstall() {
    const result = await promptInstall();
    if (!result) {
      enqueueSnackbar('A instalacao nao esta disponivel neste navegador agora.', { variant: 'info' });
      return;
    }

    enqueueSnackbar(
      result.outcome === 'accepted'
        ? 'App do scanner instalado com sucesso.'
        : 'Instalacao do app cancelada no dispositivo.',
      { variant: result.outcome === 'accepted' ? 'success' : 'warning' }
    );
  }
}
