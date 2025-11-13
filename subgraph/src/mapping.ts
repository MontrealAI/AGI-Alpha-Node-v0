import { BigDecimal, BigInt } from "@graphprotocol/graph-ts";
import {
  AlphaWUMinted,
  AlphaWUValidated,
  AlphaWUAccepted,
  SlashApplied,
} from "../generated/AlphaNodeManager/AlphaNodeManager";
import {
  Agent,
  Node,
  Validator,
  WorkUnit,
  AgentDailyMetric,
  NodeDailyMetric,
  ValidatorDailyMetric,
  AgentMetricWindow,
  NodeMetricWindow,
  ValidatorMetricWindow,
  ValidatorParticipation,
  QualityBucket,
  LatencyBucket,
  SlashEvent,
} from "../generated/schema";

const ZERO_BI = BigInt.fromI32(0);
const ONE_BI = BigInt.fromI32(1);
const ZERO_BD = BigDecimal.fromString("0");
const SECONDS_PER_DAY = 86400;
const WINDOW_OPTIONS: i32[] = [7, 30];
const SCORE_BUCKETS = 101; // 0-100 inclusive (percentage points)
const LATENCY_BUCKET_BOUNDS: i32[] = [
  60,
  120,
  180,
  300,
  600,
  900,
  1200,
  1800,
  3600,
  7200,
  14400,
  28800,
  43200,
  86400,
  172800,
  259200,
  604800,
  1209600,
  2419200,
  4838400,
];
const LATENCY_BUCKET_COUNT = LATENCY_BUCKET_BOUNDS.length + 1;
const OWNER_AGENT = "AGENT";
const OWNER_NODE = "NODE";
const OWNER_VALIDATOR = "VALIDATOR";

function getOrCreateAgent(id: string): Agent {
  let entity = Agent.load(id);
  if (entity == null) {
    entity = new Agent(id);
    entity.totalWorkUnits = ZERO_BI;
    entity.totalAccepted = ZERO_BI;
    entity.totalValidations = ZERO_BI;
    entity.totalSlashAmount = ZERO_BI;
    entity.totalStake = ZERO_BI;
    entity.lastUpdated = 0;
  }
  return entity as Agent;
}

function getOrCreateNode(id: string): Node {
  let entity = Node.load(id);
  if (entity == null) {
    entity = new Node(id);
    entity.totalWorkUnits = ZERO_BI;
    entity.totalAccepted = ZERO_BI;
    entity.totalValidations = ZERO_BI;
    entity.totalSlashAmount = ZERO_BI;
    entity.totalStake = ZERO_BI;
    entity.lastUpdated = 0;
  }
  return entity as Node;
}

function getOrCreateValidator(id: string): Validator {
  let entity = Validator.load(id);
  if (entity == null) {
    entity = new Validator(id);
    entity.totalWorkUnits = ZERO_BI;
    entity.totalAccepted = ZERO_BI;
    entity.totalValidations = ZERO_BI;
    entity.totalSlashAmount = ZERO_BI;
    entity.totalStake = ZERO_BI;
    entity.lastUpdated = 0;
  }
  return entity as Validator;
}

function getOrCreateWorkUnit(id: string): WorkUnit {
  let entity = WorkUnit.load(id);
  if (entity == null) {
    entity = new WorkUnit(id);
    entity.mintedAt = 0;
    entity.validationCount = ZERO_BI;
    entity.totalScore = ZERO_BI;
    entity.totalStake = ZERO_BI;
    entity.totalSlashAmount = ZERO_BI;
    entity.validatorIds = new Array<string>();
    entity.unset("acceptedAt");
    entity.unset("lastValidatedAt");
  }
  return entity as WorkUnit;
}

function getOrCreateParticipation(workUnitId: string, validatorId: string): ValidatorParticipation {
  const id = workUnitId + "-" + validatorId;
  let participation = ValidatorParticipation.load(id);
  if (participation == null) {
    participation = new ValidatorParticipation(id);
    participation.workUnit = workUnitId;
    participation.validator = validatorId;
    participation.stake = ZERO_BI;
    participation.score = ZERO_BI;
    participation.lastValidatedAt = 0;
  }
  return participation as ValidatorParticipation;
}

