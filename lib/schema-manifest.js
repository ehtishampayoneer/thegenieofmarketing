// lib/schema-manifest.js
// GENERATED from the code: every table, and every column the code selects or
// filters on. /api/diagnostics probes the live database against this, because the
// database is edited by hand and falls behind the code without any error: a
// missing column makes a query return nothing, and features quietly do nothing.
// Regenerate after adding queries with: node scripts/gen-schema-manifest.mjs.
export const SCHEMA_MANIFEST = {
  action_outcomes: [],
  actions: ["created_at","id","payload","priority","result","scan_id","status","target","title","type","updated_at","user_id"],
  activity: ["created_at","detail","icon","id","message","user_id","verb"],
  cadence_plans: ["host","plan","updated_at","user_id"],
  chat_messages: ["content","created_at","host","role","user_id"],
  citation_targets: ["authority","host","user_id"],
  connections: ["access_token","created_at","google_email","gsc_site","id","meta","provider","refresh_token","scopes","updated_at","user_id"],
  decisions: ["choice","confidence","created_at","host","id","kind","meta","outcome","rationale","user_id"],
  directory_contacts: ["domain","id","is_genie_lead"],
  entities: ["host","user_id"],
  events: ["actor","created_at","data","host","id","subject","type","user_id"],
  growth_memory: ["host","insight","meta","mkey","updated_at","user_id","weight"],
  keyword_history: ["clicks","host","impressions","keyword","position","recorded_on","user_id"],
  keyword_usage: ["channel","created_at","host","id","keyword","ref_id","role","status","title","url","user_id"],
  keywords: ["ai_cited","competition","coverage","health","host","id","keyword","priority","source","traffic_potential","user_id","volume"],
  links: ["channel","host","id","ref","url","user_id"],
  notifications: ["created_at","id","kind","priority","status","user_id"],
  outreach_log: ["contact_email","contact_name","created_at","host","id","replied_at","sent_at","status","subject","user_id"],
  placements: ["created_at","draft","host","id","keyword","kind","meta","next_eligible_at","performance","platform","status","target_title","target_url","user_id"],
  profiles: ["company_address","company_name","company_phone","company_pitch","company_website","id","logo_url","money_page_url","onboarding_completed","plan","sender_email","sender_name","setup_completed"],
  published_pages: ["action_id","body_html","business_name","business_url","handle","host","id","meta_description","published_at","slug","status","target_keyword","title","updated_at","user_id"],
  safety_settings: ["kill_switch","monthly_spend_cap","permission_level","user_id"],
  scans: ["ai","checks","created_at","final_url","gsc","id","overall_score","scores","url","user_id"],
  suppressions: ["email","id","user_id"],
};
