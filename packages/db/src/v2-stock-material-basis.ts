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
  const complete = product !== null && packSize !== null;
  const same = complete && prior?.since != null && product === prior.product && prior.packSize !== null &&
    packSize.unit === prior.packSize.unit && packQuantity(packSize.quantity) === packQuantity(prior.packSize.quantity);
  // The existing full edit form echoes the old stock figure. A material change does not confirm that
  // those packs fit the new product. An explicit stock edit or a fresh quantity can confirm it later.
  const entered = changes.setAsidePacks;
  const stockOnly = entered !== undefined && Object.keys(changes).length === 1;
  let confirmedSetAside = "0";
  if (complete && !prior) confirmedSetAside = entered ?? "0";
  if (same) {
    confirmedSetAside = prior.confirmedSetAside;
    if (entered !== undefined && (stockOnly || entered !== prior.lastEnteredSetAside)) confirmedSetAside = entered;
  }
  return { product, packSize, since: complete ? (same ? prior.since : revision) : null,
    confirmedSetAside, lastEnteredSetAside: entered ?? prior?.lastEnteredSetAside ?? "0" };
}
