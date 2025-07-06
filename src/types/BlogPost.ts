export interface BlogPost {
  type: string;
  title: string,
  url: string,
  pubDate: Date
}

export interface Serie {
  type: string;
  title: string,
  blogs: Map<string, BlogPost>
  pubDate: Date
}

export interface Category {
  title: string,
  blogs: Map<string, BlogPost | Serie>
  pubDate: Date
}