function getDayFromTimestamp(timestamp: BigInt): i32 {
  return timestamp.toI32() / SECONDS_PER_DAY;
}

function updateAgentDaily(
  agentId: string,
  day: i32,
  mintedDelta: BigInt,
  acceptedDelta: BigInt,
  validationDelta: BigInt,
  scoreDelta: BigInt,
  stakeDelta: BigInt,
  slashDelta: BigInt,
): void {
  const metricId = agentId + "-" + day.toString();
  let metric = AgentDailyMetric.load(metricId);
  if (metric == null) {
    metric = new AgentDailyMetric(metricId);
    metric.agent = agentId;
    metric.day = day;
    metric.mintedCount = ZERO_BI;
    metric.acceptedCount = ZERO_BI;
    metric.validationCount = ZERO_BI;
    metric.scoreSum = ZERO_BI;
    metric.stakeSum = ZERO_BI;
    metric.slashAmount = ZERO_BI;
  }

  metric.mintedCount = metric.mintedCount.plus(mintedDelta);
  metric.acceptedCount = metric.acceptedCount.plus(acceptedDelta);
  metric.validationCount = metric.validationCount.plus(validationDelta);
  metric.scoreSum = metric.scoreSum.plus(scoreDelta);
  metric.stakeSum = metric.stakeSum.plus(stakeDelta);
  metric.slashAmount = metric.slashAmount.plus(slashDelta);
  metric.save();
}

function updateNodeDaily(
  nodeId: string,
  day: i32,
  mintedDelta: BigInt,
  acceptedDelta: BigInt,
  validationDelta: BigInt,
  scoreDelta: BigInt,
  stakeDelta: BigInt,
  slashDelta: BigInt,
): void {
  const metricId = nodeId + "-" + day.toString();
  let metric = NodeDailyMetric.load(metricId);
  if (metric == null) {
    metric = new NodeDailyMetric(metricId);
    metric.node = nodeId;
    metric.day = day;
    metric.mintedCount = ZERO_BI;
    metric.acceptedCount = ZERO_BI;
    metric.validationCount = ZERO_BI;
    metric.scoreSum = ZERO_BI;
    metric.stakeSum = ZERO_BI;
    metric.slashAmount = ZERO_BI;
  }

  metric.mintedCount = metric.mintedCount.plus(mintedDelta);
  metric.acceptedCount = metric.acceptedCount.plus(acceptedDelta);
  metric.validationCount = metric.validationCount.plus(validationDelta);
  metric.scoreSum = metric.scoreSum.plus(scoreDelta);
  metric.stakeSum = metric.stakeSum.plus(stakeDelta);
  metric.slashAmount = metric.slashAmount.plus(slashDelta);
  metric.save();
}

function updateValidatorDaily(
  validatorId: string,
  day: i32,
  mintedDelta: BigInt,
  acceptedDelta: BigInt,
  validationDelta: BigInt,
  scoreDelta: BigInt,
  stakeDelta: BigInt,
  slashDelta: BigInt,
): void {
  const metricId = validatorId + "-" + day.toString();
  let metric = ValidatorDailyMetric.load(metricId);
  if (metric == null) {
    metric = new ValidatorDailyMetric(metricId);
    metric.validator = validatorId;
    metric.day = day;
    metric.mintedCount = ZERO_BI;
    metric.acceptedCount = ZERO_BI;
    metric.validationCount = ZERO_BI;
    metric.scoreSum = ZERO_BI;
    metric.stakeSum = ZERO_BI;
    metric.slashAmount = ZERO_BI;
  }

  metric.mintedCount = metric.mintedCount.plus(mintedDelta);
  metric.acceptedCount = metric.acceptedCount.plus(acceptedDelta);
  metric.validationCount = metric.validationCount.plus(validationDelta);
  metric.scoreSum = metric.scoreSum.plus(scoreDelta);
  metric.stakeSum = metric.stakeSum.plus(stakeDelta);
  metric.slashAmount = metric.slashAmount.plus(slashDelta);
  metric.save();
}

function getQualityBucketId(ownerType: string, ownerId: string, day: i32, bucket: i32): string {
  return ownerType + ":" + ownerId + ":" + day.toString() + ":" + bucket.toString();
}

