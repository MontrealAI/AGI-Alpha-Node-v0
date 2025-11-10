import { Contract, getAddress, isAddress, namehash, toUtf8Bytes, keccak256 } from 'ethers';
import {
  ALPHA_NODE_ROOT_NODE,
  NODE_ROOT_NODE,
  assertNodeParentDomain,
  getAllowedNodeDomains,
  normalizeDomain
} from './ensConstants.js';

export const ENS_REGISTRY_ADDRESS = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
export const NAME_WRAPPER_ADDRESS = '0xD4416b13d2b3a9aBae7AcD5D6C2BbDBE25686401';

const ENS_REGISTRY_ABI = ['function owner(bytes32 node) view returns (address)'];
const NAME_WRAPPER_ABI = ['function ownerOf(uint256 id) view returns (address)'];

const defaultFactory = (address, abi, provider) => new Contract(address, abi, provider);

function normalizeAddress(value) {
  if (!value || value === '0x0000000000000000000000000000000000000000') return null;
  if (!isAddress(value)) return null;
  return getAddress(value);
}

function buildNodeName(label, parentDomain) {
  const sanitizedLabel = label.trim().toLowerCase();
  const normalizedParent = normalizeDomain(parentDomain);
  return `${sanitizedLabel}.${normalizedParent}`;
}

export function computeLabelhash(label) {
  return keccak256(toUtf8Bytes(label));
}

export async function fetchEnsRecords({
  provider,
  nodeName,
  contractFactory = defaultFactory,
  registryAddress = ENS_REGISTRY_ADDRESS,
  wrapperAddress = NAME_WRAPPER_ADDRESS
}) {
  const registry = contractFactory(registryAddress, ENS_REGISTRY_ABI, provider);
  const wrapper = contractFactory(wrapperAddress, NAME_WRAPPER_ABI, provider);
  const node = namehash(nodeName);
  const [resolvedAddress, registryOwner, wrapperOwner] = await Promise.all([
    provider.resolveName(nodeName),
    registry.owner(node).catch(() => null),
    wrapper
      .ownerOf(BigInt(node))
      .then((owner) => owner)
      .catch(() => null)
  ]);

  return {
    nodeName,
    namehash: node,
    resolvedAddress: normalizeAddress(resolvedAddress),
    registryOwner: normalizeAddress(registryOwner),
    wrapperOwner: normalizeAddress(wrapperOwner)
  };
}

export async function verifyNodeOwnership({
  provider,
  label,
  parentDomain,
  expectedAddress,
  contractFactory,
  allowedParentDomains = getAllowedNodeDomains()
}) {
  if (!provider) throw new Error('provider is required');
  if (!label) throw new Error('label is required');
  if (!parentDomain) throw new Error('parentDomain is required');

  const normalizedParent = assertNodeParentDomain(parentDomain, { allowedDomains: allowedParentDomains });

  const nodeName = buildNodeName(label, normalizedParent);
  const expected = expectedAddress ? getAddress(expectedAddress) : null;

  const records = await fetchEnsRecords({
    provider,
    nodeName,
    contractFactory
  });

  const matches = {
    resolved: expected ? records.resolvedAddress === expected : false,
    registry: expected ? records.registryOwner === expected : false,
    wrapper: expected ? records.wrapperOwner === expected : false
  };

  const success = expected
    ? matches.resolved || matches.registry || matches.wrapper
    : Boolean(records.resolvedAddress || records.registryOwner || records.wrapperOwner);

  return {
    ...records,
    expectedAddress: expected,
    matches,
    success,
    parentDomain: normalizedParent
  };
}

export function buildNodeNameFromLabel(label, parentDomain = 'alpha.node.agi.eth') {
  return buildNodeName(label, parentDomain);
}

export { ALPHA_NODE_ROOT_NODE, NODE_ROOT_NODE };
