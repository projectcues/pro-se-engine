// ---------------------------------------------------------------------------
// Regulations.gov API v4 Client
// ---------------------------------------------------------------------------

const BASE_URL = "https://api.regulations.gov/v4";

export class RegulationsClient {
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error("Regulations.gov API key is required");
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

    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null && val !== "") {
        url.searchParams.set(key, String(val));
      }
    }

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "X-Api-Key": this.apiKey,
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
      },
    });

    if (res.status === 429) {
      throw new Error(
        "Regulations.gov rate limit exceeded (429). The API allows 1,000 requests/hour. " +
        "Please reduce request frequency.",
      );
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(
        `Regulations.gov API error ${res.status}: ${res.statusText}. ${errText.slice(0, 500)}`,
      );
    }

    return (await res.json()) as T;
  }

  // -------------------------------------------------------------------------
  // Dockets
  // -------------------------------------------------------------------------

  /**
   * Search regulatory dockets (proceedings).
   */
  async searchDockets(params: {
    searchTerm?: string;
    agencyId?: string;
    docketType?: string;
    pageSize?: number;
    pageNumber?: number;
    sort?: string;
  } = {}): Promise<{
    data: RegDocket[];
    meta: { totalElements: number; hasNextPage: boolean };
  }> {
    const {
      searchTerm,
      agencyId,
      docketType,
      pageSize = 20,
      pageNumber = 1,
      sort,
    } = params;

    const raw = await this.request<JsonApiListResponse>(
      "/dockets",
      {
        "filter[searchTerm]": searchTerm,
        "filter[agencyId]": agencyId,
        "filter[docketType]": docketType,
        "page[size]": pageSize,
        "page[number]": pageNumber,
        sort,
      },
    );

    return {
      data: (raw.data ?? []).map(extractDocket),
      meta: {
        totalElements: raw.meta?.totalElements ?? raw.data?.length ?? 0,
        hasNextPage: raw.meta?.hasNextPage ?? false,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Documents
  // -------------------------------------------------------------------------

  /**
   * Search regulatory documents (rules, proposed rules, notices).
   */
  async searchDocuments(params: {
    searchTerm?: string;
    agencyId?: string;
    documentType?: string;
    postedDate?: string;
    docketId?: string;
    pageSize?: number;
    pageNumber?: number;
    sort?: string;
  } = {}): Promise<{
    data: RegDocument[];
    meta: { totalElements: number; hasNextPage: boolean };
  }> {
    const {
      searchTerm,
      agencyId,
      documentType,
      postedDate,
      docketId,
      pageSize = 20,
      pageNumber = 1,
      sort,
    } = params;

    const raw = await this.request<JsonApiListResponse>(
      "/documents",
      {
        "filter[searchTerm]": searchTerm,
        "filter[agencyId]": agencyId,
        "filter[documentType]": documentType,
        "filter[postedDate]": postedDate,
        "filter[docketId]": docketId,
        "page[size]": pageSize,
        "page[number]": pageNumber,
        sort,
      },
    );

    return {
      data: (raw.data ?? []).map(extractDocument),
      meta: {
        totalElements: raw.meta?.totalElements ?? raw.data?.length ?? 0,
        hasNextPage: raw.meta?.hasNextPage ?? false,
      },
    };
  }

  /**
   * Get full details for a single regulatory document.
   */
  async getDocument(documentId: string): Promise<RegDocument> {
    const raw = await this.request<JsonApiSingleResponse>(
      `/documents/${encodeURIComponent(documentId)}`,
    );
    return extractDocument(raw.data);
  }

  // -------------------------------------------------------------------------
  // Comments
  // -------------------------------------------------------------------------

  /**
   * Search public comments. Note: the list endpoint does NOT include comment
   * text — you must call getComment() for each to get the full text.
   */
  async searchComments(params: {
    searchTerm?: string;
    commentOnId?: string;
    agencyId?: string;
    pageSize?: number;
    pageNumber?: number;
    sort?: string;
  } = {}): Promise<{
    data: RegComment[];
    meta: { totalElements: number; hasNextPage: boolean };
  }> {
    const {
      searchTerm,
      commentOnId,
      agencyId,
      pageSize = 20,
      pageNumber = 1,
      sort,
    } = params;

    const raw = await this.request<JsonApiListResponse>(
      "/comments",
      {
        "filter[searchTerm]": searchTerm,
        "filter[commentOnId]": commentOnId,
        "filter[agencyId]": agencyId,
        "page[size]": pageSize,
        "page[number]": pageNumber,
        sort,
      },
    );

    return {
      data: (raw.data ?? []).map(extractComment),
      meta: {
        totalElements: raw.meta?.totalElements ?? raw.data?.length ?? 0,
        hasNextPage: raw.meta?.hasNextPage ?? false,
      },
    };
  }

  /**
   * Get full details for a single comment, including the comment text.
   */
  async getComment(commentId: string): Promise<RegComment> {
    const raw = await this.request<JsonApiSingleResponse>(
      `/comments/${encodeURIComponent(commentId)}`,
    );
    return extractComment(raw.data);
  }
}

// ---------------------------------------------------------------------------
// JSON:API response shapes
// ---------------------------------------------------------------------------

interface JsonApiResource {
  id: string;
  type: string;
  attributes: Record<string, unknown>;
  links?: Record<string, string>;
}

interface JsonApiListResponse {
  data: JsonApiResource[];
  meta?: {
    totalElements?: number;
    hasNextPage?: boolean;
    [key: string]: unknown;
  };
}

interface JsonApiSingleResponse {
  data: JsonApiResource;
}

// ---------------------------------------------------------------------------
// Extracted types
// ---------------------------------------------------------------------------

export interface RegDocket {
  id: string;
  type: string;
  agencyId: string;
  docketType: string;
  title: string;
  objectId: string;
  highlightedContent?: string;
}

export interface RegDocument {
  id: string;
  type: string;
  agencyId: string;
  documentType: string;
  title: string;
  objectId: string;
  postedDate?: string;
  frDocNum?: string;
  fileFormats?: Array<{ fileUrl?: string; format?: string }>;
  highlightedContent?: string;
  comment?: string;
  summary?: string;
}

export interface RegComment {
  id: string;
  type: string;
  title?: string;
  comment?: string;
  postedDate?: string;
  receiveDate?: string;
  agencyId?: string;
  objectId?: string;
}

// ---------------------------------------------------------------------------
// Extractors — flatten JSON:API resources into plain objects
// ---------------------------------------------------------------------------

function extractDocket(resource: JsonApiResource): RegDocket {
  const a = resource.attributes;
  return {
    id: resource.id,
    type: resource.type,
    agencyId: (a.agencyId as string) ?? "",
    docketType: (a.docketType as string) ?? "",
    title: (a.title as string) ?? "",
    objectId: (a.objectId as string) ?? resource.id,
    highlightedContent: a.highlightedContent as string | undefined,
  };
}

function extractDocument(resource: JsonApiResource): RegDocument {
  const a = resource.attributes;
  return {
    id: resource.id,
    type: resource.type,
    agencyId: (a.agencyId as string) ?? "",
    documentType: (a.documentType as string) ?? "",
    title: (a.title as string) ?? "",
    objectId: (a.objectId as string) ?? resource.id,
    postedDate: a.postedDate as string | undefined,
    frDocNum: a.frDocNum as string | undefined,
    fileFormats: a.fileFormats as Array<{ fileUrl?: string; format?: string }> | undefined,
    highlightedContent: a.highlightedContent as string | undefined,
    comment: a.comment as string | undefined,
    summary: a.summary as string | undefined,
  };
}

function extractComment(resource: JsonApiResource): RegComment {
  const a = resource.attributes;
  return {
    id: resource.id,
    type: resource.type,
    title: a.title as string | undefined,
    comment: a.comment as string | undefined,
    postedDate: a.postedDate as string | undefined,
    receiveDate: a.receiveDate as string | undefined,
    agencyId: a.agencyId as string | undefined,
    objectId: a.objectId as string | undefined,
  };
}
