import { lazy, Suspense } from 'react';
import { useRoute } from './lib/route';
import { Library } from './Library';

const Atlas = lazy(() => import('./books/atlas/Atlas'));

export function App() {
  const route = useRoute();
  if (route.path.startsWith('/atlas')) {
    return (
      <Suspense fallback={<div className="loading">Opening the Atlas…</div>}>
        <Atlas params={route.params} />
      </Suspense>
    );
  }
  return <Library />;
}
