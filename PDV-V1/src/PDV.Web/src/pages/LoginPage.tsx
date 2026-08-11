import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import DeliveryDiningRoundedIcon from '@mui/icons-material/DeliveryDiningRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import StorefrontRoundedIcon from '@mui/icons-material/StorefrontRounded';
import {
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
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { InstallPwaButton } from '../components/pwa/InstallPwaButton';
import { useAuth } from '../contexts/AuthContext';
import { canAccessAppPath, getDefaultAuthorizedPath } from '../utils/featureAccess';
import { getErrorMessage } from '../utils/http';
import { getPdvInstallerDownloadUrl } from '../utils/installer';

export function LoginPage({ mode = 'internal' }: { mode?: 'internal' | 'buyer' | 'courier' }) {
  const buyerMode = mode === 'buyer';
  const courierMode = mode === 'courier';
  const [email, setEmail] = useState(
    buyerMode
      ? 'comprador@pdv.local'
      : courierMode
        ? 'entregador@pdv.local'
        : 'master@pdv.local'
  );
  const [senha, setSenha] = useState(
    buyerMode
      ? 'Comprador@123'
      : courierMode
        ? 'Entregador@123'
        : 'Master@123'
  );
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();
  const location = useLocation();
  const installerDownloadUrl = getPdvInstallerDownloadUrl();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    try {
      const session = await login({ email, senha });
      enqueueSnackbar('Login realizado com sucesso.', { variant: 'success' });

      const returnTo = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      if (returnTo && canAccessAppPath(session, returnTo)) {
        navigate(returnTo, { replace: true });
        return;
      }

      navigate(getDefaultAuthorizedPath(session), { replace: true });
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Container maxWidth="lg" sx={{ minHeight: '100vh', display: 'grid', alignItems: 'center', py: 4 }}>
      <Grid container spacing={4} alignItems="center">
        <Grid item xs={12} md={6}>
          <Stack spacing={2.5}>
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 1.5,
                px: 2,
                py: 1,
                borderRadius: 999,
                bgcolor: 'rgba(23, 75, 138, 0.08)',
                width: 'fit-content'
              }}
            >
              {buyerMode ? <StorefrontRoundedIcon color="primary" /> : courierMode ? <DeliveryDiningRoundedIcon color="primary" /> : <StorefrontRoundedIcon color="primary" />}
                <Typography sx={{ fontWeight: 700 }}>
                  {buyerMode
                    ? 'Portal do comprador conectado ao PDV'
                    : courierMode
                      ? 'Portal do entregador conectado ao PDV'
                      : 'PDV multiempresa focado em operacao'}
                </Typography>
              </Box>

              <Typography variant="h3">
              {buyerMode
                ? 'Compre pelo seu catalogo e acompanhe o pedido em uma experiencia propria.'
                : courierMode
                  ? 'Receba suas entregas designadas e compartilhe a rota em tempo real.'
                : 'Venda rapida, caixa sob controle e estoque com regra de negocio na frente da maquiagem.'}
            </Typography>

            <Typography variant="h6" color="text.secondary">
              {buyerMode
                ? 'O comprador entra por um link proprio, com acesso ao catalogo, carrinho, promocoes e acompanhamento profissional da entrega.'
                : courierMode
                  ? 'O entregador entra com usuario proprio, ve as entregas vinculadas a ele e atualiza a localizacao sem depender de link solto.'
                : 'Este MVP ja entra com login JWT, produtos, clientes, abertura de caixa, PDV e dashboard simples.'}
            </Typography>

            <Card sx={{ borderRadius: 5, bgcolor: 'rgba(255,255,255,0.8)' }}>
              <CardContent>
                <Typography sx={{ fontWeight: 800 }}>
                  {buyerMode ? 'Acesso inicial do comprador' : courierMode ? 'Acesso inicial do entregador' : 'Acesso inicial para validacao'}
                </Typography>
                {buyerMode ? (
                  <Typography color="text.secondary" sx={{ mt: 1 }}>
                    Comprador: <strong>comprador@pdv.local</strong> / <strong>Comprador@123</strong>
                  </Typography>
                ) : courierMode ? (
                  <Typography color="text.secondary" sx={{ mt: 1 }}>
                    Entregador: <strong>entregador@pdv.local</strong> / <strong>Entregador@123</strong>
                  </Typography>
                ) : (
                  <>
                    <Typography color="text.secondary" sx={{ mt: 1 }}>
                      Master: <strong>master@pdv.local</strong> / <strong>Master@123</strong>
                    </Typography>
                    <Typography color="text.secondary">
                      Admin: <strong>admin@pdv.local</strong> / <strong>Admin@123</strong>
                    </Typography>
                    <Typography color="text.secondary">
                      Operacao de caixa: <strong>acesso por cracha</strong> na tela dedicada do caixa
                    </Typography>
                  </>
                )}
              </CardContent>
            </Card>
          </Stack>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card sx={{ borderRadius: 6 }}>
            <CardContent sx={{ p: { xs: 3, md: 4 } }}>
              <Stack component="form" spacing={2.5} onSubmit={handleSubmit}>
                <Box>
                  <Typography variant="h4">
                    {buyerMode ? 'Entrar no portal de compras' : courierMode ? 'Entrar no portal de entregas' : 'Entrar no sistema'}
                  </Typography>
                  <Typography color="text.secondary">
                    {buyerMode
                      ? 'Acesse com o usuario comprador vinculado ao seu cadastro de cliente.'
                      : courierMode
                        ? 'Acesse com o usuario entregador liberado para o painel de entregas.'
                        : 'Acesse a administracao com e-mail e senha. A operacao do caixa entra por uma tela propria com cracha e senha.'}
                  </Typography>
                </Box>
                <TextField
                  label="E-mail"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  fullWidth
                />
                <TextField
                  label="Senha"
                  type="password"
                  value={senha}
                  onChange={(event) => setSenha(event.target.value)}
                  fullWidth
                />
                <Button size="large" type="submit" variant="contained" endIcon={<ArrowForwardRoundedIcon />} disabled={loading}>
                  Entrar
                </Button>
                {!buyerMode && !courierMode && (
                  <Button size="large" variant="outlined" onClick={() => navigate('/acesso-caixa')}>
                    Acesso operacional por cracha
                  </Button>
                )}
                {!buyerMode && !courierMode && (
                  <Button
                    size="large"
                    variant="outlined"
                    color="secondary"
                    component="a"
                    href={installerDownloadUrl}
                    startIcon={<DownloadRoundedIcon />}
                  >
                    Baixar instalador Windows
                  </Button>
                )}
                {!buyerMode && !courierMode && (
                  <InstallPwaButton
                    label="Instalar app do PDV"
                    variant="outlined"
                    color="primary"
                    size="large"
                    fullWidth
                  />
                )}
                {!buyerMode && !courierMode && (
                  <Button size="large" variant="text" onClick={() => navigate('/ativacao-terminal')}>
                    Ativar terminal / instalador
                  </Button>
                )}
                <Button
                  size="large"
                  variant="text"
                  onClick={() => navigate(buyerMode ? '/login' : '/comprador/login')}
                >
                  {buyerMode ? 'Sou da operacao interna' : 'Sou comprador'}
                </Button>
                <Button
                  size="large"
                  variant="text"
                  onClick={() => navigate(courierMode ? '/login' : '/entregador/login')}
                >
                  {courierMode ? 'Sou da operacao interna' : 'Sou entregador'}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Container>
  );
}
