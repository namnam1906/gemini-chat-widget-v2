// lib/cache.js

const store = new Map();

/**
 * get cache
 */
export function getCache(key) {
    const item = store.get(key);

    if (!item) return null;

    // หมดอายุแล้ว
    if (Date.now() > item.expireAt) {
        store.delete(key);
        return null;
    }

    return item.value;
}

/**
 * set cache
 */
export function setCache(key, value, ttlMs = 5 * 60 * 1000) {
    store.set(key, {
        value,
        expireAt: Date.now() + ttlMs
    });
}

/**
 * clear cache (optional)
 */
export function clearCache(key) {
    if (key) {
        store.delete(key);
    } else {
        store.clear();
    }
}