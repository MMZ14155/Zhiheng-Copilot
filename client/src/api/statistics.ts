import { jsonRequest } from './client';
import type { StatisticsOverviewResponseDto } from './dto';
import { mapStatisticsOverview } from './mappers';

export const getStatisticsOverview = async () =>
  mapStatisticsOverview(await jsonRequest<StatisticsOverviewResponseDto>('/statistics/overview'));
