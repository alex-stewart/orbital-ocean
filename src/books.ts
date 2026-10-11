export interface Book {
  id: string;
  title: string;
  subtitle: string;
  /** Imperial catalogue reference, shown on the spine and in the register. */
  shelfmark: string;
  /** Route of the book, or null while it awaits approval. */
  href: string | null;
  colour: string;
  height: number;
}

export const books: Book[] = [
  {
    id: 'atlas',
    title: 'The Atlas',
    subtitle: 'Official Charts of the Orbital Ocean',
    shelfmark: 'HPBE/CRT/0001',
    href: '#/atlas',
    colour: '#4b2d63',
    height: 100,
  },
  {
    id: 'chronicle',
    title: 'The Chronicle',
    subtitle: 'An Authorised History of the Empire and its Neighbours',
    shelfmark: 'HPBE/HST/0001',
    href: null,
    colour: '#6b2a22',
    height: 92,
  },
  {
    id: 'bestiary',
    title: 'The Bestiary',
    subtitle: 'Register of Creatures, Licensed and Unlicensed',
    shelfmark: 'HPBE/FNA/0001',
    href: null,
    colour: '#2f4a46',
    height: 96,
  },
];
