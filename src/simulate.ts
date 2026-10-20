import { availableActions, createSwap, transition } from "./state-machine.js";
import type { Scenario, ScenarioResult, TraceEntry } from "./types.js";

/**
 * Plays scripted steps against the state machine with a fake clock.
 * A rejected step is recorded in the trace and the state is left unchanged,
 * so scenarios can show invalid attempts. Step times must not go backwards.
 */
export function runScenario(scenario: Scenario): ScenarioResult {
  let state = createSwap(scenario.terms);
  const trace: TraceEntry[] = [];
  let clock = 0;

  scenario.steps.forEach((step, i) => {
    if (step.at < clock) {
      throw new RangeError(`step ${i + 1} at ${step.at} is before the previous step at ${clock}`);
    }
    clock = step.at;
    const before = state.phase;
    const result = transition(state, step.event, clock);
    if (result.ok) state = result.state;
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
    });
  });

  return { scenario: scenario.name, trace, finalState: state };
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
    if (t.note) lines.push(`             ${t.note}`);
  }
  const s = result.finalState;
  lines.push(
    "",
    `final: phase ${s.phase}, xmr ${s.xmr}, a public ${s.revealedA}, b public ${s.revealedB}, ready without confirmed lock ${s.readyWithoutConfirmedLock}`,
  );
  return lines.join("\n");
}
