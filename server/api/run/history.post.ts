import { fetchSunRunHistory, type HistorySession } from '../../utils/sunrunHistory';

export default defineEventHandler(async (e) => {
  try {
    const body = await readBody<{
      session: HistorySession;
      startDate?: string;
      endDate?: string;
    }>(e);

    return await fetchSunRunHistory({
      session: body?.session,
      startDate: body?.startDate,
      endDate: body?.endDate,
    });
  } catch (err) {
    return { message: (err as Error).message };
  }
});