function updateQualityHistogram(ownerType: string, ownerId: string, day: i32, bucket: i32, stakeDelta: BigInt): void {
  if (stakeDelta.equals(ZERO_BI)) {
    return;
  }
  const id = getQualityBucketId(ownerType, ownerId, day, bucket);
  let histogram = QualityBucket.load(id);
  if (histogram == null) {
    histogram = new QualityBucket(id);
    histogram.ownerType = ownerType;
    histogram.owner = ownerId;
    histogram.day = day;
    histogram.bucket = bucket;
    histogram.stake = ZERO_BI;
  }
  histogram.stake = histogram.stake.plus(stakeDelta);
  histogram.save();
}

function getLatencyBucketId(ownerType: string, ownerId: string, day: i32, bucket: i32): string {
  return ownerType + ":" + ownerId + ":" + day.toString() + ":" + bucket.toString();
}

function updateLatencyHistogram(ownerType: string, ownerId: string, day: i32, bucket: i32, countDelta: BigInt): void {
  if (countDelta.equals(ZERO_BI)) {
    return;
  }
  const id = getLatencyBucketId(ownerType, ownerId, day, bucket);
  let histogram = LatencyBucket.load(id);
  if (histogram == null) {
    histogram = new LatencyBucket(id);
    histogram.ownerType = ownerType;
    histogram.owner = ownerId;
    histogram.day = day;
    histogram.bucket = bucket;
    histogram.count = ZERO_BI;
  }
  histogram.count = histogram.count.plus(countDelta);
  histogram.save();
}

function aggregateQualityHistogram(ownerType: string, ownerId: string, day: i32, window: i32): Array<BigInt> {
  const totals = new Array<BigInt>(SCORE_BUCKETS);
  for (let i = 0; i < SCORE_BUCKETS; i++) {
    totals[i] = ZERO_BI;
  }

  for (let offset = 0; offset < window; offset++) {
    const currentDay = day - offset;
    if (currentDay < 0) {
      break;
    }
    for (let bucket = 0; bucket < SCORE_BUCKETS; bucket++) {
      const id = getQualityBucketId(ownerType, ownerId, currentDay, bucket);
      const histogram = QualityBucket.load(id);
      if (histogram != null) {
        totals[bucket] = totals[bucket].plus(histogram.stake);
      }
    }
  }
  return totals;
}

function aggregateLatencyHistogram(ownerType: string, ownerId: string, day: i32, window: i32): Array<BigInt> {
  const totals = new Array<BigInt>(LATENCY_BUCKET_COUNT);
  for (let i = 0; i < LATENCY_BUCKET_COUNT; i++) {
    totals[i] = ZERO_BI;
  }

  for (let offset = 0; offset < window; offset++) {
    const currentDay = day - offset;
    if (currentDay < 0) {
      break;
    }
    for (let bucket = 0; bucket < LATENCY_BUCKET_COUNT; bucket++) {
      const id = getLatencyBucketId(ownerType, ownerId, currentDay, bucket);
      const histogram = LatencyBucket.load(id);
      if (histogram != null) {
        totals[bucket] = totals[bucket].plus(histogram.count);
      }
    }
  }
  return totals;
}

function computeQualityMedian(ownerType: string, ownerId: string, day: i32, window: i32): BigDecimal {
  const totals = aggregateQualityHistogram(ownerType, ownerId, day, window);
  let cumulativeStake = ZERO_BI;
  for (let i = 0; i < SCORE_BUCKETS; i++) {
    cumulativeStake = cumulativeStake.plus(totals[i]);
  }
  if (cumulativeStake.equals(ZERO_BI)) {
    return ZERO_BD;
  }

  const halfStake = cumulativeStake.div(BigInt.fromI32(2));
  let runningStake = ZERO_BI;
  for (let bucket = 0; bucket < SCORE_BUCKETS; bucket++) {
    runningStake = runningStake.plus(totals[bucket]);
    if (runningStake.ge(halfStake)) {
      // bucket represents percentage points, return with two decimal precision
      const bucketValue = BigDecimal.fromString(bucket.toString());
      return bucketValue;
    }
  }
  return ZERO_BD;
}

