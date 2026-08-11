import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import PrintRoundedIcon from '@mui/icons-material/PrintRounded';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Divider,
  FormControlLabel,
  FormGroup,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Tooltip,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AccessDeniedCard } from '../components/common/AccessDeniedCard';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { DetachableDialog } from '../components/common/DetachableDialog';
import { ListFilterField } from '../components/common/ListFilterField';
import { Loading } from '../components/common/Loading';
import { useAuth } from '../contexts/AuthContext';
import { userService, type UsuarioCrachaSugestao, type UsuarioPayload } from '../services/userService';
import type { PerfilOpcao, PermissaoOpcao, Usuario, UsuarioClienteVinculo } from '../types';
import { readDetachedDialogSession, removeDetachedDialogSession } from '../utils/detachedDialogSession';
import { getErrorMessage } from '../utils/http';
import { buildBadgeQrCodeDataUrl, buildCode39BarcodeSvg, printUserBadge } from '../utils/userBadgePrinter';

const emptyForm: UsuarioPayload = {
  perfilId: '',
  clienteId: null,
  nome: '',
  email: '',
  codigoBarrasCracha: '',
  senha: '',
  ativo: true,
  usarPermissoesCustomizadas: false,
  permissoesCustomizadas: []
};

interface UserDetachedSession {
  editingUser: Usuario | null;
  form: UsuarioPayload;
  dialogError: string | null;
}

const USER_DIALOG_PATH = '/usuarios';

