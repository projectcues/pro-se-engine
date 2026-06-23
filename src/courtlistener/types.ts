// ---------------------------------------------------------------------------
// CourtListener API Types
// ---------------------------------------------------------------------------

export interface CLSearchResult {
  count: number;
  next: string | null;
  previous: string | null;
  results: CLSearchHit[];
}

export interface CLSearchHit {
  id: number;
  caseName: string;
  court: string;
  court_id: string;
  court_citation_string: string;
  dateFiled: string;
  dateArgued: string | null;
  docketNumber: string;
  citation: string[];
  suitNature: string;
  citeCount: number;
  status: string;
  cluster_id: number;
  snippet: string;
  absolute_url: string;
  [key: string]: unknown;
}

export interface CLOpinion {
  id: number;
  absolute_url: string;
  cluster: string; // URL to cluster
  cluster_id: number;
  author: string | null;
  author_str: string;
  type: string;
  sha1: string;
  plain_text: string;
  html: string;
  html_lawbox: string;
  html_columbia: string;
  html_with_citations: string;
  download_url: string | null;
  date_created: string;
  date_modified: string;
  joined_by: string[];
  [key: string]: unknown;
}

export interface CLCluster {
  id: number;
  absolute_url: string;
  case_name: string;
  case_name_short: string;
  case_name_full: string;
  date_filed: string;
  date_filed_is_approximate: boolean;
  docket: string; // URL
  docket_id: number;
  citation_count: number;
  precedential_status: string;
  judges: string;
  nature_of_suit: string;
  syllabus: string;
  posture: string;
  procedural_history: string;
  slug: string;
  sub_opinions: string[]; // URLs to opinions
  citations: CLCitation[];
  panel: string[];
  [key: string]: unknown;
}

export interface CLCitation {
  volume: number;
  reporter: string;
  page: string;
  type: number;
}

export interface CLDocket {
  id: number;
  absolute_url: string;
  case_name: string;
  case_name_short: string;
  court: string; // URL
  court_id: string;
  date_filed: string | null;
  date_terminated: string | null;
  date_last_filing: string | null;
  docket_number: string;
  docket_number_core: string;
  nature_of_suit: string;
  cause: string;
  assigned_to: string | null;
  assigned_to_str: string;
  referred_to: string | null;
  referred_to_str: string;
  pacer_case_id: string;
  source: number;
  slug: string;
  [key: string]: unknown;
}

export interface CLDocketEntry {
  id: number;
  docket: string; // URL
  date_filed: string | null;
  entry_number: number | null;
  description: string;
  recap_documents: CLRECAPDocument[];
  [key: string]: unknown;
}

export interface CLRECAPDocument {
  id: number;
  description: string;
  document_number: string;
  attachment_number: number | null;
  page_count: number | null;
  filepath_local: string;
  is_available: boolean;
  [key: string]: unknown;
}

export interface CLCourt {
  id: string;
  full_name: string;
  short_name: string;
  citation_string: string;
  url: string;
  jurisdiction: string;
  in_use: boolean;
  date_modified: string;
  start_date: string;
  end_date: string | null;
  [key: string]: unknown;
}

export interface CLPerson {
  id: number;
  absolute_url: string;
  name_first: string;
  name_middle: string;
  name_last: string;
  name_suffix: string;
  date_dob: string | null;
  date_dod: string | null;
  dob_city: string;
  dob_state: string;
  gender: string;
  race: string[];
  political_affiliations: CLPoliticalAffiliation[];
  positions: CLPosition[];
  educations: CLEducation[];
  aba_ratings: CLABARating[];
  [key: string]: unknown;
}

export interface CLPoliticalAffiliation {
  id: number;
  political_party: string;
  date_start: string | null;
  date_end: string | null;
  source: string;
}

export interface CLPosition {
  id: number;
  court: string; // URL
  court_full_name: string;
  position_type: string;
  date_nominated: string | null;
  date_elected: string | null;
  date_recess_appointment: string | null;
  date_referred_to_judicial_committee: string | null;
  date_judicial_committee_action: string | null;
  date_hearing: string | null;
  date_confirmation: string | null;
  date_start: string | null;
  date_retirement: string | null;
  date_termination: string | null;
  appointer: string | null;
  how_selected: string;
  [key: string]: unknown;
}

export interface CLEducation {
  id: number;
  school: { id: number; name: string; [key: string]: unknown };
  degree_level: string;
  degree_detail: string;
  degree_year: number | null;
}

export interface CLABARating {
  id: number;
  rating: string;
  year_rated: string;
}

export interface CLCitationLookupResult {
  citations: CLCitationMatch[];
  [key: string]: unknown;
}

export interface CLCitationMatch {
  citation: string;
  normalized_citations: string[];
  clusters: CLCitationCluster[];
  status: number;
}

export interface CLCitationCluster {
  id: number;
  case_name: string;
  absolute_url: string;
  [key: string]: unknown;
}

export interface CLOpinionsCitedResult {
  count: number;
  next: string | null;
  previous: string | null;
  results: CLOpinionsCitedHit[];
}

export interface CLOpinionsCitedHit {
  id: number;
  citing_opinion: string; // URL
  cited_opinion: string; // URL
  depth: number;
  [key: string]: unknown;
}

export interface CLOralArgument {
  id: number;
  absolute_url: string;
  case_name: string;
  case_name_short: string;
  court_id: string;
  date_argued: string;
  docket: string;
  docket_id: number;
  duration: number;
  judges: string;
  download_url: string;
  local_path_original_file: string;
  sha1: string;
  [key: string]: unknown;
}

export interface CLListResult<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// Search types for the CourtListener search endpoint
export type CLSearchType = "o" | "r" | "p" | "oa";
