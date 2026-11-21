/**
 * ClubKonnect / Nellobyte server-only catalogue transport.
 * Raw provider data is intended for server-side normalization and must never
 * be returned directly to a browser. Supplier credentials stay in server env.
 */
type JsonRecord = Record<string, unknown>;
const API_ROOT = "https://www.nellobytesystems.com";

function credentials() {
  const userId = process.env.CLUBKONNECT_USER_ID;
  const apiKey = process.env.CLUBKONNECT_API_KEY;
  if (!userId || !apiKey) throw new Error("ClubKonnect API credentials are not configured.");
  return { UserID: userId, APIKey: apiKey };
}

async function getJson(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(path, API_ROOT);
  Object.entries({ ...credentials(), ...params }).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`ClubKonnect catalogue request failed (${response.status}).`);
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object") throw new Error("ClubKonnect returned an invalid catalogue response.");
  if ("status" in payload) {
    const status = String((payload as JsonRecord).status ?? "").trim().toLowerCase();
    if (status && !["success", "ok"].includes(status)) throw new Error(`ClubKonnect returned ${status}.`);
  }
  return payload;
}

export async function getClubKonnectCatalog() {
  const [dataNetworks, dataPlans, airtimeNetworks, cableTypes, cablePackages, epinDiscounts] = await Promise.all([
    getJson("/APIDatabundleNetworkV1.asp"),
    getJson("/APIDatabundlePlansV2.asp"),
    getJson("/APIAirtimeNetworkV2.asp"),
    getJson("/APICableTVTypeV2.asp"),
    getJson("/APICableTVPackagesV2.asp"),
    getJson("/APIEPINDiscountV2.asp"),
  ]);

  // The supplied integration documents electricity discos and meter types as
  // account-specific catalogue data, not a universally available public endpoint.
  const electricityConfig = process.env.CLUBKONNECT_ELECTRICITY_BILLERS_JSON;
  let electricityDiscos: unknown = null;
  if (electricityConfig) {
    try {
      electricityDiscos = JSON.parse(electricityConfig);
    } catch {
      throw new Error("CLUBKONNECT_ELECTRICITY_BILLERS_JSON is not valid JSON.");
    }
  }

  return { dataNetworks, dataPlans, airtimeNetworks, cableTypes, cablePackages, electricityDiscos, epinDiscounts };
}
