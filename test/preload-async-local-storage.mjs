import { AsyncLocalStorage } from "node:async_hooks";

// Next's server sets this in node-environment-baseline.js before request APIs load.
// Tests import those APIs outside the server, so install it first.
globalThis.AsyncLocalStorage = AsyncLocalStorage;
