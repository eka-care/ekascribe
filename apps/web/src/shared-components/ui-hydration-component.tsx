import ScribeAnimatedLogo from '@/assets/scribe-animated-logo';

const UIHydrationComponent = () => {
  return (
    <div className="fixed inset-0 z-50 bg-background overflow-hidden flex justify-center items-center">
      <div className="flex flex-col items-center gap-4">
        <ScribeAnimatedLogo />
        <p className="font-semibold text-lg">Setting up Vaarta...</p>
      </div>
    </div>
  );
};

export default UIHydrationComponent;
