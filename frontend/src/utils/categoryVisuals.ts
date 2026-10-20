import React from 'react';
import type { Category } from '../types';
import {
  ShoppingCart, Car, Home, Tv, HeartPulse,
  Shirt, Plane, Lightbulb, Coffee, Smartphone,
  Utensils, Gamepad2, Briefcase, GraduationCap, Gift,
  Package, CreditCard, Monitor, Book, Music, Film,
  Dumbbell, Scissors, Wrench, Smile, Star, Heart,
  Camera, Globe, Map, Key, Umbrella, Truck, Watch,
  Wifi, Zap, Palette, ScissorsSquare, PiggyBank,
  PawPrint, Stethoscope, Ticket, Wine, Receipt
} from 'lucide-react';

export const CATEGORY_COLORS: { label: string; value: string }[] = [
  { label: 'Ámbar', value: '#F59E0B' },
  { label: 'Azul', value: '#3B82F6' },
  { label: 'Morado', value: '#8B5CF6' },
  { label: 'Cian', value: '#06B6D4' },
  { label: 'Rojo', value: '#EF4444' },
  { label: 'Rosa', value: '#EC4899' },
  { label: 'Esmeralda', value: '#10B981' },
  { label: 'Índigo', value: '#6366F1' },
  { label: 'Turquesa', value: '#14B8A6' },
  { label: 'Naranja', value: '#F97316' },
  { label: 'Verde', value: '#22C55E' },
  { label: 'Pizarra', value: '#64748B' },
];

export const ICON_MAP: Record<string, React.FC<any>> = {
  ShoppingCart, Car, Home, Tv, HeartPulse,
  Shirt, Plane, Lightbulb, Coffee, Smartphone,
  Utensils, Gamepad2, Briefcase, GraduationCap, Gift,
  CreditCard, Monitor, Book, Music, Film,
  Dumbbell, Scissors, Wrench, Smile, Star, Heart,
  Camera, Globe, Map, Key, Umbrella, Truck, Watch,
  Wifi, Zap, Palette, ScissorsSquare, PiggyBank,
  PawPrint, Stethoscope, Ticket, Wine, Receipt, Package
};

export const DEFAULT_ICONS = Object.keys(ICON_MAP);

const NAME_TO_ICON: Record<string, string> = {
  'alimentación': 'Utensils',
  'alimentacion': 'Utensils',
  'comida': 'Utensils',
  'food': 'Utensils',
  'transporte': 'Car',
  'transport': 'Car',
  'gasolina': 'Car',
  'vivienda': 'Home',
  'casa': 'Home',
  'bills': 'Home',
  'hogar': 'Home',
  'servicios': 'Zap',
  'luz': 'Zap',
  'electricidad': 'Zap',
  'agua': 'Zap',
  'salud': 'HeartPulse',
  'médico': 'HeartPulse',
  'medicina': 'HeartPulse',
  'farmacia': 'HeartPulse',
  'ocio': 'Tv',
  'entretenimiento': 'Tv',
  'entertainment': 'Tv',
  'compras': 'ShoppingCart',
  'shopping': 'ShoppingCart',
  'mercado': 'ShoppingCart',
  'supermercado': 'ShoppingCart',
  'educación': 'GraduationCap',
  'educacion': 'GraduationCap',
  'estudios': 'GraduationCap',
  'colegio': 'GraduationCap',
  'universidad': 'GraduationCap',
  'gastos fijos': 'Receipt',
  'gasto fijo': 'Receipt',
  'deudas': 'CreditCard',
  'deuda': 'CreditCard',
  'préstamo': 'CreditCard',
  'prestamo': 'CreditCard',
  'ahorro': 'PiggyBank',
  'ahorros': 'PiggyBank',
  'sin categoría': 'Package',
  'sin categoria': 'Package',
  'other': 'Package',
};

const NAME_TO_COLOR: Record<string, string> = {
  'alimentación': '#F59E0B',
  'alimentacion': '#F59E0B',
  'comida': '#F59E0B',
  'food': '#F59E0B',
  'transporte': '#3B82F6',
  'transport': '#3B82F6',
  'gasolina': '#3B82F6',
  'vivienda': '#8B5CF6',
  'casa': '#8B5CF6',
  'bills': '#8B5CF6',
  'hogar': '#8B5CF6',
  'servicios': '#06B6D4',
  'luz': '#06B6D4',
  'electricidad': '#06B6D4',
  'salud': '#EF4444',
  'médico': '#EF4444',
  'medicina': '#EF4444',
  'ocio': '#EC4899',
  'entretenimiento': '#EC4899',
  'entertainment': '#EC4899',
  'compras': '#10B981',
  'shopping': '#10B981',
  'mercado': '#10B981',
  'educación': '#6366F1',
  'educacion': '#6366F1',
  'gastos fijos': '#14B8A6',
  'gasto fijo': '#14B8A6',
  'deudas': '#F97316',
  'deuda': '#F97316',
  'préstamo': '#F97316',
  'prestamo': '#F97316',
  'ahorro': '#22C55E',
  'ahorros': '#22C55E',
  'sin categoría': '#64748B',
  'sin categoria': '#64748B',
};

export function getDefaultIconForName(name?: string): string {
  if (!name) return 'Package';
  const clean = name.trim().toLowerCase();
  return NAME_TO_ICON[clean] || 'Package';
}

export function getDefaultColorForName(name?: string): string {
  if (!name) return '#6366F1';
  const clean = name.trim().toLowerCase();
  return NAME_TO_COLOR[clean] || '#6366F1';
}

export interface CategoryVisuals {
  IconComponent: React.FC<any>;
  iconName: string;
  hexColor: string;
}

/**
 * Resolves icon component, icon name, and hex color for a category.
 * Fully backward-compatible with legacy categories where `color` held an icon name and `icon` was null.
 */
export function resolveCategoryVisuals(cat?: Category | null, fallbackName?: string): CategoryVisuals {
  const isColorHex = typeof cat?.color === 'string' && cat.color.trim().startsWith('#');

  // 1. Resolve Icon Name
  let iconName = 'Package';
  if (cat?.icon && ICON_MAP[cat.icon]) {
    iconName = cat.icon;
  } else if (!isColorHex && cat?.color && ICON_MAP[cat.color]) {
    // Backward compatibility: color holds the legacy icon name
    iconName = cat.color;
  } else if (cat?.name) {
    iconName = getDefaultIconForName(cat.name);
  } else if (fallbackName) {
    iconName = getDefaultIconForName(fallbackName);
  }

  // 2. Resolve Hex Color
  let hexColor = '#6366F1';
  if (isColorHex && cat?.color) {
    hexColor = cat.color.trim();
  } else if (cat?.name) {
    hexColor = getDefaultColorForName(cat.name);
  } else if (fallbackName) {
    hexColor = getDefaultColorForName(fallbackName);
  }

  const IconComponent = ICON_MAP[iconName] || Package;

  return {
    IconComponent,
    iconName,
    hexColor,
  };
}
