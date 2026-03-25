// Storage keys for IndexedDB and LocalStorage
export const STORAGE_KEYS = {
  SCENARIOS: 'personaforge_scenarios',
  CURRENT_SCENARIO_ID: 'personaforge_current_scenario_id',
  DRAFT_DATA: 'personaforge_draft_profile',
  DRAFT_IDEA: 'personaforge_draft_idea',
  DRAFT_STEP: 'personaforge_draft_step',
  DRAFT_MODE: 'personaforge_draft_mode',
  DRAFT_SETUP_TYPE: 'personaforge_draft_setup_type',
  RESCUE_BACKUP: 'personaforge_rescue_backup',
  SCENARIO_MESSAGES: (id: string) => `personaforge_messages_${id}`,
  SCENARIO_CODEX: (id: string) => `personaforge_codex_${id}`,
  SCENARIO_SUMMARY: (id: string) => `personaforge_summary_${id}`,
};
