// Transport entrypoint for the funding-graph signals (fundingRelationship,
// circularFunding, clustering, fanOut, convergentRelayFunding,
// outboundRelationships). They import `callAnkr` from here by name,
// unchanged from telegraph-sentinel, so their own detection logic never
// had to move. Headwater is Monad-only, so unlike telegraph-sentinel's
// version of this file there is no Ankr passthrough branch, every call
// goes straight to monadClient.js's callMonad, translating the Ankr
// method name to the Monad equivalent.

import { callMonad } from './monadClient.js';

const ANKR_TO_MONAD_METHOD = {
  ankr_getTokenTransfers: 'monad_getTokenTransfers',
  ankr_getTransactionsByAddress: 'monad_getTransactionsByAddress',
};

export async function callAnkr(method, params, opts = {}) {
  const monadMethod = ANKR_TO_MONAD_METHOD[method];
  if (!monadMethod) {
    throw new Error(`No Monad equivalent wired for Ankr method: ${method}`);
  }
  return callMonad(monadMethod, params, opts);
}
