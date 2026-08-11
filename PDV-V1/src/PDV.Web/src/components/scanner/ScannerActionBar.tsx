import CameraAltRoundedIcon from '@mui/icons-material/CameraAltRounded';
import CenterFocusStrongRoundedIcon from '@mui/icons-material/CenterFocusStrongRounded';
import PhoneIphoneRoundedIcon from '@mui/icons-material/PhoneIphoneRounded';
import QrCode2RoundedIcon from '@mui/icons-material/QrCode2Rounded';
import StraightenRoundedIcon from '@mui/icons-material/StraightenRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import { Button, Stack, Typography } from '@mui/material';
import { useMemo, useState } from 'react';
import type { ScannerTipoLeitura } from '../../types';
import { formatScannerMode, getScannerModeDescription } from '../../utils/scanner';
import { CameraScannerDialog } from './CameraScannerDialog';
import { RemoteScannerDialog } from './RemoteScannerDialog';

interface ScannerActionBarProps {
  contexto: string;
  title: string;
  description: string;
  onDetected: (code: string, format?: string | null) => void;
  onFocusInput?: () => void;
  defaultMode?: ScannerTipoLeitura;
  availableModes?: ScannerTipoLeitura[];
}

export function ScannerActionBar({
  contexto,
  title,
  description,
  onDetected,
  onFocusInput,
  defaultMode = 'Auto',
  availableModes = ['CodigoBarras', 'QrCode', 'Auto']
}: ScannerActionBarProps) {
  const [cameraMode, setCameraMode] = useState<ScannerTipoLeitura | null>(null);
  const [remoteMode, setRemoteMode] = useState<ScannerTipoLeitura | null>(null);

  const modes = useMemo(
    () => prioritizeModes(defaultMode, availableModes),
    [availableModes, defaultMode]
  );

  return (
    <>
      <Stack spacing={1.5}>
        {onFocusInput && (
          <Stack spacing={0.75}>
            <Typography variant="body2" color="text.secondary">
              Leitor comum
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
              <Button variant="outlined" startIcon={<CenterFocusStrongRoundedIcon />} onClick={onFocusInput}>
                Focar campo para leitor comum
              </Button>
            </Stack>
          </Stack>
        )}

        <Stack spacing={0.75}>
          <Typography variant="body2" color="text.secondary">
            Abrir camera deste dispositivo
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} flexWrap="wrap" useFlexGap>
            {modes.map((mode) => (
              <Button
                key={`local-${mode}`}
                variant={mode === defaultMode ? 'contained' : 'outlined'}
                startIcon={getScannerModeIcon(mode)}
                onClick={() => setCameraMode(mode)}
              >
                {formatScannerMode(mode)}
              </Button>
            ))}
          </Stack>
        </Stack>

        <Stack spacing={0.75}>
          <Typography variant="body2" color="text.secondary">
            Usar celular como scanner
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} flexWrap="wrap" useFlexGap>
            {modes.map((mode) => (
              <Button
                key={`remote-${mode}`}
                variant={mode === defaultMode ? 'contained' : 'outlined'}
                color={mode === defaultMode ? 'primary' : 'inherit'}
                startIcon={<PhoneIphoneRoundedIcon />}
                onClick={() => setRemoteMode(mode)}
              >
                {formatScannerMode(mode)} no celular
              </Button>
            ))}
          </Stack>
        </Stack>

        <Typography variant="body2" color="text.secondary">
          Fluxo direto: toque no tipo de leitura e o sistema ja abre no modo certo, sem etapa intermediaria.
        </Typography>
      </Stack>

      <CameraScannerDialog
        open={cameraMode !== null}
        mode={cameraMode ?? defaultMode}
        title={`${title} · ${formatScannerMode(cameraMode ?? defaultMode)}`}
        description={getScannerModeDescription(cameraMode ?? defaultMode) || description}
        onClose={() => setCameraMode(null)}
        onDetected={onDetected}
      />

      <RemoteScannerDialog
        open={remoteMode !== null}
        contexto={contexto}
        mode={remoteMode ?? defaultMode}
        title={`${title} no celular · ${formatScannerMode(remoteMode ?? defaultMode)}`}
        description="Pareie o celular com esta tela. O codigo lido pelo telefone entra direto no sistema, no mesmo modo da leitura escolhida."
        onClose={() => setRemoteMode(null)}
        onDetected={onDetected}
      />
    </>
  );
}

function prioritizeModes(defaultMode: ScannerTipoLeitura, availableModes: ScannerTipoLeitura[]) {
  const uniqueModes = Array.from(new Set(availableModes));
  const prioritized = uniqueModes.filter((mode) => mode === defaultMode);
  const others = uniqueModes.filter((mode) => mode !== defaultMode);
  return [...prioritized, ...others];
}

function getScannerModeIcon(mode: ScannerTipoLeitura) {
  if (mode === 'QrCode') {
    return <QrCode2RoundedIcon />;
  }

  if (mode === 'CodigoBarras') {
    return <StraightenRoundedIcon />;
  }

  return <TuneRoundedIcon />;
}
