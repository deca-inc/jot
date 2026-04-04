/**
 * Web shim for @react-native-community/datetimepicker
 *
 * Uses HTML <input type="date"> and <input type="time"> elements.
 */

import React, { useCallback } from "react";

export interface DateTimePickerEvent {
  type: "set" | "dismissed";
  nativeEvent: {
    timestamp: number;
    utcOffset: number;
  };
}

interface DateTimePickerProps {
  value: Date;
  mode?: "date" | "time" | "datetime";
  display?: "default" | "spinner" | "calendar" | "clock" | "compact";
  onChange?: (event: DateTimePickerEvent, date?: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  accentColor?: string;
  themeVariant?: "dark" | "light";
  style?: React.CSSProperties;
}

function formatDateValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatTimeValue(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function DateTimePicker({
  value,
  mode = "date",
  onChange,
  minimumDate,
  maximumDate,
  style,
}: DateTimePickerProps) {
  const inputType = mode === "time" ? "time" : "date";

  const inputValue =
    mode === "time" ? formatTimeValue(value) : formatDateValue(value);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      let newDate: Date;

      if (mode === "time") {
        const [hours, minutes] = raw.split(":").map(Number);
        newDate = new Date(value);
        newDate.setHours(hours, minutes);
      } else {
        const [year, month, day] = raw.split("-").map(Number);
        newDate = new Date(value);
        newDate.setFullYear(year, month - 1, day);
      }

      const event: DateTimePickerEvent = {
        type: "set",
        nativeEvent: {
          timestamp: newDate.getTime(),
          utcOffset: newDate.getTimezoneOffset() * -60,
        },
      };

      onChange?.(event, newDate);
    },
    [onChange, value, mode],
  );

  return React.createElement("input", {
    type: inputType,
    value: inputValue,
    onChange: handleChange,
    min: minimumDate ? formatDateValue(minimumDate) : undefined,
    max: maximumDate ? formatDateValue(maximumDate) : undefined,
    style: {
      fontSize: 16,
      padding: "8px 12px",
      borderRadius: 8,
      border: "1px solid rgba(255,255,255,0.2)",
      background: "rgba(255,255,255,0.08)",
      color: "inherit",
      ...(style as Record<string, unknown>),
    },
  });
}

export default DateTimePicker;
export { DateTimePicker };