function getLatencyUpperBound(bucket: i32): i32 {
  if (bucket < LATENCY_BUCKET_BOUNDS.length) {
    return LATENCY_BUCKET_BOUNDS[bucket];
  }
  const last = LATENCY_BUCKET_BOUNDS[LATENCY_BUCKET_BOUNDS.length - 1];
  return last * 2;
}

function computeLatencyP95(ownerType: string, ownerId: string, day: i32, window: i32): i32 {
  const totals = aggregateLatencyHistogram(ownerType, ownerId, day, window);
  let totalCount = ZERO_BI;
  for (let i = 0; i < LATENCY_BUCKET_COUNT; i++) {
    totalCount = totalCount.plus(totals[i]);
  }
  if (totalCount.equals(ZERO_BI)) {
    return 0;
  }

  const ninetyFive = totalCount.times(BigInt.fromI32(95));
  const target = ninetyFive.plus(BigInt.fromI32(99)).div(BigInt.fromI32(100)); // ceil(0.95 * total)
  let running = ZERO_BI;
  for (let bucket = 0; bucket < LATENCY_BUCKET_COUNT; bucket++) {
    running = running.plus(totals[bucket]);
    if (running.ge(target)) {
      return getLatencyUpperBound(bucket);
    }
  }
  return getLatencyUpperBound(LATENCY_BUCKET_COUNT - 1);
}

function computeAcceptanceRate(accepted: BigInt, minted: BigInt): BigDecimal {
  if (minted.equals(ZERO_BI)) {
    return ZERO_BD;
  }
  return accepted.toBigDecimal().div(minted.toBigDecimal());
}

function computeSlashingAdjustedYield(accepted: BigInt, slashAmount: BigInt, stake: BigInt): BigDecimal {
  if (stake.equals(ZERO_BI)) {
    return ZERO_BD;
  }
  const numerator = accepted.toBigDecimal().minus(slashAmount.toBigDecimal());
  return numerator.div(stake.toBigDecimal());
}

function computeWindowStartTimestamp(day: i32, window: i32): i32 {
  const startDay = day - window + 1;
  const normalizedDay = startDay > 0 ? startDay : 0;
  return normalizedDay * SECONDS_PER_DAY;
}

function updateAgentWindows(agentId: string, day: i32, timestamp: BigInt): void {
  for (let i = 0; i < WINDOW_OPTIONS.length; i++) {
    const window = WINDOW_OPTIONS[i];
    const aggregateId = agentId + "-" + window.toString();
    let aggregate = AgentMetricWindow.load(aggregateId);
    if (aggregate == null) {
      aggregate = new AgentMetricWindow(aggregateId);
      aggregate.agent = agentId;
      aggregate.windowDays = window;
      aggregate.windowStart = 0;
      aggregate.windowEnd = 0;
      aggregate.mintedCount = ZERO_BI;
      aggregate.acceptedCount = ZERO_BI;
      aggregate.validationCount = ZERO_BI;
      aggregate.stakeSum = ZERO_BI;
      aggregate.slashAmount = ZERO_BI;
      aggregate.acceptanceRate = ZERO_BD;
      aggregate.validatorWeightedQuality = ZERO_BD;
      aggregate.onTimeP95Seconds = 0;
      aggregate.slashingAdjustedYield = ZERO_BD;
      aggregate.updatedAt = 0;
    }

    let mintedTotal = ZERO_BI;
    let acceptedTotal = ZERO_BI;
    let validationTotal = ZERO_BI;
    let stakeTotal = ZERO_BI;
    let slashTotal = ZERO_BI;

    for (let offset = 0; offset < window; offset++) {
      const currentDay = day - offset;
      if (currentDay < 0) {
        break;
      }
      const metricId = agentId + "-" + currentDay.toString();
      const daily = AgentDailyMetric.load(metricId);
      if (daily != null) {
        mintedTotal = mintedTotal.plus(daily.mintedCount);
        acceptedTotal = acceptedTotal.plus(daily.acceptedCount);
        validationTotal = validationTotal.plus(daily.validationCount);
        stakeTotal = stakeTotal.plus(daily.stakeSum);
        slashTotal = slashTotal.plus(daily.slashAmount);
      }
    }

    aggregate.mintedCount = mintedTotal;
    aggregate.acceptedCount = acceptedTotal;
    aggregate.validationCount = validationTotal;
    aggregate.stakeSum = stakeTotal;
    aggregate.slashAmount = slashTotal;
    aggregate.acceptanceRate = computeAcceptanceRate(acceptedTotal, mintedTotal);
    aggregate.validatorWeightedQuality = computeQualityMedian(OWNER_AGENT, agentId, day, window);
    aggregate.onTimeP95Seconds = computeLatencyP95(OWNER_AGENT, agentId, day, window);
    aggregate.slashingAdjustedYield = computeSlashingAdjustedYield(acceptedTotal, slashTotal, stakeTotal);
    aggregate.windowStart = computeWindowStartTimestamp(day, window);
    aggregate.windowEnd = timestamp.toI32();
    aggregate.updatedAt = timestamp.toI32();
    aggregate.save();
  }
}

