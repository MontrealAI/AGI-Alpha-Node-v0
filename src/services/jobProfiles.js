import { Interface } from 'ethers';

const baseEvents = {
  created: 'JobCreated',
  applied: 'JobApplied',
  assigned: 'JobAssigned',
  submitted: 'JobSubmitted',
  finalized: 'JobFinalized'
};

const v0Methods = {
  apply: [
    { name: 'applyForJob', args: ['jobId', 'subdomain', 'proof'] },
    { name: 'apply', args: ['jobId', 'subdomain', 'proof'] }
  ],
  submit: [
    { name: 'submitProof', args: ['jobId', 'commitment', 'resultHash', 'resultUri', 'metadata'] },
    { name: 'submit', args: ['jobId', 'resultHash', 'resultUri', 'subdomain', 'proof'] },
    { name: 'completeJob', args: ['jobId', 'resultHash', 'resultUri'] }
  ],
  finalize: [
    { name: 'finalize', args: ['jobId'] },
    { name: 'finalizeJob', args: ['jobId'] }
  ]
};

const JOB_PROFILE_DEFINITIONS = {
  v0: {
    id: 'v0',
    label: 'Registry v0 compatibility',
    abi: [
      'event JobCreated(bytes32 indexed jobId, address indexed client, uint256 reward, uint256 deadline, string uri, string tags)',
      'event JobApplied(bytes32 indexed jobId, address indexed worker)',
      'event JobAssigned(bytes32 indexed jobId, address indexed worker)',
      'event JobSubmitted(bytes32 indexed jobId, address indexed client, address indexed worker, bytes32 resultHash, string resultURI)',
      'event JobFinalized(bytes32 indexed jobId, address indexed client, address indexed worker)',
      'event AlphaWUMinted(bytes32 indexed id, address indexed agent, address indexed node, uint256 timestamp)',
      'event AlphaWUValidated(bytes32 indexed id, address indexed validator, uint256 stake, uint256 score, uint256 timestamp)',
      'event AlphaWUAccepted(bytes32 indexed id, uint256 timestamp)',
      'event SlashApplied(bytes32 indexed id, address indexed validator, uint256 amount, uint256 timestamp)',
      'function getOpenJobs() view returns (tuple(bytes32 jobId,address client,uint256 reward,uint256 deadline,string uri,string tags)[])',
      'function jobCount() view returns (uint256)',
      'function jobs(bytes32 jobId) view returns (tuple(address client,address worker,uint8 status,uint256 reward,uint256 deadline,string uri,string tags))',
      'function applyForJob(bytes32 jobId,string subdomain,bytes proof)',
      'function apply(bytes32 jobId,string subdomain,bytes proof)',
      'function submit(bytes32 jobId,bytes32 resultHash,string resultURI,string subdomain,bytes proof)',
      'function submitProof(bytes32 jobId,bytes32 commitment,bytes32 resultHash,string resultURI,bytes metadata)',
      'function completeJob(bytes32 jobId,bytes32 resultHash,string resultURI)',
      'function finalize(bytes32 jobId)',
      'function finalizeJob(bytes32 jobId)'
    ],
    events: {
      ...baseEvents,
      alphaWUMinted: 'AlphaWUMinted',
      alphaWUValidated: 'AlphaWUValidated',
      alphaWUAccepted: 'AlphaWUAccepted',
      slashApplied: 'SlashApplied'
    },
    methods: v0Methods
  },
  v2: {
    id: 'v2',
    label: 'Registry v2 compatibility',
    abi: [
      'event JobCreated(bytes32 indexed jobId, address indexed client, uint256 reward, uint256 deadline, string uri, string tags)',
      'event JobApplied(bytes32 indexed jobId, address indexed worker)',
      'event JobAssigned(bytes32 indexed jobId, address indexed worker)',
      'event JobSubmitted(bytes32 indexed jobId, address indexed client, address indexed worker, bytes32 resultHash, string resultURI)',
      'event JobValidated(bytes32 indexed jobId, address indexed validator, bool accepted)',
      'event JobFinalized(bytes32 indexed jobId, address indexed client, address indexed worker)',
      'event AlphaWUMinted(bytes32 indexed id, address indexed agent, address indexed node, uint256 timestamp)',
      'event AlphaWUValidated(bytes32 indexed id, address indexed validator, uint256 stake, uint256 score, uint256 timestamp)',
      'event AlphaWUAccepted(bytes32 indexed id, uint256 timestamp)',
      'event SlashApplied(bytes32 indexed id, address indexed validator, uint256 amount, uint256 timestamp)',
      'function getOpenJobs() view returns (tuple(bytes32 jobId,address client,uint256 reward,uint256 deadline,string uri,string tags)[])',
      'function jobCount() view returns (uint256)',
      'function jobs(bytes32 jobId) view returns (tuple(address client,address worker,uint8 status,uint256 reward,uint256 deadline,string uri,string tags))',
      'function applyForJob(bytes32 jobId,string subdomain,bytes proof)',
      'function apply(bytes32 jobId,string subdomain,bytes proof)',
      'function submitWithValidator(bytes32 jobId,bytes32 commitment,bytes32 resultHash,string resultURI,bytes metadata,address validator)',
      'function submitProof(bytes32 jobId,bytes32 commitment,bytes32 resultHash,string resultURI,bytes metadata)',
      'function submit(bytes32 jobId,bytes32 resultHash,string resultURI,string subdomain,bytes proof)',
      'function completeJob(bytes32 jobId,bytes32 resultHash,string resultURI)',
      'function notifyValidator(bytes32 jobId,address validator)',
      'function finalizeWithValidator(bytes32 jobId,address validator)',
      'function finalize(bytes32 jobId)'
    ],
    events: {
      ...baseEvents,
      validated: 'JobValidated',
      alphaWUMinted: 'AlphaWUMinted',
      alphaWUValidated: 'AlphaWUValidated',
      alphaWUAccepted: 'AlphaWUAccepted',
      slashApplied: 'SlashApplied'
    },
    methods: {
      apply: v0Methods.apply,
      submit: [
        {
          name: 'submitWithValidator',
          args: ['jobId', 'commitment', 'resultHash', 'resultUri', 'metadata', 'validator']
        },
        ...v0Methods.submit
      ],
      finalize: [
        { name: 'finalizeWithValidator', args: ['jobId', 'validator'] },
        ...v0Methods.finalize
      ],
      notifyValidator: [{ name: 'notifyValidator', args: ['jobId', 'validator'] }]
    }
  }
};

