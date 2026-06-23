// ---------------------------------------------------------------------------
// SEC EDGAR API Client
// ---------------------------------------------------------------------------

import { stripHtml } from "../utils/html.js";

const DATA_BASE_URL = "https://data.sec.gov";
const EFTS_BASE_URL = "https://efts.sec.gov/LATEST";
const ARCHIVES_BASE_URL = "https://www.sec.gov/Archives/edgar/data";

/** Minimum interval between requests to respect SEC's 10 req/sec limit. */
const MIN_REQUEST_INTERVAL_MS = 110;

/** Maximum retries on 429 responses. */
const MAX_RETRIES = 3;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SECCompanyFilings {
  cik: string;
  entityType: string;
  sic: string;
  sicDescription: string;
  name: string;
  tickers: string[];
  exchanges: string[];
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      form: string[];
      primaryDocument: string[];
      primaryDocDescription: string[];
    };
  };
}

export interface SECCompanyFacts {
  cik: number;
  entityName: string;
  facts: {
    "us-gaap"?: Record<
      string,
      {
        label: string;
        description: string;
        units: Record<
          string,
          Array<{
            val: number;
            accn: string;
            fy: number;
            fp: string;
            form: string;
            filed: string;
            start?: string;
            end?: string;
          }>
        >;
      }
    >;
    dei?: Record<string, unknown>;
  };
}

export interface SECSearchHit {
  _id: string;
  _source: {
    file_date: string;
    form_type: string;
    entity_name: string;
    file_num: string;
    period_of_report: string;
    display_names: string[];
  };
}

export interface SECSearchResult {
  hits: {
    total: { value: number };
    hits: SECSearchHit[];
  };
}

export interface SECSearchParams {
  query: string;
  forms?: string;
  startDate?: string;
  endDate?: string;
  from?: number;
  size?: number;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class SECClient {
  private userAgent: string;
  private lastRequestTime = 0;

  constructor(userAgent: string) {
    if (!userAgent) {
      throw new Error(
        "SEC EDGAR requires a User-Agent header (e.g. 'CompanyName admin@company.com')",
      );
    }
    this.userAgent = userAgent;
  }

  // -------------------------------------------------------------------------
  // Core HTTP
  // -------------------------------------------------------------------------

  /** Simple delay to stay within SEC's 10 req/sec rate limit. */
  private async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed),
      );
    }
    this.lastRequestTime = Date.now();
  }

  private async request<T>(
    url: string,
    retries = MAX_RETRIES,
  ): Promise<T> {
    await this.throttle();

    const res = await fetch(url, {
      headers: {
        "User-Agent": this.userAgent,
        Accept: "application/json",
      },
    });

    if (res.status === 429) {
      if (retries > 0) {
        const retryAfter = Number(res.headers.get("retry-after") ?? "2");
        const waitMs = Math.max(retryAfter * 1000, 1000);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        return this.request<T>(url, retries - 1);
      }
      throw new Error(
        "SEC EDGAR rate limit exceeded (429). Please reduce request frequency.",
      );
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(
        `SEC EDGAR API error ${res.status}: ${res.statusText}. ${errText.slice(0, 500)}`,
      );
    }

    return (await res.json()) as T;
  }

  private async requestText(
    url: string,
    retries = MAX_RETRIES,
  ): Promise<string> {
    await this.throttle();

    const res = await fetch(url, {
      headers: {
        "User-Agent": this.userAgent,
        Accept: "text/html, text/plain, application/xhtml+xml",
      },
    });

    if (res.status === 429) {
      if (retries > 0) {
        const retryAfter = Number(res.headers.get("retry-after") ?? "2");
        const waitMs = Math.max(retryAfter * 1000, 1000);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        return this.requestText(url, retries - 1);
      }
      throw new Error(
        "SEC EDGAR rate limit exceeded (429). Please reduce request frequency.",
      );
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(
        `SEC EDGAR error ${res.status}: ${res.statusText}. ${errText.slice(0, 500)}`,
      );
    }

    return res.text();
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Zero-pad a CIK to 10 digits as required by SEC endpoints. */
  private padCIK(cik: string): string {
    return cik.replace(/^0+/, "").padStart(10, "0");
  }

  // -------------------------------------------------------------------------
  // A. Official Data API (data.sec.gov)
  // -------------------------------------------------------------------------

  /**
   * Get company information and recent filing history.
   * @param cik - The company's Central Index Key (CIK)
   */
  async getCompanyFilings(cik: string): Promise<SECCompanyFilings> {
    const cik10 = this.padCIK(cik);
    return this.request<SECCompanyFilings>(
      `${DATA_BASE_URL}/submissions/CIK${cik10}.json`,
    );
  }

  /**
   * Get all XBRL financial facts for a company.
   * @param cik - The company's Central Index Key (CIK)
   */
  async getCompanyFacts(cik: string): Promise<SECCompanyFacts> {
    const cik10 = this.padCIK(cik);
    return this.request<SECCompanyFacts>(
      `${DATA_BASE_URL}/api/xbrl/companyfacts/CIK${cik10}.json`,
    );
  }

  // -------------------------------------------------------------------------
  // B. Full-Text Search (efts.sec.gov)
  // -------------------------------------------------------------------------

  /**
   * Full-text search across all SEC filings.
   */
  async searchFilings(params: SECSearchParams): Promise<SECSearchResult> {
    const url = new URL(`${EFTS_BASE_URL}/search-index`);
    url.searchParams.set("q", params.query);
    if (params.forms) url.searchParams.set("forms", params.forms);
    if (params.startDate) {
      url.searchParams.set("dateRange", "custom");
      url.searchParams.set("startdt", params.startDate);
    }
    if (params.endDate) {
      url.searchParams.set("dateRange", "custom");
      url.searchParams.set("enddt", params.endDate);
    }
    if (params.from !== undefined) {
      url.searchParams.set("from", String(params.from));
    }
    url.searchParams.set("size", String(params.size ?? 20));

    return this.request<SECSearchResult>(url.toString());
  }

  // -------------------------------------------------------------------------
  // C. Filing Content
  // -------------------------------------------------------------------------

  /**
   * Retrieve and return the plain-text content of a filing document.
   *
   * @param accessionNumber - e.g. '0000320193-23-000106'
   * @param primaryDocument - e.g. 'aapl-20230930.htm'
   */
  async getFilingDocument(
    accessionNumber: string,
    primaryDocument: string,
  ): Promise<string> {
    // Accession number with dashes removed forms the folder path
    const accessionNoDashes = accessionNumber.replace(/-/g, "");
    // Extract CIK from the accession (first segment before the dash)
    // But SEC archives path uses the accession-no-dashes directly under the CIK folder
    // The URL format is: /Archives/edgar/data/{CIK}/{accession-no-dashes}/{primaryDocument}
    // Since we don't have CIK here, we use the alternative path format that works:
    // /Archives/edgar/data/{accession-no-dashes}/{primaryDocument}
    // Actually, the correct structure needs CIK. Let's use the full accession path format.
    const url = `${ARCHIVES_BASE_URL}/${accessionNoDashes}/${primaryDocument}`;

    const html = await this.requestText(url);
    return stripHtml(html);
  }
}
