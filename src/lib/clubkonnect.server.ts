/**
 * ClubKonnect / Nellobyte read-only catalogue adapter.
 * Keep this module server-only. Never import it from a client component.
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
  const response = await fetch(url, { method: "GET", headers: { Accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error(`ClubKonnect catalogue request failed (${response.status}).`);
  const payload: unknown = await response.json();
  if (payload && typeof payload === "object" && "status" in payload) {
    const status = String((payload as JsonRecord).status ?? "");
    if (status && !["success", "ok"].includes(status.toLowerCase()) && status.toUpperCase() !== "ORDER_RECEIVED") {
      throw new Error(`ClubKonnect returned ${status}.`);
    }
  }
  return payload;
}

export async function getClubKonnectCatalog() {
  const [dataNetworks, dataPlans, airtimeNetworks, cableTypes, cablePackages, electricityDiscos, epinDiscounts] =
    await Promise.all([
      getJson("/APIDatabundleNetworkV1.asp"),
      getJson("/APIDatabundlePlansV3.asp"),
      getJson("/APIAirtimeNetworkV2.asp"),
      getJson("/APICableTVTypeV2.asp"),
      getJson("/APICableTVPackagesV2.asp"),
      getJson("/APIElectricityDiscosV1.asp", {}),
      getJson("/APIEPINDiscountV2.asp"),
    ]);
  return { dataNetworks, dataPlans, airtimeNetworks, cableTypes, cablePackages, electricityDiscos, epinDiscounts };
}
