import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { formatCurrencyBRL } from './AdminUtils';

const STORAGE_KEY = 'renovo_admin_hide_money';

export const MASKED_CURRENCY_LABEL = 'R$ •••••';

export const maskCurrencyValue = (value: number, hideMoney: boolean): string =>
  hideMoney ? MASKED_CURRENCY_LABEL : formatCurrencyBRL(value);

export const maskMoneyTextValue = (text: string | null | undefined, hideMoney: boolean): string => {
  if (!text) return '';
  if (!hideMoney) return text;
  if (/r\$/i.test(text)) {
    return text.replace(/R\$\s*-?[\d.,]+/gi, MASKED_CURRENCY_LABEL);
  }
  if (/^\s*-?[\d.,]+\s*$/.test(text)) {
    return MASKED_CURRENCY_LABEL;
  }
  return text;
};

type MoneyPrivacyContextValue = {
  hideMoney: boolean;
  setHideMoney: (next: boolean) => void;
  toggleHideMoney: () => void;
  maskCurrency: (value: number) => string;
  maskMoneyText: (text: string | null | undefined) => string;
};

const MoneyPrivacyContext = createContext<MoneyPrivacyContextValue>({
  hideMoney: false,
  setHideMoney: () => {},
  toggleHideMoney: () => {},
  maskCurrency: (value: number) => formatCurrencyBRL(value),
  maskMoneyText: (text) => text || '',
});

const readInitialPreference = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

export function MoneyPrivacyProvider({ children }: { children: ReactNode }) {
  const [hideMoney, setHideMoneyState] = useState<boolean>(() => readInitialPreference());

  const setHideMoney = useCallback((next: boolean) => {
    setHideMoneyState(next);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        // ignore storage errors
      }
    }
  }, []);

  const toggleHideMoney = useCallback(() => {
    setHideMoney(!hideMoney);
  }, [hideMoney, setHideMoney]);

  const maskCurrency = useCallback(
    (value: number) => maskCurrencyValue(value, hideMoney),
    [hideMoney],
  );

  const maskMoneyText = useCallback(
    (text: string | null | undefined) => maskMoneyTextValue(text, hideMoney),
    [hideMoney],
  );

  const value = useMemo<MoneyPrivacyContextValue>(
    () => ({
      hideMoney,
      setHideMoney,
      toggleHideMoney,
      maskCurrency,
      maskMoneyText,
    }),
    [hideMoney, maskCurrency, maskMoneyText, setHideMoney, toggleHideMoney],
  );

  return (
    <MoneyPrivacyContext.Provider value={value}>
      {children}
    </MoneyPrivacyContext.Provider>
  );
}

export const useMoneyPrivacy = (): MoneyPrivacyContextValue => useContext(MoneyPrivacyContext);

export function MoneyEyeButton({
  variant = 'default',
  className = '',
  showLabel = true,
}: {
  variant?: 'default' | 'compact' | 'sidebar' | 'icon';
  className?: string;
  showLabel?: boolean;
}) {
  const { hideMoney, toggleHideMoney } = useMoneyPrivacy();
  const label = hideMoney ? 'Mostrar valores' : 'Ocultar valores';
  const ariaLabel = hideMoney ? 'Mostrar valores financeiros' : 'Ocultar valores financeiros';
  const Icon = hideMoney ? EyeOff : Eye;

  const variantClass = variant === 'sidebar'
    ? 'admin-sidebar-btn admin-sidebar-privacy-btn'
    : variant === 'icon'
      ? 'admin-money-eye-btn is-icon'
      : variant === 'compact'
        ? 'admin-money-eye-btn is-compact'
        : 'admin-money-eye-btn';

  return (
    <button
      type="button"
      onClick={toggleHideMoney}
      className={`${variantClass}${hideMoney ? ' is-hidden' : ''}${className ? ` ${className}` : ''}`}
      aria-pressed={hideMoney}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      {showLabel && variant !== 'icon' && <span>{label}</span>}
    </button>
  );
}
