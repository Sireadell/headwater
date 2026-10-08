// Central config. Monad-only build, trimmed down from telegraph-sentinel's
// config.js: no Ankr keys, no other-chain RPC urls. Copied signal files
// still read config.chain and a handful of other fields by the same
// names, so those stay, everything Ankr-specific was dropped since
// Headwater never calls Ankr at all.

export const config = {
  chain: process.env.CHAIN || 'monad',

  monadRpcUrls: (process.env.MONAD_RPC_URLS || 'https://rpc1.monad.xyz,https://rpc3.monad.xyz')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean),
  // Optional Alchemy endpoint for registry reads (eth_call, eth_getCode).
  // Not used for eth_getLogs: Alchemy's free tier caps a log query at 10
  // blocks, so log scans stay on the public endpoints above.
  monadReadRpcUrl: process.env.ALCHEMY_API_KEY
    ? `https://monad-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
    : undefined,
  monadMaxLookbackBlocks: Number(process.env.MONAD_MAX_LOOKBACK_BLOCKS) || 50_000,
  // How many blocks one funder-search "page" covers, see the
  // PAGE_BLOCK_SPAN comment in core/rpc/monadClient.js. Bigger finds
  // older funders, slower. Default keeps scripts/demo.mjs fast.
  monadPageBlockSpan: Number(process.env.MONAD_PAGE_BLOCK_SPAN) || 1_500,

  knownExchangeAddresses: (process.env.KNOWN_EXCHANGE_ADDRESSES || '')
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter((a) => a.startsWith('0x')),

  optionalSignalDeadlineMs: Number(process.env.OPTIONAL_SIGNAL_DEADLINE_MS) || 2_500,
};
