import DashboardShell from "./components/dashboard-shell";
import { getDashboardData } from "./lib/dashboard";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export default async function Home(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const data = await getDashboardData({
    q: firstValue(searchParams.q),
    suite: firstValue(searchParams.suite),
    browser: firstValue(searchParams.browser),
    verdict: firstValue(searchParams.verdict),
    from: firstValue(searchParams.from),
    to: firstValue(searchParams.to),
  });

  return <DashboardShell data={data} />;
}
