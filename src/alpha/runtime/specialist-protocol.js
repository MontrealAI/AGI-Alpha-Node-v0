import { verifyMessage, getAddress } from 'ethers';
import { digest, analyzeMission, missionSchema } from '../mission.js';
import { validateModelResult } from './synthesis.js';
const address = (x) => getAddress(x).toLowerCase();
export function validateSpecialistReceipt(envelope, mission, recipient) {
  const result = verifyEnvelope(envelope, {
    sender: envelope.sender,
    recipient,
    kind: 'result',
    allowExpired: true,
  });
  const requestId = digest({
    sender: address(recipient),
    recipient: envelope.sender,
    capability: result.capability,
    mission,
  });
  if (
    result.requestId !== requestId ||
    result.inputDigest !== digest(mission) ||
    !Number.isSafeInteger(result.priceMicroUsd) ||
    result.priceMicroUsd < 0
  )
    throw new Error('Specialist receipt binding mismatch');
  if (['research-synthesis', 'adversarial-review'].includes(result.capability))
    validateModelResult(result.result, mission, result.capability);
  else if (
    digest(result.result) !==
    digest(executeSpecialist(result.capability, mission))
  )
    throw new Error('Specialist receipt computation mismatch');
  return result;
}
export async function signEnvelope(
  wallet,
  kind,
  recipient,
  payload,
  { ttlMs = 60000, now = Date.now() } = {},
) {
  const body = {
    domain: 'agialpha:specialist:v1',
    kind,
    sender: address(wallet.address),
    recipient: recipient ? address(recipient) : null,
    issuedAt: now,
    expiresAt: now + ttlMs,
    payload,
  };
  const hash = digest(body);
  return { ...body, hash, signature: await wallet.signMessage(hash) };
}
export function verifyEnvelope(
  envelope,
  { sender, recipient, kind, now = Date.now(), allowExpired = false },
) {
  const { hash, signature, ...body } = envelope;
  if (
    body.domain !== 'agialpha:specialist:v1' ||
    body.kind !== kind ||
    digest(body) !== hash ||
    address(verifyMessage(hash, signature)) !== address(sender) ||
    body.sender !== address(sender) ||
    body.recipient !== (recipient ? address(recipient) : null)
  )
    throw new Error('Invalid specialist signature or binding');
  if (
    !Number.isSafeInteger(body.issuedAt) ||
    !Number.isSafeInteger(body.expiresAt) ||
    body.issuedAt > now + 30000 ||
    body.expiresAt <= body.issuedAt ||
    body.expiresAt - body.issuedAt > 300000 ||
    (!allowExpired && body.expiresAt < now)
  )
    throw new Error('Expired or invalid specialist envelope');
  return body.payload;
}
export function executeSpecialist(capability, input) {
  const mission = missionSchema.parse(input);
  const analysis = analyzeMission(mission);
  if (capability === 'evidence-analysis')
    return { inputDigest: digest(mission), analysis };
  if (capability === 'risk-review')
    return {
      inputDigest: digest(mission),
      recommendation: analysis.recommendation,
      findings: analysis.rankings.map((o) => ({
        id: o.id,
        admitted: o.admitted,
        stressedNet: o.stressedNet,
        lossIfNoBenefit: o.cost + o.downside,
      })),
      requiredChecks: [
        'Source truth',
        'Uniform cost assumption',
        'Privacy and correctness',
        'Independent observed outcome',
      ],
    };
  if (capability === 'implementation-plan')
    return {
      inputDigest: digest(mission),
      recommendation: analysis.recommendation,
      steps: [
        'Validate the baseline and cache eligibility',
        'Prepare a hash-bound configuration patch',
        'Execute only an owner-authorized capability',
        'Measure the same observation period',
        'Rollback if the health check fails',
      ],
      executableCode: false,
    };
  throw new Error('Unsupported specialist capability');
}
