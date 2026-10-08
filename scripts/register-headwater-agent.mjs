import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const IDENTITY_REGISTRY_ADDRESS = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
const MONAD_CHAIN_ID = 143n;
const DEFAULT_RPC = "https://rpc.monad.xyz";

const IDENTITY_ABI = [
  "function register(string agentURI) returns (uint256 agentId)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function getAgentWallet(uint256 agentId) view returns (address)",
];

function env(name) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function loadDefaultAgentUri() {
  const here = dirname(fileURLToPath(import.meta.url));
  const metadataPath = join(here, "..", "docs", "agent.json");
  const metadata = readFileSync(metadataPath, "utf8");
  const compact = JSON.stringify(JSON.parse(metadata));
  return `data:application/json,${encodeURIComponent(compact)}`;
}

function readPrivateKey() {
  const key =
    env("HEADWATER_PRIVATE_KEY") ||
    env("MONAD_PRIVATE_KEY") ||
    env("SENTINEL_PRIVATE_KEY") ||
    env("MINER_PRIVATE_KEY") ||
    env("FROM_PRIVATE_KEY");
  if (!key) {
    throw new Error(
      "Set HEADWATER_PRIVATE_KEY, MONAD_PRIVATE_KEY, SENTINEL_PRIVATE_KEY, MINER_PRIVATE_KEY, or FROM_PRIVATE_KEY for the wallet that should own the Headwater agent."
    );
  }
  return key;
}

const rpcUrl = env("MONAD_RPC_URL") || DEFAULT_RPC;
const agentUri = env("HEADWATER_AGENT_URI") || loadDefaultAgentUri();

const provider = new ethers.JsonRpcProvider(rpcUrl, Number(MONAD_CHAIN_ID), {
  staticNetwork: true,
});
const wallet = new ethers.Wallet(readPrivateKey(), provider);
const identity = new ethers.Contract(IDENTITY_REGISTRY_ADDRESS, IDENTITY_ABI, wallet);

const network = await provider.getNetwork();
if (network.chainId !== MONAD_CHAIN_ID) {
  throw new Error(`Connected to chain ${network.chainId}, expected Monad chain ${MONAD_CHAIN_ID}.`);
}

const balance = await provider.getBalance(wallet.address);
if (balance === 0n) {
  throw new Error(`Wallet ${wallet.address} has 0 MON on Monad. Fund it before registering.`);
}

console.log(`Registering Headwater as an ERC-8004 agent on Monad.`);
console.log(`Owner wallet: ${wallet.address}`);
console.log(`Registry:     ${IDENTITY_REGISTRY_ADDRESS}`);
console.log(`Agent URI:    ${agentUri.slice(0, 120)}${agentUri.length > 120 ? "..." : ""}`);

const predictedAgentId = await identity.register.staticCall(agentUri);
console.log(`Predicted agent id: ${predictedAgentId.toString()}`);

const tx = await identity.register(agentUri);
console.log(`Transaction sent: ${tx.hash}`);

const receipt = await tx.wait();
if (!receipt || receipt.status !== 1) {
  throw new Error(`Registration transaction failed: ${tx.hash}`);
}

const owner = await identity.ownerOf(predictedAgentId);
const walletOnRegistry = await identity.getAgentWallet(predictedAgentId);
const tokenUri = await identity.tokenURI(predictedAgentId);

console.log(`Registered agent id: ${predictedAgentId.toString()}`);
console.log(`Owner verified:      ${owner}`);
console.log(`Agent wallet:        ${walletOnRegistry}`);
console.log(`Token URI matches:   ${tokenUri === agentUri ? "yes" : "no"}`);
console.log(`Tx hash:             ${tx.hash}`);
