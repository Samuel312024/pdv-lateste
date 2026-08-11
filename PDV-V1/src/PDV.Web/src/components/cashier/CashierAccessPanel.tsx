import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import PointOfSaleRoundedIcon from '@mui/icons-material/PointOfSaleRounded';
import QrCodeScannerRoundedIcon from '@mui/icons-material/QrCodeScannerRounded';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Grid,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ScannerActionBar } from '../scanner/ScannerActionBar';
import { useScanner } from '../../hooks/useScanner';
import { useAuth } from '../../contexts/AuthContext';
import { markCashierAccess } from '../../utils/cashierAccess';
import { canAccessAppPath } from '../../utils/featureAccess';
import { getErrorMessage } from '../../utils/http';

interface CashierAccessPanelProps {
  accessPath: '/caixa' | '/pdv';
  successPath?: string | null;
  embedded?: boolean;
  title?: string;
  description?: string;
  onAuthenticated?: () => void;
}

export function CashierAccessPanel({
  accessPath,
  successPath = null,
  embedded = false,
  title,
  description,
  onAuthenticated
}: CashierAccessPanelProps) {
  const [codigoBarrasCracha, setCodigoBarrasCracha] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const codigoBarrasInputRef = useRef<HTMLInputElement | null>(null);
  const senhaInputRef = useRef<HTMLInputElement | null>(null);
  const { clearOperationalAccessSession, login } = useAuth();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const resolvedTitle = title ?? (accessPath === '/pdv' ? 'Acesso operacional do PDV' : 'Acesso operacional do caixa');
  const resolvedDescription = description ?? (
    accessPath === '/pdv'
      ? 'Leia o cracha do operador e confirme a senha para liberar a operacao do PDV com rastreabilidade por usuario.'
      : 'Leia o cracha do colaborador e confirme a senha para identificar o operador antes da abertura do caixa.'
  );

  const badgeExamples = useMemo(() => ([
    { label: 'Gerente', value: '900000000003 / Gerente@123' },
    { label: 'Operador', value: '900000000004 / Operador@123' }
  ]), []);

  useEffect(() => {
    requestAnimationFrame(() => {
      codigoBarrasInputRef.current?.focus();
      codigoBarrasInputRef.current?.select();
    });
  }, []);

  function registerBadgeCode(rawCode: string) {
    const normalizedCode = rawCode.trim().toUpperCase();
    if (!normalizedCode) {
      return;
    }

    setCodigoBarrasCracha(normalizedCode);
    requestAnimationFrame(() => {
      senhaInputRef.current?.focus();
      senhaInputRef.current?.select();
    });
  }

  useScanner(async (event) => {
    registerBadgeCode(event.codigoBarras);
  }, { duplicateSuppressionMs: 350 });

  function handleBarcodeFieldEnter(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    requestAnimationFrame(() => {
      senhaInputRef.current?.focus();
      senhaInputRef.current?.select();
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    try {
      const nextSession = await login({
        codigoBarrasCracha: codigoBarrasCracha.trim(),
        senha
      });

      if (!canAccessAppPath(nextSession, accessPath)) {
        clearOperationalAccessSession();

        enqueueSnackbar(
          accessPath === '/pdv'
            ? 'Este cracha nao possui acesso operacional ao PDV.'
            : 'Este cracha nao possui acesso operacional ao caixa.',
          { variant: 'error' }
        );
        return;
      }

      markCashierAccess(nextSession);
      enqueueSnackbar('Operador identificado com sucesso.', { variant: 'success' });

      if (successPath) {
        navigate(successPath, { replace: true });
      } else {
        onAuthenticated?.();
      }
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  const content = (
    <Grid container spacing={4} alignItems="stretch">
      <Grid item xs={12} lg={6}>
        <Stack spacing={2.5} justifyContent="center" sx={{ height: '100%' }}>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1.25,
              px: 2,
              py: 1,
              borderRadius: 999,
              bgcolor: 'rgba(28, 78, 128, 0.08)',
              width: 'fit-content'
            }}
          >
            <PointOfSaleRoundedIcon color="primary" />
            <Typography sx={{ fontWeight: 700 }}>Acesso profissional do caixa</Typography>
          </Box>

          <Typography variant={embedded ? 'h4' : 'h3'}>
            Operador identificado por cracha, senha e trilha operacional no PDV.
          </Typography>

          <Typography variant="h6" color="text.secondary">
            {resolvedDescription}
          </Typography>

          <Alert
            severity="info"
            icon={<QrCodeScannerRoundedIcon fontSize="inherit" />}
            sx={{ borderRadius: 4, maxWidth: 640 }}
          >
            Bipe o cracha no leitor. Como o scanner funciona como teclado, o codigo entra automaticamente no campo abaixo e fica pronto para validacao.
          </Alert>

          <Card sx={{ borderRadius: 5, bgcolor: 'rgba(255,255,255,0.82)', maxWidth: 640 }}>
            <CardContent>
              <Stack spacing={1.25}>
                <Typography sx={{ fontWeight: 800 }}>Credenciais de validacao inicial</Typography>
                {badgeExamples.map((item) => (
                  <Typography color="text.secondary" key={item.label}>
                    {item.label}: <strong>{item.value}</strong>
                  </Typography>
                ))}
                <Typography variant="body2" color="text.secondary">
                  O cadastro de usuarios continua com e-mail, senha e codigo de barras para operacao no caixa.
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Stack>
      </Grid>

      <Grid item xs={12} lg={6}>
        <Card
          sx={{
            borderRadius: 6,
            height: '100%',
            boxShadow: '0 24px 80px rgba(17, 24, 39, 0.12)'
          }}
        >
          <CardContent sx={{ p: { xs: 3, md: 4 }, height: '100%' }}>
            <Stack component="form" spacing={2.5} onSubmit={handleSubmit} justifyContent="center" sx={{ height: '100%' }}>
              <Box>
                <Typography variant="h4">{resolvedTitle}</Typography>
                <Typography color="text.secondary">
                  Valide o operador antes de abrir o caixa e iniciar as vendas.
                </Typography>
              </Box>

              <TextField
                label="Cracha / codigo de barras do operador"
                value={codigoBarrasCracha}
                onChange={(event) => setCodigoBarrasCracha(event.target.value.toUpperCase())}
                onKeyDown={handleBarcodeFieldEnter}
                onFocus={(event) => event.target.select()}
                helperText="Leitor comum 1D le o codigo de barras do verso. Para o QR Code da frente, use a camera ou um leitor 2D."
                inputRef={codigoBarrasInputRef}
                fullWidth
              />

              <ScannerActionBar
                contexto={accessPath === '/pdv' ? 'acesso-profissional-pdv' : 'acesso-profissional-caixa'}
                title={resolvedTitle}
                description="Leia o cracha pelo codigo de barras do verso ou pelo QR Code da frente usando camera ou celular."
                defaultMode="Auto"
                availableModes={['CodigoBarras', 'QrCode', 'Auto']}
                onDetected={(code) => registerBadgeCode(code)}
                onFocusInput={() => {
                  codigoBarrasInputRef.current?.focus();
                  codigoBarrasInputRef.current?.select();
                }}
              />

              <Alert severity="info" sx={{ borderRadius: 3 }}>
                Leitor laser comum costuma ler apenas o codigo de barras do verso. O QR Code da frente exige camera ou leitor 2D.
              </Alert>

              <TextField
                label="Senha do operador"
                type="password"
                value={senha}
                onChange={(event) => setSenha(event.target.value)}
                onFocus={(event) => event.target.select()}
                inputRef={senhaInputRef}
                fullWidth
              />

              <Button
                size="large"
                type="submit"
                variant="contained"
                startIcon={<LoginRoundedIcon />}
                disabled={loading || !codigoBarrasCracha.trim() || !senha}
                sx={{ alignSelf: 'flex-start', px: 3 }}
              >
                Entrar na operacao
              </Button>

              {!embedded && (
                <>
                  <Button size="large" variant="text" onClick={() => navigate('/ativacao-terminal')}>
                    Primeira instalacao? Ativar terminal
                  </Button>
                  <Button size="large" variant="text" onClick={() => navigate('/login')}>
                    Acesso administrativo por e-mail
                  </Button>
                </>
              )}
            </Stack>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );

  if (embedded) {
    return (
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4">{resolvedTitle}</Typography>
          <Typography color="text.secondary">
            Identifique o operador do caixa antes de liberar a abertura e a operacao no PDV.
          </Typography>
        </Box>
        {content}
      </Stack>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        alignItems: 'center',
        py: 4,
        background: 'radial-gradient(circle at top left, rgba(209, 127, 52, 0.22), transparent 28%), linear-gradient(135deg, #f6efe4 0%, #eef3f8 48%, #dce8f5 100%)'
      }}
    >
      <Container maxWidth="xl">
        {content}
      </Container>
    </Box>
  );
}
