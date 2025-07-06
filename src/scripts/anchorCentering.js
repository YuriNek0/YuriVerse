function scrollToHashCenter(hash) {
  const target = document.querySelector(hash);
  if (target) {
    target.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }
}

// Scroll on link clicks
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener("click", function (e) {
    const hash = this.getAttribute("href");
    const target = document.querySelector(hash);
    if (target) {
      e.preventDefault();
      history.pushState(null, "", hash); // update URL without jump
      scrollToHashCenter(hash);
    }
  });
});

// Scroll if URL already has a hash on page load
window.addEventListener("load", () => {
  if (window.location.hash) {
    setTimeout(() => {
      scrollToHashCenter(window.location.hash);
    }, 0); // delay to ensure layout is stable
  }
});
