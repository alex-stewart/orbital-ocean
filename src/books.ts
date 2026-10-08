export interface Book {
  id: string;
  title: string;
  subtitle: string;
  /** Route of the book, or null while it is still being written. */
  href: string | null;
  colour: string;
  height: number;
}

export const books: Book[] = [
  {
    id: 'atlas',
    title: 'The Atlas',
    subtitle: 'Charts of the Orbital Ocean',
    href: '#/atlas',
    colour: '#2f4a46',
    height: 100,
  },
  {
    id: 'chronicle',
    title: 'The Chronicle',
    subtitle: 'A History of the Isles',
    href: null,
    colour: '#6b2a22',
    height: 92,
  },
  {
    id: 'bestiary',
    title: 'The Bestiary',
    subtitle: 'Creatures of Sea and Shore',
    href: null,
    colour: '#4a3a5c',
    height: 96,
  },
];
