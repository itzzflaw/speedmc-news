const tagMap = {
  update: 'tag-update',
  patch: 'tag-patch',
  event: 'tag-event',
  news: 'tag-news'
};

const tagLabels = {
  update: 'Update',
  patch: 'Patch',
  event: 'Event',
  news: 'News'
};

function renderPosts(filtered) {
  const container = document.getElementById('posts');
  const empty = document.getElementById('empty');
  container.innerHTML = '';

  if (filtered.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  filtered.forEach(post => {
    const initial = post.author ? post.author[0].toUpperCase() : 'S';
    const el = document.createElement('article');
    el.className = 'post-card';
    el.dataset.tag = post.tag;
    el.dataset.server = post.server;
    el.innerHTML = `
      <span class="tag ${tagMap[post.tag] || 'tag-news'}">${tagLabels[post.tag] || post.tag}</span>
      <h2>${post.title}</h2>
      <p>${post.description}</p>
      <div class="post-meta">
        <div class="avatar">${initial}</div>
        <span>${post.author}</span>
        <span class="dot"></span>
        <span>${post.date}</span>
      </div>
    `;
    container.appendChild(el);
  });
}

let activeTag = 'all';
let activeServer = 'all';

function filter() {
  const filtered = posts.filter(p => {
    const matchTag = activeTag === 'all' || p.tag === activeTag;
    const matchServer = activeServer === 'all' || p.server === activeServer;
    return matchTag && matchServer;
  });
  renderPosts(filtered);
}

document.querySelectorAll('#tag-filter .filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#tag-filter .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTag = btn.dataset.filter;
    filter();
  });
});

document.querySelectorAll('#server-filter .filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#server-filter .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeServer = btn.dataset.server;
    filter();
  });
});

renderPosts(posts);
