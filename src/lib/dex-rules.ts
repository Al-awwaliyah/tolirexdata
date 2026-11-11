export function isValidNigerianPhone(phone: string): boolean {
  return /^0\d{10}$/.test(phone);
}

export function formatNaira(amount: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}