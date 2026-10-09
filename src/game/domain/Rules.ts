/** Match-level rules that the simulation and flow read from state/config. */
export interface MatchRules {
  /** Planning window per turn in seconds. `null` disables the timer. */
  readonly turnDurationSeconds: number | null;
  /**
   * When false, a shot that reaches a teammate's ship is stopped without
   * dealing damage.
   */
  readonly friendlyFire: boolean;
}
