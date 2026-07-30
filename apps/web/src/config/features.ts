/**
 * Feature flags (plan decision #8): ALL code stays in the repo; non-scribe
 * features are disabled by default and re-enableable via env. v1 default =
 * scribe only: record → transcribe → structured note → edit → print/copy.
 *
 * Enable with NEXT_PUBLIC_FEATURE_<NAME>=true.
 */

function flag(env: string | undefined, fallback = false): boolean {
  if (env === undefined || env === '') return fallback;
  return env === 'true' || env === '1';
}

export const FEATURES = {
  /** Stripe payments + pricing pages */
  payments: flag(process.env.NEXT_PUBLIC_FEATURE_PAYMENTS),
  /** Firebase/Firestore appointment queue + WhatsApp Rx */
  appointmentQueue: flag(process.env.NEXT_PUBLIC_FEATURE_APPOINTMENT_QUEUE),
  /** patient directory (aortago-backed) */
  patientDirectory: flag(process.env.NEXT_PUBLIC_FEATURE_PATIENT_DIRECTORY),
  /** medical records / attachments vault */
  recordsVault: flag(process.env.NEXT_PUBLIC_FEATURE_RECORDS_VAULT),
  /** hub EMR configuration screens */
  emrConfig: flag(process.env.NEXT_PUBLIC_FEATURE_EMR_CONFIG),
  /** parchi doctor profile (feeds PDF letterhead) */
  doctorProfile: flag(process.env.NEXT_PUBLIC_FEATURE_DOCTOR_PROFILE),
  /** onboarding screens */
  onboarding: flag(process.env.NEXT_PUBLIC_FEATURE_ONBOARDING),
  /** publish integrations (GDoc / Notion / WhatsApp) */
  publishIntegrations: flag(process.env.NEXT_PUBLIC_FEATURE_PUBLISH),
  /** drug/lab autocomplete backed by the local formulary */
  drugSearch: flag(process.env.NEXT_PUBLIC_FEATURE_DRUG_SEARCH, true),

  // trackers/analytics — all off by default for on-prem
  mixpanel: flag(process.env.NEXT_PUBLIC_ENABLE_MIXPANEL),
  gtm: flag(process.env.NEXT_PUBLIC_ENABLE_GTM),
  crisp: flag(process.env.NEXT_PUBLIC_ENABLE_CRISP),
  sentry: flag(process.env.NEXT_PUBLIC_ENABLE_SENTRY),
  geoIp: flag(process.env.NEXT_PUBLIC_ENABLE_GEOIP),
};

export type FeatureName = keyof typeof FEATURES;

export function isEnabled(name: FeatureName): boolean {
  return FEATURES[name];
}
