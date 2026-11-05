/**
 * Client-side mirror of the signed-in buyer's saved items (products or suppliers). Each store is loaded once per
 * page from its list endpoint and only ever changes after the server confirms a save or removal, so what a heart
 * shows is what is stored.
 */
interface WishlistState {
  loaded: boolean;
  authenticated: boolean;
  keys: ReadonlySet<string>;
}

export type ToggleResult = "saved" | "removed" | "auth" | "error";

interface StoreConfig {
  /** GET (list) and POST (save) endpoint. */
  listUrl: string;
  /** Property of the list response that holds the saved keys, and of the POST body that names one. */
  listField: string;
  bodyField: string;
}

function createWishlistStore({ listUrl, listField, bodyField }: StoreConfig) {
  const INITIAL: WishlistState = { loaded: false, authenticated: false, keys: new Set() };
  let state: WishlistState = INITIAL;
  let loading: Promise<void> | undefined;
  const listeners = new Set<() => void>();

  function set(next: WishlistState) {
    state = next;
    listeners.forEach((listener) => listener());
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => state,
    getServerSnapshot: () => INITIAL,

    load(): Promise<void> {
      loading ??= fetch(listUrl, { cache: "no-store" })
        .then((response) => response.json())
        .then((data) => set({ loaded: true, authenticated: Boolean(data.authenticated), keys: new Set<string>(data[listField] ?? []) }))
        .catch(() => {
          // Leave the store unloaded so the next mount can try again.
          loading = undefined;
        });
      return loading;
    },

    async toggle(id: string): Promise<ToggleResult> {
      const saved = state.keys.has(id);
      try {
        const response = saved
          ? await fetch(`${listUrl}/${encodeURIComponent(id)}`, { method: "DELETE" })
          : await fetch(listUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [bodyField]: id }) });
        if (response.status === 401) return "auth";
        if (!response.ok) return "error";
        const keys = new Set(state.keys);
        if (saved) keys.delete(id);
        else keys.add(id);
        set({ ...state, authenticated: true, keys });
        return saved ? "removed" : "saved";
      } catch {
        return "error";
      }
    },
  };
}

export type WishlistStore = ReturnType<typeof createWishlistStore>;

export const productWishlist = createWishlistStore({ listUrl: "/api/buyer/wishlist", listField: "productIds", bodyField: "productId" });
export const supplierWishlist = createWishlistStore({ listUrl: "/api/buyer/wishlist/suppliers", listField: "supplierIds", bodyField: "supplierId" });

/** The buyer's product comparison list (Compare Products): same mechanics, own endpoint (buyer accounts only, at most 4 products). */
export const productCompare = createWishlistStore({ listUrl: "/api/buyer/compare", listField: "productIds", bodyField: "productId" });

// The product heart keeps its original function-style API.
export const subscribe = productWishlist.subscribe;
export const getSnapshot = productWishlist.getSnapshot;
export const getServerSnapshot = productWishlist.getServerSnapshot;
export const loadWishlist = productWishlist.load;
export const toggleWishlist = productWishlist.toggle;
