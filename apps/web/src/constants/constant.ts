const env = (process.env.NEXT_PUBLIC_ENV || 'PROD') as 'DEV' | 'PROD';

export enum Environment {
  PROD = 'PROD',
  DEV = 'DEV',
}

export type ExtraMinifiedPatientFields = 'dob' | 'gen' | 'abha' | 'u_ate' | 'is_age';

export const globalTrinitySDKConfig = {
  env: env === 'PROD' ? Environment.PROD : Environment.DEV,
  workspaceId: process.env.NEXT_PUBLIC_TRINITY_WORKSPACE_ID || '',
  extraMinifiedPatientFields: ['gen', 'dob', 'is_age'] as ExtraMinifiedPatientFields[],
};

export const FLAVOUR = 'ekascribe-web';

import { HOSTS } from '@/config/hosts';

export const medicalRecordSDKConfig = {
  environment: 'prod' as import('@eka-care/medical-records-ts-sdk').SDKEnvironment,
  baseUrl: HOSTS.EKA_HOST,
  vaultBaseUrl: HOSTS.VAULT_HOST,
};

// On-prem: login/switch URLs are env-driven (NEXT_PUBLIC_LOGIN_URL etc.).
export const LOGOUT_PROD_URL = HOSTS.LOGIN_URL;
export const LOGOUT_DEV_URL = HOSTS.LOGIN_URL;

export const SWITCH_WORKSPACE_PROD_URL = HOSTS.SWITCH_WORKSPACE_URL;
export const SWITCH_WORKSPACE_DEV_URL = HOSTS.SWITCH_WORKSPACE_URL;

export const DEMO_SCRIPT_TEXT =
  'This consultation is for John Smith, a 45-year-old male presenting with a three-day history of sore throat and low-grade fever. He reports painful swallowing and general fatigue but denies cough, chest pain, shortness of breath, or rash. His past medical history includes well-controlled hypertension, and he currently takes amlodipine 5 mg daily with no known drug allergies. The patient agrees with the plan and understands when to seek further care.';
