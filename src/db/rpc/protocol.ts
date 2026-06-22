export interface DbRequests {
  init: {
    timeoutMs: number;
  };
  query: {
    sql: string;
    rowCapOverride?: number;
  };
  ping: Record<string, never>;
}

export interface DbResponses {
  init: {
    ok: true;
  };
  query: {
    fields: Array<{ name: string; dataTypeID: number }>;
    rows: unknown[][];
    totalRows: number;
    capped: boolean;
  };
  ping: {
    ok: true;
  };
}
