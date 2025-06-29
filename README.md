# Design

## Structure

- Using src/content folder to store blogposts.
- Posts have their own directory with index.md, of which the cwd will be its parent directory.
- Posts can be standalone, and can be categorized as a series/topic.
- A series/topic is also represented as a subdirectory, with info.json, which has the information for the series.
- i.e. A tree structure.

## Pages
- Home page is an *about* introduction, below that lists recent published posts. *A page control should be implemented*.
- The left panel displays all series and posts (can be collapsed).
- The right side should be all headers' references.
- Mobile support for search, tab, and navigation.
- Recommend readings at the bottom.

## Search
- Show all articles with tag
- Search by title/category/tag

## Garbage collection
- Collect unused resources, mostly images.

## Hooks
- Put garbages into trash can after building. Disable the hook when there is no trashcan detected.

