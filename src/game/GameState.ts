export type RunningState = {
  phase: 'running';
  elapsedSeconds: number;
  distanceMeters: number;
};

export type GameOverState = {
  phase: 'gameOver';
  distanceMeters: number;
  durationSeconds: number;
};

export type GameState = RunningState | GameOverState;

export function startRun(): RunningState {
  return { phase: 'running', elapsedSeconds: 0, distanceMeters: 0 };
}

export function tickRun(
  state: RunningState,
  dtSeconds: number,
  speedMs: number,
): RunningState {
  return {
    phase: 'running',
    elapsedSeconds: state.elapsedSeconds + dtSeconds,
    distanceMeters: state.distanceMeters + speedMs * dtSeconds,
  };
}

export function crashRun(state: RunningState): GameOverState {
  return {
    phase: 'gameOver',
    distanceMeters: state.distanceMeters,
    durationSeconds: state.elapsedSeconds,
  };
}
