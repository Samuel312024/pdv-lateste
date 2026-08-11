import { TextField, type TextFieldProps } from '@mui/material';

interface MoneyInputProps extends Omit<TextFieldProps, 'value' | 'onChange'> {
  value: number;
  onChange: (value: number) => void;
}

export function MoneyInput({ value, onChange, ...props }: MoneyInputProps) {
  return (
    <TextField
      {...props}
      type="number"
      value={Number.isFinite(value) ? value : 0}
      onChange={(event) => onChange(parseMoneyInput(event.target.value))}
      inputProps={{ min: 0, step: '0.01' }}
    />
  );
}

function parseMoneyInput(rawValue: string) {
  const normalized = rawValue.trim();
  if (!normalized) {
    return 0;
  }

  const commaDecimal = normalized.includes(',') && !normalized.includes('.');
  const safeValue = commaDecimal
    ? normalized.replace(',', '.')
    : normalized.replace(/\s+/g, '');

  const parsed = Number(safeValue);
  return Number.isFinite(parsed) ? roundMoneyValue(parsed) : 0;
}

function roundMoneyValue(value: number) {
  return Number(value.toFixed(2));
}
