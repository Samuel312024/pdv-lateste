import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  type DialogProps,
  type SxProps,
  type Theme
} from '@mui/material';
import { useEffect, type ReactNode } from 'react';
import { openDetachedDialogWindow, removeDetachedDialogSession, writeDetachedDialogSession } from '../../utils/detachedDialogSession';

interface DetachableDialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  fullWidth?: boolean;
  maxWidth?: DialogProps['maxWidth'];
  contentDividers?: boolean;
  contentSx?: SxProps<Theme>;
  titleSx?: SxProps<Theme>;
  actionsSx?: SxProps<Theme>;
  paperSx?: SxProps<Theme>;
  windowTitle?: string;
  disableDetach?: boolean;
  detachedWindow?: boolean;
  detachPath?: string;
  detachPayload?: unknown;
  onDetach?: () => void;
}

export function DetachableDialog({
  open,
  onClose,
  title,
  children,
  actions,
  fullWidth = true,
  maxWidth = 'md',
  contentDividers = false,
  contentSx,
  titleSx,
  actionsSx,
  paperSx,
  windowTitle,
  disableDetach = false,
  detachedWindow = false,
  detachPath,
  detachPayload,
  onDetach
}: DetachableDialogProps) {
  useEffect(() => {
    if (!detachedWindow || !open || !windowTitle) {
      return;
    }

    const previousTitle = document.title;
    document.title = windowTitle;

    return () => {
      document.title = previousTitle;
    };
  }, [detachedWindow, open, windowTitle]);

  function handleDetach() {
    if (disableDetach || !detachPath || typeof detachPayload === 'undefined') {
      return;
    }

    const sessionKey = writeDetachedDialogSession(detachPayload);
    const popup = openDetachedDialogWindow(detachPath, sessionKey, maxWidth);
    if (!popup) {
      removeDetachedDialogSession(sessionKey);
      return;
    }

    popup.focus();
    onDetach?.();
  }

  const headerAction = disableDetach ? null : detachedWindow ? (
    <Button variant="outlined" size="small" onClick={onClose}>
      Fechar janela
    </Button>
  ) : (
    <Button variant="outlined" size="small" onClick={handleDetach} disabled={!detachPath}>
      Abrir em outra janela
    </Button>
  );

  if (!open) {
    return null;
  }

  const resolvedPaperSx = mergeSx(
    {
      width: resolveDialogPaperWidth(maxWidth, fullWidth, detachedWindow),
      maxWidth: 'none',
      minHeight: resolveDialogPaperMinHeight(maxWidth, detachedWindow),
      maxHeight: detachedWindow ? 'calc(100vh - 16px)' : '94dvh',
      height: detachedWindow ? 'calc(100vh - 16px)' : 'auto',
      margin: detachedWindow ? '8px' : { xs: '8px', sm: '16px' },
      borderRadius: detachedWindow ? 3 : 5,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    },
    paperSx
  );

  const resolvedTitleSx = mergeSx(
    {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 2,
      px: { xs: 2, sm: 3.5 },
      py: { xs: 2, sm: 2.5 },
      flexShrink: 0
    },
    titleSx
  );

  const resolvedContentSx = mergeSx(
    {
      px: { xs: 2, sm: 3.5 },
      py: { xs: 2, sm: 2.5 },
      flex: 1,
      overflowY: 'auto',
      overflowX: 'hidden'
    },
    contentSx
  );

  const resolvedActionsSx = mergeSx(
    {
      px: { xs: 2, sm: 3.5 },
      py: { xs: 2, sm: 2.5 },
      flexShrink: 0
    },
    actionsSx
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth={fullWidth}
      maxWidth={false}
      hideBackdrop={detachedWindow}
      PaperProps={{ sx: resolvedPaperSx }}
    >
      <DialogTitle sx={resolvedTitleSx}>
        <Box>{title}</Box>
        {headerAction}
      </DialogTitle>
      <DialogContent dividers={contentDividers} sx={resolvedContentSx}>
        {children}
      </DialogContent>
      {actions ? <DialogActions sx={resolvedActionsSx}>{actions}</DialogActions> : null}
    </Dialog>
  );
}

function resolveDialogPaperWidth(
  maxWidth: DialogProps['maxWidth'],
  fullWidth: boolean,
  detachedWindow: boolean
) {
  if (!fullWidth) {
    return 'auto';
  }

  const desktopWidth = (() => {
    switch (maxWidth) {
      case 'xs':
        return 720;
      case 'sm':
        return 980;
      case 'md':
        return 1240;
      case 'xl':
        return 1760;
      case 'lg':
      default:
        return 1560;
    }
  })();

  return detachedWindow
    ? `min(calc(100vw - 16px), ${desktopWidth}px)`
    : `min(calc(100vw - 32px), ${desktopWidth}px)`;
}

function resolveDialogPaperMinHeight(
  maxWidth: DialogProps['maxWidth'],
  detachedWindow: boolean
) {
  if (detachedWindow) {
    return 'calc(100vh - 16px)';
  }

  switch (maxWidth) {
    case 'xs':
      return 'min(72dvh, 640px)';
    case 'sm':
      return 'min(78dvh, 760px)';
    case 'md':
      return 'min(82dvh, 860px)';
    case 'xl':
      return 'min(90dvh, 1080px)';
    case 'lg':
    default:
      return 'min(88dvh, 980px)';
  }
}

function mergeSx(...styles: Array<SxProps<Theme> | undefined>): SxProps<Theme> {
  return styles.filter((style): style is SxProps<Theme> => style != null) as SxProps<Theme>;
}
