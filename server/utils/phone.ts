export const normalizeWhatsappPhone = (input: string): string => {
  const digits = input.replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('55') && digits.length >= 12) {
    return digits;
  }

  if (digits.length === 11 || digits.length === 10) {
    return `55${digits}`;
  }

  // Números internacionais com código de país explícito (>= 12 dígitos)
  if (digits.length >= 12) {
    return digits;
  }

  // Menos de 10 dígitos = inválido
  return '';
};

export const normalizeWhatsappPhoneWithPlus = (input: string): string => {
  const normalized = normalizeWhatsappPhone(input);
  if (!normalized) return '';
  return `+${normalized}`;
};

export const whatsappJidToPhone = (jid: string): string => {
  const localPart = (jid.split('@')[0] || '').split(':')[0] || '';
  return normalizeWhatsappPhone(localPart);
};
