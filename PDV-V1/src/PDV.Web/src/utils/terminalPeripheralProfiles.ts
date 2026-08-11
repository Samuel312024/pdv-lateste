import type {
  TerminalPerfilImpressora,
  TerminalPerfilScanner,
  TerminalPerfilTeclado
} from '../types';

export const terminalPrinterOptions: Array<{ value: TerminalPerfilImpressora; label: string; description: string }> = [
  {
    value: 'NAVEGADOR_PADRAO',
    label: 'Navegador / Windows',
    description: 'Usa a impressora padrao da estacao e abre a caixa de impressao comum.'
  },
  {
    value: 'TERMICA_80MM',
    label: 'Termica 80mm',
    description: 'Cupom estreito de 80 mm para impressora termica de caixa.'
  },
  {
    value: 'TERMICA_58MM',
    label: 'Termica 58mm',
    description: 'Cupom ultra compacto de 58 mm para mini impressoras.'
  }
];

export const terminalScannerOptions: Array<{ value: TerminalPerfilScanner; label: string; description: string }> = [
  {
    value: 'TECLADO_USB',
    label: 'Leitor USB/Bluetooth',
    description: 'Scanner comum em modo teclado, ideal para frente de caixa.'
  },
  {
    value: 'CAMERA_CELULAR',
    label: 'Camera / celular',
    description: 'Leitura principal pela camera local ou pelo scanner remoto no celular.'
  },
  {
    value: 'HIBRIDO',
    label: 'Hibrido',
    description: 'Aceita leitor comum e tambem camera/celular no mesmo terminal.'
  }
];

export const terminalKeyboardOptions: Array<{ value: TerminalPerfilTeclado; label: string; description: string }> = [
  {
    value: 'PADRAO_PDV',
    label: 'Teclado padrao PDV',
    description: 'Ativa atalhos de caixa para teclado programavel / teclado de operador.'
  },
  {
    value: 'ABNT2',
    label: 'Teclado ABNT2',
    description: 'Uso comum de escritorio, sem atalhos dedicados do teclado PDV.'
  },
  {
    value: 'TOUCH',
    label: 'Touch / misto',
    description: 'Priorizacao do teclado touch na tela com apoio de teclado fisico.'
  }
];

export function getTerminalPrinterLabel(value: string | null | undefined) {
  return terminalPrinterOptions.find((item) => item.value === value)?.label ?? value ?? '-';
}

export function getTerminalScannerLabel(value: string | null | undefined) {
  return terminalScannerOptions.find((item) => item.value === value)?.label ?? value ?? '-';
}

export function getTerminalKeyboardLabel(value: string | null | undefined) {
  return terminalKeyboardOptions.find((item) => item.value === value)?.label ?? value ?? '-';
}

export function resolveReceiptPaperWidth(value: string | null | undefined) {
  return value === 'TERMICA_58MM' ? '58mm' : '80mm';
}
