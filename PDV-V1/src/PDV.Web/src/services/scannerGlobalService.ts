import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import type {
  ScannerCodigoEscaneadoEvento,
  ScannerRealtimeConnectionState,
  ScannerSessaoCriada,
  ScannerSessaoPublica,
  ScannerStatusConexao,
  ScannerTipoLeitura
} from '../types';
import { scannerService } from './scannerService';

type ScannerRole = 'pdv' | 'mobile';

const DESKTOP_SCANNER_SESSION_STORAGE_KEY = 'pdv:scanner:desktop-session';

export interface ScannerSessionState {
  role: ScannerRole | null;
  connectionState: ScannerRealtimeConnectionState;
  session: (ScannerSessaoCriada & { pairUrl?: string }) | null;
  publicSession: ScannerSessaoPublica | null;
  pairUrl: string | null;
  status: ScannerStatusConexao | null;
  active: boolean;
  lastCode: ScannerCodigoEscaneadoEvento | null;
  updatedAt: string | null;
}

type CodeListener = (event: ScannerCodigoEscaneadoEvento) => void;
type StatusListener = (state: ScannerSessionState) => void;

export interface ScannerCodeSubscriptionOptions {
  duplicateSuppressionMs?: number;
}

interface CodeSubscription {
  listener: CodeListener;
  duplicateSuppressionMs: number;
  lastCodeAt: { code: string; at: number } | null;
}

interface PersistedDesktopScannerSession {
  sessionId: string;
  accessKey: string;
  session: ScannerSessaoCriada | null;
  publicSession: ScannerSessaoPublica | null;
  pairUrl: string | null;
  status: ScannerStatusConexao | null;
  lastCode: ScannerCodigoEscaneadoEvento | null;
  updatedAt: string | null;
}

const reconnectDelays = [0, 1000, 2500, 5000, 10000];

class ScannerGlobalService {
  private connection: HubConnection | null = null;
  private codeListeners = new Set<CodeSubscription>();
  private statusListeners = new Set<StatusListener>();
  private tokenFactory: () => string | null = () => null;
  private state: ScannerSessionState = {
    role: null,
    connectionState: 'desconectado',
    session: null,
    publicSession: null,
    pairUrl: null,
    status: null,
    active: false,
    lastCode: null,
    updatedAt: null
  };
  private activeSessionId: string | null = null;
  private activeAccessKey: string | null = null;
  private activeRole: ScannerRole | null = null;
  private restorePromise: Promise<boolean> | null = null;

  constructor() {
    this.restorePersistedDesktopSnapshot();
  }

  setTokenFactory(factory: () => string | null) {
    this.tokenFactory = factory;
  }

  async resumePersistedDesktopSession() {
    if (this.activeRole !== 'pdv' || !this.activeSessionId || !this.activeAccessKey) {
      return false;
    }

    if (
      this.connection &&
      (this.connection.state === HubConnectionState.Connected ||
        this.connection.state === HubConnectionState.Connecting ||
        this.connection.state === HubConnectionState.Reconnecting)
    ) {
      return true;
    }

    if (this.restorePromise) {
      return this.restorePromise;
    }

    this.restorePromise = this.resumePersistedDesktopSessionInternal();

    try {
      return await this.restorePromise;
    } finally {
      this.restorePromise = null;
    }
  }

  getState() {
    return this.state;
  }

  subscribeToCodes(listener: CodeListener, options?: ScannerCodeSubscriptionOptions) {
    const subscription: CodeSubscription = {
      listener,
      duplicateSuppressionMs: options?.duplicateSuppressionMs ?? 2000,
      lastCodeAt: null
    };

    this.codeListeners.add(subscription);
    return () => {
      this.codeListeners.delete(subscription);
    };
  }

