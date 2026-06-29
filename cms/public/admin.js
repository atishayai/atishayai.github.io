(function () {
  let currentDraftId = null;
  let publishedSlug = null;
  let originalPublishedSlug = null;
  let isPublishedEdit = false;
  let publications = [];
  let lastPushCommands = [];

  const views = {
    dashboard: document.getElementById('view-dashboard'),
    upload: document.getElementById('view-upload'),
    editor: document.getElementById('view-editor'),
    success: document.getElementById('view-success'),
  };

  function showView(name) {
    Object.entries(views).forEach(([key, el]) => {
      el.classList.toggle('active', key === name);
    });
    document.querySelectorAll('.studio-nav .links a[data-view]').forEach((a) => {
      a.classList.toggle('active', a.dataset.view === name);
    });
    if (name === 'dashboard') {
      loadDashboard();
    }
  }

  document.querySelectorAll('[data-view]').forEach((el) => {
    el.addEventListener('click', (e) => {
      const view = el.dataset.view;
      if (view) {
        e.preventDefault();
        showView(view);
      }
    });
  });

  async function api(path, options = {}) {
    const res = await fetch(path, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  async function loadPublications() {
    try {
      const { publications: list } = await api('/api/publications');
      publications = list || [];
      populatePublicationSelect();
    } catch {
      publications = [];
    }
  }

  function populatePublicationSelect() {
    const select = document.getElementById('field-publication');
    const current = select.value;
    select.innerHTML =
      '<option value="">— Select publication —</option>' +
      publications.map((p) => `<option value="${escapeAttr(p)}">${escapeHtml(p)}</option>`).join('');
    if (current) select.value = current;
  }

  async function loadDashboard() {
    await Promise.all([loadDrafts(), loadPublished(), loadGitStatus(), loadPublications()]);
  }

  async function loadDrafts() {
    const el = document.getElementById('drafts-list');
    try {
      const { drafts } = await api('/api/drafts');
      if (!drafts.length) {
        el.innerHTML = '<p class="studio-empty">No drafts yet. Upload a document to start.</p>';
        return;
      }
      el.innerHTML = drafts
        .map(
          (d) => `
        <div class="studio-list-item" data-draft-id="${d.id}">
          <div>
            <div class="studio-list-item-title">${escapeHtml(d.title || 'Untitled')}</div>
            <div class="studio-list-item-meta">${escapeHtml(d.sourceFile || 'Draft')} · ${formatDate(d.updatedAt)}</div>
          </div>
          <div class="studio-list-item-actions">
            <span class="studio-list-item-tag">${escapeHtml(d.category || 'draft')}</span>
            <button type="button" class="studio-btn-icon" data-delete-draft="${d.id}" title="Delete draft">×</button>
          </div>
        </div>`
        )
        .join('');
      el.querySelectorAll('[data-draft-id]').forEach((item) => {
        item.addEventListener('click', (e) => {
          if (e.target.closest('[data-delete-draft]')) return;
          openDraft(item.dataset.draftId);
        });
      });
      el.querySelectorAll('[data-delete-draft]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm('Delete this draft? This cannot be undone.')) return;
          try {
            await api(`/api/drafts/${btn.dataset.deleteDraft}`, { method: 'DELETE' });
            loadDrafts();
          } catch (err) {
            alert(err.message);
          }
        });
      });
    } catch (err) {
      el.innerHTML = `<p class="studio-empty">${escapeHtml(err.message)}</p>`;
    }
  }

  async function loadPublished() {
    const el = document.getElementById('published-list');
    try {
      const posts = await api('/api/posts');
      const all = [
        ...posts.fiction.map((p) => ({ ...p, category: 'fiction' })),
        ...posts.nonfiction.map((p) => ({ ...p, category: 'nonfiction' })),
      ];
      if (!all.length) {
        el.innerHTML = '<p class="studio-empty">No published posts.</p>';
        return;
      }
      el.innerHTML = all
        .map(
          (p) => `
        <div class="studio-list-item">
          <a class="studio-list-item-link" href="/articles/${p.slug}.html" target="_blank" rel="noopener">
            <div>
              <div class="studio-list-item-title">${escapeHtml(p.title)}</div>
              <div class="studio-list-item-meta">${escapeHtml(p.publication)} · ${escapeHtml(p.date)}</div>
            </div>
          </a>
          <div class="studio-list-item-actions">
            <span class="studio-list-item-tag">${escapeHtml(p.category)}</span>
            <button type="button" class="studio-btn studio-btn-sm" data-edit-published="${p.slug}">Edit</button>
            <button type="button" class="studio-btn-icon" data-delete-published="${p.slug}" title="Delete post">×</button>
          </div>
        </div>`
        )
        .join('');
      el.querySelectorAll('[data-edit-published]').forEach((btn) => {
        btn.addEventListener('click', () => openPublished(btn.dataset.editPublished));
      });
      el.querySelectorAll('[data-delete-published]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm(`Delete "${btn.dataset.deletePublished}" from the live site files? You must push to GitHub to remove it from the web.`)) return;
          try {
            await api(`/api/posts/${btn.dataset.deletePublished}`, { method: 'DELETE' });
            loadPublished();
            loadGitStatus();
          } catch (err) {
            alert(err.message);
          }
        });
      });
    } catch (err) {
      el.innerHTML = `<p class="studio-empty">${escapeHtml(err.message)}</p>`;
    }
  }

  async function loadGitStatus() {
    const el = document.getElementById('git-status-content');
    try {
      const git = await api('/api/git/status');
      if (!git.ok) {
        el.innerHTML = `<p class="studio-empty">${escapeHtml(git.error || 'Git unavailable')}</p>`;
        return;
      }
      if (!git.hasChanges) {
        el.innerHTML = `<p class="studio-git-clean">Working tree clean — nothing to push.</p>`;
        return;
      }
      el.innerHTML = `
        <p class="studio-git-dirty">${git.files.length} file(s) changed on branch <strong>${escapeHtml(git.branch)}</strong></p>
        <ul class="studio-file-list">
          ${git.files.map((f) => `<li>${escapeHtml(f.file)}</li>`).join('')}
        </ul>`;
    } catch (err) {
      el.innerHTML = `<p class="studio-empty">${escapeHtml(err.message)}</p>`;
    }
  }

  // Upload
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const progressWrap = document.getElementById('upload-progress-wrap');
  const progressLabel = document.getElementById('upload-progress-label');
  const progressBar = document.getElementById('upload-progress-bar');
  const uploadError = document.getElementById('upload-error');

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) uploadFile(file);
    fileInput.value = '';
  });

  function setProgress(label, pct) {
    progressWrap.classList.remove('hidden');
    progressLabel.textContent = label;
    progressBar.style.width = `${pct}%`;
  }

  async function uploadFile(file) {
    uploadError.classList.add('hidden');
    setProgress('Uploading…', 10);

    const formData = new FormData();
    formData.append('file', file);

    try {
      setProgress('Uploading…', 25);
      await delay(200);
      setProgress('Extracting text…', 45);

      const xhr = new XMLHttpRequest();
      const result = await new Promise((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const pct = 10 + Math.round((e.loaded / e.total) * 30);
            setProgress('Uploading…', pct);
          }
        });
        xhr.addEventListener('load', () => {
          try {
            const data = JSON.parse(xhr.responseText);
            if (xhr.status >= 400) reject(new Error(data.error || 'Upload failed'));
            else resolve(data);
          } catch {
            reject(new Error('Upload failed'));
          }
        });
        xhr.addEventListener('error', () => reject(new Error('Network error')));
        xhr.open('POST', '/api/upload');
        xhr.send(formData);
      });

      setProgress('Creating draft…', 90);
      await delay(300);
      setProgress('Done', 100);
      openDraft(result.draftId, result.draft);
    } catch (err) {
      uploadError.textContent = err.message;
      uploadError.classList.remove('hidden');
      progressWrap.classList.add('hidden');
    }
  }

  // Editor fields
  const fieldTitle = document.getElementById('field-title');
  const fieldSlug = document.getElementById('field-slug');
  const slugPreview = document.getElementById('slug-preview');
  const slugWarning = document.getElementById('slug-warning');
  const wordCount = document.getElementById('word-count');
  const editorError = document.getElementById('editor-error');
  const editorSuccess = document.getElementById('editor-success');
  const editorSource = document.getElementById('editor-source');
  const pubSelect = document.getElementById('field-publication');
  const pubNewToggle = document.getElementById('field-publication-new-toggle');
  const pubCustom = document.getElementById('field-publication-custom');

  BodyComposer.init({
    onChange: (_blocks, count) => {
      wordCount.textContent = count ? `(${count} words)` : '';
    },
  });

  fieldTitle.addEventListener('input', () => {
    if (!isPublishedEdit && !fieldSlug.dataset.manual) {
      fieldSlug.value = slugify(fieldTitle.value);
      slugPreview.textContent = fieldSlug.value || 'your-slug';
    }
    updateSlugWarning();
  });

  fieldSlug.addEventListener('input', () => {
    fieldSlug.dataset.manual = '1';
    slugPreview.textContent = fieldSlug.value || 'your-slug';
    updateSlugWarning();
  });

  function updateSlugWarning() {
    if (!isPublishedEdit) {
      slugWarning.classList.add('hidden');
      return;
    }
    const changed = fieldSlug.value.trim() !== originalPublishedSlug;
    slugWarning.classList.toggle('hidden', !changed);
  }

  document.getElementById('btn-sync-slug').addEventListener('click', () => {
    if (isPublishedEdit) {
      if (
        !confirm(
          'This will change the live URL and may break shared links. A redirect stub will be created at the old URL. Continue?'
        )
      ) {
        return;
      }
    }
    delete fieldSlug.dataset.manual;
    fieldSlug.value = slugify(fieldTitle.value);
    slugPreview.textContent = fieldSlug.value || 'your-slug';
    updateSlugWarning();
  });

  pubNewToggle.addEventListener('change', () => {
    pubCustom.classList.toggle('hidden', !pubNewToggle.checked);
    if (pubNewToggle.checked) {
      pubSelect.value = '';
      pubCustom.focus();
    }
  });

  pubCustom.addEventListener('blur', async () => {
    const name = pubCustom.value.trim();
    if (!name || !pubNewToggle.checked) return;
    try {
      const { publications: list } = await api('/api/publications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      publications = list;
      populatePublicationSelect();
      pubSelect.value = name;
      pubNewToggle.checked = false;
      pubCustom.classList.add('hidden');
      pubCustom.value = '';
    } catch (err) {
      editorError.textContent = err.message;
      editorError.classList.remove('hidden');
    }
  });

  function setPublicationValue(value) {
    populatePublicationSelect();
    if (value && publications.includes(value)) {
      pubSelect.value = value;
      pubNewToggle.checked = false;
      pubCustom.classList.add('hidden');
    } else if (value) {
      pubNewToggle.checked = true;
      pubCustom.classList.remove('hidden');
      pubCustom.value = value;
    }
  }

  function getPublicationValue() {
    if (pubNewToggle.checked && pubCustom.value.trim()) {
      return pubCustom.value.trim();
    }
    return pubSelect.value.trim();
  }

  function updateEditorMode() {
    const draftMode = !isPublishedEdit;
    document.getElementById('editor-eyebrow').textContent = isPublishedEdit ? 'Edit published' : 'Step 2';
    document.getElementById('editor-heading').innerHTML = isPublishedEdit
      ? 'Edit <span class="accent">published</span>'
      : 'Review <span class="accent">draft</span>';
    document.getElementById('btn-save').classList.toggle('hidden', !draftMode);
    document.getElementById('btn-publish').classList.toggle('hidden', !draftMode);
    document.getElementById('btn-update-published').classList.toggle('hidden', draftMode);
    document.getElementById('btn-delete-draft').classList.toggle('hidden', !draftMode);
    document.getElementById('btn-delete-published').classList.toggle('hidden', draftMode);
    updateSlugWarning();
  }

  function blocksFromDraft(draft) {
    if (draft.bodyBlocks?.length) return draft.bodyBlocks;
    const paragraphs = draft.bodyParagraphs || [];
    if (paragraphs.length) {
      return paragraphs.map((text) => ({
        id: crypto.randomUUID?.() || `p-${Math.random()}`,
        type: 'paragraph',
        text,
      }));
    }
    if (draft.bodyText?.trim()) {
      return draft.bodyText
        .split(/\n\s*\n/)
        .map((p) => p.replace(/\n/g, ' ').trim())
        .filter(Boolean)
        .map((text) => ({
          id: crypto.randomUUID?.() || `p-${Math.random()}`,
          type: 'paragraph',
          text,
        }));
    }
    return [];
  }

  function fillEditor(draft, { published = false } = {}) {
    isPublishedEdit = published;
    currentDraftId = draft.id;
    publishedSlug = published ? draft.publishedSlug || draft.slug : null;
    originalPublishedSlug = published ? draft.publishedSlug || draft.slug : null;

    fieldTitle.value = draft.title || '';
    fieldSlug.value = draft.slug || '';
    fieldSlug.dataset.manual = published || draft.slug ? '1' : '';
    slugPreview.textContent = draft.slug || 'your-slug';
    document.getElementById('field-category').value = draft.category || 'nonfiction';
    document.getElementById('field-tag').value = draft.tag || '';
    setPublicationValue(draft.publication || '');
    document.getElementById('field-date').value = draft.date || '';
    document.getElementById('field-excerpt').value = draft.excerpt || '';
    BodyComposer.setBlocks(blocksFromDraft(draft), draft.id);
    editorSource.textContent = published
      ? `Editing published post · ${draft.slug}`
      : draft.sourceFile
        ? `From ${draft.sourceFile}`
        : 'Edit your draft';
    updateWordCount();
    updateEditorMode();
    editorError.classList.add('hidden');
    editorSuccess.classList.add('hidden');
    showView('editor');
  }

  async function openDraft(id, draftData) {
    isPublishedEdit = false;
    publishedSlug = null;
    originalPublishedSlug = null;
    if (draftData) {
      fillEditor(draftData);
      return;
    }
    try {
      const draft = await api(`/api/drafts/${id}`);
      fillEditor(draft);
    } catch (err) {
      alert(err.message);
    }
  }

  async function openPublished(slug) {
    try {
      const post = await api(`/api/posts/${slug}/edit`);
      fillEditor(post, { published: true });
    } catch (err) {
      alert(err.message);
    }
  }

  function collectFormData() {
    return {
      title: fieldTitle.value.trim(),
      slug: fieldSlug.value.trim(),
      category: document.getElementById('field-category').value,
      tag: document.getElementById('field-tag').value.trim(),
      publication: getPublicationValue(),
      date: document.getElementById('field-date').value.trim(),
      excerpt: document.getElementById('field-excerpt').value.trim(),
      bodyBlocks: BodyComposer.getBlocks(),
    };
  }

  function updateWordCount() {
    const count = BodyComposer.getWordCount();
    wordCount.textContent = count ? `(${count} words)` : '';
  }

  document.getElementById('btn-back-dashboard').addEventListener('click', () => {
    isPublishedEdit = false;
    publishedSlug = null;
    showView('dashboard');
  });

  document.getElementById('btn-save').addEventListener('click', async () => {
    editorError.classList.add('hidden');
    editorSuccess.classList.add('hidden');
    try {
      await api(`/api/drafts/${currentDraftId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(collectFormData()),
      });
      editorSuccess.textContent = 'Draft saved.';
      editorSuccess.classList.remove('hidden');
    } catch (err) {
      editorError.textContent = err.message;
      editorError.classList.remove('hidden');
    }
  });

  document.getElementById('btn-preview').addEventListener('click', async () => {
    editorError.classList.add('hidden');
    try {
      const data = collectFormData();
      if (isPublishedEdit) {
        const res = await fetch(`/api/posts/${publishedSlug}/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error(await res.text());
        const html = await res.text();
        const w = window.open();
        w.document.write(html);
        w.document.close();
      } else {
        await api(`/api/drafts/${currentDraftId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        window.open(`/api/drafts/${currentDraftId}/preview`, '_blank');
      }
    } catch (err) {
      editorError.textContent = err.message;
      editorError.classList.remove('hidden');
    }
  });

  document.getElementById('btn-publish').addEventListener('click', async () => {
    editorError.classList.add('hidden');
    editorSuccess.classList.add('hidden');
    if (!confirm('Publish this post? It will generate HTML files in your project folder.')) return;

    try {
      await api(`/api/drafts/${currentDraftId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(collectFormData()),
      });

      const result = await api(`/api/drafts/${currentDraftId}/publish`, { method: 'POST' });
      showSuccess(result);
    } catch (err) {
      editorError.textContent = err.message;
      editorError.classList.remove('hidden');
    }
  });

  document.getElementById('btn-update-published').addEventListener('click', async () => {
    editorError.classList.add('hidden');
    editorSuccess.classList.add('hidden');

    const data = collectFormData();
    const slugChanged = data.slug !== originalPublishedSlug;

    if (slugChanged) {
      if (
        !confirm(
          'You changed the URL slug. Existing links may break unless a redirect stub is created. Update anyway?'
        )
      ) {
        return;
      }
    } else if (!confirm('Update this published post on disk? Push to GitHub to go live.')) {
      return;
    }

    try {
      const result = await api(`/api/posts/${publishedSlug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, createRedirect: slugChanged }),
      });
      showSuccess(result);
    } catch (err) {
      editorError.textContent = err.message;
      editorError.classList.remove('hidden');
    }
  });

  document.getElementById('btn-delete-draft').addEventListener('click', async () => {
    if (!confirm('Delete this draft? This cannot be undone.')) return;
    try {
      await api(`/api/drafts/${currentDraftId}`, { method: 'DELETE' });
      currentDraftId = null;
      showView('dashboard');
    } catch (err) {
      editorError.textContent = err.message;
      editorError.classList.remove('hidden');
    }
  });

  document.getElementById('btn-delete-published').addEventListener('click', async () => {
    if (!confirm('Delete this published post from local files? Push to GitHub to remove from the web.')) return;
    try {
      await api(`/api/posts/${publishedSlug}`, { method: 'DELETE' });
      publishedSlug = null;
      isPublishedEdit = false;
      showSuccess({ changedFiles: [`articles/${originalPublishedSlug}.html`, 'writing.html', 'posts.json'] });
    } catch (err) {
      editorError.textContent = err.message;
      editorError.classList.remove('hidden');
    }
  });

  function showSuccess(result) {
    const filesEl = document.getElementById('changed-files');
    filesEl.innerHTML = (result.changedFiles || [])
      .map((f) => `<li>${escapeHtml(f)}</li>`)
      .join('');

    const stepsEl = document.getElementById('push-steps');
    stepsEl.innerHTML = (result.push?.steps || [
      'Review changed files with git status',
      'git add the listed files (not cms/drafts/)',
      'git commit and git push',
      'Wait 1–2 minutes, then verify on atishay.io',
    ])
      .map((s) => `<li>${escapeHtml(s)}</li>`)
      .join('');

    lastPushCommands = result.push?.commands || [];
    document.getElementById('push-commands').textContent = lastPushCommands.join('\n') || 'npm run push';

    currentDraftId = null;
    isPublishedEdit = false;
    publishedSlug = null;
    showView('success');
  }

  document.getElementById('btn-copy-commands').addEventListener('click', () => {
    const text = lastPushCommands.join('\n') || 'npm run push';
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('btn-copy-commands');
      const orig = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => {
        btn.textContent = orig;
      }, 2000);
    });
  });

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    return escapeHtml(str);
  }

  function slugify(title) {
    return String(title)
      .toLowerCase()
      .trim()
      .replace(/['']/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function formatDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  loadDashboard();
})();