export function UsersPage() {
  const [loading, setLoading] = useState(true);
  const [refreshingUsers, setRefreshingUsers] = useState(false);
  const [users, setUsers] = useState<Usuario[]>([]);
  const [profiles, setProfiles] = useState<PerfilOpcao[]>([]);
  const [permissions, setPermissions] = useState<PermissaoOpcao[]>([]);
  const [linkableClients, setLinkableClients] = useState<UsuarioClienteVinculo[]>([]);
  const [search, setSearch] = useState('');
  const [userSuggestions, setUserSuggestions] = useState<Usuario[]>([]);
  const [userSuggestionsLoading, setUserSuggestionsLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Usuario | null>(null);
  const [deleteUser, setDeleteUser] = useState<Usuario | null>(null);
  const [deletePermanent, setDeletePermanent] = useState(false);
  const [form, setForm] = useState<UsuarioPayload>(emptyForm);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [badgeSuggestion, setBadgeSuggestion] = useState<UsuarioCrachaSugestao | null>(null);
  const [badgePreviewQrCode, setBadgePreviewQrCode] = useState<string | null>(null);
  const { enqueueSnackbar } = useSnackbar();
  const { hasPermission, isMasterUser, session } = useAuth();
  const [searchParams] = useSearchParams();
  const detachedWindow = searchParams.get('detachedWindow') === '1';
  const detachedSessionKey = searchParams.get('detachedSession');
  const hydratedDetachedSessionRef = useRef<string | null>(null);
  const lastSuggestedBadgeCodeRef = useRef<string | null>(null);
  const deferredSearch = useDeferredValue(search);
  const canManageUsers = hasPermission('GerenciarUsuarios');

  useEffect(() => {
    if (!canManageUsers) {
      setLoading(false);
      return;
    }

    void loadData(undefined, true);
  }, [canManageUsers]);

  useEffect(() => {
    if (loading || !detachedWindow || !detachedSessionKey || hydratedDetachedSessionRef.current === detachedSessionKey) {
      return;
    }

    const sessionData = readDetachedDialogSession<UserDetachedSession>(detachedSessionKey);
    hydratedDetachedSessionRef.current = detachedSessionKey;

    if (!sessionData) {
      return;
    }

    setEditingUser(sessionData.editingUser);
    setDialogError(sessionData.dialogError);
    setForm({
      ...sessionData.form,
      permissoesCustomizadas: normalizePermissionSelection(sessionData.form.permissoesCustomizadas)
    });
    setDialogOpen(true);
  }, [detachedSessionKey, detachedWindow, loading]);

  useEffect(() => {
    let active = true;

    if (!canManageUsers) {
      setUserSuggestions([]);
      setUserSuggestionsLoading(false);
      return;
    }

    const normalizedTerm = deferredSearch.trim();
    if (!normalizedTerm) {
      setUserSuggestions([]);
      setUserSuggestionsLoading(false);
      return;
    }

    async function loadSuggestions() {
      setUserSuggestionsLoading(true);
      try {
        const result = await userService.list(normalizedTerm);
        if (active) {
          setUserSuggestions(result.slice(0, 12));
        }
      } catch {
        if (active) {
          setUserSuggestions([]);
        }
      } finally {
        if (active) {
          setUserSuggestionsLoading(false);
        }
      }
    }

    void loadSuggestions();
    return () => {
      active = false;
    };
  }, [canManageUsers, deferredSearch]);

  const permissionGroups = useMemo(() => {
    const groups = new Map<string, PermissaoOpcao[]>();

    for (const permission of permissions) {
      const items = groups.get(permission.grupo) ?? [];
      items.push(permission);
      groups.set(permission.grupo, items);
    }

    return [...groups.entries()];
  }, [permissions]);
  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.perfilId === form.perfilId) ?? null,
    [form.perfilId, profiles]
  );
  const badgeBarcodePreview = useMemo(() => {
    const badgeCode = form.codigoBarrasCracha?.trim();
    return badgeCode ? buildCode39BarcodeSvg(badgeCode) : null;
  }, [form.codigoBarrasCracha]);

  useEffect(() => {
    let active = true;
    const badgeCode = form.codigoBarrasCracha?.trim();

    if (!badgeCode) {
      setBadgePreviewQrCode(null);
      return () => {
        active = false;
      };
    }

    void buildBadgeQrCodeDataUrl(badgeCode, 180)
      .then((value: string) => {
        if (active) {
          setBadgePreviewQrCode(value);
        }
      })
      .catch(() => {
        if (active) {
          setBadgePreviewQrCode(null);
        }
      });

    return () => {
      active = false;
    };
  }, [form.codigoBarrasCracha]);

  useEffect(() => {
    if (!dialogOpen || editingUser || !canManageUsers || !form.perfilId) {
      return;
    }

    const perfilId = form.perfilId;
    let active = true;

    async function loadBadgeSuggestion() {
      try {
        const suggestion = await userService.getBadgeSuggestion(perfilId);
        if (!active) {
          return;
        }

        setBadgeSuggestion(suggestion);
        setForm((current) => {
          if (current.perfilId !== perfilId) {
            return current;
          }

          const currentBadgeCode = current.codigoBarrasCracha?.trim() ?? '';
          const canReplaceCurrentValue =
            !currentBadgeCode ||
            currentBadgeCode === (lastSuggestedBadgeCodeRef.current ?? '');

          if (!canReplaceCurrentValue) {
            return current;
          }

          lastSuggestedBadgeCodeRef.current = suggestion.codigoBarrasCracha;
          return {
            ...current,
            codigoBarrasCracha: suggestion.codigoBarrasCracha
          };
        });
      } catch (error) {
        if (!active) {
          return;
        }

        setBadgeSuggestion(null);
        enqueueSnackbar(getErrorMessage(error), { variant: 'warning' });
      }
    }

    void loadBadgeSuggestion();

    return () => {
      active = false;
    };
  }, [canManageUsers, dialogOpen, editingUser, enqueueSnackbar, form.perfilId]);

  async function loadData(term?: string, showPageLoader = false) {
    if (!canManageUsers) {
      setLoading(false);
      return;
    }

    if (showPageLoader) {
      setLoading(true);
    } else {
      setRefreshingUsers(true);
    }

    try {
      const [usersResult, profilesResult, permissionsResult, clientsResult] = await Promise.all([
        userService.list(term),
        userService.listProfiles(),
        userService.listPermissions(),
        userService.listLinkableClients()
      ]);

      setUsers(usersResult);
      setProfiles(profilesResult);
      setPermissions(permissionsResult);
      setLinkableClients(clientsResult);

      if (!editingUser && profilesResult.length > 0 && !form.perfilId) {
        setForm((current) => ({ ...current, perfilId: profilesResult[0].perfilId }));
      }
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    } finally {
      if (showPageLoader) {
        setLoading(false);
      } else {
        setRefreshingUsers(false);
      }
    }
  }

  function getProfilePermissions(perfilId: string) {
    return profiles.find((profile) => profile.perfilId === perfilId)?.permissoes ?? [];
  }

  function openCreateDialog() {
    if (!canManageUsers) {
      enqueueSnackbar('Seu usuario nao possui permissao para criar contas ou liberar feature flags.', { variant: 'warning' });
      return;
    }

    setEditingUser(null);
    setDialogError(null);
    setBadgeSuggestion(null);
    setBadgePreviewQrCode(null);
    lastSuggestedBadgeCodeRef.current = null;
    setForm({
      ...emptyForm,
      perfilId: profiles[0]?.perfilId ?? ''
    });
    setDialogOpen(true);
  }

  function openEditDialog(user: Usuario) {
    if (user.isMaster && !isMasterUser) {
      enqueueSnackbar('Somente o usuario master pode editar a conta master.', { variant: 'warning' });
      return;
    }

    setEditingUser(user);
    setDialogError(null);
    setBadgeSuggestion(null);
    lastSuggestedBadgeCodeRef.current = user.codigoBarrasCracha;
    setForm({
      perfilId: user.perfilId,
      clienteId: user.clienteId,
      nome: user.nome,
      email: user.email,
      codigoBarrasCracha: user.codigoBarrasCracha,
      senha: '',
      ativo: user.ativo,
      usarPermissoesCustomizadas: user.usarPermissoesCustomizadas,
      permissoesCustomizadas: normalizePermissionSelection([...user.permissoesCustomizadas])
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setBadgeSuggestion(null);
    setBadgePreviewQrCode(null);
    lastSuggestedBadgeCodeRef.current = null;

    if (!detachedWindow) {
      return;
    }

    removeDetachedDialogSession(detachedSessionKey);
    window.close();
  }

  function toggleCustomPermission(codigo: string, checked: boolean) {
    setForm((current) => {
      const next = new Set(current.permissoesCustomizadas);
      if (checked) {
        next.add(codigo);
      } else {
        next.delete(codigo);
      }

      return {
        ...current,
        permissoesCustomizadas: normalizePermissionSelection([...next])
      };
    });
  }

  function handlePermissionModeChange(checked: boolean) {
    setForm((current) => {
      if (!checked) {
        return {
          ...current,
          usarPermissoesCustomizadas: false,
          permissoesCustomizadas: []
        };
      }

      const initialPermissions =
        current.permissoesCustomizadas.length > 0
          ? current.permissoesCustomizadas
          : editingUser?.permissoesEfetivas.length
            ? editingUser.permissoesEfetivas
            : getProfilePermissions(current.perfilId);

      return {
        ...current,
        usarPermissoesCustomizadas: true,
        permissoesCustomizadas: normalizePermissionSelection(initialPermissions)
      };
    });
  }

  function applySuggestedBadgeCode() {
    if (!badgeSuggestion) {
      return;
    }

    lastSuggestedBadgeCodeRef.current = badgeSuggestion.codigoBarrasCracha;
    setForm((current) => ({
      ...current,
      codigoBarrasCracha: badgeSuggestion.codigoBarrasCracha
    }));
  }

  async function handleSave() {
    if (!canManageUsers) {
      enqueueSnackbar('Seu usuario nao possui permissao para salvar contas e feature flags.', { variant: 'warning' });
      return;
    }

    setDialogError(null);

    const payload: UsuarioPayload = {
      ...form,
      codigoBarrasCracha: form.codigoBarrasCracha?.trim() ? form.codigoBarrasCracha.trim() : null,
      senha: form.senha?.trim() ? form.senha.trim() : null,
      permissoesCustomizadas: form.usarPermissoesCustomizadas ? normalizePermissionSelection(form.permissoesCustomizadas) : []
    };
    let createdUser: Usuario | null = null;

    try {
      if (editingUser) {
        await userService.update(editingUser.usuarioId, payload);
        enqueueSnackbar('Usuario atualizado com sucesso.', { variant: 'success' });
      } else {
        createdUser = await userService.create(payload);
        enqueueSnackbar('Usuario criado com sucesso.', { variant: 'success' });
      }

      if (createdUser?.codigoBarrasCracha && detachedWindow) {
        try {
          await printUserBadge(createdUser);
        } catch (printError) {
          enqueueSnackbar(getErrorMessage(printError), { variant: 'warning' });
        }
      }

      if (detachedWindow) {
        closeDialog();
        return;
      }

      await loadData(search);
      closeDialog();

      if (createdUser?.codigoBarrasCracha) {
        try {
          await printUserBadge(createdUser);
        } catch (printError) {
          enqueueSnackbar(getErrorMessage(printError), { variant: 'warning' });
        }
      }
    } catch (error) {
      const message = getErrorMessage(error);
      setDialogError(message);
      enqueueSnackbar(message, { variant: 'error' });
    }
  }

  async function handlePrintBadge(user: Usuario) {
    if (!user.codigoBarrasCracha) {
      enqueueSnackbar('Cadastre um codigo de cracha antes de imprimir.', { variant: 'warning' });
      return;
    }

    try {
      await printUserBadge(user);
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    }
  }

  async function handleDelete() {
    if (!deleteUser) {
      return;
    }

    if (!canManageUsers) {
      enqueueSnackbar('Seu usuario nao possui permissao para inativar ou excluir contas.', { variant: 'warning' });
      return;
    }

    try {
      await userService.remove(deleteUser.usuarioId, deletePermanent);
      enqueueSnackbar(deletePermanent ? 'Usuario excluido permanentemente com sucesso.' : 'Usuario inativado com sucesso.', { variant: 'success' });
      setDeleteUser(null);
      setDeletePermanent(false);
      await loadData(search);
    } catch (error) {
      enqueueSnackbar(getErrorMessage(error), { variant: 'error' });
    }
  }

  if (loading) {
    return <Loading message="Carregando usuarios..." />;
  }

  if (!canManageUsers) {
    return (
      <AccessDeniedCard
        title="Usuarios bloqueado"
        message="Seu usuario nao possui a feature flag de administracao de usuarios. Peca ao administrador para liberar esse modulo."
      />
    );
  }

  const inheritedPermissions = getProfilePermissions(form.perfilId);
  const hasSuggestedBadgeOverride =
    Boolean(badgeSuggestion?.codigoBarrasCracha) &&
    (form.codigoBarrasCracha?.trim() ?? '') !== badgeSuggestion?.codigoBarrasCracha;

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4">Usuarios</Typography>
        <Typography color="text.secondary">Administracao central de contas, senhas, crachas e feature flags por usuario, com a conta master preservada como acesso raiz.</Typography>
      </Box>

      <Card sx={{ borderRadius: 5 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Autocomplete
              fullWidth
              freeSolo
              value={null}
              options={userSuggestions}
              inputValue={search}
              filterOptions={(options) => options}
              onInputChange={(_, nextValue) => setSearch(nextValue)}
              onChange={(_, user) => {
                if (!user || typeof user === 'string') {
                  return;
                }

                setSearch(user.nome);
                setUsers([user]);
              }}
              getOptionLabel={(option) => (typeof option === 'string' ? option : option.nome)}
              noOptionsText={search.trim() ? 'Nenhum usuario encontrado.' : 'Digite para buscar usuarios.'}
              renderOption={(props, option) => (
                <Box component="li" {...props} sx={{ py: 1.25 }}>
                  <Box>
                    <Typography sx={{ fontWeight: 700 }}>{option.nome}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {[option.email, option.perfilNome, option.usarPermissoesCustomizadas ? 'Acesso individual' : 'Acesso por perfil'].join(' · ')}
                      {option.clienteNome ? ` · cliente ${option.clienteNome}` : ''}
                    </Typography>
                  </Box>
                </Box>
              )}
              renderInput={(params) => (
                <ListFilterField
                  {...params}
                  label="Buscar usuario"
                  placeholder="Nome ou e-mail"
                  loading={userSuggestionsLoading}
                  helperText={
                    userSuggestionsLoading
                      ? 'Buscando usuarios parecidos...'
                      : 'As sugestoes aparecem enquanto voce digita. Pressione Enter para filtrar a tabela.'
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void loadData(search);
                    }
                  }}
                  fullWidth
                />
              )}
            />
            <Button variant="outlined" onClick={() => void loadData(search)} disabled={refreshingUsers}>
              Buscar
            </Button>
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={openCreateDialog}>
              Novo usuario
            </Button>
          </Stack>

          {refreshingUsers && (
            <Typography variant="body2" color="primary.main" sx={{ mt: 1.5 }}>
              Atualizando a lista de usuarios...
            </Typography>
          )}
        </CardContent>
      </Card>

      <Paper sx={{ borderRadius: 5, overflow: 'hidden' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Usuario</TableCell>
              <TableCell>Perfil</TableCell>
              <TableCell>Acesso</TableCell>
              <TableCell>Status</TableCell>
              <TableCell width={144}></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.usuarioId} hover>
                <TableCell>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography sx={{ fontWeight: 700 }}>{user.nome}</Typography>
                    {user.isMaster ? <Chip label="Master" color="warning" size="small" /> : null}
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {user.email}
                    {user.codigoBarrasCracha ? ` · cracha ${user.codigoBarrasCracha}` : ''}
                    {user.clienteNome ? ` · cliente ${user.clienteNome}` : ''}
                    {user.usuarioId === session?.usuario.usuarioId ? ' · voce' : ''}
                  </Typography>
                </TableCell>
                <TableCell>{user.perfilNome}</TableCell>
                <TableCell>
                  <Typography sx={{ fontWeight: 700 }}>
                    {user.usarPermissoesCustomizadas ? 'Individual' : 'Por perfil'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {user.permissoesEfetivas.length} acessos liberados
                  </Typography>
                </TableCell>
                <TableCell>{user.ativo ? 'Ativo' : 'Inativo'}</TableCell>
                <TableCell>
                  <Tooltip title={user.codigoBarrasCracha ? 'Imprimir cracha' : 'Usuario sem codigo de cracha'}>
                    <span>
                      <IconButton onClick={() => void handlePrintBadge(user)} disabled={!user.codigoBarrasCracha}>
                        <PrintRoundedIcon />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Editar usuario">
                    <span>
                      <IconButton onClick={() => openEditDialog(user)} disabled={user.isMaster && !isMasterUser}>
                        <EditRoundedIcon />
                      </IconButton>
                    </span>
                  </Tooltip>
                  {!user.isMaster && user.usuarioId !== session?.usuario.usuarioId ? (
                    <Tooltip title="Inativar usuario">
                      <IconButton
                        onClick={() => {
                          setDeleteUser(user);
                          setDeletePermanent(false);
                        }}
                        color="error"
                      >
                        <DeleteOutlineRoundedIcon />
                      </IconButton>
                    </Tooltip>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <DetachableDialog
        open={dialogOpen}
        onClose={closeDialog}
        title={editingUser ? 'Editar usuario' : 'Novo usuario'}
        maxWidth="lg"
        detachedWindow={detachedWindow}
        detachPath={USER_DIALOG_PATH}
        detachPayload={{
          editingUser,
          form,
          dialogError
        } satisfies UserDetachedSession}
        onDetach={closeDialog}
        windowTitle={editingUser ? `Editar usuario - ${form.nome || 'Usuario'}` : 'Novo usuario'}
        actionsSx={{ px: 3, pb: 3 }}
        actions={
          <>
            <Button onClick={closeDialog}>{canManageUsers ? 'Cancelar' : 'Fechar'}</Button>
            {canManageUsers ? (
              <Button variant="contained" onClick={handleSave}>
                Salvar
              </Button>
            ) : null}
          </>
        }
      >
        {dialogError ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {dialogError}
          </Alert>
        ) : null}

        {editingUser?.isMaster ? (
          <Alert severity="warning" sx={{ mb: 2 }}>
            O usuario master permanece com acesso total fixo ao sistema. Voce pode ajustar nome e senha, mas nao pode remover esse acesso raiz.
          </Alert>
        ) : null}

        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid item xs={12} md={6}>
            <TextField
              label="Nome"
              value={form.nome}
              onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))}
              fullWidth
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              label="E-mail"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              fullWidth
              disabled={editingUser?.isMaster}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <Stack spacing={1.25}>
              <TextField
                label="Cracha / codigo de barras"
                value={form.codigoBarrasCracha ?? ''}
                onChange={(event) => setForm((current) => ({ ...current, codigoBarrasCracha: event.target.value.toUpperCase() }))}
                helperText={
                  selectedProfile
                    ? `Gerado automaticamente pelo perfil ${selectedProfile.nome}. Voce pode editar manualmente se quiser.`
                    : 'Selecione um perfil para gerar automaticamente o codigo de barras e o QR Code do cracha.'
                }
                fullWidth
              />

              {hasSuggestedBadgeOverride ? (
                <Button variant="text" size="small" onClick={applySuggestedBadgeCode} sx={{ alignSelf: 'flex-start', px: 0 }}>
                  Usar codigo sugerido para {badgeSuggestion?.perfilNome}
                </Button>
              ) : null}

              {form.codigoBarrasCracha?.trim() ? (
                <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 4 }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }}>
                    <Box
                      sx={{
                        width: 88,
                        minWidth: 88,
                        height: 88,
                        borderRadius: 2.5,
                        display: 'grid',
                        placeItems: 'center',
                        bgcolor: 'rgba(18,113,255,0.05)',
                        border: '1px solid rgba(18,113,255,0.12)',
                        overflow: 'hidden'
                      }}
                    >
                      {badgePreviewQrCode ? (
                        <Box component="img" src={badgePreviewQrCode} alt="Previa do QR Code do cracha" sx={{ width: 76, height: 76 }} />
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          QR
                        </Typography>
                      )}
                    </Box>

                    <Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
                      <Box>
                        <Typography sx={{ fontWeight: 800 }}>Previa automatica do cracha</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {selectedProfile?.nome ?? badgeSuggestion?.perfilNome ?? 'Perfil'} · {form.codigoBarrasCracha.trim()}
                        </Typography>
                      </Box>

                      {badgeBarcodePreview ? (
                        <Box
                          sx={{
                            px: 1,
                            py: 0.75,
                            borderRadius: 2.5,
                            bgcolor: '#fff',
                            border: '1px solid rgba(15,23,42,0.08)',
                            '& svg': {
                              width: '100%',
                              height: 48,
                              display: 'block'
                            }
                          }}
                          dangerouslySetInnerHTML={{ __html: badgeBarcodePreview }}
                        />
                      ) : (
                        <Alert severity="info" sx={{ borderRadius: 3 }}>
                          Este valor sera usado no QR Code. Para o codigo de barras impresso, prefira letras maiusculas, numeros e hifen.
                        </Alert>
                      )}
                    </Stack>
                  </Stack>
                </Paper>
              ) : null}
            </Stack>
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              select
              label="Perfil"
              value={form.perfilId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  perfilId: event.target.value,
                  permissoesCustomizadas: current.usarPermissoesCustomizadas
                    ? normalizePermissionSelection(getProfilePermissions(event.target.value))
                    : current.permissoesCustomizadas
                }))
              }
              fullWidth
              disabled={editingUser?.isMaster}
            >
              {profiles.map((profile) => (
                <MenuItem key={profile.perfilId} value={profile.perfilId}>
                  {profile.nome}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} md={6}>
            <Autocomplete
              options={linkableClients}
              value={linkableClients.find((item) => item.clienteId === form.clienteId) ?? null}
              onChange={(_, option) => setForm((current) => ({ ...current, clienteId: option?.clienteId ?? null }))}
              isOptionEqualToValue={(option, value) => option.clienteId === value.clienteId}
              getOptionLabel={(option) => option.nome}
              noOptionsText="Nenhum cliente ativo disponivel"
              renderOption={(props, option) => (
                <Box component="li" {...props} sx={{ py: 1.25 }}>
                  <Box>
                    <Typography sx={{ fontWeight: 700 }}>{option.nome}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {[option.documento, option.telefone, [option.cidade, option.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ') || 'Cadastro sem documento ou telefone.'}
                    </Typography>
                  </Box>
                </Box>
              )}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Cliente vinculado"
                  helperText="Opcional. Use para contas de comprador vinculadas ao proprio cadastro. Para entregadores, este campo normalmente fica em branco."
                  fullWidth
                />
              )}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              label={editingUser ? 'Nova senha (opcional)' : 'Senha inicial'}
              type="password"
              value={form.senha ?? ''}
              onChange={(event) => setForm((current) => ({ ...current, senha: event.target.value }))}
              helperText={editingUser ? 'Deixe em branco para manter a senha atual.' : 'Minimo de 8 caracteres.'}
              fullWidth
            />
          </Grid>
          <Grid item xs={12}>
            <FormControlLabel
              control={<Checkbox checked={form.ativo} onChange={(event) => setForm((current) => ({ ...current, ativo: event.target.checked }))} />}
              label="Usuario ativo"
              disabled={editingUser?.isMaster}
            />
          </Grid>

          <Grid item xs={12}>
            <Divider sx={{ mb: 2 }} />
            <Stack spacing={1.5}>
              <FormControlLabel
                control={
                  <Switch
                    checked={form.usarPermissoesCustomizadas}
                    onChange={(event) => handlePermissionModeChange(event.target.checked)}
                    disabled={editingUser?.isMaster}
                  />
                }
                label="Ativar feature flags por usuario"
              />
              <Typography variant="body2" color="text.secondary">
                Desligado: o usuario herda automaticamente os acessos do perfil escolhido. Ligado: o administrador escolhe exatamente quais modulos e acoes ficarao liberados.
              </Typography>

              {form.usarPermissoesCustomizadas ? (
                <Grid container spacing={2}>
                  {permissionGroups.map(([group, items]) => (
                    <Grid item xs={12} md={6} key={group}>
                      <Paper variant="outlined" sx={{ p: 2, borderRadius: 4, height: '100%' }}>
                        <Typography sx={{ fontWeight: 800, mb: 1 }}>{group}</Typography>
                        <FormGroup>
                          {items.map((permission) => (
                            <Box key={permission.codigo} sx={{ py: 0.75 }}>
                              <FormControlLabel
                                control={
                                  <Checkbox
                                    checked={form.permissoesCustomizadas.includes(permission.codigo)}
                                    onChange={(event) => toggleCustomPermission(permission.codigo, event.target.checked)}
                                  />
                                }
                                label={permission.nome}
                              />
                              <Typography variant="body2" color="text.secondary" sx={{ pl: 4.5 }}>
                                {permission.descricao}
                              </Typography>
                            </Box>
                          ))}
                        </FormGroup>
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              ) : (
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderRadius: 4,
                    background:
                      'linear-gradient(135deg, rgba(18,113,255,0.06), rgba(18,113,255,0.02))'
                  }}
                >
                  <Typography sx={{ fontWeight: 700 }}>Acesso herdado do perfil</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1.5 }}>
                    {inheritedPermissions.length === 0
                      ? 'Selecione um perfil para visualizar os acessos padrao.'
                      : `${inheritedPermissions.length} acessos serao liberados automaticamente para este usuario.`}
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {inheritedPermissions.map((permissionCode) => {
                      const permission = permissions.find((item) => item.codigo === permissionCode);
                      return <Chip key={permissionCode} label={permission?.nome ?? permissionCode} size="small" />;
                    })}
                  </Stack>
                </Paper>
              )}
            </Stack>
          </Grid>

          {!editingUser ? (
            <Grid item xs={12}>
              <Typography variant="body2" color="text.secondary">
                Usuario master seeded para acesso inicial: <strong>900000000001</strong> / <strong>Master@123</strong>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Gerente demo para liberacoes no PDV: <strong>900000000003</strong> / <strong>Gerente@123</strong>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Operador demo: <strong>900000000004</strong> / <strong>Operador@123</strong>
              </Typography>
            </Grid>
          ) : null}

          {editingUser && !editingUser.isMaster && editingUser.usuarioId !== session?.usuario.usuarioId ? (
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>
                <Button color="warning" onClick={() => { setDeleteUser(editingUser); setDeletePermanent(false); }}>
                  Inativar usuario
                </Button>
                <Button color="error" onClick={() => { setDeleteUser(editingUser); setDeletePermanent(true); }}>
                  Excluir permanente
                </Button>
              </Box>
            </Grid>
          ) : null}
        </Grid>
      </DetachableDialog>

      <ConfirmDialog
        open={Boolean(deleteUser)}
        title={deletePermanent ? 'Excluir usuario permanentemente' : 'Inativar usuario'}
        description={
          deletePermanent
            ? `Deseja excluir permanentemente o usuario ${deleteUser?.nome ?? ''}? Isso so e permitido quando ele ainda nao participou de caixa, venda, estoque ou financeiro.`
            : `Deseja inativar o usuario ${deleteUser?.nome ?? ''}? O acesso sera bloqueado, mas o historico operacional continua salvo.`
        }
        confirmLabel={deletePermanent ? 'Excluir permanente' : 'Inativar'}
        onCancel={() => {
          setDeleteUser(null);
          setDeletePermanent(false);
        }}
        onConfirm={() => void handleDelete()}
      />
    </Stack>
  );
}

