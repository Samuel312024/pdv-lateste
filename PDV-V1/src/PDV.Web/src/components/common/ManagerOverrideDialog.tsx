import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useScanner } from '../../hooks/useScanner';
import { ScannerActionBar } from '../scanner/ScannerActionBar';
import type { LiberacaoGerentePayload } from '../../types';

interface ManagerOverrideDialogProps {
  open: boolean;
  actionCode: string;
  title: string;
  description: string;
  confirmLabel?: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (payload: LiberacaoGerentePayload) => Promise<void> | void;
}

export function ManagerOverrideDialog({
  open,
  actionCode,
  title,
  description,
  confirmLabel = 'Liberar operacao',
  loading = false,
  onCancel,
  onConfirm
}: ManagerOverrideDialogProps) {
  const [codigoBarrasCracha, setCodigoBarrasCracha] = useState('');
  const [senha, setSenha] = useState('');
  const [observacao, setObservacao] = useState('');
  const crachaInputRef = useRef<HTMLInputElement | null>(null);
  const senhaInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setCodigoBarrasCracha('');
    setSenha('');
    setObservacao('');
    requestAnimationFrame(() => {
      crachaInputRef.current?.focus();
      crachaInputRef.current?.select();
    });
  }, [actionCode, open]);

  useScanner(async (event) => {
    if (!open) {
      return;
    }

    const normalizedCode = event.codigoBarras.trim().toUpperCase();
    if (!normalizedCode) {
      return;
    }

    setCodigoBarrasCracha(normalizedCode);
    requestAnimationFrame(() => {
      senhaInputRef.current?.focus();
      senhaInputRef.current?.select();
    });
  }, { enabled: open, duplicateSuppressionMs: 350 });

  async function handleConfirm() {
    await onConfirm({
      acao: actionCode,
      codigoBarrasCracha: codigoBarrasCracha.trim(),
      senha,
      observacao: observacao.trim() || null
    });
  }

  function handleCrachaEnter(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();
    requestAnimationFrame(() => {
      senhaInputRef.current?.focus();
      senhaInputRef.current?.select();
    });
  }

  function handleSenhaEnter(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' || loading || !codigoBarrasCracha.trim() || !senha) {
      return;
    }

    event.preventDefault();
    void handleConfirm();
  }

  return (
    <Dialog open={open} onClose={loading ? undefined : onCancel} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Alert severity="warning" sx={{ borderRadius: 3 }}>
            Esta etapa depende do cracha ou e-mail e da senha do gerente responsavel.
          </Alert>
          <Typography color="text.secondary">
            {description}
          </Typography>
          <TextField
            label="Cracha ou e-mail do gerente"
            value={codigoBarrasCracha}
            onChange={(event) => setCodigoBarrasCracha(event.target.value)}
            onKeyDown={handleCrachaEnter}
            onFocus={(event) => event.target.select()}
            autoFocus
            inputRef={crachaInputRef}
            helperText="Pode ler o cracha no scanner ou digitar o e-mail manualmente. Ex.: gerente@pdv.local ou 900000000003."
            fullWidth
          />
          <ScannerActionBar
            contexto={`liberacao-gerente-${actionCode.toLowerCase()}`}
            title="Leitura do cracha do gerente"
            description="Leia o codigo de barras do verso, use a camera deste dispositivo ou conecte o celular. Se preferir, digite o e-mail do gerente manualmente."
            defaultMode="Auto"
            availableModes={['CodigoBarras', 'QrCode', 'Auto']}
            onDetected={(code) => {
              const normalizedCode = code.trim().toUpperCase();
              if (!normalizedCode) {
                return;
              }

              setCodigoBarrasCracha(normalizedCode);
              requestAnimationFrame(() => {
                senhaInputRef.current?.focus();
                senhaInputRef.current?.select();
              });
            }}
            onFocusInput={() => {
              crachaInputRef.current?.focus();
              crachaInputRef.current?.select();
            }}
          />
          <TextField
            label="Senha do gerente"
            type="password"
            value={senha}
            onChange={(event) => setSenha(event.target.value)}
            onKeyDown={handleSenhaEnter}
            onFocus={(event) => event.target.select()}
            inputRef={senhaInputRef}
            helperText="Se a senha estiver errada, a operacao sera recusada sem deslogar o operador."
            fullWidth
          />
          <TextField
            label="Observacao da liberacao"
            value={observacao}
            onChange={(event) => setObservacao(event.target.value)}
            multiline
            minRows={2}
            helperText="Opcional. Use para registrar o motivo da liberacao."
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={onCancel} disabled={loading}>Cancelar</Button>
        <Button
          variant="contained"
          onClick={() => void handleConfirm()}
          disabled={loading || !codigoBarrasCracha.trim() || !senha}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
