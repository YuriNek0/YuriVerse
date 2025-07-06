import { getCollection, getEntry, type CollectionEntry } from 'astro:content';
import { slug } from 'github-slugger';
import type {Category, Serie, BlogPost} from '../types/BlogPost.ts';

let tree: Map<string, Category> | null = null;
let prevPostMap: Map<BlogPost | null, BlogPost> | null = null;
let nextPostMap: Map<BlogPost, BlogPost | null> | null = null;

export async function getPostTree() {
  const sort_func = (a, b, ascending=false) => {
    const l = ascending ? b[1].pubDate.valueOf() : a[1].pubDate.valueOf();
    const r = ascending ? a[1].pubDate.valueOf() : b[1].pubDate.valueOf();
    const result = r - l;
    if (result === 0) return a[1].title > b[1].title ? 1 : -1;
    return result;
  };
  if (!tree) {
    const allBlogs = await getCollection('blog');
    let blogTree: Map<string, Category> = new Map();

    await Promise.all(allBlogs.map(async b => {
      if (b.id === "index") return;
      
      const splitted = b.id.split('/')
      const categoryEntry: CollectionEntry<'category'> = await getEntry('category', splitted[0]);
      if (!blogTree.has(categoryEntry.id)) blogTree.set(categoryEntry.id, { title: categoryEntry.data.title, blogs: new Map(), pubDate: new Date(0)});
      const category: Category = blogTree.get(categoryEntry.id);

      if (splitted.length == 3) {
        const serieEntry: CollectionEntry<'serie'> = await getEntry('serie', categoryEntry.id + '/' + splitted[1]);
        if (!category.blogs.has(serieEntry.id)) category.blogs.set(serieEntry.id, { type: "Serie", title: serieEntry.data.title, blogs: new Map(), pubDate: new Date(0)});

        const serie: Serie = category.blogs.get(serieEntry.id);
        serie.blogs.set(b.id, { type: "BlogPost", title: b.data.title, pubDate: b.data.pubDate, url: '/'+slug(category.title)+'/'+slug(serie.title)+'/'+slug(b.data.title)});
        serie.pubDate = serie.pubDate.valueOf() < b.data.pubDate.valueOf() ? b.data.pubDate : serie.pubDate;
        category.pubDate = category.pubDate.valueOf() < serie.pubDate.valueOf() ? serie.pubDate : category.pubDate;
        return;
      }
      
      category.blogs.set(b.id, { type: "BlogPost", title: b.data.title, pubDate: b.data.pubDate, url: '/'+slug(category.title)+'/'+slug(b.data.title)});
      category.pubDate = category.pubDate.valueOf() < b.data.pubDate.valueOf() ? b.data.pubDate : category.pubDate;
    }));

    // Sort the tree, make them ordered by the latest upload date, except for the series, which will be in ascending order.
    blogTree = new Map([...blogTree.entries()].sort(sort_func));
    blogTree.values().forEach(b => {
      b.blogs = new Map([...b.blogs.entries()].sort(sort_func));
      b.blogs.forEach(c => {
        if (c.type === "BlogPost") return;
        c.blogs = new Map([...c.blogs.entries()].sort((a, b) => sort_func(a, b, true)));
      })
    });

    tree = blogTree;
  }
  return tree;
}

async function buildMaps() {
  if (!tree) getPostTree();

  const prevMap = new Map();
  const nextMap = new Map();

  let prevPost: BlogPost | null = null;
  tree.values().forEach(cat => {
    cat.blogs.values().forEach(serie => {
      if (serie.type === "Serie") {
        serie.blogs.values().forEach(blog => {
          prevMap.set(blog, prevPost);
          nextMap.set(prevPost, blog);
          prevPost = blog;
        });
        return;
      }
      prevMap.set(serie, prevPost);
      nextMap.set(prevPost, serie);
      prevPost = serie;
    })
  })
  
  prevPostMap = prevMap;
  nextPostMap = nextMap;
}

export async function getNextPost(blog) {
  if (!nextPostMap) await buildMaps();
  return nextPostMap.get(blog);
}

export async function getPrevPost(blog) {
  if (!prevPostMap) await buildMaps();
  return prevPostMap.get(blog);
}
