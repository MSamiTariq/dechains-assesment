import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.27",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      forking: {
        url: "https://eth-mainnet.public.blastapi.io",
        blockNumber: 21080117,
      },
    },
  },
  gasReporter: {
    enabled: true,
    currency: "USD",
    gasPrice: 21,
  },
};

export default config;