function updateNodeWindows(nodeId: string, day: i32, timestamp: BigInt): void {
  for (let i = 0; i < WINDOW_OPTIONS.length; i++) {
    const window = WINDOW_OPTIONS[i];
    const aggregateId = nodeId + "-" + window.toString();
    let aggregate = NodeMetricWindow.load(aggregateId);
    if (aggregate == null) {
      aggregate = new NodeMetricWindow(aggregateId);
      aggregate.node = nodeId;
      aggregate.windowDays = window;
      aggregate.windowStart = 0;
      aggregate.windowEnd = 0;
      aggregate.mintedCount = ZERO_BI;
      aggregate.acceptedCount = ZERO_BI;
      aggregate.validationCount = ZERO_BI;
      aggregate.stakeSum = ZERO_BI;
      aggregate.slashAmount = ZERO_BI;
      aggregate.acceptanceRate = ZERO_BD;
      aggregate.validatorWeightedQuality = ZERO_BD;
      aggregate.onTimeP95Seconds = 0;
      aggregate.slashingAdjustedYield = ZERO_BD;
      aggregate.updatedAt = 0;
    }

    let mintedTotal = ZERO_BI;
    let acceptedTotal = ZERO_BI;
    let validationTotal = ZERO_BI;
    let stakeTotal = ZERO_BI;
    let slashTotal = ZERO_BI;

    for (let offset = 0; offset < window; offset++) {
      const currentDay = day - offset;
      if (currentDay < 0) {
        break;
      }
      const metricId = nodeId + "-" + currentDay.toString();
      const daily = NodeDailyMetric.load(metricId);
      if (daily != null) {
        mintedTotal = mintedTotal.plus(daily.mintedCount);
        acceptedTotal = acceptedTotal.plus(daily.acceptedCount);
        validationTotal = validationTotal.plus(daily.validationCount);
        stakeTotal = stakeTotal.plus(daily.stakeSum);
        slashTotal = slashTotal.plus(daily.slashAmount);
      }
    }

    aggregate.mintedCount = mintedTotal;
    aggregate.acceptedCount = acceptedTotal;
    aggregate.validationCount = validationTotal;
    aggregate.stakeSum = stakeTotal;
    aggregate.slashAmount = slashTotal;
    aggregate.acceptanceRate = computeAcceptanceRate(acceptedTotal, mintedTotal);
    aggregate.validatorWeightedQuality = computeQualityMedian(OWNER_NODE, nodeId, day, window);
    aggregate.onTimeP95Seconds = computeLatencyP95(OWNER_NODE, nodeId, day, window);
    aggregate.slashingAdjustedYield = computeSlashingAdjustedYield(acceptedTotal, slashTotal, stakeTotal);
    aggregate.windowStart = computeWindowStartTimestamp(day, window);
    aggregate.windowEnd = timestamp.toI32();
    aggregate.updatedAt = timestamp.toI32();
    aggregate.save();
  }
}

