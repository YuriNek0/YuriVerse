const tocLinks = document.querySelectorAll('a.index-sidebar-element');
const tocContainer = document.querySelector('div.index-sidebar');
const headTocMap = new Map();

tocLinks.forEach(link => {
  const href = link.getAttribute("href");
  const target = href && document.querySelector(href); // Using ID;
  if (target) headTocMap.set(target, link);
})

let curr_active_element = headTocMap.values().next()?.value;
curr_active_element && curr_active_element.classList.add('index-sidebar-element-active');

const scrollToActive = element => {
  if (!tocContainer || !element) return;

  const elRect = element.getBoundingClientRect();
  const containerRect = tocContainer.getBoundingClientRect();

  if (elRect.top < containerRect.top || elRect.bottom > containerRect.bottom) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
};

const observer = new IntersectionObserver(
  entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        if (curr_active_element !== null) {
          curr_active_element.classList.remove('index-sidebar-element-active');
        }
        else {
          tocLinks.forEach(link => link.classList.remove('index-sidebar-element-active'));
        }
        curr_active_element = headTocMap.get(entry.target);
        if (curr_active_element) {
          curr_active_element.classList.add('index-sidebar-element-active');
          scrollToActive(curr_active_element);
        }
      }
    });
  },
  {
    rootMargin: '-49% 0px -49% 0px',
    threshold: 0
  }
)

headTocMap.keys().forEach(e => observer.observe(e));
