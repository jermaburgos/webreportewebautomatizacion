import { NextRequest } from "next/server";
import { buildExecutionsCsv, getDashboardData } from "@/app/lib/dashboard";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const data = await getDashboardData({
    q: searchParams.get("q") ?? "",
    suite: searchParams.get("suite") ?? "",
    browser: searchParams.get("browser") ?? "",
    verdict: searchParams.get("verdict") ?? "",
    from: searchParams.get("from") ?? "",
    to: searchParams.get("to") ?? "",
  });

  const csv = buildExecutionsCsv(data.executions);

  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="executions-report.csv"',
      "cache-control": "no-store",
    },
  });
}
