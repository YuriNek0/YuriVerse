import {visit} from 'unist-util-visit'
import GithubSlugger from 'github-slugger'

const default_prefix = 'post-id-'

/*
  This will add <a> element before all headings.
  Then for each heading node, set their id to be unique.

  Returns: Add h2, h3 headings.
*/

const slugger = new GithubSlugger();

export function rehypeLinkHeaders(options = {}) {
 
  const prefix = "prefix" in options ? options.prefix : default_prefix;
  const getTitle = (node) => {
    const texts = [];
    node.children?.forEach(child => {
      if (child.type === 'text') {
        texts.push(child.value);
      }
      // console.log(texts);
      texts.push(...getTitle(child));
    });
    return texts;
  }

  return (tree, file) => {
    const headings = [];
    let prev_parent_heading = null;

    visit(tree, 'element', node => {
      if (node.type !== 'element') return;

      const tag = node.tagName.toLowerCase();
      if (tag.length !== 2) return;
      if (tag.charCodeAt(0) != 104) return; // != 'h'

      const lvl_utf = tag.charCodeAt(1);
      if (lvl_utf < 49 || lvl_utf > 54) return; // range in 1-6

      const lvl = lvl_utf - 48; // - '0'
      const title = getTitle(node).join(' ').trim();
      const id = prefix + slugger.slug(title.toLowerCase());

      if (node.properties) {
        node.properties.id = id;
      }

      // Adding the bookmark
      node.children.unshift({
        type: 'element',
        tagName: 'a',
        properties: {
          href: `#${id}`,
          // class: styles.anchor,
          'aria-hidden': 'true'
        }
      });

      if (lvl == 2) {
        prev_parent_heading = {level: 2, title: title, id: id, children: []};
        headings.push(prev_parent_heading)
      }

      if (lvl == 3 && prev_parent_heading !== null) {
        prev_parent_heading.children.push({level: 3, title: title, id: id, children: null});
      }

    });

    file.data.astro = file.data.astro || {};
    file.data.astro.frontmatter = file.data.astro.frontmatter || {};
    file.data.astro.frontmatter.indexHeadings = headings;
  };
}
