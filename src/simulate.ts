import { availableActions, createSwap, transition } from "./state-machine.js";
import { classifyClaim } from "./claim-safety.js";
import { summarizeOutcome } from "./outcome.js";
import type { ClaimClassification, Scenario, ScenarioResult, TraceEntry, TransitionError } from "./types.js";

/**
 * A rejected claim still published b when it was submitted too late or after
 * the refund. Rejections for the wrong role or a missing phase before ready
 * are not counted, because no honest claimer would have broadcast those.
 */
const claimLeaks = (error: TransitionError | null, phaseBefore: string): boolean =>
  error !== null && (error.code === "DEADLINE_PASSED" || (error.code === "INVALID_PHASE" && phaseBefore === "Refunded"));

/**
 * Plays scripted steps against the state machine with a fake clock.
 * A rejected step is recorded in the trace and the state is left unchanged,
 * so scenarios can show invalid attempts. Step times must not go backwards.
 */
export function runScenario(scenario: Scenario): ScenarioResult {
  let state = createSwap(scenario.terms);
  const trace: TraceEntry[] = [];
  let clock = 0;
  let bExposed = false;
  const unsafeClaimSteps: number[] = [];

  scenario.steps.forEach((step, i) => {
    if (step.at < clock) {
      throw new RangeError(`step ${i + 1} at ${step.at} is before the previous step at ${clock}`);
    }
    clock = step.at;
    const before = state.phase;
    const t1At = state.t1At;
    let claimSafety: ClaimClassification | null = null;
    if (step.event.type === "Claim" && t1At !== null) {
      claimSafety = classifyClaim(t1At, clock, scenario.terms.claimSafetyMarginSec ?? 0);
      if (claimSafety.zone !== "safe") unsafeClaimSteps.push(i + 1);
    }
    const result = transition(state, step.event, clock);
    if (result.ok) state = result.state;
    const leaksB = step.event.type === "Claim" && !result.ok && claimLeaks(result.error, before);
    if (leaksB) bExposed = true;
    trace.push({
      step: i + 1,
      at: clock,
      event: step.event,
      ok: result.ok,
      phaseBefore: before,
      phaseAfter: state.phase,
      xmrAfter: state.xmr,
      error: result.ok ? null : result.error,
      available: availableActions(state, clock),
      note: step.note ?? null,
      claimSafety,
      leaksB,
    });
  });

  return {
    scenario: scenario.name,
    trace,
    finalState: state,
    direction: scenario.direction ?? null,
    claimRoute: scenario.claimRoute ?? "self",
    bExposed,
    unsafeClaimSteps,
  };
}

export function formatTrace(result: ScenarioResult): string {
  const lines: string[] = [`scenario: ${result.scenario}`, ""];
  for (const t of result.trace) {
    const who = "by" in t.event ? ` (${t.event.by})` : "";
    const head = `t=${String(t.at).padStart(6)}s  #${t.step}  ${t.event.type}${who}`;
    if (t.ok) {
      lines.push(`${head}  ->  ${t.phaseAfter}, xmr ${t.xmrAfter}`);
    } else {
      lines.push(`${head}  REJECTED ${t.error?.code}: ${t.error?.message}`);
    }
    if (t.claimSafety && t.claimSafety.zone !== "safe") lines.push(`             UNSAFE CLAIM (${t.claimSafety.zone}): ${t.claimSafety.explanation}`);
    if (t.leaksB) lines.push("             LEAK: the claim was rejected but b was in its data, so the ETH holder can read it.");
    if (t.note) lines.push(`             ${t.note}`);
  }
  const s = result.finalState;
  lines.push(
    "",
    `final: phase ${s.phase}, xmr ${s.xmr}, a public ${s.revealedA}, b public ${s.revealedB}, ready without confirmed lock ${s.readyWithoutConfirmedLock}`,
  );
  const outcome = summarizeOutcome(result);
  lines.push(`outcome: ${outcome.summary}`);
  return lines.join("\n");
}
