import { useCallback, useSyncExternalStore } from "react";

/** localStorage key for Nickname de Sarge display preference. */
export const STREET_NAMES_STORAGE_KEY = "winseeking:street-names";
export const STREET_NAMES_EVENT = "street-names-pref-changed";

function readStreetNamesPref(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STREET_NAMES_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeStreetNamesPref(enabled: boolean) {
  try {
    window.localStorage.setItem(STREET_NAMES_STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
  window.dispatchEvent(new Event(STREET_NAMES_EVENT));
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener(STREET_NAMES_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(STREET_NAMES_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

/** Whether Nickname de Sarge (Sarge nicknames) is enabled for golfer labels. */
export function useStreetNamesPref(): [boolean, (next: boolean) => void] {
  const enabled = useSyncExternalStore(subscribe, readStreetNamesPref, () => false);
  const setEnabled = useCallback((next: boolean) => {
    writeStreetNamesPref(next);
  }, []);
  return [enabled, setEnabled];
}

/** One-shot read for non-hook contexts (rare). */
export function getStreetNamesPref(): boolean {
  return readStreetNamesPref();
}
