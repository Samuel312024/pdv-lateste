import type { PdvTouchInfoCard, PdvTouchShortcutAction } from '../components/pdv/PdvTouchKeyboard';

export interface PdvTouchKeyboardRemoteState {
  primaryMessage: string;
  secondaryMessage: string;
  currentCode: string;
  infoCards: PdvTouchInfoCard[];
  disabled: boolean;
}

export interface PdvTouchKeyboardDetachedSessionPayload {
  state: PdvTouchKeyboardRemoteState;
}

export type PdvTouchKeyboardBridgeMessage =
  | { type: 'ready' }
  | { type: 'closed' }
  | { type: 'state'; state: PdvTouchKeyboardRemoteState }
  | { type: 'digit'; fragment: string }
  | { type: 'backspace' }
  | { type: 'clear' }
  | { type: 'confirm' }
  | { type: 'shortcut'; action: PdvTouchShortcutAction };

export function getPdvTouchKeyboardChannelName(sessionKey: string) {
  return `pdv:touch-keyboard:${sessionKey}`;
}
