import { format, intervalToDuration } from 'date-fns';
import type SunRunExercisesRequest from '../types/requestTypes/SunRunExercisesRequest';
import generateMac from '../utils/generateMac';
import {
  SUNRUN_DURATION_JITTER_SECONDS,
  clampSunRunDurationSeconds,
  getSunRunDurationBounds,
  normalizeSunRunDurationSeconds,
  pickRandomReasonableSunRunDurationSeconds,
  pickSunRunDurationAroundBaseSeconds,
} from '../utils/sunrunDuration';
import timeUtil from '../utils/timeUtil';

const BEIJING_OFFSET_MINUTES = 8 * 60;

const offsetDiffMs = () => {
  const currentOffsetMinutes = -new Date().getTimezoneOffset();
  return (BEIJING_OFFSET_MINUTES - currentOffsetMinutes) * 60_000;
};

const parseCustomEndTime = (customEndTime?: string | Date) => {
  if (!customEndTime) return null;
  if (customEndTime instanceof Date) return customEndTime;

  const normalized = customEndTime.trim().replace(' ', 'T');
  if (!normalized) return null;

  const withSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)
    ? `${normalized}:00`
    : normalized;
  const withZone = /([+-]\d{2}:?\d{2}|Z)$/i.test(withSeconds)
    ? withSeconds
    : `${withSeconds}+08:00`;

  const parsed = new Date(withZone);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const generateRunReq = async ({
  distance,
  routeId,
  taskId,
  token,
  schoolId: _schoolId,
  stuNumber,
  phoneNumber,
  minTime,
  maxTime,
  customEndTime,
  requestedDurationSeconds,
  durationPreferenceBaseSeconds,
  durationJitterSeconds,
}: {
  distance: string;
  routeId: string;
  taskId: string;
  token: string;
  schoolId: string;
  stuNumber: string;
  phoneNumber: string;
  minTime: string;
  maxTime: string;
  customEndTime?: string | Date;
  requestedDurationSeconds?: number | null;
  durationPreferenceBaseSeconds?: number | null;
  durationJitterSeconds?: number | null;
}) => {
  const bounds = getSunRunDurationBounds(minTime, maxTime);
  const requestedSeconds = normalizeSunRunDurationSeconds(requestedDurationSeconds);
  const baseSeconds = normalizeSunRunDurationSeconds(durationPreferenceBaseSeconds);
  const safeJitterSeconds =
    normalizeSunRunDurationSeconds(durationJitterSeconds) ?? SUNRUN_DURATION_JITTER_SECONDS;
  const waitSecond = requestedSeconds != null && bounds
    ? clampSunRunDurationSeconds(requestedSeconds, bounds)
    : baseSeconds != null && bounds
      ? pickSunRunDurationAroundBaseSeconds(baseSeconds, bounds, safeJitterSeconds)
      : bounds
        ? pickRandomReasonableSunRunDurationSeconds(bounds)
        : Math.max(1, Math.round((Number(minTime) || Number(maxTime) || 1) * 60));

  const diffMs = offsetDiffMs();
  const now = new Date();
  const parsedCustomEnd = parseCustomEndTime(customEndTime);

  const defaultLocalStart = new Date(now.getTime() + diffMs);
  const defaultLocalEnd = new Date(now.getTime() + waitSecond * 1000 + diffMs);

  const localEnd = parsedCustomEnd
    ? new Date(parsedCustomEnd.getTime() + diffMs)
    : defaultLocalEnd;
  const localStart = parsedCustomEnd
    ? new Date(localEnd.getTime() - waitSecond * 1000)
    : defaultLocalStart;

  // Slight random distance bump (0.01~0.15km) to avoid exact repeats
  const originalDistanceNum = Number(distance);
  const randomIncrement = Math.random() * 0.05 + 0.01;
  const adjustedDistanceNum = originalDistanceNum + randomIncrement;
  const adjustedDistance = adjustedDistanceNum.toFixed(2);

  const avgSpeedNum = adjustedDistanceNum / (waitSecond / 3600);
  const avgSpeed = avgSpeedNum.toFixed(2);
  const speedRatio = Math.max(0, Math.min(1, (avgSpeedNum - 6) / 6));
  const strideMeters = Math.max(0.68, Math.min(1.02, 0.72 + speedRatio * 0.18 + (Math.random() * 0.08 - 0.04)));
  const adjustedDistanceMeters = adjustedDistanceNum * 1000;
  let steps = Math.round(adjustedDistanceMeters / strideMeters);
  const cadence = steps / (waitSecond / 60);
  if (cadence < 120) {
    steps = Math.round(120 * (waitSecond / 60));
  } else if (cadence > 200) {
    steps = Math.round(200 * (waitSecond / 60));
  }
  const duration = intervalToDuration({ start: localStart, end: localEnd });
  const mac = await generateMac(stuNumber);
  const req: SunRunExercisesRequest = {
    LocalSubmitReason: '',
    avgSpeed,
    baseStation: '',
    endTime: format(localEnd, 'HH:mm:ss'),
    evaluateDate: format(localEnd, 'yyyy-MM-dd HH:mm:ss'),
    fitDegree: '1',
    flag: '1',
    headImage: '',
    ifLocalSubmit: '0',
    km: adjustedDistance,
    mac,
    phoneInfo: '$CN11/iPhone15,4/17.4.1',
    phoneNumber: phoneNumber || '',
    pointList: '',
    routeId,
    runType: '0',
    sensorString: '',
    startTime: format(localStart, 'HH:mm:ss'),
    steps: `${steps}`,
    stuNumber,
    taskId,
    token,
    usedTime: timeUtil.getHHmmss(duration),
    version: '1.2.14',
    warnFlag: '0',
    warnType: '',
    faceData: '',
  };
  // endTime still uses the runtime duration so the UI progress bar stays reasonable
  return { req, endTime: new Date(Number(now) + waitSecond * 1000), adjustedDistance };
};

export default generateRunReq;
