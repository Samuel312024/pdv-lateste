import { useEffect, useRef } from 'react';
import type { ScannerCodigoEscaneadoEvento } from '../types';
import { useScannerSession } from '../contexts/ScannerSessionContext';

interface UseScannerOptions {
  enabled?: boolean;
  duplicateSuppressionMs?: number;
}

export function useScanner(
  onCode: (event: ScannerCodigoEscaneadoEvento) => void | Promise<void>,
  options?: UseScannerOptions
) {
  const { subscribeToCodes, ...scanner } = useScannerSession();
  const enabled = options?.enabled ?? true;
  const onCodeRef = useRef(onCode);

  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    return subscribeToCodes((event) => {
      void onCodeRef.current(event);
    }, { duplicateSuppressionMs: options?.duplicateSuppressionMs });
  }, [enabled, options?.duplicateSuppressionMs, subscribeToCodes]);

  return scanner;
}
