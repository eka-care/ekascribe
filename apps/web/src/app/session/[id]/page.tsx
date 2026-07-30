import SessionScreen from '@/features/session/screens/session-screen';

interface PageProps {
  params: Promise<{ id: string }>;
}

const SessionPage = async ({ params }: PageProps) => {
  const { id } = await params;
  return <SessionScreen key={id} sessionId={id} />;
};

export default SessionPage;