function updateValidatorWindows(validatorId: string, day: i32, timestamp: BigInt): void {
  for (let i = 0; i < WINDOW_OPTIONS.length; i++) {
    const window = WINDOW_OPTIONS[i];
    const aggregateId = validatorId + "-" + window.toString();
    let aggregate = ValidatorMetricWindow.load(aggregateId);
    if (aggregate == null) {
      aggregate = new ValidatorMetricWindow(aggregateId);
      aggregate.validator = validatorId;
      aggregate.windowDays = window;
      aggregate.windowStart = 0;
      aggregate.windowEnd = 0;
      aggregate.mintedCount = ZERO_BI;
      aggregate.acceptedCount = ZERO_BI;
      aggregate.validationCount = ZERO_BI;
      aggregate.stakeSum = ZERO_BI;
      aggregate.slashAmount = ZERO_BI;
      aggregate.acceptanceRate = ZERO_BD;
      aggregate.validatorWeightedQuality = ZERO_BD;
      aggregate.onTimeP95Seconds = 0;
      aggregate.slashingAdjustedYield = ZERO_BD;
      aggregate.updatedAt = 0;
    }

    let mintedTotal = ZERO_BI;
    let acceptedTotal = ZERO_BI;
    let validationTotal = ZERO_BI;
    let stakeTotal = ZERO_BI;
    let slashTotal = ZERO_BI;

    for (let offset = 0; offset < window; offset++) {
      const currentDay = day - offset;
      if (currentDay < 0) {
        break;
      }
      const metricId = validatorId + "-" + currentDay.toString();
      const daily = ValidatorDailyMetric.load(metricId);
      if (daily != null) {
        mintedTotal = mintedTotal.plus(daily.mintedCount);
        acceptedTotal = acceptedTotal.plus(daily.acceptedCount);
        validationTotal = validationTotal.plus(daily.validationCount);
        stakeTotal = stakeTotal.plus(daily.stakeSum);
        slashTotal = slashTotal.plus(daily.slashAmount);
      }
    }

    aggregate.mintedCount = mintedTotal;
    aggregate.acceptedCount = acceptedTotal;
    aggregate.validationCount = validationTotal;
    aggregate.stakeSum = stakeTotal;
    aggregate.slashAmount = slashTotal;
    aggregate.acceptanceRate = computeAcceptanceRate(acceptedTotal, mintedTotal);
    aggregate.validatorWeightedQuality = computeQualityMedian(OWNER_VALIDATOR, validatorId, day, window);
    aggregate.onTimeP95Seconds = computeLatencyP95(OWNER_VALIDATOR, validatorId, day, window);
    aggregate.slashingAdjustedYield = computeSlashingAdjustedYield(acceptedTotal, slashTotal, stakeTotal);
    aggregate.windowStart = computeWindowStartTimestamp(day, window);
    aggregate.windowEnd = timestamp.toI32();
    aggregate.updatedAt = timestamp.toI32();
    aggregate.save();
  }
}

function resolveScoreBucket(score: BigInt): i32 {
  let bucket = score.toI32();
  if (bucket < 0) {
    bucket = 0;
  }
  if (bucket >= SCORE_BUCKETS) {
    bucket = SCORE_BUCKETS - 1;
  }
  return bucket;
}

function resolveLatencyBucket(durationSeconds: i32): i32 {
  for (let i = 0; i < LATENCY_BUCKET_BOUNDS.length; i++) {
    if (durationSeconds <= LATENCY_BUCKET_BOUNDS[i]) {
      return i;
    }
  }
  return LATENCY_BUCKET_COUNT - 1;
}

export function handleAlphaWUMinted(event: AlphaWUMinted): void {
  const agentId = event.params.agent.toHexString();
  const nodeId = event.params.node.toHexString();
  const workUnitId = event.params.id.toHexString();
  const mintedAt = event.params.mintedAt;
  const day = getDayFromTimestamp(mintedAt);

  const agent = getOrCreateAgent(agentId);
  agent.totalWorkUnits = agent.totalWorkUnits.plus(ONE_BI);
  agent.lastUpdated = mintedAt.toI32();
  agent.save();

  const node = getOrCreateNode(nodeId);
  node.totalWorkUnits = node.totalWorkUnits.plus(ONE_BI);
  node.lastUpdated = mintedAt.toI32();
  node.save();

  const workUnit = getOrCreateWorkUnit(workUnitId);
  workUnit.agent = agentId;
  workUnit.node = nodeId;
  workUnit.mintedAt = event.params.mintedAt.toI32();
  workUnit.totalSlashAmount = ZERO_BI;
  workUnit.validatorIds = new Array<string>();
  workUnit.save();

  updateAgentDaily(agentId, day, ONE_BI, ZERO_BI, ZERO_BI, ZERO_BI, ZERO_BI, ZERO_BI);
  updateNodeDaily(nodeId, day, ONE_BI, ZERO_BI, ZERO_BI, ZERO_BI, ZERO_BI, ZERO_BI);
  updateAgentWindows(agentId, day, mintedAt);
  updateNodeWindows(nodeId, day, mintedAt);
}

