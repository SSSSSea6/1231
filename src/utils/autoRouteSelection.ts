type RouteRule = {
  schoolId: string;
  campusKeyword: string;
  freeRunRouteNames: string[];
  sunRunRouteNames: string[];
};

type SessionLike = {
  schoolId?: string | null;
  campusId?: string | null;
  campusName?: string | null;
};

const AUTO_ROUTE_RULES: RouteRule[] = [
  {
    schoolId: '98765',
    campusKeyword: '天目湖',
    freeRunRouteNames: ['天目湖-东操场', '天目湖-西操场'],
    sunRunRouteNames: ['天目湖-东操场', '天目湖-西操场'],
  },
  {
    schoolId: '98765',
    campusKeyword: '将军路',
    freeRunRouteNames: ['田径场 将军路', '图书馆 将军路'],
    sunRunRouteNames: ['田径场 将军路', '图书馆 将军路'],
  },
];

const normalizeText = (value: unknown) => String(value ?? '').trim();

export const getAutoRouteRule = (session: SessionLike | null | undefined) => {
  const schoolId = normalizeText(session?.schoolId);
  const campusId = normalizeText(session?.campusId);
  const campusName = normalizeText(session?.campusName);

  return (
    AUTO_ROUTE_RULES.find(
      (rule) =>
        rule.schoolId === schoolId &&
        (campusName.includes(rule.campusKeyword) || campusId.includes(rule.campusKeyword)),
    ) || null
  );
};

export const pickAutoRouteName = (routeNames: string[]) => {
  if (!routeNames.length) return '';
  const index = Math.floor(Math.random() * routeNames.length);
  return routeNames[index] || '';
};
