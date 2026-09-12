import React, { useCallback, useEffect, useRef, useState } from 'react';

interface AmountRangeFilterProps {
  min: number;
  max: number;
  minVal: number;
  maxVal: number;
  onChange: (min: number, max: number) => void;
}

const AmountRangeFilter: React.FC<AmountRangeFilterProps> = ({ min, max, minVal, maxVal, onChange }) => {
  const [minValLocal, setMinValLocal] = useState(minVal);
  const [maxValLocal, setMaxValLocal] = useState(maxVal);
  const minValRef = useRef(minVal);
  const maxValRef = useRef(maxVal);
  const range = useRef<HTMLDivElement>(null);

  // Convert to percentage
  const getPercent = useCallback(
    (value: number) => Math.round(((value - min) / (max - min)) * 100),
    [min, max]
  );

  // Sync external props to local state if they change externally (e.g. initial load)
  useEffect(() => {
    setMinValLocal(minVal);
    setMaxValLocal(maxVal);
    minValRef.current = minVal;
    maxValRef.current = maxVal;
  }, [minVal, maxVal]);

  // Set width of the range to decrease from the left side
  useEffect(() => {
    const minPercent = getPercent(minValLocal);
    const maxPercent = getPercent(maxValRef.current);

    if (range.current) {
      range.current.style.left = `${minPercent}%`;
      range.current.style.width = `${maxPercent - minPercent}%`;
    }
  }, [minValLocal, getPercent]);

  // Set width of the range to decrease from the right side
  useEffect(() => {
    const minPercent = getPercent(minValRef.current);
    const maxPercent = getPercent(maxValLocal);

    if (range.current) {
      range.current.style.width = `${maxPercent - minPercent}%`;
    }
  }, [maxValLocal, getPercent]);

  const handleMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Math.min(Number(e.target.value), maxValLocal - 1);
    setMinValLocal(value);
    minValRef.current = value;
  };

  const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Math.max(Number(e.target.value), minValLocal + 1);
    setMaxValLocal(value);
    maxValRef.current = value;
  };

  const handleMouseUp = () => {
    onChange(minValLocal, maxValLocal);
  };

  const handleTouchEnd = () => {
    onChange(minValLocal, maxValLocal);
  };

  if (min >= max) {
    return null; // Not enough range to filter
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>Rango de Monto (USD)</span>
        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          ${Math.round(minValLocal)} — ${Math.round(maxValLocal)}{maxValLocal >= max ? '+' : ''}
        </span>
      </div>
      
      <div className="range-slider-container">
        <input
          type="range"
          min={min}
          max={max}
          value={minValLocal}
          onChange={handleMinChange}
          onMouseUp={handleMouseUp}
          onTouchEnd={handleTouchEnd}
          className="range-slider__thumb range-slider__thumb--left"
          style={{ zIndex: minValLocal > max - 100 ? 5 : 3 }}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={maxValLocal}
          onChange={handleMaxChange}
          onMouseUp={handleMouseUp}
          onTouchEnd={handleTouchEnd}
          className="range-slider__thumb range-slider__thumb--right"
        />
        
        <div className="range-slider__track-container">
          <div className="range-slider__track" />
          <div ref={range} className="range-slider__range" />
        </div>
      </div>
    </div>
  );
};

export default AmountRangeFilter;
