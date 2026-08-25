export type ExecutionRow = {
  id: string;
  xml_test_name: string | null;
  browser: string | null;
  headless: boolean | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | string | null;
  total_tests: number | string | null;
  passed_tests: number | string | null;
  failed_tests: number | string | null;
  skipped_tests: number | string | null;
  approval_percentage: number | string | null;
  verdict: string | null;
  report_url: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
};

export type ExecutionTestRow = {
  id: number;
  execution_id: string | null;
  test_name: string | null;
  class_name: string | null;
  group_name: string | null;
  status: string | null;
  duration_ms: number | string | null;
  error_message: string | null;
  stacktrace: string | null;
  last_step: string | null;
  last_locator: string | null;
  screenshot_url: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
};

export type DashboardFilters = {
  q?: string;
  suite?: string;
  browser?: string;
  verdict?: string;
  from?: string;
  to?: string;
};

type SupabaseConfig = {
  url: string;
  key: string;
};

export type DashboardExecution = ExecutionRow & {
  timestamp: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  duration: number;
  approval: number;
};

export type DashboardTest = ExecutionTestRow & {
  duration: number;
  statusLabel: string;
  execution: DashboardExecution | null;
  timestamp: string;
};

export type SuiteSummary = {
  suiteName: string;
  executions: number;
  cases: number;
  passedCases: number;
  failedCases: number;
  skippedCases: number;
  averageDuration: number;
  latestTimestamp: string;
  latestExecution: DashboardExecution | null;
  caseNames: string[];
};

export type DashboardData = {
  configured: boolean;
  missingConfig: string[];
  filters: Required<DashboardFilters>;
  executions: DashboardExecution[];
  tests: DashboardTest[];
  tableErrors: string[];
  summary: {
    executions: number;
    totalTests: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
    averageApproval: number;
    averageDuration: number;
    passRate: number;
  };
  browserOptions: string[];
  verdictOptions: string[];
  suiteOptions: string[];
  latestExecution: DashboardExecution | null;
  recentFailures: DashboardTest[];
  suiteSummaries: SuiteSummary[];
};

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ??
  process.env.SUPABASE_URL?.trim() ??
  "";

const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY?.trim() ??
  process.env.SUPABASE_SECRET_KEYS?.trim() ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ??
  process.env.SUPABASE_ANON_KEY?.trim() ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ??
  "";

function getSupabaseConfig(): SupabaseConfig | null {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return null;
  }

  return { url: SUPABASE_URL, key: SUPABASE_KEY };
}

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStatus(value: string | null | undefined): string {
  const status = (value ?? "").trim().toLowerCase();

  if (
    status === "passed" ||
    status === "pass" ||
    status === "success" ||
    status === "ok" ||
    status === "approved"
  ) {
    return "passed";
  }

  if (status === "skipped" || status === "skip" || status === "ignored") {
    return "skipped";
  }

  if (status === "failed" || status === "fail" || status === "error") {
    return "failed";
  }

  return status || "unknown";
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return "Sin fecha";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const parts = new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const day = lookup.day ?? "00";
  const month = lookup.month ?? "00";
  const year = lookup.year ?? "0000";
  const hour = lookup.hour ?? "00";
  const minute = lookup.minute ?? "00";

  return `${day}-${month}-${year}, ${hour}:${minute}`;
}

function parseTimestamp(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (!value) {
      continue;
    }

    const time = new Date(value).getTime();
    if (!Number.isNaN(time)) {
      return value;
    }
  }

  return "";
}

