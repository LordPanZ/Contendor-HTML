/* HTML Container — bloqueo de acceso por PIN */
window.CH = window.CH || {};

CH.auth = (function () {
  'use strict';

  const U = CH.util;
  const store = CH.store;

  const DEFAULT_PIN = '9441';
  const K_HASH = 'authHash';
  const K_SALT = 'authSalt';
  const K_REMEMBER = 'authRemember';
  const SESSION_KEY = 'ch:sesion-abierta';
  const REMEMBER_KEY = 'ch:recordar-hasta';
  const REMEMBER_DAYS = 30;
  const LOCKOUT_AFTER = 5;
  const LOCKOUT_MS = 20000;

  let salt = '';
  let failures = 0;
  let blockedUntil = 0;

  const hashPin = (pin) => U.sha256Hex(salt + ':' + String(pin));

  async function init() {
    salt = await store.getKV(K_SALT, '');
    if (!salt) {
      salt = U.uid();
      await store.setKV(K_SALT, salt);
    }
    const current = await store.getKV(K_HASH, '');
    if (!current) await store.setKV(K_HASH, await hashPin(DEFAULT_PIN));
  }

  function sessionOpen() {
    try {
      if (sessionStorage.getItem(SESSION_KEY) === '1') return true;
      const until = Number(localStorage.getItem(REMEMBER_KEY) || 0);
      if (until && Date.now() < until) return true;
      if (until) localStorage.removeItem(REMEMBER_KEY);
    } catch (e) { /* almacenamiento restringido: se pedirá el PIN */ }
    return false;
  }

  function openSession(remember) {
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
      if (remember) localStorage.setItem(REMEMBER_KEY, String(Date.now() + REMEMBER_DAYS * 864e5));
    } catch (e) { /* sin persistencia: solo esta pestaña */ }
  }

  function lock() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(REMEMBER_KEY);
    } catch (e) { /* nada que limpiar */ }
  }

  function blockedFor() {
    const left = blockedUntil - Date.now();
    return left > 0 ? Math.ceil(left / 1000) : 0;
  }

  /** Devuelve { ok, error, waitSeconds } */
  async function unlock(pin, remember) {
    const wait = blockedFor();
    if (wait) return { ok: false, error: 'Demasiados intentos. Espera ' + wait + ' s.', waitSeconds: wait };

    const stored = await store.getKV(K_HASH, '');
    const candidate = await hashPin(pin);
    if (stored && candidate === stored) {
      failures = 0;
      openSession(remember);
      return { ok: true };
    }
    failures++;
    if (failures >= LOCKOUT_AFTER) {
      blockedUntil = Date.now() + LOCKOUT_MS;
      failures = 0;
      return { ok: false, error: 'Demasiados intentos. Espera ' + Math.ceil(LOCKOUT_MS / 1000) + ' s.', waitSeconds: Math.ceil(LOCKOUT_MS / 1000) };
    }
    return { ok: false, error: 'PIN incorrecto.' };
  }

  async function changePin(currentPin, newPin) {
    const stored = await store.getKV(K_HASH, '');
    if ((await hashPin(currentPin)) !== stored) throw new Error('El PIN actual no es correcto.');
    const clean = String(newPin).trim();
    if (clean.length < 4) throw new Error('El nuevo PIN debe tener al menos 4 caracteres.');
    await store.setKV(K_HASH, await hashPin(clean));
    return true;
  }

  async function isDefaultPin() {
    const stored = await store.getKV(K_HASH, '');
    return stored === (await hashPin(DEFAULT_PIN));
  }

  const rememberEnabled = () => store.getKV(K_REMEMBER, false);
  const setRememberEnabled = (v) => store.setKV(K_REMEMBER, !!v);

  return {
    init, unlock, lock, changePin, sessionOpen, isDefaultPin, blockedFor,
    rememberEnabled, setRememberEnabled, DEFAULT_PIN
  };
})();
