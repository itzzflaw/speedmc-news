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

const chevronSVG = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M2 4L6 8L10 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

function renderBody(body) {
  if (!body) return '';
  // Support simple markdown-like: **bold**, `code`, ## heading, - list, \n\n paragraph
  let html = body
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/`(.+?)`/g,'<code>$1</code>')
    .replace(/^### (.+)$/gm,'<h3>$1</h3>')
    .replace(/^## (.+)$/gm,'<h3>$1</h3>')
    .replace(/^---$/gm,'<hr class="changelog-divider">')
    .replace(/^[-•] (.+)$/gm,'<li>$1</li>');

  // Wrap consecutive <li> in <ul>
  html = html.replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`);

  // Wrap remaining double-newline blocks in <p>
  const lines = html.split('\n');
  const out = [];
  let buf = [];
  for (const line of lines) {
    if (line === '') {
      if (buf.length) { out.push('<p>'+buf.join(' ')+'</p>'); buf = []; }
    } else if (/^<(h3|ul|hr)/.test(line)) {
      if (buf.length) { out.push('<p>'+buf.join(' ')+'</p>'); buf = []; }
      out.push(line);
    } else {
      buf.push(line);
    }
  }
  if (buf.length) out.push('<p>'+buf.join(' ')+'</p>');
  return out.join('\n');
}

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
    const hasBody = !!(post.body && post.body.trim());
    const el = document.createElement('article');
    el.className = 'post-card';
    el.dataset.tag = post.tag;
    el.dataset.server = post.server;

    el.innerHTML = `
      <div class="post-card-header">
        <div class="post-card-header-left">
          <span class="tag ${tagMap[post.tag] || 'tag-news'}">${tagLabels[post.tag] || post.tag}</span>
          <h2>${post.title}</h2>
          <p class="summary">${post.description}</p>
          <div class="post-meta">
            <div class="avatar">${initial}</div>
            <span>${post.author}</span>
            <span class="dot"></span>
            <span>${post.date}</span>
          </div>
        </div>
        ${hasBody ? `<button class="expand-btn" aria-expanded="false">
          <span class="btn-label">Read more</span>${chevronSVG}
        </button>` : ''}
      </div>
      ${hasBody ? `<div class="post-body"><div class="post-body-inner">${renderBody(post.body)}</div></div>` : ''}
    `;

    if (hasBody) {
      const btn = el.querySelector('.expand-btn');
      const body = el.querySelector('.post-body');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = el.classList.toggle('open');
        btn.setAttribute('aria-expanded', isOpen);
        btn.querySelector('.btn-label').textContent = isOpen ? 'Collapse' : 'Read more';
      });
      // Also allow clicking the card header to expand
      el.querySelector('.post-card-header-left').addEventListener('click', () => {
        btn.click();
      });
    }

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
