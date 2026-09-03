import { jsonRequest, queryString } from "./client";
import type { StatisticsOverviewResponseDto } from "./dto";
import { mapStatisticsOverview } from "./mappers";

export interface StatisticsOverviewParams {
  region?: string;
  managerId?: number;
}

export const getStatisticsOverview = async (params: StatisticsOverviewParams = {}) =>
  mapStatisticsOverview(
    await jsonRequest<StatisticsOverviewResponseDto>(
      `/statistics/overview${queryString({
        region: params.region,
        manager_id: params.managerId,
      })}`,
    ),
  );
