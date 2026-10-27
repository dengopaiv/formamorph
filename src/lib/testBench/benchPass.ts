/**
 * The Bench's background pass over the edited world: the rule findings with their seen-record keys. Pure,
 * so it runs the same in the Bench worker and in-thread where no worker exists.
 */
import { findingKeys, type FindingKeys } from './findingKeys';
import { runRules, type Finding, type RuleWorld } from './rules';

export interface BenchPassResult {
  findings: Finding[];
  /** Each finding's keys, in the same order, so the receiver skips hashing them again. */
  keys: FindingKeys[];
}

/** A pass's answer as the worker sends it: the findings only when they differ from its last answer. */
export type BenchReply = Partial<BenchPassResult>;

/** Passes over a mirrored world, replying without findings while they stay as last sent, so an edit that
 *  changes no finding costs the editor no transfer and no re-render of the list. */
export function createBenchReplier(): (world: RuleWorld) => BenchReply {
  const pass = createBenchPass();
  let lastSaid: string | null = null;
  return (world) => {
    const result = pass(world);
    const said = JSON.stringify(result.findings);
    if (said === lastSaid) return {};
    lastSaid = said;
    return result;
  };
}

/** A pass over the rules. */
export function createBenchPass(): (world: RuleWorld) => BenchPassResult {
  return (world) => {
    const findings = runRules(world);
    return { findings, keys: findings.map(findingKeys) };
  };
}
