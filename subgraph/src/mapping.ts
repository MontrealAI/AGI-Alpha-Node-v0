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
  WorkUnit,
  AgentDailyMetric,
  NodeDailyMetric,
  AgentMetricWindow,
  NodeMetricWindow,
} from "../generated/schema";

const ZERO_BI = BigInt.fromI32(0);
const ONE_BI = BigInt.fromI32(1);
const ZERO_BD = BigDecimal.fromString("0");
const SECONDS_PER_DAY = 86400;
const WINDOW_OPTIONS: i32[] = [7, 30];

function getOrCreateAgent(id: string): Agent {
  let entity = Agent.load(id);
  if (entity == null) {
    entity = new Agent(id);
    entity.totalWorkUnits = ZERO_BI;
    entity.totalAccepted = ZERO_BI;
    entity.totalValidations = ZERO_BI;
    entity.totalSlashAmount = ZERO_BI;
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
    entity.lastUpdated = 0;
  }
  return entity as Node;
}

function getOrCreateWorkUnit(id: string): WorkUnit {
  let entity = WorkUnit.load(id);
  if (entity == null) {
    entity = new WorkUnit(id);
    entity.mintedAt = 0;
    entity.acceptedAt = null;
    entity.lastValidatedAt = null;
    entity.validationCount = ZERO_BI;
    entity.totalScore = ZERO_BI;
    entity.totalStake = ZERO_BI;
  }
  return entity as WorkUnit;
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
    metric.slashAmount = ZERO_BI;
  }

  metric.mintedCount = metric.mintedCount.plus(mintedDelta);
  metric.acceptedCount = metric.acceptedCount.plus(acceptedDelta);
  metric.validationCount = metric.validationCount.plus(validationDelta);
  metric.scoreSum = metric.scoreSum.plus(scoreDelta);
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
    metric.slashAmount = ZERO_BI;
  }

  metric.mintedCount = metric.mintedCount.plus(mintedDelta);
  metric.acceptedCount = metric.acceptedCount.plus(acceptedDelta);
  metric.validationCount = metric.validationCount.plus(validationDelta);
  metric.scoreSum = metric.scoreSum.plus(scoreDelta);
  metric.slashAmount = metric.slashAmount.plus(slashDelta);
  metric.save();
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
      aggregate.mintedCount = ZERO_BI;
      aggregate.acceptedCount = ZERO_BI;
      aggregate.validationCount = ZERO_BI;
      aggregate.averageScore = ZERO_BD;
      aggregate.slashAmount = ZERO_BI;
      aggregate.updatedAt = 0;
    }

    let mintedTotal = ZERO_BI;
    let acceptedTotal = ZERO_BI;
    let validationTotal = ZERO_BI;
    let scoreTotal = ZERO_BI;
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
        scoreTotal = scoreTotal.plus(daily.scoreSum);
        slashTotal = slashTotal.plus(daily.slashAmount);
      }
    }

    aggregate.mintedCount = mintedTotal;
    aggregate.acceptedCount = acceptedTotal;
    aggregate.validationCount = validationTotal;
    aggregate.slashAmount = slashTotal;

    if (validationTotal.gt(ZERO_BI)) {
      aggregate.averageScore = scoreTotal.toBigDecimal().div(validationTotal.toBigDecimal());
    } else {
      aggregate.averageScore = ZERO_BD;
    }

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
      aggregate.mintedCount = ZERO_BI;
      aggregate.acceptedCount = ZERO_BI;
      aggregate.validationCount = ZERO_BI;
      aggregate.averageScore = ZERO_BD;
      aggregate.slashAmount = ZERO_BI;
      aggregate.updatedAt = 0;
    }

    let mintedTotal = ZERO_BI;
    let acceptedTotal = ZERO_BI;
    let validationTotal = ZERO_BI;
    let scoreTotal = ZERO_BI;
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
        scoreTotal = scoreTotal.plus(daily.scoreSum);
        slashTotal = slashTotal.plus(daily.slashAmount);
      }
    }

    aggregate.mintedCount = mintedTotal;
    aggregate.acceptedCount = acceptedTotal;
    aggregate.validationCount = validationTotal;
    aggregate.slashAmount = slashTotal;

    if (validationTotal.gt(ZERO_BI)) {
      aggregate.averageScore = scoreTotal.toBigDecimal().div(validationTotal.toBigDecimal());
    } else {
      aggregate.averageScore = ZERO_BD;
    }

    aggregate.updatedAt = timestamp.toI32();
    aggregate.save();
  }
}

