export const PAYMENT_BANK_NAMES = [
  "Vietcombank",
  "VietinBank",
  "BIDV",
  "Agribank",
  "Techcombank",
  "MB Bank",
  "ACB",
  "VPBank",
  "Sacombank",
  "TPBank",
  "VIB",
  "HDBank",
  "MSB",
  "SHB",
  "SeABank",
  "OCB",
  "Eximbank",
  "Nam A Bank",
  "LPBank",
  "ABBank",
  "KienlongBank",
  "Bac A Bank",
  "VietABank",
  "VietBank",
  "BVBank",
  "NCB",
  "PVcomBank",
  "SaigonBank",
  "BaoViet Bank",
  "PGBank",
  "OceanBank",
  "GPBank",
  "CBBank",
  "Shinhan Bank",
  "Woori Bank",
  "Hong Leong Bank",
  "HSBC",
  "UOB",
  "Standard Chartered",
  "CIMB",
  "Public Bank Vietnam",
  "ANZ",
  "PingPong",
] as const;

export function normalizeBankNameInput(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function findStandardBankName(value: string) {
  const normalized = normalizeBankNameInput(value);
  return PAYMENT_BANK_NAMES.find((bankName) => bankName.toLowerCase() === normalized.toLowerCase()) ?? null;
}
