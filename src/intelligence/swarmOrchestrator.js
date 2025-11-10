function validateAgent(agent, index) {
  if (!agent || typeof agent !== 'object') {
    throw new Error(`Agent at index ${index} must be an object`);
  }
  if (!agent.name) {
    throw new Error(`Agent at index ${index} requires a name`);
  }
  if (!Array.isArray(agent.domains) || agent.domains.length === 0) {
    throw new Error(`Agent ${agent.name} must declare at least one domain`);
  }
  if (!Number.isFinite(agent.capacity) || agent.capacity <= 0) {
    throw new Error(`Agent ${agent.name} must have a capacity > 0`);
  }
  return {
    name: agent.name,
    domains: agent.domains.map((domain) => domain.toLowerCase()),
    capacity: Math.floor(agent.capacity),
    latencyMs: Number.isFinite(agent.latencyMs) ? agent.latencyMs : 120,
    quality: Number.isFinite(agent.quality) ? agent.quality : 0.9,
    capability: Number.isFinite(agent.capability) ? agent.capability : 6
  };
}

function validateTask(task, index) {
  if (!task || typeof task !== 'object') {
    throw new Error(`Task at index ${index} must be an object`);
  }
  if (!task.domain) {
    throw new Error(`Task at index ${index} must specify a domain`);
  }
  if (!Number.isFinite(task.complexity) || task.complexity <= 0) {
    throw new Error(`Task ${task.domain} must have complexity > 0`);
  }
  return {
    name: task.name ?? `${task.domain}-task-${index + 1}`,
    domain: task.domain.toLowerCase(),
    complexity: task.complexity,
    urgency: Number.isFinite(task.urgency) ? task.urgency : 1,
    value: Number.isFinite(task.value) ? task.value : 1
  };
}

function scoreAgentForTask(agent, task, latencyBudgetMs) {
  const domainAffinity = agent.domains.includes(task.domain) ? 1 : 0.4;
  const capabilityRatio = agent.capability / task.complexity;
  const capabilityScore = capabilityRatio >= 1 ? 1 : capabilityRatio;
  const latencyScore = agent.latencyMs <= latencyBudgetMs ? 1 : latencyBudgetMs / agent.latencyMs;
  const qualityScore = agent.quality;
  const score = domainAffinity * (0.4 + 0.3 * capabilityScore + 0.2 * latencyScore + 0.1 * qualityScore);
  return score;
}

export function orchestrateSwarm({ tasks, agents, latencyBudgetMs = 250 }) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error('tasks must contain at least one entry');
  }
  if (!Array.isArray(agents) || agents.length === 0) {
    throw new Error('agents must contain at least one entry');
  }
  const normalizedAgents = agents.map(validateAgent);
  const normalizedTasks = tasks.map(validateTask);

  const assignments = [];
  const fallbackAssignments = [];
  const capacityState = new Map();
  normalizedAgents.forEach((agent) => capacityState.set(agent.name, agent.capacity));

  const sortedTasks = [...normalizedTasks].sort((a, b) => {
    if (b.urgency !== a.urgency) return b.urgency - a.urgency;
    return b.value - a.value;
  });

  for (const task of sortedTasks) {
    const ranked = normalizedAgents
      .map((agent) => ({
        agent,
        score: scoreAgentForTask(agent, task, latencyBudgetMs)
      }))
      .sort((a, b) => b.score - a.score);

    const primary = ranked.find((candidate) => (capacityState.get(candidate.agent.name) ?? 0) > 0);
    if (primary) {
      capacityState.set(primary.agent.name, capacityState.get(primary.agent.name) - 1);
      assignments.push({
        task,
        agent: primary.agent,
        score: primary.score
      });
    }

    const fallback = ranked.find((candidate) => candidate.agent.name !== primary?.agent.name);
    if (fallback) {
      fallbackAssignments.push({
        task,
        agent: fallback.agent,
        score: fallback.score
      });
    }
  }

  const utilization = normalizedAgents.map((agent) => {
    const used = agent.capacity - (capacityState.get(agent.name) ?? 0);
    return {
      agent: agent.name,
      used,
      capacity: agent.capacity,
      utilization: agent.capacity === 0 ? 0 : used / agent.capacity
    };
  });

  return {
    assignments,
    fallbacks: fallbackAssignments,
    utilization,
    latencyBudgetMs
  };
}
