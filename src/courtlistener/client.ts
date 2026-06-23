// ---------------------------------------------------------------------------
// CourtListener API v4 Client
// ---------------------------------------------------------------------------

import type {
  CLCluster,
  CLCourt,
  CLDocket,
  CLDocketEntry,
  CLListResult,
  CLOpinion,
  CLOralArgument,
  CLPerson,
  CLSearchResult,
  CLSearchType,
} from "./types.js";

const BASE_URL = "https://www.courtlistener.com/api/rest/v4";
const SITE_URL = "https://www.courtlistener.com";

export class CourtListenerClient {
  private token: string;
  private rateLimitRemaining = Infinity;
  private rateLimitReset = 0;

  constructor(token: string) {
    if (!token) throw new Error("CourtListener API token is required");
    this.token = token;
  }

  // -------------------------------------------------------------------------
  // Core HTTP
  // -------------------------------------------------------------------------

  private async request<T>(
    path: string,
    options: {
      method?: string;
      params?: Record<string, string | number | boolean | undefined>;
      body?: unknown;
    } = {},
  ): Promise<T> {
    // Check rate limit
    if (this.rateLimitRemaining <= 1 && Date.now() / 1000 < this.rateLimitReset) {
      const waitSec = Math.ceil(this.rateLimitReset - Date.now() / 1000);
      throw new Error(
        `CourtListener rate limit reached. Retry in ${waitSec}s. ` +
        `Please reduce request frequency.`,
      );
    }

    const url = new URL(path.startsWith("http") ? path : `${BASE_URL}${path}`);

    if (options.params) {
      for (const [key, val] of Object.entries(options.params)) {
        if (val !== undefined && val !== null && val !== "") {
          url.searchParams.set(key, String(val));
        }
      }
    }

    // Always request JSON
    if (!url.searchParams.has("format")) {
      url.searchParams.set("format", "json");
    }

    const headers: Record<string, string> = {
      Authorization: `Token ${this.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const res = await fetch(url.toString(), {
      method: options.method ?? "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    // Track rate limits from response headers
    const remaining = res.headers.get("x-ratelimit-remaining");
    const reset = res.headers.get("x-ratelimit-reset");
    if (remaining) this.rateLimitRemaining = Number(remaining);
    if (reset) this.rateLimitReset = Number(reset);

    if (res.status === 429) {
      const retryAfter = res.headers.get("retry-after");
      throw new Error(
        `CourtListener rate limit exceeded (429). ` +
        `Retry after ${retryAfter ?? "unknown"} seconds.`,
      );
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(
        `CourtListener API error ${res.status}: ${res.statusText}. ${errText.slice(0, 500)}`,
      );
    }

    return (await res.json()) as T;
  }

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  /**
   * Full-text search across opinions, RECAP, people, or oral arguments.
   */
  async search(
    query: string,
    type: CLSearchType = "o",
    filters: Record<string, string | number | boolean | undefined> = {},
    page = 1,
  ): Promise<CLSearchResult> {
    return this.request<CLSearchResult>("/search/", {
      params: { q: query, type, page, ...filters },
    });
  }

  // -------------------------------------------------------------------------
  // Opinions & Clusters
  // -------------------------------------------------------------------------

  /**
   * Get an opinion cluster by ID (case-level grouping of opinions).
   */
  async getCluster(clusterId: number): Promise<CLCluster> {
    return this.request<CLCluster>(`/clusters/${clusterId}/`);
  }

  /**
   * Get a specific opinion by ID.
   */
  async getOpinion(opinionId: number): Promise<CLOpinion> {
    return this.request<CLOpinion>(`/opinions/${opinionId}/`);
  }

  /**
   * List opinions for a cluster.
   */
  async getClusterOpinions(clusterId: number): Promise<CLListResult<CLOpinion>> {
    return this.request<CLListResult<CLOpinion>>(`/opinions/`, {
      params: { cluster: clusterId },
    });
  }

  // -------------------------------------------------------------------------
  // Citation Verification & Network
  // -------------------------------------------------------------------------

  /**
   * Verify legal citations via CourtListener's citation lookup endpoint.
   * Accepts a text blob containing citations.
   */
  async verifyCitations(text: string): Promise<unknown> {
    return this.request("/citation-lookup/", {
      method: "POST",
      body: { text },
    });
  }

  /**
   * Get opinions cited BY a given opinion (backward citations / authorities).
   */
  async getAuthorities(
    opinionId: number,
    page = 1,
  ): Promise<CLListResult<{ id: number; cited_opinion: string; depth: number }>> {
    return this.request(`/opinions-cited/`, {
      params: { citing_opinion: opinionId, page },
    });
  }

  /**
   * Get opinions that CITE a given opinion (forward citations).
   */
  async getCitingOpinions(
    opinionId: number,
    page = 1,
  ): Promise<CLListResult<{ id: number; citing_opinion: string; depth: number }>> {
    return this.request(`/opinions-cited/`, {
      params: { cited_opinion: opinionId, page },
    });
  }

  // -------------------------------------------------------------------------
  // Dockets
  // -------------------------------------------------------------------------

  /**
   * Get a docket by ID.
   */
  async getDocket(docketId: number): Promise<CLDocket> {
    return this.request<CLDocket>(`/dockets/${docketId}/`);
  }

  /**
   * Get docket entries for a specific docket.
   */
  async getDocketEntries(
    docketId: number,
    page = 1,
  ): Promise<CLListResult<CLDocketEntry>> {
    return this.request<CLListResult<CLDocketEntry>>(`/docket-entries/`, {
      params: { docket: docketId, page },
    });
  }

  // -------------------------------------------------------------------------
  // Courts
  // -------------------------------------------------------------------------

  /**
   * List courts, optionally filtering by jurisdiction.
   */
  async listCourts(
    jurisdiction?: string,
    page = 1,
  ): Promise<CLListResult<CLCourt>> {
    return this.request<CLListResult<CLCourt>>(`/courts/`, {
      params: { jurisdiction, page },
    });
  }

  /**
   * Get a specific court by its ID (e.g. "scotus", "ca9").
   */
  async getCourt(courtId: string): Promise<CLCourt> {
    return this.request<CLCourt>(`/courts/${courtId}/`);
  }

  // -------------------------------------------------------------------------
  // People / Judges
  // -------------------------------------------------------------------------

  /**
   * Search for judges/people.
   */
  async searchPeople(
    query: string,
    page = 1,
  ): Promise<CLSearchResult> {
    return this.search(query, "p", {}, page);
  }

  /**
   * Get a person (judge) by ID.
   */
  async getPerson(personId: number): Promise<CLPerson> {
    return this.request<CLPerson>(`/people/${personId}/`);
  }

  // -------------------------------------------------------------------------
  // Oral Arguments
  // -------------------------------------------------------------------------

  /**
   * Search oral arguments.
   */
  async searchOralArguments(
    query: string,
    page = 1,
  ): Promise<CLSearchResult> {
    return this.search(query, "oa", {}, page);
  }

  /**
   * Get an oral argument by ID.
   */
  async getOralArgument(oaId: number): Promise<CLOralArgument> {
    return this.request<CLOralArgument>(`/audio/${oaId}/`);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Build a full CourtListener URL from a relative path.
   */
  static fullUrl(absoluteUrl: string): string {
    if (absoluteUrl.startsWith("http")) return absoluteUrl;
    return `${SITE_URL}${absoluteUrl}`;
  }

  /**
   * Extract an ID from a CourtListener API resource URL.
   * e.g. "https://www.courtlistener.com/api/rest/v4/opinions/123/" → 123
   */
  static extractIdFromUrl(url: string): number | null {
    const match = url.match(/\/(\d+)\/$/);
    return match ? Number(match[1]) : null;
  }
}
