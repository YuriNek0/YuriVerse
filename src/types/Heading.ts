export interface Heading {
  level: number;
  id: string;
  title: string;
  children?: Heading[];
};
