import normalRandom from './normalRandom';

export const SUNRUN_DURATION_JITTER_SECONDS = 20;

export interface SunRunDurationBounds {
  minSeconds: number;
  maxSeconds: number;
}

const normalizePositiveNumber = (value: unknown) => {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
};

export const getSunRunDurationBounds = (
  minTime: unknown,
  maxTime: unknown,
): SunRunDurationBounds | null => {
  const minMinutes = normalizePositiveNumber(minTime);
  const maxMinutes = normalizePositiveNumber(maxTime);
  if (minMinutes == null || maxMinutes == null) return null;

  const minSeconds = Math.max(1, Math.round(minMinutes * 60));
  const maxSeconds = Math.max(minSeconds, Math.round(maxMinutes * 60));
  return { minSeconds, maxSeconds };
};

export const clampSunRunDurationSeconds = (
  seconds: number,
  bounds: SunRunDurationBounds,
) => {
  const normalized = Math.round(seconds);
  return Math.min(bounds.maxSeconds, Math.max(bounds.minSeconds, normalized));
};

export const pickRandomReasonableSunRunDurationSeconds = (
  bounds: SunRunDurationBounds,
) => {
  const mean = bounds.minSeconds + bounds.maxSeconds / 2;
  const std = Math.max(1, Math.abs(bounds.maxSeconds - mean) / 3);
  return clampSunRunDurationSeconds(
    Math.round(normalRandom(mean, std)),
    bounds,
  );
};

export const pickSunRunDurationAroundBaseSeconds = (
  baseSeconds: number,
  bounds: SunRunDurationBounds,
  jitterSeconds = SUNRUN_DURATION_JITTER_SECONDS,
) => {
  const clampedBase = clampSunRunDurationSeconds(baseSeconds, bounds);
  const safeJitter = Math.max(0, Math.round(jitterSeconds));
  const min = Math.max(bounds.minSeconds, clampedBase - safeJitter);
  const max = Math.min(bounds.maxSeconds, clampedBase + safeJitter);
  if (min >= max) return clampedBase;
  return min + Math.floor(Math.random() * (max - min + 1));
};

export const formatSunRunDurationSeconds = (seconds: number | null | undefined) => {
  if (!Number.isFinite(seconds)) return '--:--:--';
  const total = Math.max(0, Math.round(Number(seconds)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return [hours, minutes, secs].map((value) => String(value).padStart(2, '0')).join(':');
};

export const normalizeSunRunDurationSeconds = (value: unknown) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.round(num);
};
