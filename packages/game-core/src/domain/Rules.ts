/** Match-level rules that the simulation and flow read from state/config. */
export interface MatchRules {
  /** Planning window per turn in seconds. `null` disables the timer. */
  readonly turnDurationSeconds: number | null;
  /**
   * When false, a shot that reaches a teammate's ship is stopped without
   * dealing damage.
   */
  readonly friendlyFire: boolean;
  /**
   * End the planning window as soon as every human has locked in, instead of
   * waiting for the timer. (Always true in effect when the timer is disabled,
   * otherwise a match could never advance.)
   */
  readonly endTurnWhenAllLocked: boolean;
}
