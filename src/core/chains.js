// Chain registry, trimmed to the one chain Headwater runs on. Kept as
// its own file (not folded into config.js) because publicChainClient.js
// and contractControlRisk.js/liveSolvencyRisk.js, copied unchanged from
// telegraph-sentinel, import publicRpcUrlsForChain() from here by name.

export const CHAINS = Object.freeze({
  monad: Object.freeze({
    key: 'monad',
    chainId: 143,
    name: 'Monad',
    publicRpcUrl: 'https://rpc1.monad.xyz',
  }),
});

export const SUPPORTED_CHAIN_KEYS = Object.freeze(Object.keys(CHAINS));

export function normalizeChain(value) {
  const chain = String(value ?? 'monad').trim().toLowerCase();
  return Object.hasOwn(CHAINS, chain) ? chain : null;
}

export function getChainConfig(value) {
  const chain = normalizeChain(value);
  return chain ? CHAINS[chain] : null;
}

export function publicRpcUrlsForChain(chain, explicitUrl) {
  if (explicitUrl) return [explicitUrl];
  const selected = getChainConfig(chain);
  if (!selected) return [];
  return [selected.publicRpcUrl];
}
