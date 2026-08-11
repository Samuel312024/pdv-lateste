import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import KeyRoundedIcon from '@mui/icons-material/KeyRounded';
import PointOfSaleRoundedIcon from '@mui/icons-material/PointOfSaleRounded';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Divider,
  Grid,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ScannerActionBar } from '../components/scanner/ScannerActionBar';
import { terminalService } from '../services/terminalService';
import { formatDateTime } from '../utils/format';
import { getErrorMessage } from '../utils/http';
import {
  getTerminalKeyboardLabel,
  getTerminalPrinterLabel,
  getTerminalScannerLabel
} from '../utils/terminalPeripheralProfiles';
import {
  ensureTerminalDeviceId,
  readTerminalActivationState,
  resolveTerminalAppVersion,
  resolveTerminalHostName,
  resolveTerminalInstallerVersion,
  writeTerminalActivationState,
  type TerminalActivationState
} from '../utils/terminalActivation';

type ActivationField = 'codigoTerminal' | 'chaveAtivacao';

export function TerminalActivationPage() {
  const [searchParams] = useSearchParams();
  const [codigoTerminal, setCodigoTerminal] = useState(() => searchParams.get('codigo')?.trim().toUpperCase() ?? '');
  const [chaveAtivacao, setChaveAtivacao] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeField, setActiveField] = useState<ActivationField>(() => searchParams.get('codigo') ? 'chaveAtivacao' : 'codigoTerminal');
  const [activationState, setActivationState] = useState<TerminalActivationState | null>(() => readTerminalActivationState());
  const codigoTerminalInputRef = useRef<HTMLInputElement | null>(null);
  const chaveAtivacaoInputRef = useRef<HTMLInputElement | null>(null);
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();

  const deviceIdentifier = useMemo(() => ensureTerminalDeviceId(), []);
  const hostName = useMemo(() => resolveTerminalHostName(), []);
  const installerVersion = useMemo(() => resolveTerminalInstallerVersion(), []);
  const appVersion = useMemo(() => resolveTerminalAppVersion(), []);

  useEffect(() => {
    requestAnimationFrame(() => {
      codigoTerminalInputRef.current?.focus();
      codigoTerminalInputRef.current?.select();
    });
  }, []);

  function focusField(field: ActivationField) {
    setActiveField(field);

    requestAnimationFrame(() => {
      const input = field === 'codigoTerminal'
        ? codigoTerminalInputRef.current
        : chaveAtivacaoInputRef.current;
      input?.focus();
      input?.select();
    });
  }

  function applyScannedValue(rawValue: string) {
    const payload = parseScannedTerminalActivationPayload(rawValue);

    if (payload.codigoTerminal || payload.chaveAtivacao) {
      if (payload.codigoTerminal) {
        setCodigoTerminal(payload.codigoTerminal);
      }

      if (payload.chaveAtivacao) {
        setChaveAtivacao(payload.chaveAtivacao);
      }

      if (payload.codigoTerminal && !payload.chaveAtivacao) {
        focusField('chaveAtivacao');
        return;
      }

      if (!payload.codigoTerminal && payload.chaveAtivacao) {
        focusField('codigoTerminal');
        return;
      }

      return;
    }

    if (activeField === 'codigoTerminal') {
      setCodigoTerminal(normalizeTerminalCodeInput(rawValue));
      focusField('chaveAtivacao');
      return;
    }

    setChaveAtivacao(normalizeActivationKeyInput(rawValue));
  }

  async function handleCopyValue(value: string | null | undefined, successMessage: string) {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      enqueueSnackbar(successMessage, { variant: 'success' });
    } catch {
      enqueueSnackbar('Nao foi possivel copiar agora.', { variant: 'warning' });
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await terminalService.activate({
        codigoTerminal: codigoTerminal.trim().toUpperCase(),
        chaveAtivacao,
        dispositivoIdentificador: deviceIdentifier,
        nomeHost: hostName,
        versaoInstalador: installerVersion,
        versaoAplicativo: appVersion
      });

      const nextState: TerminalActivationState = {
        ...response,
        dispositivoIdentificador: deviceIdentifier,
        nomeHost: hostName,
        versaoInstalador: installerVersion,
        versaoAplicativo: appVersion
      };

      writeTerminalActivationState(nextState);
      setActivationState(nextState);
      setCodigoTerminal(response.codigoTerminal);
      setChaveAtivacao('');
      enqueueSnackbar(`Terminal ${response.codigoTerminal} ativado com sucesso.`, { variant: 'success' });
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        alignItems: 'center',
        py: 4,
        background: 'radial-gradient(circle at top left, rgba(23, 75, 138, 0.16), transparent 28%), linear-gradient(135deg, #eef3f8 0%, #f8fbff 40%, #eef6ec 100%)'
      }}
    >
      <Container maxWidth="xl">
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
                  bgcolor: 'rgba(23, 75, 138, 0.08)',
                  width: 'fit-content'
                }}
              >
                <PointOfSaleRoundedIcon color="primary" />
                <Typography sx={{ fontWeight: 700 }}>Instalador e ativacao do terminal</Typography>
              </Box>

              <Typography variant="h3">
                Primeiro boot do PDV com codigo do terminal, chave e rastreio do dispositivo.
              </Typography>

              <Typography variant="h6" color="text.secondary">
                Use esta tela no equipamento da loja para validar o terminal liberado pela administracao e registrar a estacao que vai operar o caixa.
              </Typography>

              <Alert severity="info" icon={<KeyRoundedIcon fontSize="inherit" />} sx={{ borderRadius: 4, maxWidth: 720 }}>
                Fluxo recomendado: 1) admin gera o terminal em Hardware, 2) instalador informa codigo e chave nesta tela, 3) operador acessa o caixa por cracha em seguida.
              </Alert>

              <Card sx={{ borderRadius: 5, bgcolor: 'rgba(255,255,255,0.84)', maxWidth: 720 }}>
                <CardContent>
                  <Stack spacing={1.5}>
                    <Typography sx={{ fontWeight: 800 }}>Identificacao deste equipamento</Typography>
                    <Typography color="text.secondary">
                      Dispositivo: <strong>{deviceIdentifier}</strong>
                    </Typography>
                    <Typography color="text.secondary">
                      Host detectado: <strong>{hostName ?? '-'}</strong>
                    </Typography>
                    <Typography color="text.secondary">
                      Versao informada ao servidor: <strong>{installerVersion ?? '-'}</strong>
                    </Typography>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                      <Button
                        variant="outlined"
                        startIcon={<ContentCopyRoundedIcon />}
                        onClick={() => void handleCopyValue(deviceIdentifier, 'Identificador do dispositivo copiado.')}
                        sx={{ width: { xs: '100%', sm: 'fit-content' } }}
                      >
                        Copiar identificador
                      </Button>
                      {hostName ? (
                        <Button
                          variant="outlined"
                          startIcon={<ContentCopyRoundedIcon />}
                          onClick={() => void handleCopyValue(hostName, 'Host detectado copiado.')}
                          sx={{ width: { xs: '100%', sm: 'fit-content' } }}
                        >
                          Copiar host
                        </Button>
                      ) : null}
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            </Stack>
          </Grid>

          <Grid item xs={12} lg={6}>
            <Card sx={{ borderRadius: 6, boxShadow: '0 24px 80px rgba(17, 24, 39, 0.12)', height: '100%' }}>
              <CardContent sx={{ p: { xs: 3, md: 4 }, height: '100%' }}>
                <Stack spacing={2.5} component="form" onSubmit={handleSubmit} justifyContent="center" sx={{ height: '100%' }}>
                  <Box>
                    <Typography variant="h4">Ativar terminal</Typography>
                    <Typography color="text.secondary">
                      Informe o codigo e a chave entregues pelo administrador. O servidor valida a liberacao e registra esta maquina no parque da empresa.
                    </Typography>
                  </Box>

                  {activationState ? (
                    <Alert severity="success" icon={<TaskAltRoundedIcon fontSize="inherit" />} sx={{ borderRadius: 4 }}>
                      Terminal local ativo: <strong>{activationState.codigoTerminal}</strong> · {activationState.nomeTerminal}. Ultima sincronizacao em {formatDateTime(activationState.ultimaSincronizacaoEm)}.
                    </Alert>
                  ) : (
                    <Alert severity="warning" sx={{ borderRadius: 4 }}>
                      Este navegador ainda nao registrou uma ativacao local do terminal.
                    </Alert>
                  )}

                  <Alert severity="info" sx={{ borderRadius: 4 }}>
                    Nao use a senha do seu usuario aqui. Esta tela pede <strong>codigo do terminal</strong> e <strong>chave de ativacao</strong>, ambos gerados na aba Hardware pelo administrador.
                  </Alert>

                  <Alert severity="info" sx={{ borderRadius: 4 }}>
                    Exemplo do que preencher: <strong>Codigo</strong> = <strong>SP-MATRIZ-PDV-001</strong> e <strong>Chave</strong> = <strong>ABCD-EFGH-IJKL-MNOP</strong>.
                  </Alert>

                  <TextField
                    label="Codigo do terminal gerado no Hardware"
                    value={codigoTerminal}
                    onChange={(event) => setCodigoTerminal(event.target.value.toUpperCase())}
                    onFocus={() => setActiveField('codigoTerminal')}
                    inputRef={codigoTerminalInputRef}
                    placeholder="Ex.: SP-MATRIZ-PDV-001"
                    helperText="Nao e o e-mail, nao e o cracha e nao e o usuario. Exemplo: SP-MATRIZ-PDV-001."
                    fullWidth
                  />

                  <TextField
                    label="Chave de ativacao gerada no Hardware"
                    value={chaveAtivacao}
                    onChange={(event) => setChaveAtivacao(event.target.value.toUpperCase())}
                    onFocus={() => setActiveField('chaveAtivacao')}
                    inputRef={chaveAtivacaoInputRef}
                    placeholder="Ex.: ABCD-EFGH-IJKL-MNOP"
                    helperText="Nao e a senha do usuario. Use a chave mostrada quando o admin cria ou renova o terminal. Aceita com ou sem hifens."
                    fullWidth
                  />

                  <Card variant="outlined" sx={{ borderRadius: 4 }}>
                    <CardContent>
                      <Stack spacing={2}>
                        <Box>
                          <Typography variant="subtitle1">Leitura por scanner ou camera</Typography>
                          <Typography color="text.secondary">
                            Escolha qual campo vai receber a leitura. Leitor comum funciona como teclado; camera e celular funcionam pelos botoes abaixo.
                          </Typography>
                        </Box>

                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                          <Button
                            variant={activeField === 'codigoTerminal' ? 'contained' : 'outlined'}
                            onClick={() => focusField('codigoTerminal')}
                          >
                            Ler codigo do terminal
                          </Button>
                          <Button
                            variant={activeField === 'chaveAtivacao' ? 'contained' : 'outlined'}
                            onClick={() => focusField('chaveAtivacao')}
                          >
                            Ler chave de ativacao
                          </Button>
                        </Stack>

                        <Typography variant="body2" color="text.secondary">
                          Leitura atual vai preencher: <strong>{activeField === 'codigoTerminal' ? 'Codigo do terminal' : 'Chave de ativacao'}</strong>
                        </Typography>

                        <ScannerActionBar
                          contexto="ativacao-terminal"
                          title={activeField === 'codigoTerminal' ? 'Leitura do codigo do terminal' : 'Leitura da chave de ativacao'}
                          description="Leia pelo leitor comum, pela camera deste dispositivo ou pelo celular pareado."
                          defaultMode="Auto"
                          availableModes={['CodigoBarras', 'QrCode', 'Auto']}
                          onDetected={(code) => applyScannedValue(code)}
                          onFocusInput={() => focusField(activeField)}
                        />
                      </Stack>
                    </CardContent>
                  </Card>

                  <Button
                    size="large"
                    type="submit"
                    variant="contained"
                    endIcon={<ArrowForwardRoundedIcon />}
                    disabled={loading || !codigoTerminal.trim() || !chaveAtivacao.trim()}
                    sx={{ alignSelf: 'flex-start', px: 3 }}
                  >
                    {loading ? 'Ativando terminal...' : 'Validar e ativar terminal'}
                  </Button>

                  {activationState ? (
                    <>
                      <Divider />
                      <Stack spacing={1.25}>
                        <Typography variant="h6">Resumo da ativacao local</Typography>
                        <Typography color="text.secondary">
                          Terminal: <strong>{activationState.codigoTerminal}</strong> · {activationState.nomeTerminal}
                        </Typography>
                        <Typography color="text.secondary">
                          Loja / unidade: <strong>{activationState.lojaNome ?? '-'}</strong> · PDV <strong>{activationState.numeroPdv}</strong>
                        </Typography>
                        <Typography color="text.secondary">
                          Perfil: <strong>{activationState.perfilInstalacao}</strong> · Status <strong>{activationState.ativo ? 'Ativo' : 'Bloqueado'}</strong>
                        </Typography>
                        <Typography color="text.secondary">
                          Impressora: <strong>{getTerminalPrinterLabel(activationState.perfilImpressora)}</strong> · Scanner <strong>{getTerminalScannerLabel(activationState.perfilScanner)}</strong>
                        </Typography>
                        <Typography color="text.secondary">
                          Teclado: <strong>{getTerminalKeyboardLabel(activationState.perfilTeclado)}</strong> · Autoimpressao <strong>{activationState.impressaoAutomatica ? 'Ligada' : 'Desligada'}</strong>
                        </Typography>
                        <Typography color="text.secondary">
                          Ativado em: <strong>{formatDateTime(activationState.ativadoEm)}</strong>
                        </Typography>
                      </Stack>

                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                        <Button
                          size="large"
                          variant="contained"
                          onClick={() => navigate('/acesso-caixa')}
                          sx={{ width: { xs: '100%', sm: 'fit-content' } }}
                        >
                          Seguir para acesso do caixa
                        </Button>
                        <Button
                          size="large"
                          variant="outlined"
                          onClick={() => navigate('/login')}
                          sx={{ width: { xs: '100%', sm: 'fit-content' } }}
                        >
                          Voltar ao login administrativo
                        </Button>
                      </Stack>
                    </>
                  ) : null}
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}

function normalizeTerminalCodeInput(value: string) {
  return value.trim().toUpperCase();
}

function normalizeActivationKeyInput(value: string) {
  return value.trim().toUpperCase();
}

function parseScannedTerminalActivationPayload(rawValue: string) {
  const normalizedValue = rawValue.trim();
  if (!normalizedValue) {
    return {
      codigoTerminal: '',
      chaveAtivacao: ''
    };
  }

  try {
    const url = new URL(normalizedValue);
    return {
      codigoTerminal: normalizeTerminalCodeInput(url.searchParams.get('codigo') ?? ''),
      chaveAtivacao: normalizeActivationKeyInput(url.searchParams.get('chave') ?? '')
    };
  } catch {
    return {
      codigoTerminal: '',
      chaveAtivacao: ''
    };
  }
}
