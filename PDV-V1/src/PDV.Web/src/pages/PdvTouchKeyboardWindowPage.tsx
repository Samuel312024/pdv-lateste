import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import KeyboardDoubleArrowLeftRoundedIcon from '@mui/icons-material/KeyboardDoubleArrowLeftRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  Typography
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PdvTouchKeyboard } from '../components/pdv/PdvTouchKeyboard';
import { readDetachedDialogSession, removeDetachedDialogSession } from '../utils/detachedDialogSession';
import {
  getPdvTouchKeyboardChannelName,
  type PdvTouchKeyboardBridgeMessage,
  type PdvTouchKeyboardDetachedSessionPayload,
  type PdvTouchKeyboardRemoteState
} from '../utils/pdvTouchKeyboardBridge';

export function PdvTouchKeyboardWindowPage() {
  const [searchParams] = useSearchParams();
  const detachedSessionKey = searchParams.get('detachedSession') ?? '';
  const detachedWindow = searchParams.get('detachedWindow') === '1';
  const [keyboardState, setKeyboardState] = useState<PdvTouchKeyboardRemoteState | null>(() => {
    if (!detachedSessionKey) {
      return null;
    }

    const sessionData = readDetachedDialogSession<PdvTouchKeyboardDetachedSessionPayload>(detachedSessionKey);
    return sessionData?.state ?? null;
  });

  const channelName = useMemo(
    () => (detachedSessionKey ? getPdvTouchKeyboardChannelName(detachedSessionKey) : null),
    [detachedSessionKey]
  );

  useEffect(() => {
    if (!detachedWindow || !detachedSessionKey || !channelName) {
      return;
    }

    const channel = new BroadcastChannel(channelName);
    channel.onmessage = (event: MessageEvent<PdvTouchKeyboardBridgeMessage>) => {
      if (event.data?.type === 'state') {
        setKeyboardState(event.data.state);
      }
    };

    channel.postMessage({ type: 'ready' } satisfies PdvTouchKeyboardBridgeMessage);

    const handleBeforeUnload = () => {
      channel.postMessage({ type: 'closed' } satisfies PdvTouchKeyboardBridgeMessage);
      removeDetachedDialogSession(detachedSessionKey);
      channel.close();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      channel.close();
    };
  }, [channelName, detachedSessionKey, detachedWindow]);

  useEffect(() => {
    document.title = keyboardState
      ? `Teclado touch · ${keyboardState.primaryMessage}`
      : 'Teclado touch destacado';
  }, [keyboardState]);

  function postMessage(message: PdvTouchKeyboardBridgeMessage) {
    if (!channelName) {
      return;
    }

    const channel = new BroadcastChannel(channelName);
    channel.postMessage(message);
    channel.close();
  }

  if (!detachedWindow || !detachedSessionKey) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 3, bgcolor: '#eaf0f7' }}>
        <Alert severity="warning" sx={{ borderRadius: 4, maxWidth: 720 }}>
          Esta janela do teclado nao recebeu uma sessao valida. Volte ao PDV principal e abra novamente a opcao de segundo monitor.
        </Alert>
      </Box>
    );
  }

  if (!keyboardState) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 3, bgcolor: '#eaf0f7' }}>
        <Stack spacing={2} sx={{ maxWidth: 720 }}>
          <Alert severity="info" sx={{ borderRadius: 4 }}>
            Aguardando o PDV principal enviar o teclado.
          </Alert>
          <Typography color="text.secondary">
            Se esta janela acabou de abrir, arraste para o outro monitor e aguarde um instante. Se nada aparecer, volte ao PDV e abra o destaque novamente.
          </Typography>
        </Stack>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#dfe7f2', p: { xs: 1.5, sm: 2.5 } }}>
      <Card sx={{ borderRadius: 5, bgcolor: '#eef2f7', minHeight: 'calc(100vh - 24px)' }}>
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack spacing={2.5}>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={1.5}
              justifyContent="space-between"
              alignItems={{ md: 'center' }}
            >
              <Box>
                <Typography variant="h4">Teclado touch no monitor auxiliar</Typography>
                <Typography color="text.secondary">
                  Esta janela acompanha a venda principal. Voce pode arrastar a janela inteira para outro monitor.
                </Typography>
              </Box>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button
                  variant="outlined"
                  startIcon={<KeyboardDoubleArrowLeftRoundedIcon />}
                  onClick={() => {
                    postMessage({ type: 'closed' });
                    window.close();
                  }}
                >
                  Voltar para o PDV
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<OpenInNewRoundedIcon />}
                  onClick={() => window.focus()}
                >
                  Manter nesta janela
                </Button>
                <Button
                  color="inherit"
                  startIcon={<CloseRoundedIcon />}
                  onClick={() => window.close()}
                >
                  Fechar
                </Button>
              </Stack>
            </Stack>

            <Alert severity="info" sx={{ borderRadius: 4 }}>
              Dica: arraste esta janela para o outro monitor e deixe o PDV principal no monitor principal. As teclas continuam controlando a mesma venda.
            </Alert>

            <PdvTouchKeyboard
              primaryMessage={keyboardState.primaryMessage}
              secondaryMessage={keyboardState.secondaryMessage}
              currentCode={keyboardState.currentCode}
              infoCards={keyboardState.infoCards}
              disabled={keyboardState.disabled}
              onInfoCardAction={(action) => postMessage({ type: 'shortcut', action })}
              onDigit={(fragment) => postMessage({ type: 'digit', fragment })}
              onBackspace={() => postMessage({ type: 'backspace' })}
              onClear={() => postMessage({ type: 'clear' })}
              onConfirm={() => postMessage({ type: 'confirm' })}
              onShortcut={(action) => postMessage({ type: 'shortcut', action })}
            />
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
