import { getAddress } from 'ethers';
import { buildNodeNameFromLabel } from './ensVerifier.js';

const ENS_MANAGER_BASE_URL = 'https://app.ens.domains/name';

function sanitizeLabel(label) {
  if (!label || typeof label !== 'string') {
    throw new Error('label is required');
  }
  return label.trim().toLowerCase();
}

export function generateEnsSetupGuide({ label, parentDomain = 'alpha.node.agi.eth', operatorAddress }) {
  const normalizedLabel = sanitizeLabel(label);
  if (!operatorAddress) {
    throw new Error('operatorAddress is required');
  }

  const ownerAddress = getAddress(operatorAddress);
  const nodeName = buildNodeNameFromLabel(normalizedLabel, parentDomain);
  const parentUrl = `${ENS_MANAGER_BASE_URL}/${parentDomain}`;
  const subdomainUrl = `${ENS_MANAGER_BASE_URL}/${nodeName}`;

  const steps = [
    {
      title: 'Anchor the parent domain session',
      description:
        `Open ${parentDomain} in the ENS manager, authenticate with the owner wallet, and ensure NameWrapper + resolver point to your custody policy before delegating any subdomain rights.`,
      link: parentUrl
    },
    {
      title: `Mint subdomain ${nodeName}`,
      description:
        'Create the subdomain, set the owner to your hot or multisig operator key, and confirm the resolver is the canonical PublicResolver or your enterprise resolver.',
      link: subdomainUrl
    },
    {
      title: 'Set primary address records',
      description:
        `Inside the resolver records, add the ETH address record pointing to ${ownerAddress} and mirror any TXT proof requirements from your compliance runbooks.`,
      command: `Resolver → Addresses → ETH → ${ownerAddress}`
    },
    {
      title: 'Publish controller safeguards',
      description:
        'If using the NameWrapper, apply the CAN_EXTEND and CAN_UNWRAP fuse policies aligned with your governance. Snapshot the transaction hash into your custody ledger.'
    },
    {
      title: 'Verify binding with the sovereign CLI',
      description:
        'Use the runtime CLI to assert resolver, registry, and wrapper ownership prior to activation. Archive the JSON table with your compliance evidence.',
      command: `node src/index.js verify-ens --label ${normalizedLabel} --address ${ownerAddress}`
    },
    {
      title: 'Prime staking activation',
      description:
        'Once ENS binding is notarized, precompute the stake transaction so the operator can activate without manual ABI crafting.',
      command: 'node src/index.js stake-tx --amount <stake> --incentives <0xPlatformIncentives>'
    },
    {
      title: 'Run diagnostics before go-live',
      description:
        'Execute the diagnostics command against your RPC endpoint to validate stake posture, heartbeat telemetry, and reward projections.',
      command: `node src/index.js status --label ${normalizedLabel} --address ${ownerAddress} --rpc <https://rpc>`
    }
  ];

  return {
    nodeName,
    parentDomain,
    ownerAddress,
    steps,
    ensManagerUrl: subdomainUrl
  };
}

export function formatEnsGuide(guide) {
  if (!guide || !Array.isArray(guide.steps)) {
    throw new Error('guide with steps is required');
  }

  return guide.steps.map((step, index) => {
    const header = `${index + 1}. ${step.title}`;
    const bodyLines = [step.description];
    if (step.link) bodyLines.push(`Link: ${step.link}`);
    if (step.command) bodyLines.push(`Command: ${step.command}`);
    return `${header}\n   ${bodyLines.join('\n   ')}`;
  });
}

