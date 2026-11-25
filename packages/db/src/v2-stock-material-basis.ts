type Pack = { quantity: string; unit: string };
export type StockMaterialChanges = { product?: string | null; packSize?: Pack | null; setAsidePacks?: string };
type MaterialBasis = { product: string | null; packSize: Pack | null };

export type StockMaterialBasis = MaterialBasis & {
  since: number | null;
  confirmedSetAside: string;
  lastEnteredSetAside: string;
};

function packQuantity(value: string) {
  const [whole, fraction = ""] = value.split(".");
  const decimals = fraction.replace(/0+$/u, "");
  return decimals ? whole + "." + decimals : whole;
}

/** D3 revisions are partial edits. Delivery FKs point to the forecast's zero-based material revision. */
export function nextStockMaterialBasis(prior: StockMaterialBasis | undefined, changes: StockMaterialChanges, revision: number): StockMaterialBasis {
  const product = changes.product === undefined ? prior?.product ?? null : changes.product;
  const packSize = changes.packSize === undefined ? prior?.packSize ?? null : changes.packSize;
  const productChanged = prior?.product != null && prior.product !== product;
  const packChanged = prior?.packSize != null && (packSize === null || prior.packSize.unit !== packSize.unit ||
    packQuantity(prior.packSize.quantity) !== packQuantity(packSize.quantity));
  const replaced = productChanged || packChanged;
  // Filling an unknown product or pack for the first time preserves the builder's entry.
  // Replacing a known part invalidates it, including while a line is still incomplete.
  const entered = changes.setAsidePacks;
  const stockOnly = entered !== undefined && Object.keys(changes).length === 1;
  let confirmedSetAside = replaced ? "0" : prior?.confirmedSetAside ?? "0";
  if (!replaced && entered !== undefined && (stockOnly || entered !== prior?.lastEnteredSetAside)) {
    confirmedSetAside = entered;
  }
  // A receipt may precede the first complete pack. An entirely unidentified line
  // establishes no identity; clearing or replacing a known component starts a new one.
  const since = product === null && packSize === null ? null : replaced ? revision : prior?.since ?? revision;
  return { product, packSize, since,
    confirmedSetAside, lastEnteredSetAside: entered ?? prior?.lastEnteredSetAside ?? "0" };
}
