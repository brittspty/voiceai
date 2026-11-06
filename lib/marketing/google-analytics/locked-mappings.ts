/**
 * Locked ads@specificityinc.com property list.
 * Used by the mapping helper and tests only.
 * This is not a migration and it does not write client rows.
 *
 * Not included: Angelo Marketing and Capital Financial USA (their own logins later),
 * Visions (no ads@ property), Precision Akron, babyPlaque, The Perfect Franchise, and Celina.
 * Forty Two is FortyTWO Event Pros 361580563, not www.fortytwo4u.com 355340857.
 * Specificity is Specificity - GA4 377915570, not older Specificity Inc 259530011.
 * Mold Medics is moldmedicsofcentralohio.com 546709099 only.
 */

export type LockedAnalyticsMapping = {
  client: string;
  property: string;
  propertyId: string;
  /** Empty uses the primary ads@ connection. */
  connectionName: "";
};

export const LOCKED_ANALYTICS_MAPPINGS: readonly LockedAnalyticsMapping[] = [
  { client: "Be Found AI", property: "BeFoundAI", propertyId: "553292453", connectionName: "" },
  { client: "Benton Dental", property: "Mint Dental Team - New Domain", propertyId: "450569307", connectionName: "" },
  { client: "Buckeye Horizon", property: "Buckeye Horizon - GA4", propertyId: "375861793", connectionName: "" },
  { client: "Burnett Pools", property: "Burnett Pools & Spas - GA4", propertyId: "375893779", connectionName: "" },
  { client: "Collegiate Racing Series", property: "drivecrs.com", propertyId: "484628915", connectionName: "" },
  { client: "Forty Two", property: "FortyTWO Event Pros - GA4", propertyId: "361580563", connectionName: "" },
  { client: "Gearheads", property: "Gearheads Ohio", propertyId: "354866181", connectionName: "" },
  { client: "Grizzly Garage Doors", property: "Grizzly Garage Door Service GA4", propertyId: "440565069", connectionName: "" },
  { client: "HomeStead RV", property: "HRV Website - GA4", propertyId: "322067109", connectionName: "" },
  { client: "Kohl Heating Services", property: "Kohl Heating and Air - GA4", propertyId: "379729044", connectionName: "" },
  { client: "Mold Medics", property: "moldmedicsofcentralohio.com", propertyId: "546709099", connectionName: "" },
  { client: "Pinball Expo", property: "Pinball Expo - GA4", propertyId: "371314458", connectionName: "" },
  { client: "Pinnacle Allergy", property: "Pinnacle Allergy - Shopify", propertyId: "443418215", connectionName: "" },
  { client: "Precision Garage Doors Nashville", property: "Precision Nashville - GA4", propertyId: "381444836", connectionName: "" },
  { client: "Precision Garage Doors Pittsburgh", property: "Precision Pittsburgh - GA4", propertyId: "381393753", connectionName: "" },
  { client: "Sunshine Movers", property: "Sunshine Movers - GA4", propertyId: "370573400", connectionName: "" },
  { client: "Specificity", property: "Specificity - GA4", propertyId: "377915570", connectionName: "" },
];

export const ANALYTICS_CLIENTS_NOT_MAPPED = [
  "Angelo Marketing",
  "Capital Financial USA",
  "Visions",
  "Precision Akron",
  "babyPlaque",
  "The Perfect Franchise",
  "Celina",
] as const;

/** Properties that must not be attached to the locked ads@ list. */
export const ANALYTICS_PROPERTY_IDS_NOT_INCLUDED = ["355340857", "259530011"] as const;

export function lockedMappingByClient(name: string) {
  const key = name.trim().toLowerCase();
  return LOCKED_ANALYTICS_MAPPINGS.find((row) => row.client.toLowerCase() === key) ?? null;
}

export function lockedMappingByProperty(propertyId: string) {
  const id = propertyId.trim();
  return LOCKED_ANALYTICS_MAPPINGS.find((row) => row.propertyId === id) ?? null;
}
