import React, { createContext, useContext, useState, useEffect } from 'react';
import type { MainCurrencyPreference } from '../types';

export interface CurrencyPreferenceContextValue {
  mainCurrency: MainCurrencyPreference;
  setMainCurrency: (c: MainCurrencyPreference) => void;
}

const STORAGE_KEY = 'gastosapp_main_currency';

const CurrencyPreferenceContext = createContext<CurrencyPreferenceContextValue | undefined>(undefined);

const VALID_CURRENCIES: MainCurrencyPreference[] = ['USD', 'BS', 'EUR', 'USDT'];

export const CurrencyPreferenceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mainCurrency, setMainCurrencyState] = useState<MainCurrencyPreference>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && VALID_CURRENCIES.includes(saved as MainCurrencyPreference)) {
        return saved as MainCurrencyPreference;
      }
    } catch {
      // ignore
    }
    return 'USD';
  });

  const setMainCurrency = (c: MainCurrencyPreference) => {
    if (!VALID_CURRENCIES.includes(c)) return;
    setMainCurrencyState(c);
    try {
      localStorage.setItem(STORAGE_KEY, c);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue && VALID_CURRENCIES.includes(e.newValue as MainCurrencyPreference)) {
        setMainCurrencyState(e.newValue as MainCurrencyPreference);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return (
    <CurrencyPreferenceContext.Provider value={{ mainCurrency, setMainCurrency }}>
      {children}
    </CurrencyPreferenceContext.Provider>
  );
};

export function useCurrencyPreference(): CurrencyPreferenceContextValue {
  const context = useContext(CurrencyPreferenceContext);
  if (!context) {
    throw new Error('useCurrencyPreference must be used within a CurrencyPreferenceProvider');
  }
  return context;
}
