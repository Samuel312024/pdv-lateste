import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { cepService } from '../../services/cepService';
import { clientService, type ClientePerfilCompradorPayload } from '../../services/clientService';
import type { Cliente } from '../../types';
import { formatCep, formatCpfCnpj, formatPhone, isValidCnpj, isValidCpf, isValidEmail, onlyDigits } from '../../utils/br';
import { getErrorMessage } from '../../utils/http';
import { ufOptions } from '../../utils/ufs';

interface BuyerClientProfileDialogProps {
  open: boolean;
  initialClient?: Cliente | null;
  onClose: () => void;
  onSaved: (client: Cliente) => void;
}

interface BuyerClientProfileFormState {
  nome: string;
  documento: string;
  telefone: string;
  email: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  codigoMunicipioIbge: string;
}

type BuyerClientProfileErrors = Partial<Record<keyof BuyerClientProfileFormState, string>>;

export function BuyerClientProfileDialog({ open, initialClient = null, onClose, onSaved }: BuyerClientProfileDialogProps) {
  const { enqueueSnackbar } = useSnackbar();
  const { session, replaceSession } = useAuth();
  const [form, setForm] = useState<BuyerClientProfileFormState>(() => buildInitialForm(initialClient, session?.usuario.nome ?? '', session?.usuario.email ?? ''));
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [cepLookupLoading, setCepLookupLoading] = useState(false);
  const [cepLookupMessage, setCepLookupMessage] = useState<string | null>(null);
  const validationErrors = useMemo(() => validateBuyerClientProfileForm(form), [form]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setForm(buildInitialForm(initialClient, session?.usuario.nome ?? '', session?.usuario.email ?? ''));
    setSaveAttempted(false);
    setSaving(false);
    setDialogError(null);
    setCepLookupLoading(false);
    setCepLookupMessage(null);
  }, [initialClient, open, session?.usuario.email, session?.usuario.nome]);

  function updateForm<Key extends keyof BuyerClientProfileFormState>(key: Key, value: BuyerClientProfileFormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function lookupCep() {
    const cep = onlyDigits(form.cep);
    if (!cep || cep.length !== 8) {
      return;
    }

    setCepLookupLoading(true);
    setCepLookupMessage('Consultando CEP...');
    try {
      const result = await cepService.lookup(cep);
      setForm((current) => ({
        ...current,
        cep: result.cep,
        logradouro: result.logradouro ?? current.logradouro,
        complemento: current.complemento || result.complemento || '',
        bairro: result.bairro ?? current.bairro,
        cidade: result.cidade,
        uf: result.uf,
        codigoMunicipioIbge: result.codigoMunicipioIbge ?? current.codigoMunicipioIbge
      }));
      setCepLookupMessage(`CEP localizado: ${result.cidade}/${result.uf}`);
    } catch (error) {
      setCepLookupMessage('Nao foi possivel preencher o endereco com esse CEP.');
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      setCepLookupLoading(false);
    }
  }

  async function handleSave() {
    setSaveAttempted(true);
    setDialogError(null);
    if (Object.keys(validationErrors).length > 0) {
      setDialogError('Preencha os campos obrigatorios para habilitar o Pix integrado.');
      return;
    }

    setSaving(true);
    try {
      const response = await clientService.saveBuyerProfile(normalizeBuyerClientPayload(form));
      replaceSession(response.sessaoAtualizada);
      onSaved(response.cliente);
      enqueueSnackbar('Comprador vinculado com sucesso ao cadastro de cliente.', { variant: 'success' });
      onClose();
    } catch (error) {
      const message = getErrorMessage(error);
      setDialogError(message);
      enqueueSnackbar(message, { variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle>Cadastro rapido do comprador</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Alert severity="info" sx={{ borderRadius: 3 }}>
            Este cadastro cria ou vincula o cliente do comprador e libera o Pix integrado sem sair do checkout.
          </Alert>

          {dialogError ? (
            <Alert severity="warning" sx={{ borderRadius: 3 }}>
              {dialogError}
            </Alert>
          ) : null}

          {cepLookupMessage ? (
            <Alert severity="success" sx={{ borderRadius: 3 }}>
              {cepLookupMessage}
            </Alert>
          ) : null}

          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                label="Nome"
                value={form.nome}
                onChange={(event) => updateForm('nome', event.target.value)}
                fullWidth
                required
                error={saveAttempted && Boolean(validationErrors.nome)}
                helperText={saveAttempted ? validationErrors.nome : 'Use o nome do comprador que vai acompanhar o pedido.'}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="CPF/CNPJ"
                value={form.documento}
                onChange={(event) => updateForm('documento', formatCpfCnpj(event.target.value))}
                fullWidth
                required
                error={saveAttempted && Boolean(validationErrors.documento)}
                helperText={saveAttempted ? validationErrors.documento : 'Obrigatorio para cobrar Pix e boleto com rastreio profissional.'}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Telefone"
                value={form.telefone}
                onChange={(event) => updateForm('telefone', formatPhone(event.target.value))}
                fullWidth
                required
                error={saveAttempted && Boolean(validationErrors.telefone)}
                helperText={saveAttempted ? validationErrors.telefone : 'Inclua DDD para notificacoes e contato do pedido.'}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="E-mail"
                value={form.email}
                onChange={(event) => updateForm('email', event.target.value)}
                fullWidth
                required
                error={saveAttempted && Boolean(validationErrors.email)}
                helperText={saveAttempted ? validationErrors.email : 'Usado pelo gateway de cobranca e comprovantes.'}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                label="CEP"
                value={form.cep}
                onChange={(event) => updateForm('cep', formatCep(event.target.value))}
                onBlur={() => void lookupCep()}
                fullWidth
                required
                error={saveAttempted && Boolean(validationErrors.cep)}
                helperText={saveAttempted ? validationErrors.cep : 'Ao sair do campo o sistema tenta completar o endereco.'}
              />
            </Grid>
            <Grid item xs={12} md={8} sx={{ display: 'flex', alignItems: 'center' }}>
              <Button
                variant="outlined"
                startIcon={<SearchRoundedIcon />}
                onClick={() => void lookupCep()}
                disabled={cepLookupLoading}
                sx={{ mt: { xs: 0, md: 1.25 } }}
              >
                {cepLookupLoading ? 'Consultando CEP...' : 'Buscar CEP'}
              </Button>
            </Grid>
            <Grid item xs={12} md={8}>
              <TextField
                label="Logradouro"
                value={form.logradouro}
                onChange={(event) => updateForm('logradouro', event.target.value)}
                fullWidth
                required
                error={saveAttempted && Boolean(validationErrors.logradouro)}
                helperText={saveAttempted ? validationErrors.logradouro : 'Rua, avenida ou travessa.'}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                label="Numero"
                value={form.numero}
                onChange={(event) => updateForm('numero', event.target.value)}
                fullWidth
                required
                error={saveAttempted && Boolean(validationErrors.numero)}
                helperText={saveAttempted ? validationErrors.numero : 'Numero do endereco.'}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Complemento"
                value={form.complemento}
                onChange={(event) => updateForm('complemento', event.target.value)}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Bairro"
                value={form.bairro}
                onChange={(event) => updateForm('bairro', event.target.value)}
                fullWidth
                required
                error={saveAttempted && Boolean(validationErrors.bairro)}
                helperText={saveAttempted ? validationErrors.bairro : 'Bairro de entrega e cobranca.'}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Cidade"
                value={form.cidade}
                onChange={(event) => updateForm('cidade', event.target.value)}
                fullWidth
                required
                error={saveAttempted && Boolean(validationErrors.cidade)}
                helperText={saveAttempted ? validationErrors.cidade : 'Cidade usada para validar o municipio no backend.'}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                select
                label="UF"
                value={form.uf}
                onChange={(event) => updateForm('uf', event.target.value)}
                fullWidth
                required
                error={saveAttempted && Boolean(validationErrors.uf)}
                helperText={saveAttempted ? validationErrors.uf : 'Estado do endereco.'}
              >
                {ufOptions.map((option) => (
                  <MenuItem key={option} value={option}>
                    {option}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                label="Codigo IBGE"
                value={form.codigoMunicipioIbge}
                onChange={(event) => updateForm('codigoMunicipioIbge', onlyDigits(event.target.value).slice(0, 7))}
                fullWidth
                error={saveAttempted && Boolean(validationErrors.codigoMunicipioIbge)}
                helperText={saveAttempted ? validationErrors.codigoMunicipioIbge : 'Opcional. Se vazio, o sistema tenta resolver pela cidade/UF.'}
              />
            </Grid>
          </Grid>

          <Typography variant="body2" color="text.secondary">
            Depois de salvar, o checkout continua aberto e o Pix integrado ja pode ser gerado para este comprador.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button variant="contained" onClick={() => void handleSave()} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar e usar no Pix'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function buildInitialForm(initialClient: Cliente | null, sessionName: string, sessionEmail: string): BuyerClientProfileFormState {
  return {
    nome: initialClient?.nome ?? sessionName,
    documento: initialClient?.documento ?? '',
    telefone: initialClient?.telefone ?? '',
    email: initialClient?.email ?? sessionEmail,
    cep: initialClient?.cep ?? '',
    logradouro: initialClient?.logradouro ?? '',
    numero: initialClient?.numero ?? '',
    complemento: initialClient?.complemento ?? '',
    bairro: initialClient?.bairro ?? '',
    cidade: initialClient?.cidade ?? '',
    uf: initialClient?.uf ?? '',
    codigoMunicipioIbge: initialClient?.codigoMunicipioIbge ?? ''
  };
}

function validateBuyerClientProfileForm(form: BuyerClientProfileFormState): BuyerClientProfileErrors {
  const errors: BuyerClientProfileErrors = {};
  const nome = form.nome.trim();
  const documento = onlyDigits(form.documento);
  const telefone = onlyDigits(form.telefone);
  const email = form.email.trim();
  const cep = onlyDigits(form.cep);
  const logradouro = form.logradouro.trim();
  const numero = form.numero.trim();
  const bairro = form.bairro.trim();
  const cidade = form.cidade.trim();
  const uf = form.uf.trim().toUpperCase();
  const codigoMunicipioIbge = onlyDigits(form.codigoMunicipioIbge);

  if (!nome || nome.length < 3) {
    errors.nome = 'Informe um nome com pelo menos 3 caracteres.';
  }

  if (!documento) {
    errors.documento = 'CPF ou CNPJ e obrigatorio.';
  } else if (documento.length <= 11) {
    if (documento.length !== 11 || !isValidCpf(documento)) {
      errors.documento = 'CPF invalido.';
    }
  } else if (documento.length !== 14 || !isValidCnpj(documento)) {
    errors.documento = 'CNPJ invalido.';
  }

  if (!telefone) {
    errors.telefone = 'Telefone e obrigatorio.';
  } else if (![10, 11].includes(telefone.length)) {
    errors.telefone = 'Telefone deve conter DDD e 10 ou 11 digitos.';
  }

  if (!email) {
    errors.email = 'E-mail e obrigatorio.';
  } else if (!isValidEmail(email)) {
    errors.email = 'E-mail invalido.';
  }

  if (!cep || cep.length !== 8) {
    errors.cep = 'CEP deve conter 8 digitos.';
  }

  if (!logradouro) {
    errors.logradouro = 'Logradouro e obrigatorio.';
  }

  if (!numero) {
    errors.numero = 'Numero e obrigatorio.';
  }

  if (!bairro) {
    errors.bairro = 'Bairro e obrigatorio.';
  }

  if (!cidade) {
    errors.cidade = 'Cidade e obrigatoria.';
  }

  if (!uf) {
    errors.uf = 'UF e obrigatoria.';
  } else if (uf.length !== 2) {
    errors.uf = 'UF deve ter 2 caracteres.';
  }

  if (codigoMunicipioIbge && codigoMunicipioIbge.length !== 7) {
    errors.codigoMunicipioIbge = 'Codigo IBGE deve conter 7 digitos.';
  }

  return errors;
}

function normalizeBuyerClientPayload(form: BuyerClientProfileFormState): ClientePerfilCompradorPayload {
  return {
    nome: emptyToNull(form.nome),
    documento: formatCpfCnpj(form.documento),
    telefone: formatPhone(form.telefone),
    email: emptyToNull(form.email),
    cep: onlyDigits(form.cep),
    logradouro: form.logradouro.trim(),
    numero: form.numero.trim(),
    complemento: emptyToNull(form.complemento),
    bairro: form.bairro.trim(),
    cidade: form.cidade.trim(),
    uf: form.uf.trim().toUpperCase(),
    codigoMunicipioIbge: emptyToNull(onlyDigits(form.codigoMunicipioIbge))
  };
}

function emptyToNull(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