export function handleAlphaWUValidated(event: AlphaWUValidated): void {
  const workUnitId = event.params.id.toHexString();
  const workUnit = WorkUnit.load(workUnitId);
  if (workUnit == null) {
    return;
  }

  const validatedAt = event.params.validatedAt;
  const day = getDayFromTimestamp(validatedAt);
  const agentId = workUnit.agent;
  const nodeId = workUnit.node;
  const validatorId = event.params.validator.toHexString();
  const weightedScore = event.params.score.times(event.params.stake);
  const scoreBucket = resolveScoreBucket(event.params.score);

  const agent = getOrCreateAgent(agentId);
  agent.totalValidations = agent.totalValidations.plus(ONE_BI);
  agent.totalStake = agent.totalStake.plus(event.params.stake);
  agent.lastUpdated = validatedAt.toI32();
  agent.save();

  const node = getOrCreateNode(nodeId);
  node.totalValidations = node.totalValidations.plus(ONE_BI);
  node.totalStake = node.totalStake.plus(event.params.stake);
  node.lastUpdated = validatedAt.toI32();
  node.save();

  const validator = getOrCreateValidator(validatorId);
  let mintedDelta = ZERO_BI;
  let participation = ValidatorParticipation.load(workUnitId + "-" + validatorId);
  if (participation == null) {
    participation = getOrCreateParticipation(workUnitId, validatorId);
    mintedDelta = ONE_BI;
    validator.totalWorkUnits = validator.totalWorkUnits.plus(ONE_BI);
    const validatorIds = workUnit.validatorIds;
    validatorIds.push(validatorId);
    workUnit.validatorIds = validatorIds;
  } else {
    participation = getOrCreateParticipation(workUnitId, validatorId);
  }

  validator.totalValidations = validator.totalValidations.plus(ONE_BI);
  validator.totalStake = validator.totalStake.plus(event.params.stake);
  validator.lastUpdated = validatedAt.toI32();
  validator.save();

  participation.stake = participation.stake.plus(event.params.stake);
  participation.score = event.params.score;
  participation.lastValidatedAt = event.params.validatedAt.toI32();
  participation.save();

  workUnit.validationCount = workUnit.validationCount.plus(ONE_BI);
  workUnit.totalScore = workUnit.totalScore.plus(event.params.score);
  workUnit.totalStake = workUnit.totalStake.plus(event.params.stake);
  workUnit.lastValidatedAt = event.params.validatedAt.toI32();
  workUnit.save();

  updateAgentDaily(agentId, day, ZERO_BI, ZERO_BI, ONE_BI, weightedScore, event.params.stake, ZERO_BI);
  updateNodeDaily(nodeId, day, ZERO_BI, ZERO_BI, ONE_BI, weightedScore, event.params.stake, ZERO_BI);
  updateValidatorDaily(validatorId, day, mintedDelta, ZERO_BI, ONE_BI, weightedScore, event.params.stake, ZERO_BI);

  updateQualityHistogram(OWNER_AGENT, agentId, day, scoreBucket, event.params.stake);
  updateQualityHistogram(OWNER_NODE, nodeId, day, scoreBucket, event.params.stake);
  updateQualityHistogram(OWNER_VALIDATOR, validatorId, day, scoreBucket, event.params.stake);

  updateAgentWindows(agentId, day, validatedAt);
  updateNodeWindows(nodeId, day, validatedAt);
  updateValidatorWindows(validatorId, day, validatedAt);
}

