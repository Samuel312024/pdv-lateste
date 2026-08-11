import type { FormaPagamento } from '../types';

export interface PaymentMethodMeta {
  value: FormaPagamento;
  label: string;
  description: string;
  acceptsChange: boolean;
}

export const paymentMethods: PaymentMethodMeta[] = [
  {
    value: 'Dinheiro',
    label: 'Dinheiro',
    description: 'Pagamento fisico no caixa. Permite troco.',
    acceptsChange: true
  },
  {
    value: 'Pix',
    label: 'Pix',
    description: 'Transferencia instantanea confirmada no ato da venda.',
    acceptsChange: false
  },
  {
    value: 'CartaoDebito',
    label: 'Cartao de debito',
    description: 'Pagamento no debito, normalmente com autorizacao imediata.',
    acceptsChange: false
  },
  {
    value: 'CartaoCredito',
    label: 'Cartao de credito',
    description: 'Pagamento no credito, inclusive em divisao de valor com outros meios.',
    acceptsChange: false
  },
  {
    value: 'Voucher',
    label: 'Voucher / beneficio',
    description: 'Vale alimentacao, refeicao, convenio ou outro beneficio aceito.',
    acceptsChange: false
  }
];

const paymentMethodMap = Object.fromEntries(paymentMethods.map((item) => [item.value, item])) as Record<FormaPagamento, PaymentMethodMeta>;

export function getPaymentMethodMeta(value: FormaPagamento) {
  return paymentMethodMap[value];
}

export function formatPaymentMethod(value: FormaPagamento) {
  return paymentMethodMap[value]?.label ?? value;
}
