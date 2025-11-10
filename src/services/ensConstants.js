import { namehash } from 'ethers';

const DEFAULT_ALLOWED_DOMAINS = ['alpha.node.agi.eth', 'node.agi.eth'];

export const NODE_ROOT_NODE = namehash('node.agi.eth');
export const ALPHA_NODE_ROOT_NODE = namehash('alpha.node.agi.eth');

export function normalizeDomain(domain) {
  if (!domain) {
    throw new Error('domain is required');
  }
  const normalized = domain.trim().toLowerCase().replace(/\.+$/, '');
  if (!normalized) {
    throw new Error('domain is required');
  }
  return normalized;
}

export function assertNodeParentDomain(parentDomain, { allowedDomains = DEFAULT_ALLOWED_DOMAINS } = {}) {
  const normalizedParent = normalizeDomain(parentDomain);
  const normalizedAllowed = allowedDomains.map((domain) => normalizeDomain(domain));
  if (!normalizedAllowed.includes(normalizedParent)) {
    throw new Error(
      `parentDomain must be one of ${normalizedAllowed.join(', ')} to qualify as an AGI Alpha Node subdomain`
    );
  }
  return normalizedParent;
}

export function getAllowedNodeDomains() {
  return [...DEFAULT_ALLOWED_DOMAINS];
}
