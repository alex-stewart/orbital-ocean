import { books } from './books';

/** Purple ink stamp of the Imperial Office of Records. */
function Seal() {
  const text = 'HOLY PURPLE BUREAUCRATIC EMPIRE · OFFICE OF RECORDS ·';
  return (
    <svg className="seal" viewBox="-60 -60 120 120" aria-hidden>
      <defs>
        <path id="seal-ring" d="M0,-44 a44,44 0 1,1 -0.01,0" />
      </defs>
      <circle r="56" className="seal-line" />
      <circle r="35" className="seal-line thin" />
      <text className="seal-ring-text">
        <textPath href="#seal-ring">
          {text}
        </textPath>
      </text>
      <text y="3" className="seal-mid">
        APPROVED
      </text>
      <text y="15" className="seal-small">
        FOR READING
      </text>
    </svg>
  );
}

const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

export function Library() {
  return (
    <main className="library">
      <header className="library-head">
        <p className="eyebrow">Holy Purple Bureaucratic Empire · Imperial Office of Records</p>
        <h1>The Imperial Reference Shelf</h1>
        <p className="lede">
          Works of reference concerning the Orbital Ocean, the Land of the Large, and the continents that wheel about it,
          released for consultation by citizens of good standing.
        </p>
        <Seal />
      </header>

      <section className="shelf" aria-label="Books">
        <div className="shelf-books">
          {books.map((b) => {
            const spine = (
              <>
                <span className="spine-band" />
                <span className="spine-title">{b.title}</span>
                <span className="spine-mark">{b.shelfmark.split('/')[1]}</span>
                <span className="spine-band" />
              </>
            );
            const style = { '--book': b.colour, '--h': `${b.height}%` } as React.CSSProperties;
            return b.href ? (
              <a key={b.id} className="book" href={b.href} style={style} title={b.subtitle}>
                {spine}
              </a>
            ) : (
              <div key={b.id} className="book book--forthcoming" style={style} title={`${b.subtitle} — pending approval`}>
                {spine}
              </div>
            );
          })}
        </div>
        <div className="shelf-board" />
      </section>

      <h2 className="register-title">Register of Holdings</h2>
      <ol className="catalogue">
        {books.map((b, i) => (
          <li key={b.id}>
            <span className="catalogue-no">Vol. {roman[i]}</span>
            {b.href ? <a href={b.href}>{b.title}</a> : <span>{b.title}</span>}
            <span className="catalogue-sub">
              {b.subtitle} · <span className="shelfmark">{b.shelfmark}</span>
            </span>
            <span className={`catalogue-state ${b.href ? 'approved' : ''}`}>
              {b.href ? 'Approved' : 'Pending approval'}
            </span>
          </li>
        ))}
      </ol>

      <p className="notice">
        Volumes marked <em>pending approval</em> remain under review by the appropriate committee. Requests for early
        access must be submitted in triplicate.
      </p>
    </main>
  );
}