  subscribeToState(listener: StatusListener) {
    this.statusListeners.add(listener);
    listener(this.state);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  async startDesktopSession(contexto: string, tipoLeitura: ScannerTipoLeitura = 'Auto') {
    const createdSession = await scannerService.createSession(contexto, tipoLeitura);
    const pairUrl = buildPairUrl(createdSession.sessaoId, createdSession.chaveAcesso);

    this.state = {
      ...this.state,
      role: 'pdv',
      session: { ...createdSession, pairUrl },
      publicSession: {
        sessaoId: createdSession.sessaoId,
        contexto: createdSession.contexto,
        tipoLeitura: createdSession.tipoLeitura,
        expiraEmUtc: createdSession.expiraEmUtc,
        permitePdvAnonimo: createdSession.permitePdvAnonimo
      },
      pairUrl,
      active: true,
      updatedAt: new Date().toISOString()
    };
    this.notifyState();

    await this.connectToSession('pdv', createdSession.sessaoId, createdSession.chaveAcesso);
    return createdSession;
  }

  async connectMobileSession(sessaoId: string, chaveAcesso: string) {
    const publicSession = await scannerService.getPublicSession(sessaoId, chaveAcesso);

    this.state = {
      ...this.state,
      role: 'mobile',
      session: null,
      publicSession,
      pairUrl: null,
      active: true,
      updatedAt: new Date().toISOString()
    };
    this.notifyState();

    await this.connectToSession('mobile', sessaoId, chaveAcesso);
    return publicSession;
  }

  async sendCode(codigoBarras: string, formato?: string | null) {
    if (!this.connection || !this.activeSessionId) {
      throw new Error('Scanner global nao esta conectado a uma sessao.');
    }

    await this.connection.invoke('EnviarCodigo', this.activeSessionId, codigoBarras, formato ?? null);
  }

  async disconnect(closeSession = false) {
    const sessionId = this.activeSessionId;

    await this.disposeConnection(sessionId);

    if (closeSession && this.state.session?.sessaoId) {
      try {
        await scannerService.closeSession(this.state.session.sessaoId);
      } catch {
        // A sessao expira naturalmente se o backend estiver ocupado.
      }
    }

    this.activeSessionId = null;
    this.activeAccessKey = null;
    this.activeRole = null;
    this.state = {
      role: null,
      connectionState: 'desconectado',
      session: null,
      publicSession: null,
      pairUrl: null,
      status: null,
      active: false,
      lastCode: null,
      updatedAt: new Date().toISOString()
    };
    this.notifyState();
  }

  private async resumePersistedDesktopSessionInternal() {
    if (this.activeRole !== 'pdv' || !this.activeSessionId || !this.activeAccessKey) {
      return false;
    }

    const publicSession = await this.loadPersistedDesktopSession();
    if (!publicSession) {
      await this.disconnect(false);
      return false;
    }

    this.state = {
      ...this.state,
      role: 'pdv',
      session: {
        sessaoId: this.activeSessionId,
        chaveAcesso: this.activeAccessKey,
        contexto: publicSession.contexto,
        tipoLeitura: publicSession.tipoLeitura,
        expiraEmUtc: publicSession.expiraEmUtc,
        permitePdvAnonimo: publicSession.permitePdvAnonimo
      },
      publicSession,
      pairUrl: buildPairUrl(this.activeSessionId, this.activeAccessKey),
      active: true,
      connectionState: 'reconectando',
      updatedAt: new Date().toISOString()
    };
    this.notifyState();

    try {
      await this.connectToSession('pdv', this.activeSessionId, this.activeAccessKey);
      return true;
    } catch {
      this.setConnectionState('desconectado');
      return false;
    }
  }

  private async connectToSession(role: ScannerRole, sessaoId: string, chaveAcesso: string | null) {
    if (
      this.connection &&
      this.activeSessionId === sessaoId &&
      this.activeRole === role &&
      this.activeAccessKey === chaveAcesso
    ) {
      if (this.connection.state === HubConnectionState.Connected) {
        return;
      }

      await this.disposeConnection(this.activeSessionId);
    } else {
      await this.disposeConnection(this.activeSessionId);
    }

    this.activeRole = role;
    this.activeSessionId = sessaoId;
    this.activeAccessKey = chaveAcesso;
    this.setConnectionState('conectando');

    const connection = new HubConnectionBuilder()
      .withUrl(buildHubUrl(role, chaveAcesso), {
        accessTokenFactory: () => this.tokenFactory() ?? ''
      })
      .withAutomaticReconnect(reconnectDelays)
      .configureLogging(import.meta.env.DEV ? LogLevel.Information : LogLevel.Warning)
      .build();

    this.connection = connection;
    this.wireConnection(connection);

    await connection.start();
    await connection.invoke('EntrarNaSessao', sessaoId);
    this.setConnectionState('conectado');
  }

  private async disposeConnection(sessionId: string | null) {
    if (this.connection && sessionId && this.connection.state === HubConnectionState.Connected) {
      try {
        await this.connection.invoke('SairDaSessao', sessionId);
      } catch {
        // A desconexao do cliente ja e suficiente se o hub estiver indisponivel.
      }
    }

    if (this.connection) {
      try {
        await this.connection.stop();
      } catch {
        // Nao bloqueia limpeza local.
      }
      this.connection = null;
    }
  }

  private wireConnection(connection: HubConnection) {
    connection.on('CodigoEscaneado', (payload: ScannerCodigoEscaneadoEvento) => {
      this.state = {
        ...this.state,
        lastCode: payload,
        updatedAt: new Date().toISOString()
      };
      this.notifyState();

      for (const subscription of this.codeListeners) {
        if (this.shouldIgnoreDuplicateCode(subscription, payload.codigoBarras)) {
          continue;
        }

        subscription.listener(payload);
      }
    });

    connection.on('ScannerConectado', (status: ScannerStatusConexao) => {
      this.applyStatus(status);
    });

    connection.on('ScannerDesconectado', (status: ScannerStatusConexao) => {
      this.applyStatus(status);
    });

    connection.onreconnecting(() => {
      this.setConnectionState('reconectando');
    });

    connection.onreconnected(async () => {
      this.setConnectionState('conectado');

      if (this.activeSessionId) {
        try {
          await connection.invoke('EntrarNaSessao', this.activeSessionId);
        } catch {
          this.setConnectionState('desconectado');
        }
      }
    });

    connection.onclose(() => {
      this.setConnectionState('desconectado');
    });
  }

  private applyStatus(status: ScannerStatusConexao) {
    this.state = {
      ...this.state,
      status,
      updatedAt: new Date().toISOString()
    };
    this.notifyState();
  }

  private setConnectionState(connectionState: ScannerRealtimeConnectionState) {
    this.state = {
      ...this.state,
      connectionState,
      updatedAt: new Date().toISOString()
    };
    this.notifyState();
  }

  private shouldIgnoreDuplicateCode(subscription: CodeSubscription, code: string) {
    if (subscription.duplicateSuppressionMs <= 0) {
      subscription.lastCodeAt = { code, at: Date.now() };
      return false;
    }

    const now = Date.now();
    if (
      subscription.lastCodeAt &&
      subscription.lastCodeAt.code === code &&
      now - subscription.lastCodeAt.at < subscription.duplicateSuppressionMs
    ) {
      return true;
    }

    subscription.lastCodeAt = { code, at: now };
    return false;
  }

  private notifyState() {
    this.syncPersistedDesktopSession();
    for (const listener of this.statusListeners) {
      listener(this.state);
    }
  }

  private restorePersistedDesktopSnapshot() {
    const persisted = readPersistedDesktopSession();
    if (!persisted) {
      return;
    }

    const referenceSession = persisted.session ?? buildCreatedSessionFromPublic(
      persisted.sessionId,
      persisted.accessKey,
      persisted.publicSession
    );

    if (!referenceSession || isScannerSessionExpired(referenceSession.expiraEmUtc)) {
      clearPersistedDesktopSession();
      return;
    }

    this.activeRole = 'pdv';
    this.activeSessionId = persisted.sessionId;
    this.activeAccessKey = persisted.accessKey;
    this.state = {
      role: 'pdv',
      connectionState: 'reconectando',
      session: referenceSession,
      publicSession: persisted.publicSession ?? mapPublicSession(referenceSession),
      pairUrl: persisted.pairUrl ?? buildPairUrl(persisted.sessionId, persisted.accessKey),
      status: persisted.status,
      active: true,
      lastCode: persisted.lastCode,
      updatedAt: persisted.updatedAt ?? new Date().toISOString()
    };
  }

  private async loadPersistedDesktopSession() {
    if (!this.activeSessionId || !this.activeAccessKey) {
      return null;
    }

    const expiresAt = this.state.session?.expiraEmUtc ?? this.state.publicSession?.expiraEmUtc ?? null;
    if (expiresAt && isScannerSessionExpired(expiresAt)) {
      return null;
    }

    try {
      return await scannerService.getPublicSession(this.activeSessionId, this.activeAccessKey);
    } catch (error) {
      const statusCode = getHttpStatusCode(error);
      if (statusCode === 401 || statusCode === 404) {
        return null;
      }

      return this.state.publicSession ?? (this.state.session ? mapPublicSession(this.state.session) : null);
    }
  }

  private syncPersistedDesktopSession() {
    if (
      this.activeRole !== 'pdv' ||
      !this.state.active ||
      !this.activeSessionId ||
      !this.activeAccessKey ||
      !this.state.session
    ) {
      clearPersistedDesktopSession();
      return;
    }

    const payload: PersistedDesktopScannerSession = {
      sessionId: this.activeSessionId,
      accessKey: this.activeAccessKey,
      session: this.state.session,
      publicSession: this.state.publicSession,
      pairUrl: this.state.pairUrl,
      status: this.state.status,
      lastCode: this.state.lastCode,
      updatedAt: this.state.updatedAt
    };

    writePersistedDesktopSession(payload);
  }
}

function buildHubUrl(role: ScannerRole, chaveAcesso: string | null) {
  const url = new URL('/hubs/scanner', window.location.origin);
  url.searchParams.set('papel', role);

  if (chaveAcesso) {
    url.searchParams.set('chaveAcesso', chaveAcesso);
  }

  if (role === 'mobile' && chaveAcesso) {
    url.searchParams.set('device', buildMobileDeviceName());
  }

  return url.toString();
}

function buildPairUrl(sessaoId: string, chaveAcesso: string) {
  const url = new URL('/scanner', window.location.origin);
  url.searchParams.set('sessao', sessaoId);
  url.searchParams.set('chave', chaveAcesso);
  return url.toString();
}

function buildMobileDeviceName() {
  if (typeof navigator === 'undefined') {
    return 'Celular';
  }

  const userAgent = navigator.userAgent;
  if (/android/i.test(userAgent)) {
    return 'Celular Android';
  }

  if (/iphone|ipad|ipod/i.test(userAgent)) {
    return 'iPhone';
  }

  return 'Celular';
}

function mapPublicSession(session: ScannerSessaoCriada): ScannerSessaoPublica {
  return {
    sessaoId: session.sessaoId,
    contexto: session.contexto,
    tipoLeitura: session.tipoLeitura,
    expiraEmUtc: session.expiraEmUtc,
    permitePdvAnonimo: session.permitePdvAnonimo
  };
}

function buildCreatedSessionFromPublic(
  sessionId: string,
  accessKey: string,
  publicSession: ScannerSessaoPublica | null
): ScannerSessaoCriada | null {
  if (!publicSession) {
    return null;
  }

  return {
    sessaoId: sessionId,
    chaveAcesso: accessKey,
    contexto: publicSession.contexto,
    tipoLeitura: publicSession.tipoLeitura,
    expiraEmUtc: publicSession.expiraEmUtc,
    permitePdvAnonimo: publicSession.permitePdvAnonimo
  };
}

function isScannerSessionExpired(expiraEmUtc: string) {
  return new Date(expiraEmUtc).getTime() <= Date.now();
}

function getHttpStatusCode(error: unknown) {
  if (typeof error !== 'object' || !error || !('response' in error)) {
    return null;
  }

  const response = (error as { response?: { status?: number } }).response;
  return typeof response?.status === 'number' ? response.status : null;
}

function readPersistedDesktopSession(): PersistedDesktopScannerSession | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawValue = window.localStorage.getItem(DESKTOP_SCANNER_SESSION_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as PersistedDesktopScannerSession;
    if (!parsed.sessionId || !parsed.accessKey) {
      clearPersistedDesktopSession();
      return null;
    }

    return parsed;
  } catch {
    clearPersistedDesktopSession();
    return null;
  }
}

function writePersistedDesktopSession(payload: PersistedDesktopScannerSession) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(DESKTOP_SCANNER_SESSION_STORAGE_KEY, JSON.stringify(payload));
}

function clearPersistedDesktopSession() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(DESKTOP_SCANNER_SESSION_STORAGE_KEY);
}

export const scannerGlobalService = new ScannerGlobalService();