export function handleAlphaWUMinted(event: AlphaWUMinted): void {
  const agentId = event.params.agent.toHexString();
  const nodeId = event.params.node.toHexString();
  const workUnitId = event.params.id.toHexString();
  const timestamp = event.block.timestamp;
  const day = getDayFromTimestamp(timestamp);

  const agent = getOrCreateAgent(agentId);
  agent.totalWorkUnits = agent.totalWorkUnits.plus(ONE_BI);
  agent.lastUpdated = timestamp.toI32();
  agent.save();

  const node = getOrCreateNode(nodeId);
  node.totalWorkUnits = node.totalWorkUnits.plus(ONE_BI);
  node.lastUpdated = timestamp.toI32();
  node.save();

  const workUnit = getOrCreateWorkUnit(workUnitId);
  workUnit.agent = agentId;
  workUnit.node = nodeId;
  workUnit.mintedAt = event.params.timestamp.toI32();
  workUnit.save();

  updateAgentDaily(agentId, day, ONE_BI, ZERO_BI, ZERO_BI, ZERO_BI, ZERO_BI);
  updateNodeDaily(nodeId, day, ONE_BI, ZERO_BI, ZERO_BI, ZERO_BI, ZERO_BI);
  updateAgentWindows(agentId, day, timestamp);
  updateNodeWindows(nodeId, day, timestamp);
}

export function handleAlphaWUValidated(event: AlphaWUValidated): void {
  const workUnitId = event.params.id.toHexString();
  const workUnit = WorkUnit.load(workUnitId);
  if (workUnit == null) {
    return;
  }

  const timestamp = event.block.timestamp;
  const day = getDayFromTimestamp(timestamp);
  const agentId = workUnit.agent;
  const nodeId = workUnit.node;

  const agent = getOrCreateAgent(agentId);
  agent.totalValidations = agent.totalValidations.plus(ONE_BI);
  agent.lastUpdated = timestamp.toI32();
  agent.save();

  const node = getOrCreateNode(nodeId);
  node.totalValidations = node.totalValidations.plus(ONE_BI);
  node.lastUpdated = timestamp.toI32();
  node.save();

  workUnit.validationCount = workUnit.validationCount.plus(ONE_BI);
  workUnit.totalScore = workUnit.totalScore.plus(event.params.score);
  workUnit.totalStake = workUnit.totalStake.plus(event.params.stakeAmount);
  workUnit.lastValidatedAt = event.params.timestamp.toI32();
  workUnit.save();

  updateAgentDaily(agentId, day, ZERO_BI, ZERO_BI, ONE_BI, event.params.score, ZERO_BI);
  updateNodeDaily(nodeId, day, ZERO_BI, ZERO_BI, ONE_BI, event.params.score, ZERO_BI);
  updateAgentWindows(agentId, day, timestamp);
  updateNodeWindows(nodeId, day, timestamp);
}

export function handleAlphaWUAccepted(event: AlphaWUAccepted): void {
  const workUnitId = event.params.id.toHexString();
  const workUnit = WorkUnit.load(workUnitId);
  if (workUnit == null) {
    return;
  }

  const timestamp = event.block.timestamp;
  const day = getDayFromTimestamp(timestamp);
  const agentId = workUnit.agent;
  const nodeId = workUnit.node;

  const agent = getOrCreateAgent(agentId);
  agent.totalAccepted = agent.totalAccepted.plus(ONE_BI);
  agent.lastUpdated = timestamp.toI32();
  agent.save();

  const node = getOrCreateNode(nodeId);
  node.totalAccepted = node.totalAccepted.plus(ONE_BI);
  node.lastUpdated = timestamp.toI32();
  node.save();

  workUnit.acceptedAt = event.params.timestamp.toI32();
  workUnit.save();

  updateAgentDaily(agentId, day, ZERO_BI, ONE_BI, ZERO_BI, ZERO_BI, ZERO_BI);
  updateNodeDaily(nodeId, day, ZERO_BI, ONE_BI, ZERO_BI, ZERO_BI, ZERO_BI);
  updateAgentWindows(agentId, day, timestamp);
  updateNodeWindows(nodeId, day, timestamp);
}

export function handleSlashApplied(event: SlashApplied): void {
  const workUnitId = event.params.id.toHexString();
  const workUnit = WorkUnit.load(workUnitId);
  if (workUnit == null) {
    return;
  }

  const timestamp = event.block.timestamp;
  const day = getDayFromTimestamp(timestamp);
  const agentId = workUnit.agent;
  const nodeId = workUnit.node;

  const agent = getOrCreateAgent(agentId);
  agent.totalSlashAmount = agent.totalSlashAmount.plus(event.params.amount);
  agent.lastUpdated = timestamp.toI32();
  agent.save();

  const node = getOrCreateNode(nodeId);
  node.totalSlashAmount = node.totalSlashAmount.plus(event.params.amount);
  node.lastUpdated = timestamp.toI32();
  node.save();

  updateAgentDaily(agentId, day, ZERO_BI, ZERO_BI, ZERO_BI, ZERO_BI, event.params.amount);
  updateNodeDaily(nodeId, day, ZERO_BI, ZERO_BI, ZERO_BI, ZERO_BI, event.params.amount);
  updateAgentWindows(agentId, day, timestamp);
  updateNodeWindows(nodeId, day, timestamp);
}
