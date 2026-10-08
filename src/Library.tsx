import { books } from './books';

export function Library() {
  return (
    <main className="library">
      <header className="library-head">
        <p className="eyebrow">Ex Libris</p>
        <h1>The Library of the Orbital Ocean</h1>
        <p className="lede">
          Works of reference concerning the flat sea, the Central Isle, and the lesser isles that wheel about it.
        </p>
      </header>

      <section className="shelf" aria-label="Books">
        <div className="shelf-books">
          {books.map((b) => {
            const spine = (
              <>
                <span className="spine-band" />
                <span className="spine-title">{b.title}</span>
                <span className="spine-band" />
              </>
            );
            const style = { '--book': b.colour, '--h': `${b.height}%` } as React.CSSProperties;
            return b.href ? (
              <a key={b.id} className="book" href={b.href} style={style} title={b.subtitle}>
                {spine}
              </a>
            ) : (
              <div key={b.id} className="book book--forthcoming" style={style} title={`${b.subtitle} — forthcoming`}>
                {spine}
              </div>
            );
          })}
        </div>
        <div className="shelf-board" />
      </section>

      <ol className="catalogue">
        {books.map((b, i) => (
          <li key={b.id}>
            <span className="catalogue-no">Vol. {['I', 'II', 'III', 'IV', 'V'][i]}</span>
            {b.href ? <a href={b.href}>{b.title}</a> : <span>{b.title}</span>}
            <span className="catalogue-sub">{b.subtitle}</span>
            <span className="catalogue-state">{b.href ? 'Open' : 'Forthcoming'}</span>
          </li>
        ))}
      </ol>
    </main>
  );
}
