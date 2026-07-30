// import { Button } from './shadcn-ui/components/ui/button
import { Button } from '@/components/ui/button';
import './index.css';

// import ShadCnButton from '@/components/ui/button';

function App() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-lg">
        <h1 className="text-3xl font-bold text-gray-800 mb-4">
          Welcome to Eka Care Design Components
        </h1>
        <p className="text-gray-600">
          Your Vite + React + TypeScript + Tailwind CSS project is ready!
        </p>

        <Button>Click me</Button>
      </div>
    </div>
  );
}

export default App;
