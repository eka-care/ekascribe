// Desktop installer URLs — same artefacts the old ekascribe.ai/download page served.
export const DOWNLOAD_URLS = {
  mac: 'https://updates.eka.care/ekascribe/latest/EkaScribe.dmg',
  windows: 'https://updates.eka.care/ekascribe/latest/EkaScribe%20Setup.exe',
} as const;

export const PRIVACY_POLICY_URL = 'https://www.eka.care/privacy-policy';
export const TERMS_OF_SERVICE_URL = 'https://www.eka.care/terms-of-service';

// Demo video shown between the hero and the feature cards. Authored at the Figma
// frame's 1311x819 (16:10) — export at 2x (2622x1638) so it stays crisp.
export const DEMO_VIDEO_SRC = '/assets/download/vaarta-demo.mp4';
export const DEMO_VIDEO_POSTER = '/assets/download/vaarta-demo-poster.png';
