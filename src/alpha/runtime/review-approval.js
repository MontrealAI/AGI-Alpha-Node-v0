import { Wallet, getAddress, verifyTypedData } from 'ethers';
const types = {
  Review: [
    { name: 'workId', type: 'bytes32' },
    { name: 'evidenceHash', type: 'bytes32' },
    { name: 'accepted', type: 'bool' },
    { name: 'expiresAt', type: 'uint256' },
  ],
};
const domain = (escrow) => ({
  name: 'AGIALPHA Mission Escrow',
  version: '1',
  chainId: 1,
  verifyingContract: getAddress(escrow),
});
export async function signSettlementApproval(
  run,
  escrow,
  expiresAt,
  accepted,
  privateKey,
) {
  if (
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= Math.floor(Date.now() / 1000)
  )
    throw new Error('Future settlement approval expiry required');
  const wallet = new Wallet(privateKey);
  const value = {
    workId: run.workId,
    evidenceHash: run.hash,
    accepted,
    expiresAt,
  };
  return {
    schema: 1,
    chainId: 1,
    escrow: getAddress(escrow),
    ...value,
    signature: await wallet.signTypedData(domain(escrow), types, value),
  };
}
export function verifySettlementApproval(approval, run, reviewer, escrow) {
  if (
    approval.schema !== 1 ||
    approval.chainId !== 1 ||
    getAddress(approval.escrow) !== getAddress(escrow) ||
    approval.workId !== run.workId ||
    approval.evidenceHash !== run.hash ||
    approval.accepted !== true ||
    !Number.isSafeInteger(approval.expiresAt)
  )
    throw new Error('Invalid settlement approval binding');
  const value = {
    workId: approval.workId,
    evidenceHash: approval.evidenceHash,
    accepted: approval.accepted,
    expiresAt: approval.expiresAt,
  };
  if (
    getAddress(
      verifyTypedData(domain(escrow), types, value, approval.signature),
    ) !== getAddress(reviewer)
  )
    throw new Error('Invalid settlement reviewer signature');
  return approval;
}
