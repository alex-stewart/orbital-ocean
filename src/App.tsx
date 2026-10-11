import { Component, lazy, Suspense, type ReactNode } from 'react';
import { useRoute } from './lib/route';
import { Library } from './Library';

const Atlas = lazy(() => import('./books/atlas/Atlas'));

/** Shows load errors (e.g. a faulty continent design) instead of a blank page. */
class LoadError extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="load-error">
        <h1>The Atlas could not be opened</h1>
        <p className="load-error-message">{this.state.error.message}</p>
        <p>
          If you have just edited a continent design, see <code>docs/designing-continents.md</code>.{' '}
          <a href="#/">Return to the Reference Shelf</a>.
        </p>
      </main>
    );
  }
}

export function App() {
  const route = useRoute();
  if (route.path.startsWith('/atlas')) {
    return (
      <LoadError>
        <Suspense fallback={<div className="loading">Opening the Atlas…</div>}>
          <Atlas params={route.params} />
        </Suspense>
      </LoadError>
    );
  }
  return <Library />;
}
