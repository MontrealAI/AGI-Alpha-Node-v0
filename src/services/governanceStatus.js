import { Contract, getAddress } from 'ethers';

const JOB_REGISTRY_GOVERNANCE_ABI = [
  'function validationModule() view returns (address)',
  'function reputationModule() view returns (address)',
  'function disputeModule() view returns (address)'
];

const defaultFactory = (address, abi, provider) => new Contract(address, abi, provider);

function normalizeAddress(value) {
  if (!value) return null;
  try {
    return getAddress(value);
  } catch {
    return null;
  }
}

export async function fetchGovernanceStatus({
  provider,
  stakeStatus = {},
  jobRegistryAddress,
  identityRegistryAddress,
  contractFactory = defaultFactory
} = {}) {
  const resolvedJobRegistry = normalizeAddress(jobRegistryAddress ?? stakeStatus.jobRegistryAddress);
  const resolvedIdentityRegistry = normalizeAddress(
    identityRegistryAddress ?? stakeStatus.identityRegistryAddress
  );

  const status = {
    jobRegistry: {
      address: resolvedJobRegistry,
      validationModule: null,
      reputationModule: null,
      disputeModule: null,
      errors: {}
    },
    identityRegistry: {
      address: resolvedIdentityRegistry,
      errors: {}
    }
  };

  if (!provider || !resolvedJobRegistry) {
    if (!Object.keys(status.jobRegistry.errors).length) delete status.jobRegistry.errors;
    if (!Object.keys(status.identityRegistry.errors).length) delete status.identityRegistry.errors;
    return status;
  }

  let registryContract = null;
  try {
    registryContract = contractFactory(resolvedJobRegistry, JOB_REGISTRY_GOVERNANCE_ABI, provider);
  } catch (error) {
    status.jobRegistry.errors.contract = error;
    if (!Object.keys(status.identityRegistry.errors).length) delete status.identityRegistry.errors;
    return status;
  }

  try {
    const module = await registryContract.validationModule();
    status.jobRegistry.validationModule = normalizeAddress(module);
  } catch (error) {
    status.jobRegistry.validationModule = null;
    status.jobRegistry.errors.validationModule = error;
  }

  try {
    const module = await registryContract.reputationModule();
    status.jobRegistry.reputationModule = normalizeAddress(module);
  } catch (error) {
    status.jobRegistry.reputationModule = null;
    status.jobRegistry.errors.reputationModule = error;
  }

  try {
    const module = await registryContract.disputeModule();
    status.jobRegistry.disputeModule = normalizeAddress(module);
  } catch (error) {
    status.jobRegistry.disputeModule = null;
    status.jobRegistry.errors.disputeModule = error;
  }

  if (!Object.keys(status.jobRegistry.errors).length) delete status.jobRegistry.errors;
  if (!Object.keys(status.identityRegistry.errors).length) delete status.identityRegistry.errors;

  return status;
}

export { JOB_REGISTRY_GOVERNANCE_ABI };
