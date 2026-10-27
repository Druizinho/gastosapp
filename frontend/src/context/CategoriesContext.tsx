import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Category } from '../types';
import { getCategories } from '../api';
import { useAuth } from './AuthContext';

interface CategoriesContextType {
  categories: Category[];
  incomeCategories: Category[];
  loading: boolean;
  refreshCategories: () => Promise<Category[]>;
  setCategories: React.Dispatch<React.SetStateAction<Category[]>>;
  setIncomeCategories: React.Dispatch<React.SetStateAction<Category[]>>;
  addCategoryLocally: (category: Category) => void;
}

const CategoriesContext = createContext<CategoriesContextType | undefined>(undefined);

export const CategoriesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { session } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [incomeCategories, setIncomeCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const refreshCategories = useCallback(async (): Promise<Category[]> => {
    if (!session) {
      setCategories([]);
      setIncomeCategories([]);
      return [];
    }
    setLoading(true);
    try {
      const [expenseRes, incomeRes] = await Promise.allSettled([
        getCategories('expense'),
        getCategories('income'),
      ]);
      const expenseData = expenseRes.status === 'fulfilled'
        ? expenseRes.value.filter((c) => !c.kind || c.kind === 'expense')
        : [];
      const incomeData = incomeRes.status === 'fulfilled'
        ? incomeRes.value.filter((c) => c.kind === 'income')
        : [];
      setCategories(expenseData);
      setIncomeCategories(incomeData);
      return expenseData;
    } catch (err) {
      console.error('Error fetching categories in context:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, [session]);

  const addCategoryLocally = useCallback((newCat: Category) => {
    if (newCat.kind === 'income') {
      setIncomeCategories((prev) => {
        if (prev.some((c) => c.id === newCat.id || c.name.toLowerCase() === newCat.name.toLowerCase())) {
          return prev.map((c) => (c.id === newCat.id ? newCat : c));
        }
        return [...prev, newCat];
      });
    } else {
      setCategories((prev) => {
        if (prev.some((c) => c.id === newCat.id || c.name.toLowerCase() === newCat.name.toLowerCase())) {
          return prev.map((c) => (c.id === newCat.id ? newCat : c));
        }
        return [...prev, newCat];
      });
    }
  }, []);

  useEffect(() => {
    if (session) {
      refreshCategories();
    } else {
      setCategories([]);
      setIncomeCategories([]);
    }
  }, [session, refreshCategories]);

  return (
    <CategoriesContext.Provider
      value={{
        categories,
        incomeCategories,
        loading,
        refreshCategories,
        setCategories,
        setIncomeCategories,
        addCategoryLocally,
      }}
    >
      {children}
    </CategoriesContext.Provider>
  );
};

export const useCategories = () => {
  const context = useContext(CategoriesContext);
  if (!context) {
    throw new Error('useCategories must be used within a CategoriesProvider');
  }
  return context;
};
