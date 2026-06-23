// ---------------------------------------------------------------------------
// Congress.gov API v3 Client
// ---------------------------------------------------------------------------

import { stripHtml } from "../utils/html.js";

const BASE_URL = "https://api.congress.gov/v3";

export class CongressClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  // -------------------------------------------------------------------------
  // Core HTTP
  // -------------------------------------------------------------------------

  private async request<T>(
    path: string,
    params: Record<string, string | number | boolean | undefined> = {},
  ): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`);

    // Auth via query param
    url.searchParams.set("api_key", this.apiKey);
    url.searchParams.set("format", "json");

    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null && val !== "") {
        url.searchParams.set(key, String(val));
      }
    }

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (res.status === 429) {
      throw new Error(
        "Congress.gov rate limit exceeded (429). The API allows 5,000 requests/hour. " +
        "Please reduce request frequency.",
      );
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(
        `Congress.gov API error ${res.status}: ${res.statusText}. ${errText.slice(0, 500)}`,
      );
    }

    return (await res.json()) as T;
  }

  // -------------------------------------------------------------------------
  // Bills — List / Search
  // -------------------------------------------------------------------------

  /**
   * List bills for a given Congress session, optionally filtering by type.
   *
   * NOTE: The Congress.gov API does NOT support full-text keyword search on
   * the bills endpoint. Bills are listed by Congress number and can be
   * filtered by bill type. For keyword research, pair this with bill
   * summaries or use the website search.
   */
  async searchBills(params: {
    congress?: number;
    billType?: string;
    limit?: number;
    offset?: number;
    fromDateTime?: string;
    toDateTime?: string;
    sort?: string;
  } = {}): Promise<{
    bills: CongressBillSummary[];
    pagination: { count: number; next?: string };
  }> {
    const {
      congress,
      billType,
      limit = 20,
      offset = 0,
      fromDateTime,
      toDateTime,
      sort = "updateDate+desc",
    } = params;

    // Build path — /bill or /bill/{congress} or /bill/{congress}/{type}
    let path = "/bill";
    if (congress) {
      path += `/${congress}`;
      if (billType) {
        path += `/${billType.toLowerCase()}`;
      }
    }

    const data = await this.request<{
      bills: CongressBillSummary[];
      pagination?: { count?: number; next?: string };
    }>(path, {
      limit,
      offset,
      fromDateTime,
      toDateTime,
      sort,
    });

    return {
      bills: data.bills ?? [],
      pagination: {
        count: data.pagination?.count ?? data.bills?.length ?? 0,
        next: data.pagination?.next,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Bills — Detail
  // -------------------------------------------------------------------------

  /**
   * Get comprehensive details about a specific bill.
   */
  async getBill(
    congress: number,
    billType: string,
    billNumber: number,
  ): Promise<CongressBill> {
    const data = await this.request<{ bill: CongressBill }>(
      `/bill/${congress}/${billType.toLowerCase()}/${billNumber}`,
    );
    return data.bill;
  }

  // -------------------------------------------------------------------------
  // Bills — Text Versions
  // -------------------------------------------------------------------------

  /**
   * Get text versions for a bill. Returns metadata about each version with
   * links to the actual text (HTML, XML, PDF).
   */
  async getBillText(
    congress: number,
    billType: string,
    billNumber: number,
  ): Promise<CongressTextVersion[]> {
    const data = await this.request<{ textVersions: CongressTextVersion[] }>(
      `/bill/${congress}/${billType.toLowerCase()}/${billNumber}/text`,
    );
    return data.textVersions ?? [];
  }

  /**
   * Fetch the actual content of a bill text version from its format URL.
   * Prefers TXT > HTML. Returns plain text.
   */
  async fetchBillTextContent(textVersion: CongressTextVersion): Promise<string> {
    if (!textVersion.formats || textVersion.formats.length === 0) {
      return "";
    }

    // Prefer plain text, then HTML
    const txtFormat = textVersion.formats.find((f) =>
      f.url?.endsWith(".txt") || f.type === "Formatted Text",
    );
    const htmlFormat = textVersion.formats.find((f) =>
      f.url?.endsWith(".htm") || f.url?.endsWith(".html") || f.type === "Formatted Text (HTML)",
    );

    const formatUrl = txtFormat?.url ?? htmlFormat?.url ?? textVersion.formats[0]?.url;
    if (!formatUrl) return "";

    try {
      const res = await fetch(formatUrl, {
        headers: { Accept: "text/html, text/plain" },
      });
      if (!res.ok) return `[Could not fetch bill text: HTTP ${res.status}]`;
      const body = await res.text();
      return stripHtml(body);
    } catch (err) {
      return `[Error fetching bill text: ${err instanceof Error ? err.message : String(err)}]`;
    }
  }

  // -------------------------------------------------------------------------
  // Bills — Summaries
  // -------------------------------------------------------------------------

  /**
   * Get CRS summaries for a bill.
   */
  async getBillSummaries(
    congress: number,
    billType: string,
    billNumber: number,
  ): Promise<CongressSummary[]> {
    const data = await this.request<{ summaries: CongressSummary[] }>(
      `/bill/${congress}/${billType.toLowerCase()}/${billNumber}/summaries`,
    );

    // Strip HTML from summary text
    return (data.summaries ?? []).map((s) => ({
      ...s,
      text: stripHtml(s.text),
    }));
  }

  // -------------------------------------------------------------------------
  // Bills — Actions
  // -------------------------------------------------------------------------

  /**
   * Get the action history for a bill.
   */
  async getBillActions(
    congress: number,
    billType: string,
    billNumber: number,
  ): Promise<CongressAction[]> {
    const data = await this.request<{ actions: CongressAction[] }>(
      `/bill/${congress}/${billType.toLowerCase()}/${billNumber}/actions`,
    );
    return data.actions ?? [];
  }

  // -------------------------------------------------------------------------
  // Members
  // -------------------------------------------------------------------------

  /**
   * List members of Congress with optional filters.
   */
  async searchMembers(params: {
    limit?: number;
    offset?: number;
    currentMember?: boolean;
  } = {}): Promise<{
    members: CongressMember[];
    pagination: { count: number; next?: string };
  }> {
    const { limit = 50, offset = 0, currentMember } = params;

    const data = await this.request<{
      members: CongressMember[];
      pagination?: { count?: number; next?: string };
    }>("/member", {
      limit,
      offset,
      currentMember,
    });

    return {
      members: data.members ?? [],
      pagination: {
        count: data.pagination?.count ?? data.members?.length ?? 0,
        next: data.pagination?.next,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CongressBillSummary {
  number: number;
  title: string;
  type: string;
  congress: number;
  originChamber?: string;
  originChamberCode?: string;
  latestAction?: {
    text: string;
    actionDate: string;
  };
  updateDate?: string;
  url?: string;
}

export interface CongressBill {
  title: string;
  number: number;
  type: string;
  congress: number;
  introducedDate?: string;
  originChamber?: string;
  sponsors?: Array<{
    bioguideId: string;
    fullName: string;
    firstName?: string;
    lastName?: string;
    party?: string;
    state?: string;
  }>;
  cosponsors?: {
    count?: number;
    url?: string;
  };
  committees?: {
    count?: number;
    url?: string;
  };
  latestAction?: {
    text: string;
    actionDate: string;
    actionTime?: string;
  };
  laws?: Array<{
    type: string;
    number: string;
  }>;
  policyArea?: {
    name: string;
  };
  subjects?: {
    count?: number;
    url?: string;
  };
  summaries?: {
    count?: number;
    url?: string;
  };
  textVersions?: {
    count?: number;
    url?: string;
  };
  constitutionalAuthorityStatementText?: string;
  updateDate?: string;
  updateDateIncludingText?: string;
}

export interface CongressTextVersion {
  date?: string;
  type?: string;
  formats: Array<{
    url?: string;
    type?: string;
  }>;
}

export interface CongressSummary {
  actionDate: string;
  actionDesc?: string;
  text: string;
  updateDate?: string;
  versionCode?: string;
  currentChamber?: string;
  currentChamberCode?: string;
}

export interface CongressAction {
  actionDate: string;
  text: string;
  type?: string;
  actionCode?: string;
  sourceSystem?: {
    code?: number;
    name?: string;
  };
  committees?: Array<{
    systemCode: string;
    name: string;
  }>;
  recordedVotes?: Array<{
    rollNumber: number;
    chamber: string;
    congress: number;
    date: string;
    sessionNumber: number;
    url: string;
  }>;
}

export interface CongressMember {
  bioguideId: string;
  name: string;
  firstName?: string;
  lastName?: string;
  partyName?: string;
  state?: string;
  district?: number;
  depiction?: {
    attribution?: string;
    imageUrl?: string;
  };
  terms?: {
    item?: Array<{
      chamber: string;
      startYear: number;
      endYear?: number;
    }>;
  };
  url?: string;
}
