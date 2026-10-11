import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

export default {
  solidity: {
    version: "0.8.37",
    path: require.resolve("solc/soljson.js"),
    preferWasm: true,
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "paris" },
  },
  paths: {
    sources: "./contracts",
    artifacts: "./build/hardhat/artifacts",
    cache: "./build/hardhat/cache",
  },
  networks: {
    simulated: { type: "edr-simulated", chainType: "l1", chainId: 31337 },
  },
};
