import type {
  TerminalPerfilImpressora,
  TerminalPerfilScanner,
  TerminalPerfilTeclado,
  TerminalPdvAtivacaoResultado
} from '../types';

const TERMINAL_ACTIVATION_STORAGE_KEY = 'pdv-terminal-activation';
const TERMINAL_DEVICE_ID_STORAGE_KEY = 'pdv-terminal-device-id';

export interface TerminalActivationState extends TerminalPdvAtivacaoResultado {
  dispositivoIdentificador: string;
  nomeHost: string | null;
  versaoInstalador: string | null;
  versaoAplicativo: string | null;
}

const DEFAULT_TERMINAL_PRINTER_PROFILE: TerminalPerfilImpressora = 'TERMICA_80MM';
const DEFAULT_TERMINAL_SCANNER_PROFILE: TerminalPerfilScanner = 'HIBRIDO';
const DEFAULT_TERMINAL_KEYBOARD_PROFILE: TerminalPerfilTeclado = 'PADRAO_PDV';

function limitText(value: string | null | undefined, maxLength: number) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  return normalized.length <= maxLength ? normalized : normalized.slice(0, maxLength);
}

function createDeviceIdentifier() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `terminal-${Date.now().toString(36)}`;
}

function resolveBuildIdentifier() {
  const mode = limitText(import.meta.env.MODE?.toUpperCase() ?? null, 24);
  return mode ? `PDV.WEB.${mode}` : 'PDV.WEB';
}

export function ensureTerminalDeviceId() {
  const storedValue = limitText(window.localStorage.getItem(TERMINAL_DEVICE_ID_STORAGE_KEY), 120);
  if (storedValue) {
    return storedValue;
  }

  const nextValue = createDeviceIdentifier();
  window.localStorage.setItem(TERMINAL_DEVICE_ID_STORAGE_KEY, nextValue);
  return nextValue;
}

export function readTerminalActivationState() {
  const rawValue = window.localStorage.getItem(TERMINAL_ACTIVATION_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as TerminalActivationState;
    if (!parsed.codigoTerminal || !parsed.nomeTerminal) {
      return null;
    }

    return normalizeTerminalActivationState(parsed);
  } catch {
    return null;
  }
}

export function writeTerminalActivationState(state: TerminalActivationState) {
  window.localStorage.setItem(TERMINAL_ACTIVATION_STORAGE_KEY, JSON.stringify(normalizeTerminalActivationState(state)));
}

export function resolveTerminalHostName() {
  const hostName = limitText(window.location.hostname, 120);
  if (hostName && hostName !== 'localhost' && hostName !== '127.0.0.1') {
    return hostName;
  }

  return limitText(navigator.platform, 120) ?? hostName;
}

export function resolveTerminalInstallerVersion() {
  return limitText(resolveBuildIdentifier(), 40);
}

export function resolveTerminalAppVersion() {
  return limitText(resolveBuildIdentifier(), 40);
}

function normalizeTerminalActivationState(state: TerminalActivationState) {
  return {
    ...state,
    perfilImpressora: state.perfilImpressora ?? DEFAULT_TERMINAL_PRINTER_PROFILE,
    perfilScanner: state.perfilScanner ?? DEFAULT_TERMINAL_SCANNER_PROFILE,
    perfilTeclado: state.perfilTeclado ?? DEFAULT_TERMINAL_KEYBOARD_PROFILE,
    impressaoAutomatica: state.impressaoAutomatica ?? true
  };
}
