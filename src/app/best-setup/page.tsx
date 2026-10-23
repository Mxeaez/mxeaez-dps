import { Metadata } from 'next';
import BestSetup from '@/app/components/bestSetup/BestSetup';

// Fractured Archive "Best setup" view (phase 8): gear search + search-based summary. Docs: docs/BEST_SETUP.md.
export const metadata: Metadata = {
  title: 'Best setup - DPS Calculator',
};

const Page = () => <BestSetup />;

export default Page;
