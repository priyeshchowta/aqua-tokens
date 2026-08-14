export function formatTokens(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    return trimDecimal(n / 1_000_000) + "M";
  }
  if (abs >= 10_000) {
    return trimDecimal(n / 1_000) + "K";
  }
  return Math.round(n).toLocaleString("en-US");
}

function trimDecimal(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatVolumeRange(lowMl: number, highMl: number): string {
  const useLiters = highMl >= 1000;
  if (useLiters) {
    return `${formatVolumeQty(lowMl / 1000)}–${formatVolumeQty(highMl / 1000)} L`;
  }
  return `${formatVolumeQty(lowMl)}–${formatVolumeQty(highMl)} mL`;
}

function formatVolumeQty(n: number): string {
  if (n >= 100) return String(Math.round(n));
  if (n >= 10) return trimDecimal(n);
  if (n >= 1) return (Math.round(n * 10) / 10).toString();
  if (n <= 0) return "0";
  const rounded = Math.round(n * 100) / 100;
  return String(rounded);
}

export function pad(value: string, width: number): string {
  if (value.length >= width) return value;
  return value + " ".repeat(width - value.length);
}

export function padLeft(value: string, width: number): string {
  if (value.length >= width) return value;
  return " ".repeat(width - value.length) + value;
}