function getExecutionTimestamp(row: ExecutionRow): number {
  const source = row.created_at ?? row.started_at ?? "";
  const time = new Date(source).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function isWithinRange(value: string | null, from?: string, to?: string): boolean {
  if (!value) {
    return !from && !to;
  }

  const time = new Date(value).getTime();
  if (Number.isNaN(time)) {
    return true;
  }

  if (from) {
    const start = new Date(`${from}T00:00:00`).getTime();
    if (!Number.isNaN(start) && time < start) {
      return false;
    }
  }

  if (to) {
    const end = new Date(`${to}T23:59:59.999`).getTime();
    if (!Number.isNaN(end) && time > end) {
      return false;
    }
  }

  return true;
}

function includesText(source: string | null, needle: string): boolean {
  return (source ?? "").toLowerCase().includes(needle);
}

function matchesExecution(row: ExecutionRow, filters: Required<DashboardFilters>): boolean {
  const q = filters.q.trim().toLowerCase();
  const suite = filters.suite.trim().toLowerCase();
  const browser = filters.browser.trim().toLowerCase();
  const verdict = filters.verdict.trim().toLowerCase();

  if (!isWithinRange(row.created_at ?? row.started_at, filters.from, filters.to)) {
    return false;
  }

  if (suite && !includesText(row.xml_test_name, suite)) {
    return false;
  }

  if (browser && !includesText(row.browser, browser)) {
    return false;
  }

  if (verdict && normalizeStatus(row.verdict).toLowerCase() !== verdict) {
    return false;
  }

  if (!q) {
    return true;
  }

  const haystack = [
    row.xml_test_name,
    row.browser,
    row.verdict,
    row.report_url,
    row.created_at,
    row.started_at,
    row.finished_at,
    JSON.stringify(row.metadata ?? {}),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(q);
}

function matchesTest(row: DashboardTest, filters: Required<DashboardFilters>): boolean {
  const q = filters.q.trim().toLowerCase();

  if (!isWithinRange(row.timestamp || row.created_at, filters.from, filters.to)) {
    return false;
  }

  if (!q) {
    return true;
  }

  const haystack = [
    row.test_name,
    row.class_name,
    row.group_name,
    row.status,
    row.error_message,
    row.last_step,
    row.last_locator,
    row.timestamp,
    row.created_at,
    JSON.stringify(row.metadata ?? {}),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(q);
}

async function fetchSupabaseTable<T>(config: SupabaseConfig, table: string): Promise<T[]> {
  const response = await fetch(new URL(`/rest/v1/${table}?select=*`, config.url), {
    headers: {
      apikey: config.key,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`No se pudo leer ${table}: ${response.status} ${detail}`);
  }

  return (await response.json()) as T[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableSupabaseAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("PGRST303") || message.includes("JWT issued at future");
}

function formatTableReadError(table: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (isRetryableSupabaseAuthError(error)) {
    return `No se pudo leer ${table} por un desajuste temporal de autenticación. La vista seguirá cargando y se reintentará en la siguiente actualización.`;
  }

  return `No se pudo leer ${table}: ${message}`;
}

async function fetchSupabaseTableWithRetry<T>(
  config: SupabaseConfig,
  table: string,
  retries = 1,
): Promise<T[]> {
  try {
    return await fetchSupabaseTable<T>(config, table);
  } catch (error) {
    if (retries > 0 && isRetryableSupabaseAuthError(error)) {
      await sleep(2000);
      return fetchSupabaseTableWithRetry<T>(config, table, retries - 1);
    }

    throw error;
  }
}

function parseFilters(filters?: Partial<DashboardFilters>): Required<DashboardFilters> {
  return {
    q: filters?.q?.trim() ?? "",
    suite: filters?.suite?.trim() ?? "",
    browser: filters?.browser?.trim() ?? "",
    verdict: filters?.verdict?.trim() ?? "",
    from: filters?.from?.trim() ?? "",
    to: filters?.to?.trim() ?? "",
  };
}

function buildExecution(row: ExecutionRow): DashboardExecution {
  const timestamp = parseTimestamp(row.created_at, row.started_at, row.finished_at);

  return {
    ...row,
    timestamp,
    totalTests: toNumber(row.total_tests),
    passedTests: toNumber(row.passed_tests),
    failedTests: toNumber(row.failed_tests),
    skippedTests: toNumber(row.skipped_tests),
    duration: toNumber(row.duration_ms),
    approval: toNumber(row.approval_percentage),
  };
}

function buildSuiteSummaries(executions: DashboardExecution[], tests: DashboardTest[]): SuiteSummary[] {
  const executionsBySuite = new Map<string, DashboardExecution[]>();
  for (const execution of executions) {
    const suiteName = (execution.xml_test_name ?? "Sin suite").trim() || "Sin suite";
    const list = executionsBySuite.get(suiteName) ?? [];
    list.push(execution);
    executionsBySuite.set(suiteName, list);
  }

  const testsBySuite = new Map<string, DashboardTest[]>();
  for (const test of tests) {
    const suiteName = (test.execution?.xml_test_name ?? "Sin suite").trim() || "Sin suite";
    const list = testsBySuite.get(suiteName) ?? [];
    list.push(test);
    testsBySuite.set(suiteName, list);
  }

  return [...new Set([...executionsBySuite.keys(), ...testsBySuite.keys()])]
    .map((suiteName) => {
      const suiteExecutions = executionsBySuite.get(suiteName) ?? [];
      const suiteTests = testsBySuite.get(suiteName) ?? [];
      const latestExecution = suiteExecutions[0] ?? null;
      return {
        suiteName,
        executions: suiteExecutions.length,
        cases: suiteTests.length,
        passedCases: suiteTests.filter((test) => test.statusLabel === "passed").length,
        failedCases: suiteTests.filter((test) => test.statusLabel === "failed").length,
        skippedCases: suiteTests.filter((test) => test.statusLabel === "skipped").length,
        averageDuration: suiteExecutions.length
          ? suiteExecutions.reduce((sum, execution) => sum + execution.duration, 0) / suiteExecutions.length
          : 0,
        latestTimestamp: latestExecution?.timestamp ?? "",
        latestExecution,
        caseNames: [...new Set(suiteTests.map((test) => test.test_name?.trim()).filter(Boolean) as string[])].sort(
          (left, right) => left.localeCompare(right),
        ),
      };
    })
    .sort((left, right) => new Date(right.latestTimestamp || 0).getTime() - new Date(left.latestTimestamp || 0).getTime());
}

export async function getDashboardData(filters?: Partial<DashboardFilters>): Promise<DashboardData> {
  const resolvedFilters = parseFilters(filters);
  const config = getSupabaseConfig();

  if (!config) {
    return {
      configured: false,
      missingConfig: [
        !SUPABASE_URL ? "NEXT_PUBLIC_SUPABASE_URL" : "",
        !SUPABASE_KEY
          ? "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY o SUPABASE_ANON_KEY"
          : "",
      ].filter(Boolean),
      filters: resolvedFilters,
      executions: [],
      tests: [],
      tableErrors: [],
      summary: {
        executions: 0,
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        skippedTests: 0,
        averageApproval: 0,
        averageDuration: 0,
        passRate: 0,
      },
      browserOptions: [],
      verdictOptions: [],
      suiteOptions: [],
      latestExecution: null,
      recentFailures: [],
      suiteSummaries: [],
    };
  }

  const [executionsResult, testsResult] = await Promise.allSettled([
    fetchSupabaseTableWithRetry<ExecutionRow>(config, "executions"),
    fetchSupabaseTableWithRetry<ExecutionTestRow>(config, "execution_tests"),
  ]);

  const tableErrors: string[] = [];

  const rawExecutions =
    executionsResult.status === "fulfilled"
      ? executionsResult.value
      : [];
  const rawTests = testsResult.status === "fulfilled" ? testsResult.value : [];

  if (executionsResult.status === "rejected") {
    tableErrors.push(formatTableReadError("executions", executionsResult.reason));
  }

  if (testsResult.status === "rejected") {
    tableErrors.push(formatTableReadError("execution_tests", testsResult.reason));
  }

  const executions = rawExecutions
    .map(buildExecution)
    .filter((row) => matchesExecution(row, resolvedFilters))
    .sort((left, right) => getExecutionTimestamp(right) - getExecutionTimestamp(left));

  const filteredExecutionIds = new Set(executions.map((row) => row.id));
  const tests = rawTests
    .filter((row) => row.execution_id && filteredExecutionIds.has(row.execution_id))
    .map((row) => {
      const execution = executions.find((item) => item.id === row.execution_id) ?? null;
      return {
        ...row,
        duration: toNumber(row.duration_ms),
        statusLabel: normalizeStatus(row.status),
        execution,
        timestamp: parseTimestamp(row.created_at, execution?.timestamp),
      };
    })
    .filter((row) => matchesTest(row, resolvedFilters))
    .sort((left, right) => {
      const leftTime = new Date(left.timestamp || "").getTime();
      const rightTime = new Date(right.timestamp || "").getTime();
      return (Number.isNaN(rightTime) ? 0 : rightTime) - (Number.isNaN(leftTime) ? 0 : leftTime);
    });

  const summary = executions.reduce(
    (acc, execution) => {
      acc.executions += 1;
      acc.totalTests += execution.totalTests;
      acc.passedTests += execution.passedTests;
      acc.failedTests += execution.failedTests;
      acc.skippedTests += execution.skippedTests;
      acc.averageApproval += execution.approval;
      acc.averageDuration += execution.duration;
      return acc;
    },
    {
      executions: 0,
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      averageApproval: 0,
      averageDuration: 0,
    },
  );

  const latestExecution = executions[0] ?? null;
  const recentFailures = tests.filter((row) => row.statusLabel !== "passed").slice(0, 8);
  const suiteSummaries = buildSuiteSummaries(executions, tests);

  const browserOptions = [...new Set(rawExecutions.map((row) => toText(row.browser)).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right),
  );
  const verdictOptions = [...new Set(rawExecutions.map((row) => normalizeStatus(row.verdict)).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right),
  );
  const suiteOptions = [...new Set(rawExecutions.map((row) => toText(row.xml_test_name)).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right),
  );

  return {
    configured: true,
    missingConfig: [],
    filters: resolvedFilters,
    executions,
    tests,
    summary: {
      executions: summary.executions,
      totalTests: summary.totalTests,
      passedTests: summary.passedTests,
      failedTests: summary.failedTests,
      skippedTests: summary.skippedTests,
      averageApproval: summary.executions ? summary.averageApproval / summary.executions : 0,
      averageDuration: summary.executions ? summary.averageDuration / summary.executions : 0,
      passRate: summary.totalTests ? (summary.passedTests / summary.totalTests) * 100 : 0,
    },
    browserOptions,
    verdictOptions,
    suiteOptions,
    latestExecution,
    recentFailures,
    suiteSummaries,
    tableErrors,
  };
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value).replaceAll('"', '""');
  return `"${text}"`;
}

export function buildExecutionsCsv(executions: DashboardExecution[]): string {
  const rows = [
    [
      "created_at",
      "xml_test_name",
      "browser",
      "headless",
      "started_at",
      "finished_at",
      "duration_ms",
      "total_tests",
      "passed_tests",
      "failed_tests",
      "skipped_tests",
      "approval_percentage",
      "verdict",
      "report_url",
    ],
    ...executions.map((row) => [
      row.created_at,
      row.xml_test_name,
      row.browser,
      row.headless,
      row.started_at,
      row.finished_at,
      row.duration_ms,
      row.total_tests,
      row.passed_tests,
      row.failed_tests,
      row.skipped_tests,
      row.approval_percentage,
      row.verdict,
      row.report_url,
    ]),
  ];

  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

export function formatExecutionTime(value: string | null | undefined): string {
  return formatTimestamp(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("es-CL").format(Math.round(value));
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function normalizeExecutionVerdict(value: string | null): string {
  return normalizeStatus(value);
}

export function formatDurationHuman(value: number): string {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;

  if (safeValue < 1000) {
    return `${Math.round(safeValue)} ms`;
  }

  const totalSeconds = Math.floor(safeValue / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}
