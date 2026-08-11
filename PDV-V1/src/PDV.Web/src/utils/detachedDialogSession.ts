import type { DialogProps } from '@mui/material';

const DETACHED_DIALOG_STORAGE_PREFIX = 'pdv:detached-dialog:';

interface DetachedDialogEnvelope<TPayload> {
  payload: TPayload;
  updatedAt: string;
}

export function writeDetachedDialogSession<TPayload>(payload: TPayload, key?: string) {
  const sessionKey = key ?? createDetachedDialogSessionKey();
  const envelope: DetachedDialogEnvelope<TPayload> = {
    payload,
    updatedAt: new Date().toISOString()
  };

  localStorage.setItem(`${DETACHED_DIALOG_STORAGE_PREFIX}${sessionKey}`, JSON.stringify(envelope));
  return sessionKey;
}

export function readDetachedDialogSession<TPayload>(key: string) {
  const raw = localStorage.getItem(`${DETACHED_DIALOG_STORAGE_PREFIX}${key}`);
  if (!raw) {
    return null;
  }

  try {
    const envelope = JSON.parse(raw) as DetachedDialogEnvelope<TPayload>;
    return envelope.payload ?? null;
  } catch {
    localStorage.removeItem(`${DETACHED_DIALOG_STORAGE_PREFIX}${key}`);
    return null;
  }
}

export function removeDetachedDialogSession(key: string | null | undefined) {
  if (!key) {
    return;
  }

  localStorage.removeItem(`${DETACHED_DIALOG_STORAGE_PREFIX}${key}`);
}

export function openDetachedDialogWindow(path: string, sessionKey: string, maxWidth: DialogProps['maxWidth']) {
  const dimensions = resolveDetachedWindowDimensions(maxWidth);
  const url = new URL(path, window.location.origin);
  url.searchParams.set('detachedWindow', '1');
  url.searchParams.set('detachedSession', sessionKey);
  const position = resolveDetachedWindowPosition(dimensions.width, dimensions.height);

  const features = [
    `width=${dimensions.width}`,
    `height=${dimensions.height}`,
    `left=${position.left}`,
    `top=${position.top}`,
    'resizable=yes',
    'scrollbars=yes'
  ].join(',');

  return window.open(url.toString(), '_blank', features);
}

function createDetachedDialogSessionKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function resolveDetachedWindowDimensions(maxWidth: DialogProps['maxWidth']) {
  const requested = (() => {
    switch (maxWidth) {
      case 'xs':
        return { width: 760, height: 820 };
      case 'sm':
        return { width: 1040, height: 900 };
      case 'md':
        return { width: 1360, height: 960 };
      case 'xl':
        return { width: 1840, height: 1120 };
      case 'lg':
      default:
        return { width: 1660, height: 1040 };
    }
  })();

  const maxAvailableWidth = Math.max(720, (window.screen?.availWidth ?? requested.width) - 48);
  const maxAvailableHeight = Math.max(640, (window.screen?.availHeight ?? requested.height) - 48);

  return {
    width: Math.min(requested.width, maxAvailableWidth),
    height: Math.min(requested.height, maxAvailableHeight)
  };
}

function resolveDetachedWindowPosition(width: number, height: number) {
  const screenLeft = typeof window.screenLeft === 'number' ? window.screenLeft : 0;
  const screenTop = typeof window.screenTop === 'number' ? window.screenTop : 0;
  const outerWidth = typeof window.outerWidth === 'number' ? window.outerWidth : width;
  const outerHeight = typeof window.outerHeight === 'number' ? window.outerHeight : height;

  return {
    left: Math.max(0, screenLeft + Math.round((outerWidth - width) / 2)),
    top: Math.max(0, screenTop + Math.round((outerHeight - height) / 2))
  };
}
