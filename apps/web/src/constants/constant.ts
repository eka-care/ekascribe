export const FLAVOUR = 'ekascribe-web';

import { HOSTS } from '@/config/hosts';

// On-prem: login/switch URLs are env-driven (NEXT_PUBLIC_LOGIN_URL etc.).
export const LOGOUT_PROD_URL = HOSTS.LOGIN_URL;
export const LOGOUT_DEV_URL = HOSTS.LOGIN_URL;

export const SWITCH_WORKSPACE_PROD_URL = HOSTS.SWITCH_WORKSPACE_URL;
export const SWITCH_WORKSPACE_DEV_URL = HOSTS.SWITCH_WORKSPACE_URL;

export const DEMO_SCRIPT_TEXT =
  'This consultation is for John Smith, a 45-year-old male presenting with a three-day history of sore throat and low-grade fever. He reports painful swallowing and general fatigue but denies cough, chest pain, shortness of breath, or rash. His past medical history includes well-controlled hypertension, and he currently takes amlodipine 5 mg daily with no known drug allergies. The patient agrees with the plan and understands when to seek further care.';
