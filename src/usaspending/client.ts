// ---------------------------------------------------------------------------
// USAspending.gov API v2 Client
// ---------------------------------------------------------------------------

const BASE_URL = "https://api.usaspending.gov/api/v2";

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export interface USASpendingAwardResult {
  "Award ID": string;
  "Recipient Name": string;
  "Start Date": string;
  "End Date": string;
  "Award Amount": number;
  "Total Outlays": number;
  Description: string;
  "Awarding Agency": string;
  "Awarding Sub Agency": string;
  "Award Type": string;
  generated_internal_id: string;
}

export interface USASpendingSearchResponse {
  results: USASpendingAwardResult[];
  page_metadata: {
    total: number;
    page: number;
    hasNext: boolean;
  };
}

export interface USASpendingAwardDetail {
  id: number;
  generated_unique_award_id: string;
  type: string;
  type_description: string;
  description: string;
  total_obligation: number;
  base_and_all_options_value: number;
  date_signed: string;
  period_of_performance: {
    start_date: string;
    end_date: string;
    last_modified_date: string;
    potential_end_date: string;
  };
  recipient: {
    recipient_name: string;
    recipient_unique_id: string;
    recipient_hash: string;
    parent_recipient_name: string;
    parent_recipient_unique_id: string;
    location: {
      address_line1: string;
      city_name: string;
      state_code: string;
      zip5: string;
      country_name: string;
    };
    business_categories: string[];
  };
  awarding_agency: {
    id: number;
    toptier_agency: { name: string; abbreviation: string };
    subtier_agency: { name: string; abbreviation: string };
  };
  funding_agency: {
    id: number;
    toptier_agency: { name: string; abbreviation: string };
    subtier_agency: { name: string; abbreviation: string };
  };
  place_of_performance: {
    city_name: string;
    state_code: string;
    country_name: string;
  };
  naics: string;
  naics_description: string;
  psc_code: string;
  psc_description: string;
  executive_details: {
    officers: { name: string; amount: string }[];
  };
}

export interface USASpendingRecipientAutocompleteResponse {
  results: string[];
}

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

interface TimePeriod {
  start_date: string;
  end_date: string;
}

interface AgencyFilter {
  type: "awarding" | "funding";
  tier: "toptier";
  name: string;
}

export interface AwardSearchFilters {
  time_period?: TimePeriod[];
  award_type_codes?: string[];
  recipient_search_text?: string[];
  agencies?: AgencyFilter[];
  keywords?: string[];
}

export interface AwardSearchParams {
  filters: AwardSearchFilters;
  limit?: number;
  page?: number;
  sort?: string;
  order?: "asc" | "desc";
  subawards?: boolean;
  fields?: string[];
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const DEFAULT_FIELDS = [
  "Award ID",
  "Recipient Name",
  "Start Date",
  "End Date",
  "Award Amount",
  "Total Outlays",
  "Description",
  "Awarding Agency",
  "Awarding Sub Agency",
  "Award Type",
  "generated_internal_id",
];

export class USASpendingClient {
  // No constructor params needed — USAspending.gov requires no authentication.
  // Rate limit: ~1,000 requests per 5 minutes.

  // -------------------------------------------------------------------------
  // Core HTTP
  // -------------------------------------------------------------------------

  private async request<T>(
    path: string,
    options: {
      method?: string;
      body?: unknown;
    } = {},
  ): Promise<T> {
    const url = `${BASE_URL}${path}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const res = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (res.status === 422) {
      const errText = await res.text().catch(() => "");
      throw new Error(
        `USAspending API validation error (422): The query parameters are malformed. ${errText.slice(0, 500)}`,
      );
    }

    if (res.status === 429) {
      throw new Error(
        "USAspending API rate limit exceeded (429). The limit is ~1,000 requests per 5 minutes. Please wait and retry.",
      );
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(
        `USAspending API error ${res.status}: ${res.statusText}. ${errText.slice(0, 500)}`,
      );
    }

    return (await res.json()) as T;
  }

  // -------------------------------------------------------------------------
  // Award Search
  // -------------------------------------------------------------------------

  /**
   * Search awards (contracts, grants, loans) with flexible filters.
   * Uses POST /search/spending_by_award/
   */
  async searchAwards(
    params: AwardSearchParams,
  ): Promise<USASpendingSearchResponse> {
    const body = {
      filters: params.filters,
      limit: params.limit ?? 20,
      page: params.page ?? 1,
      sort: params.sort ?? "Award Amount",
      order: params.order ?? "desc",
      subawards: params.subawards ?? false,
      fields: params.fields ?? DEFAULT_FIELDS,
    };

    return this.request<USASpendingSearchResponse>(
      "/search/spending_by_award/",
      { method: "POST", body },
    );
  }

  // -------------------------------------------------------------------------
  // Award Details
  // -------------------------------------------------------------------------

  /**
   * Get full details of a specific award by its generated internal ID.
   * Uses GET /awards/{awardId}/
   */
  async getAward(awardId: string): Promise<USASpendingAwardDetail> {
    return this.request<USASpendingAwardDetail>(`/awards/${encodeURIComponent(awardId)}/`);
  }

  // -------------------------------------------------------------------------
  // Recipient Search (Autocomplete)
  // -------------------------------------------------------------------------

  /**
   * Search for recipient/contractor names using the autocomplete endpoint.
   * Uses POST /autocomplete/recipient/
   */
  async searchRecipients(
    searchText: string,
    limit = 10,
  ): Promise<USASpendingRecipientAutocompleteResponse> {
    return this.request<USASpendingRecipientAutocompleteResponse>(
      "/autocomplete/recipient/",
      {
        method: "POST",
        body: { search_text: searchText, limit },
      },
    );
  }
}
