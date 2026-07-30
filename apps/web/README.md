# EkaScribe Web

Next.js web app for EkaScribe.

## Prerequisites

- Node.js
- Yarn
- Access to [eka-care/eka-web-design-components](https://github.com/eka-care/eka-web-design-components) (private repo)

## Local Setup

### 1. Clone the repo

```bash
git clone <repo-url>
cd ekascribe-web
```

### 2. Initialize submodules

```bash
git submodule update --init --recursive
```

### 3. Build the UI library

```bash
cd packages/ui-lib
yarn install
yarn build
cd ..
```

### 4. Install and build root

```bash
yarn install
yarn build
```

### 5. Add `.env` file

Create a `.env` file in the root. You can copy `.env.development` as a starting point:

```bash
cp .env.development .env
```

### 6. Add access token and env in SDK provider

In `src/features/session/services/sdk-provider.ts`, update `EKA_SCRIBE_DEFAULT_CONFIG`:

- Set `env: 'DEV'`
- Set `access_token` to your token

To get the token: go to the dev domain, open browser DevTools -> Application -> Cookies, and copy the `stg_sess` cookie value.

### 7. Add Firebase credentials

In `src/lib/firebase.ts`, replace `getFirebaseConfig()` with hardcoded dev credentials since the runtime config (loaded from AWS) doesn't work locally:

### 8. Bypass auth in protected route provider

In `src/provider/protected-route-provider.tsx`, add an early return before the hooks since `whoAmI` doesn't work locally:

```ts
const ProtectedRouteProvider = ({ children }: Props) => {
  return children; // <-- add this for local dev

  // ... rest of the component
};
```

### 9. Run the dev server

```bash
yarn dev:local
```

### 10. Navigate to the app

Open [http://localhost:3000/new-session](http://localhost:3000/new-session) in your browser. The root `/` route won't work locally since the auth provider is bypassed.

## Running over HTTPS (eka.care subdomain)

Some flows (auth cookies, prod APIs) only work when the app is served over HTTPS from an `eka.care` subdomain. The `yarn dev` script runs the server as `https://test.eka.care` using a locally-trusted mkcert certificate.

### 1. Map the subdomain to localhost

Add this line to `/etc/hosts`:

```
127.0.0.1 test.eka.care
```

### 2. Install mkcert and its local CA

```bash
brew install mkcert
mkcert -install
```

`mkcert -install` adds mkcert's root CA to your system/browser trust store. This is required for the certificate to be trusted — if you copy certs generated on another machine, the browser will show "not secure" because that machine's CA isn't trusted here.

### 3. Generate the certificate

```bash
mkdir -p certificates
cd certificates
mkcert test.eka.care
cd ..
```

This creates `certificates/test.eka.care.pem` and `certificates/test.eka.care-key.pem`, the exact filenames the `dev` script expects.

### 4. Run the HTTPS dev server

```bash
sudo yarn dev
```

`sudo` is needed because port 443 is privileged. Then open [https://test.eka.care/new-session](https://test.eka.care/new-session).
