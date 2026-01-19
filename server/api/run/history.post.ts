import type { SunRunRecord } from '~~/src/types/responseTypes/SunRunSportResponse';
import TotoroApiWrapper from '~~/src/wrappers/TotoroApiWrapper';

const buildRecordKey = (record: SunRunRecord) =>
  record.scoreId || `${record.day || ''}-${record.runTime || ''}-${record.mileage || ''}`;

const getRecordDay = (record: SunRunRecord) => {
  if (record.day) return record.day;
  if (!record.runTime) return '';
  const day = record.runTime.split(' ')?.[0] || '';
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : '';
};

const getRecordDate = (record: SunRunRecord) => {
  const day = getRecordDay(record);
  if (!day) return null;
  const time =
    record.runTime && record.runTime.includes(' ')
      ? record.runTime.split(' ')[1]
      : record.runTime;
  const safeTime = time && time.includes(':') ? time : '00:00:00';
  const date = new Date(`${day}T${safeTime}+08:00`);
  if (Number.isNaN(date.getTime())) return null;
  return { day, date };
};

const fetchSunRunRecords = async (
  monthId: string | undefined,
  basicReq: { stuNumber: string; token: string },
) => {
  const records: SunRunRecord[] = [];
  const pageSize = 10;
  const maxPages = 20;
  for (let page = 1; page <= maxPages; page += 1) {
    const req: Record<string, string> = {
      stuNumber: basicReq.stuNumber,
      token: basicReq.token,
      runType: '0',
      pageNumber: String(page),
      rowNumber: String(pageSize),
    };
    if (monthId) req.monthId = monthId;
    const resp = await TotoroApiWrapper.getSunRunSport(req as any);
    const list = Array.isArray(resp?.runList) ? resp.runList : [];
    if (!list.length) break;
    records.push(...list);
    if (list.length < pageSize) break;
  }
  return records;
};

export default defineEventHandler(async (e) => {
  try {
    const body = await readBody<{
      session: { stuNumber: string; token: string; schoolId: string; campusId: string };
      startDate?: string;
      endDate?: string;
    }>(e);
    if (!body?.session?.stuNumber || !body?.session?.token || !body?.session?.schoolId) {
      return { message: '缺少 session 信息' };
    }
    if (!body.startDate || !body.endDate) {
      return { message: '缺少 startDate / endDate' };
    }
    const start = new Date(`${body.startDate}T00:00:00+08:00`);
    const end = new Date(`${body.endDate}T23:59:59+08:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      return { message: '日期范围不合法' };
    }

    const basicReq = {
      stuNumber: body.session.stuNumber,
      schoolId: body.session.schoolId,
      campusId: body.session.campusId ?? '',
      token: body.session.token,
    };

    const doneDates = new Set<string>();
    const recordMap = new Map<string, SunRunRecord>();

    const termResp = await TotoroApiWrapper.getSchoolTerm(basicReq);
    const terms = termResp?.data ?? [];
    const currentTerm = terms.find((term) => term.isCurrent === '1');
    const targetTerms = currentTerm ? [currentTerm] : terms;

    if (!targetTerms.length) {
      const fallbackRecords = await fetchSunRunRecords(undefined, basicReq);
      fallbackRecords.forEach((record) => {
        const parsed = getRecordDate(record);
        if (!parsed) return;
        if (parsed.date < start || parsed.date > end) return;
        doneDates.add(parsed.day);
        recordMap.set(buildRecordKey(record), record);
      });
    }

    for (const term of targetTerms) {
      const termId = term.termId || (term as any).id;
      if (!termId) continue;
      const monthResp = await TotoroApiWrapper.getSchoolMonthByTerm(termId, basicReq);
      const months = Array.isArray((monthResp as any)?.monthList)
        ? (monthResp as any).monthList
        : (monthResp as any)?.data ?? [];
      const monthIds = months
        .map((m: any) => m.monthId || m.id || m.monthCode)
        .filter((id: string) => Boolean(id));
      const targetMonthIds = monthIds.length ? monthIds : [''];

      for (const monthId of targetMonthIds) {
        try {
          const runList = await fetchSunRunRecords(monthId || undefined, basicReq);
          runList.forEach((record) => {
            const parsed = getRecordDate(record);
            if (!parsed) return;
            if (parsed.date < start || parsed.date > end) return;
            doneDates.add(parsed.day);
            recordMap.set(buildRecordKey(record), record);
          });
        } catch (err) {
          console.warn('[history] record fetch failed', monthId, (err as Error).message);
        }
      }
    }

    const records = Array.from(recordMap.values()).sort((a, b) => {
      const ad = getRecordDate(a)?.date.getTime() ?? 0;
      const bd = getRecordDate(b)?.date.getTime() ?? 0;
      return bd - ad;
    });

    return { dates: Array.from(doneDates).sort(), records };
  } catch (err) {
    return { message: (err as Error).message };
  }
});