const DEFAULT_ARGS = {
  apply: ['jobId', 'subdomain', 'proof'],
  submit: ['jobId', 'resultHash', 'resultUri', 'subdomain', 'proof'],
  finalize: ['jobId'],
  notifyValidator: ['jobId', 'validator']
};

function compileMethodSpec(operation, spec) {
  if (!spec) return null;
  if (typeof spec === 'string') {
    return compileMethodSpec(operation, { name: spec });
  }
  const name = spec.name;
  if (!name) {
    throw new Error(`Method specification missing name for ${operation}`);
  }
  const args = Array.isArray(spec.args) && spec.args.length > 0 ? spec.args : DEFAULT_ARGS[operation] ?? [];
  const includeOverrides = spec.includeOverrides !== undefined ? Boolean(spec.includeOverrides) : true;
  return {
    name,
    includeOverrides,
    buildArgs(context = {}) {
      return args.map((key) => {
        if (!(key in context)) {
          return undefined;
        }
        return context[key];
      });
    }
  };
}

function cloneMethods(methods = {}) {
  const compiled = {};
  for (const [operation, specs] of Object.entries(methods)) {
    if (Array.isArray(specs)) {
      compiled[operation] = specs.map((spec) => compileMethodSpec(operation, spec)).filter(Boolean);
    } else if (specs) {
      compiled[operation] = [compileMethodSpec(operation, specs)].filter(Boolean);
    } else {
      compiled[operation] = [];
    }
  }
  return compiled;
}

function cloneProfile(profile) {
  return {
    id: profile.id ?? 'custom',
    label: profile.label ?? 'Custom registry profile',
    abi: Array.isArray(profile.abi) ? [...profile.abi] : [],
    events: { ...(profile.events ?? {}) },
    methods: cloneMethods(profile.methods)
  };
}

function mergeProfiles(base, overrides = {}) {
  const merged = cloneProfile(base);
  if (Array.isArray(overrides.abi)) {
    merged.abi = [...overrides.abi];
  }
  if (overrides.events && typeof overrides.events === 'object') {
    merged.events = { ...merged.events, ...overrides.events };
  }
  if (overrides.methods && typeof overrides.methods === 'object') {
    const updated = {};
    for (const [operation, specs] of Object.entries(overrides.methods)) {
      if (Array.isArray(specs)) {
        updated[operation] = specs.map((spec) => compileMethodSpec(operation, spec)).filter(Boolean);
      } else if (specs) {
        updated[operation] = [compileMethodSpec(operation, specs)].filter(Boolean);
      } else {
        updated[operation] = [];
      }
    }
    merged.methods = { ...merged.methods, ...updated };
  }
  if (overrides.id) {
    merged.id = overrides.id;
  }
  if (overrides.label) {
    merged.label = overrides.label;
  }
  return merged;
}

export function resolveJobProfile(profile, overrides = null) {
  if (!profile || (typeof profile === 'string' && profile.trim().length === 0)) {
    return cloneProfile(JOB_PROFILE_DEFINITIONS.v0);
  }
  if (typeof profile === 'string') {
    const key = profile.toLowerCase();
    if (key === 'custom') {
      if (!overrides) {
        throw new Error('Custom job registry profile requires an overrides object');
      }
      const compiled = cloneProfile({ ...overrides, id: overrides.id ?? 'custom' });
      if (!compiled.abi.length) {
        throw new Error('Custom job registry profile must include an ABI array');
      }
      return compiled;
    }
    const definition = JOB_PROFILE_DEFINITIONS[key];
    if (!definition) {
      throw new Error(`Unknown job registry profile: ${profile}`);
    }
    return overrides ? mergeProfiles(definition, overrides) : cloneProfile(definition);
  }
  if (typeof profile === 'object') {
    return cloneProfile(profile);
  }
  throw new Error('Unsupported job registry profile value');
}

export function createInterfaceFromProfile(profile) {
  return new Interface(profile.abi);
}

export { JOB_PROFILE_DEFINITIONS };
