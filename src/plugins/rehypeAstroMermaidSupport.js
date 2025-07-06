import { visit } from 'unist-util-visit';

export function rehypeMermaidSupport(options = {}) {
  return (tree) => {
    visit(tree, 'element', node => {
      if (node.type !== 'element') return;
      const tag = node.tagName.toLowerCase();
      if (tag !== "pre") return;

      const language = node.properties && node.properties['dataLanguage'];
      if (language !== "mermaid") return;

      if (!node.properties.className) node.properties.className = [];
      node.properties.className.push("mermaid");
    })
  }
}
