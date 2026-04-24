import { ON_RAMP_DURATION } from './constants';

export type TitleState = {
  phase: 'title';
};

export type OnRampState = {
  phase: 'onRamp';
  elapsedSeconds: number;
};

export type RunningState = {
  phase: 'running';
  elapsedSeconds: number;
  distanceMeters: number;
};

export type GameOverState = {
  phase: 'gameOver';
  distanceMeters: number;
  durationSeconds: number;
  bestCombo: number;
};

export type GameState = TitleState | OnRampState | RunningState | GameOverState;

export function titleState(): TitleState {
  return { phase: 'title' };
}

export function startOnRamp(): OnRampState {
  return { phase: 'onRamp', elapsedSeconds: 0 };
}

export function tickOnRamp(state: OnRampState, dtSeconds: number): OnRampState | RunningState {
  const elapsed = state.elapsedSeconds + dtSeconds;
  if (elapsed >= ON_RAMP_DURATION) {
    return startRun();
  }
  return { phase: 'onRamp', elapsedSeconds: elapsed };
}

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

export function crashRun(state: RunningState, bestCombo: number): GameOverState {
  return {
    phase: 'gameOver',
    distanceMeters: state.distanceMeters,
    durationSeconds: state.elapsedSeconds,
    bestCombo,
  };
}
