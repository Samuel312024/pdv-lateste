export type DocumentoTipo = 'CPF' | 'CNPJ' | null;

export function onlyDigits(value: string | null | undefined) {
  return (value ?? '').replace(/\D/g, '');
}

export function detectDocumentType(value: string | null | undefined): DocumentoTipo {
  const digits = onlyDigits(value);

  if (digits.length <= 11) {
    return digits.length > 0 ? 'CPF' : null;
  }

  return 'CNPJ';
}

export function formatCpfCnpj(value: string | null | undefined) {
  const digits = onlyDigits(value);

  if (digits.length <= 11) {
    return digits
      .slice(0, 11)
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }

  return digits
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export function formatPhone(value: string | null | undefined) {
  const digits = onlyDigits(value).slice(0, 11);

  if (digits.length <= 2) {
    return digits;
  }

  if (digits.length <= 10) {
    return digits.replace(/^(\d{2})(\d{0,4})(\d{0,4})$/, (_, ddd, first, second) =>
      second ? `(${ddd}) ${first}-${second}` : `(${ddd}) ${first}`
    );
  }

  return digits.replace(/^(\d{2})(\d{0,5})(\d{0,4})$/, (_, ddd, first, second) =>
    second ? `(${ddd}) ${first}-${second}` : `(${ddd}) ${first}`
  );
}

export function formatCep(value: string | null | undefined) {
  const digits = onlyDigits(value).slice(0, 8);
  return digits.replace(/^(\d{5})(\d{0,3})$/, (_, first, second) => (second ? `${first}-${second}` : first));
}

export function isValidEmail(value: string | null | undefined) {
  if (!value) {
    return true;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isValidCpf(value: string | null | undefined) {
  const digits = onlyDigits(value);

  if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) {
    return false;
  }

  const numbers = digits.split('').map(Number);
  const firstDigit = calculateCpfDigit(numbers, 9, 10);
  const secondDigit = calculateCpfDigit(numbers, 10, 11);

  return numbers[9] === firstDigit && numbers[10] === secondDigit;
}

export function isValidCnpj(value: string | null | undefined) {
  const digits = onlyDigits(value);

  if (digits.length !== 14 || /^(\d)\1+$/.test(digits)) {
    return false;
  }

  const numbers = digits.split('').map(Number);
  const firstWeights = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const secondWeights = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const firstDigit = calculateWeightedDigit(numbers, firstWeights);
  const secondDigit = calculateWeightedDigit(numbers, secondWeights);

  return numbers[12] === firstDigit && numbers[13] === secondDigit;
}

function calculateCpfDigit(numbers: number[], length: number, factor: number) {
  const total = numbers.slice(0, length).reduce((sum, value, index) => sum + value * (factor - index), 0);
  const remainder = total % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

function calculateWeightedDigit(numbers: number[], weights: number[]) {
  const total = weights.reduce((sum, weight, index) => sum + numbers[index] * weight, 0);
  const remainder = total % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}