export function handleAlphaWUAccepted(event: AlphaWUAccepted): void {
  const workUnitId = event.params.id.toHexString();
  const workUnit = WorkUnit.load(workUnitId);
  if (workUnit == null) {
    return;
  }

  const acceptedAt = event.params.acceptedAt;
  const day = getDayFromTimestamp(acceptedAt);
  const agentId = workUnit.agent;
  const nodeId = workUnit.node;
  const durationSeconds = event.params.acceptedAt.toI32() - workUnit.mintedAt;
  const latencyBucket = resolveLatencyBucket(durationSeconds);

  const agent = getOrCreateAgent(agentId);
  agent.totalAccepted = agent.totalAccepted.plus(ONE_BI);
  agent.lastUpdated = acceptedAt.toI32();
  agent.save();

  const node = getOrCreateNode(nodeId);
  node.totalAccepted = node.totalAccepted.plus(ONE_BI);
  node.lastUpdated = acceptedAt.toI32();
  node.save();

  workUnit.acceptedAt = event.params.acceptedAt.toI32();
  workUnit.save();

  updateLatencyHistogram(OWNER_AGENT, agentId, day, latencyBucket, ONE_BI);
  updateLatencyHistogram(OWNER_NODE, nodeId, day, latencyBucket, ONE_BI);

  updateAgentDaily(agentId, day, ZERO_BI, ONE_BI, ZERO_BI, ZERO_BI, ZERO_BI, ZERO_BI);
  updateNodeDaily(nodeId, day, ZERO_BI, ONE_BI, ZERO_BI, ZERO_BI, ZERO_BI, ZERO_BI);

  const validatorIds = workUnit.validatorIds;
  for (let i = 0; i < validatorIds.length; i++) {
    const validatorId = validatorIds[i];
    const validator = getOrCreateValidator(validatorId);
    validator.totalAccepted = validator.totalAccepted.plus(ONE_BI);
    validator.lastUpdated = acceptedAt.toI32();
    validator.save();

    updateValidatorDaily(validatorId, day, ZERO_BI, ONE_BI, ZERO_BI, ZERO_BI, ZERO_BI, ZERO_BI);
    updateLatencyHistogram(OWNER_VALIDATOR, validatorId, day, latencyBucket, ONE_BI);
    updateValidatorWindows(validatorId, day, acceptedAt);
  }

  updateAgentWindows(agentId, day, acceptedAt);
  updateNodeWindows(nodeId, day, acceptedAt);
}

export function handleSlashApplied(event: SlashApplied): void {
  const workUnitId = event.params.id.toHexString();
  const workUnit = WorkUnit.load(workUnitId);
  if (workUnit == null) {
    return;
  }

  const slashedAt = event.params.slashedAt;
  const day = getDayFromTimestamp(slashedAt);
  const agentId = workUnit.agent;
  const nodeId = workUnit.node;
  const validatorId = event.params.validator.toHexString();
  const slashAmount = event.params.amount;

  const agent = getOrCreateAgent(agentId);
  agent.totalSlashAmount = agent.totalSlashAmount.plus(slashAmount);
  agent.lastUpdated = slashedAt.toI32();
  agent.save();

  const node = getOrCreateNode(nodeId);
  node.totalSlashAmount = node.totalSlashAmount.plus(slashAmount);
  node.lastUpdated = slashedAt.toI32();
  node.save();

  const validator = getOrCreateValidator(validatorId);
  validator.totalSlashAmount = validator.totalSlashAmount.plus(slashAmount);
  validator.lastUpdated = slashedAt.toI32();
  validator.save();

  workUnit.totalSlashAmount = workUnit.totalSlashAmount.plus(slashAmount);
  workUnit.save();

  const slashId = event.transaction.hash.toHexString() + "-" + event.logIndex.toString();
  const slashRecord = new SlashEvent(slashId);
  slashRecord.workUnit = workUnitId;
  slashRecord.validator = validatorId;
  slashRecord.amount = slashAmount;
  slashRecord.slashedAt = slashedAt.toI32();
  slashRecord.save();

  updateAgentDaily(agentId, day, ZERO_BI, ZERO_BI, ZERO_BI, ZERO_BI, ZERO_BI, slashAmount);
  updateNodeDaily(nodeId, day, ZERO_BI, ZERO_BI, ZERO_BI, ZERO_BI, ZERO_BI, slashAmount);
  updateValidatorDaily(validatorId, day, ZERO_BI, ZERO_BI, ZERO_BI, ZERO_BI, ZERO_BI, slashAmount);

  updateAgentWindows(agentId, day, slashedAt);
  updateNodeWindows(nodeId, day, slashedAt);
  updateValidatorWindows(validatorId, day, slashedAt);
}
