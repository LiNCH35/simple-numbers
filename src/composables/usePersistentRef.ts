import { ref, watch, type Ref } from 'vue';

function readStored<T>(storageKey: string): T | null {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export function usePersistentRef<T>(key: string, defaultValue: T): Ref<T> {
  const storageKey = `simple-numbers:${key}`;
  const stored = readStored<T>(storageKey);
  const value = ref(stored !== null ? stored : defaultValue) as Ref<T>;

  watch(value, (next) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }, { deep: true });

  return value;
}
