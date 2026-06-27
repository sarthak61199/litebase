export interface DbRequests {
  query: {
    sql: string;
    rowCapOverride?: number;
  };
  ping: Record<string, never>;
}

export interface DbResponses {
  query: {
    fields: Array<{ name: string; dataTypeID: number }>;
    rows: unknown[][];
    totalRows: number;
    capped: boolean;
    affectedRows?: number;
  };
  ping: {
    ok: true;
  };
}
