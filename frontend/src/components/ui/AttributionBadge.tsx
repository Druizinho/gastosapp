import React from 'react';
import { User, Users, Sparkles } from 'lucide-react';

export interface AttributionBadgeProps {
  name?: string;
  isMe?: boolean;
  role?: string;
  label?: string;
  icon?: 'user' | 'users' | 'sparkles';
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export const AttributionBadge: React.FC<AttributionBadgeProps> = ({
  name,
  isMe = false,
  role,
  label,
  icon,
  className = '',
  style,
  children
}) => {
  const isSelf = isMe || role === 'self';
  const isShared = role === 'shared' || icon === 'users';

  let variantClass = 'attribution-badge--partner';
  if (isSelf) {
    variantClass = 'attribution-badge--self';
  } else if (isShared) {
    variantClass = 'attribution-badge--shared';
  }

  const renderIcon = () => {
    const iconSize = 11;
    if (icon === 'sparkles') {
      return <Sparkles size={iconSize} aria-hidden="true" />;
    }
    if (icon === 'users' || (!icon && isShared)) {
      return <Users size={iconSize} aria-hidden="true" />;
    }
    return <User size={iconSize} aria-hidden="true" />;
  };

  const displayText = children ?? (label || name || (isSelf ? 'Tú' : role || ''));

  return (
    <span
      className={`attribution-badge ${variantClass} ${className}`.trim()}
      style={style}
    >
      {renderIcon()}
      {displayText && <span>{displayText}</span>}
    </span>
  );
};

export default AttributionBadge;
