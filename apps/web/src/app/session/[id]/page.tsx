import SessionClientPage from './session-client-page';

// Static export: session ids are runtime UUIDs, so we export one placeholder
// shell. The API serves it for every /session/* path (web_static.py rewrite);
// the client router matches /session/[id] and reads the real id from the URL.
export function generateStaticParams() {
  return [{ id: '_' }];
}

const SessionPage = () => <SessionClientPage />;

export default SessionPage;