const permissionDependencyMap: Record<string, string[]> = {
  VisualizarPedidos: ['VisualizarVendas'],
  GerenciarPedidos: ['VisualizarPedidos'],
  AcompanharPedidosCliente: ['VisualizarCatalogoProdutos'],
  RealizarPedidoCliente: ['VisualizarCatalogoProdutos', 'AcompanharPedidosCliente'],
  CriarProduto: ['VisualizarProduto'],
  EditarProduto: ['VisualizarProduto'],
  ExcluirProduto: ['VisualizarProduto'],
  GerenciarClientes: ['VisualizarClientes'],
  RealizarVenda: ['VisualizarProduto'],
  GerenciarFinanceiro: ['VisualizarFinanceiro'],
  EmitirNotasFiscais: ['VisualizarNotasFiscais']
};

function normalizePermissionSelection(selectedPermissions: string[]) {
  const resolved = new Set(
    selectedPermissions
      .filter((item) => item.trim())
      .map((item) => item.trim())
  );

  let changed = true;
  while (changed) {
    changed = false;

    for (const permission of [...resolved]) {
      for (const dependency of permissionDependencyMap[permission] ?? []) {
        if (resolved.has(dependency)) {
          continue;
        }

        resolved.add(dependency);
        changed = true;
      }
    }
  }

  return [...resolved].sort((left, right) => left.localeCompare(right));
}
