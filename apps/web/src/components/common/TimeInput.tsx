import React from 'react';
import { Input } from 'antd';

interface Props {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}

const TimeInput: React.FC<Props> = ({ value = '', onChange, placeholder = 'ЧЧ:ММ', style }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 4);

    if (raw.length <= 2) {
      onChange?.(raw);
    } else {
      const formatted = `${raw.slice(0, 2)}:${raw.slice(2)}`;
      onChange?.(formatted);
    }
  };

  const handleBlur = () => {
    if (!value) return;
    const digits = value.replace(/\D/g, '');
    if (digits.length < 4) return;

    const hh = parseInt(digits.slice(0, 2), 10);
    const mm = parseInt(digits.slice(2, 4), 10);

    if (hh > 23 || mm > 59) {
      onChange?.('');
    }
  };

  const isValid = () => {
    if (!value) return undefined;
    const digits = value.replace(/\D/g, '');
    if (digits.length < 4) return undefined;
    const hh = parseInt(digits.slice(0, 2), 10);
    const mm = parseInt(digits.slice(2, 4), 10);
    if (hh > 23 || mm > 59) return 'error' as const;
    return undefined;
  };

  return (
    <Input
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      maxLength={5}
      style={{ width: 100, ...style }}
      status={isValid()}
    />
  );
};

export default TimeInput;
