(function () {
  let blocks = [];
  let draftId = null;
  let dragBlockId = null;
  let dropIndex = null;
  let onChange = null;

  const container = () => document.getElementById('body-composer');

  function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : `b-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function init(options = {}) {
    onChange = options.onChange || null;
    draftId = options.draftId || null;

    document.getElementById('btn-add-paragraph')?.addEventListener('click', () => {
      blocks.push({ id: uid(), type: 'paragraph', text: '' });
      render();
      notifyChange();
      focusLastParagraph();
    });

    document.getElementById('btn-add-image')?.addEventListener('click', () => {
      document.getElementById('image-input')?.click();
    });

    document.getElementById('image-input')?.addEventListener('change', (e) => {
      uploadImages(Array.from(e.target.files || []), blocks.length);
      e.target.value = '';
    });

    const root = container();
    root?.addEventListener('dragover', (e) => {
      if (e.dataTransfer?.types?.includes('Files')) {
        e.preventDefault();
        root.classList.add('composer-dragover');
      }
    });
    root?.addEventListener('dragleave', (e) => {
      if (e.target === root) root.classList.remove('composer-dragover');
    });
    root?.addEventListener('drop', (e) => {
      if (e.dataTransfer?.files?.length) {
        e.preventDefault();
        root.classList.remove('composer-dragover');
        const imageFiles = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
        if (imageFiles.length) uploadImages(imageFiles, dropIndex ?? blocks.length);
      }
    });
  }

  function setBlocks(nextBlocks, nextDraftId) {
    blocks = (nextBlocks || []).map((b) => ({ ...b, id: b.id || uid() }));
    draftId = nextDraftId;
    render();
  }

  function getBlocks() {
    return blocks.map((b) => ({ ...b }));
  }

  function getWordCount() {
    return blocks
      .filter((b) => b.type === 'paragraph')
      .flatMap((b) => (b.text || '').trim().split(/\s+/).filter(Boolean))
      .length;
  }

  function notifyChange() {
    if (onChange) onChange(getBlocks(), getWordCount());
  }

  function focusLastParagraph() {
    const areas = container()?.querySelectorAll('.composer-paragraph');
    const last = areas?.[areas.length - 1];
    last?.focus();
  }

  async function uploadImages(files, insertAt) {
    if (!draftId) return;
    let index = insertAt;

    for (const file of files) {
      const formData = new FormData();
      formData.append('image', file);

      try {
        const res = await fetch(`/api/drafts/${draftId}/images`, {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Image upload failed');
        blocks.splice(index, 0, data.block);
        index += 1;
      } catch (err) {
        alert(err.message);
        break;
      }
    }

    render();
    notifyChange();
  }

  function removeBlock(id) {
    blocks = blocks.filter((b) => b.id !== id);
    render();
    notifyChange();
  }

  function moveBlock(fromId, toIndex) {
    const fromIndex = blocks.findIndex((b) => b.id === fromId);
    if (fromIndex < 0 || toIndex < 0) return;

    let insertAt = Math.min(toIndex, blocks.length);
    if (fromIndex < insertAt) insertAt -= 1;
    if (fromIndex === insertAt) return;

    const [item] = blocks.splice(fromIndex, 1);
    blocks.splice(insertAt, 0, item);
    render();
    notifyChange();
  }

  function render() {
    const root = container();
    if (!root) return;

    if (!blocks.length) {
      root.innerHTML = '<div class="composer-empty">Add a paragraph or drop an image to start building your post.</div>';
      return;
    }

    const parts = [];
    for (let i = 0; i <= blocks.length; i += 1) {
      parts.push(`<div class="composer-drop-slot" data-drop-index="${i}"></div>`);
      if (i < blocks.length) parts.push(renderBlock(blocks[i], i));
    }
    root.innerHTML = parts.join('');
    bindBlockEvents(root);
  }

  function renderBlock(block, index) {
    if (block.type === 'image') {
      const src = draftId
        ? `/api/drafts/${draftId}/media/${encodeURIComponent(block.filename)}`
        : '';
      return `
        <div class="composer-block" data-block-id="${block.id}" data-block-index="${index}" draggable="true">
          <div class="composer-drag-handle" title="Drag to reorder">⋮⋮</div>
          <div class="composer-block-body composer-image-wrap">
            <img src="${src}" alt="">
            <div class="composer-image-fields">
              <input type="text" class="composer-image-alt" placeholder="Alt text (accessibility)" value="${escapeAttr(block.alt || '')}">
              <input type="text" class="composer-image-caption" placeholder="Caption (optional)" value="${escapeAttr(block.caption || '')}">
            </div>
          </div>
          <button type="button" class="composer-block-remove" title="Remove image">×</button>
        </div>`;
    }

    return `
      <div class="composer-block" data-block-id="${block.id}" data-block-index="${index}" draggable="true">
        <div class="composer-drag-handle" title="Drag to reorder">⋮⋮</div>
        <div class="composer-block-body">
          <textarea class="composer-paragraph" placeholder="Write a paragraph…">${escapeHtml(block.text || '')}</textarea>
        </div>
        <button type="button" class="composer-block-remove" title="Remove paragraph">×</button>
      </div>`;
  }

  function bindBlockEvents(root) {
    root.querySelectorAll('.composer-paragraph').forEach((el) => {
      const blockEl = el.closest('.composer-block');
      const id = blockEl?.dataset.blockId;
      el.addEventListener('input', () => {
        const block = blocks.find((b) => b.id === id);
        if (block) block.text = el.value;
        notifyChange();
      });
    });

    root.querySelectorAll('.composer-image-alt').forEach((el) => {
      const id = el.closest('.composer-block')?.dataset.blockId;
      el.addEventListener('input', () => {
        const block = blocks.find((b) => b.id === id);
        if (block) block.alt = el.value;
        notifyChange();
      });
    });

    root.querySelectorAll('.composer-image-caption').forEach((el) => {
      const id = el.closest('.composer-block')?.dataset.blockId;
      el.addEventListener('input', () => {
        const block = blocks.find((b) => b.id === id);
        if (block) block.caption = el.value;
        notifyChange();
      });
    });

    root.querySelectorAll('.composer-block-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.closest('.composer-block')?.dataset.blockId;
        if (id) removeBlock(id);
      });
    });

    root.querySelectorAll('.composer-block').forEach((blockEl) => {
      blockEl.addEventListener('dragstart', (e) => {
        dragBlockId = blockEl.dataset.blockId;
        dropIndex = null;
        blockEl.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dragBlockId);
      });

      blockEl.addEventListener('dragend', () => {
        dragBlockId = null;
        dropIndex = null;
        blockEl.classList.remove('dragging');
        root.querySelectorAll('.composer-drop-slot').forEach((s) => s.classList.remove('active'));
        root.querySelectorAll('.composer-block').forEach((b) => b.classList.remove('drag-over'));
      });

      blockEl.addEventListener('dragover', (e) => {
        if (!dragBlockId) return;
        e.preventDefault();
        blockEl.classList.add('drag-over');
      });

      blockEl.addEventListener('dragleave', () => {
        blockEl.classList.remove('drag-over');
      });

      blockEl.addEventListener('drop', (e) => {
        e.preventDefault();
        blockEl.classList.remove('drag-over');
        if (!dragBlockId) return;
        moveBlock(dragBlockId, Number(blockEl.dataset.blockIndex));
      });
    });

    root.querySelectorAll('.composer-drop-slot').forEach((slot) => {
      slot.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropIndex = Number(slot.dataset.dropIndex);
        root.querySelectorAll('.composer-drop-slot').forEach((s) => s.classList.remove('active'));
        slot.classList.add('active');
      });

      slot.addEventListener('dragleave', () => {
        slot.classList.remove('active');
      });

      slot.addEventListener('drop', (e) => {
        e.preventDefault();
        slot.classList.remove('active');
        if (dragBlockId) {
          moveBlock(dragBlockId, Number(slot.dataset.dropIndex));
          return;
        }
        if (e.dataTransfer?.files?.length) {
          const imageFiles = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
          if (imageFiles.length) uploadImages(imageFiles, Number(slot.dataset.dropIndex));
        }
      });
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeAttr(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  window.BodyComposer = {
    init,
    setBlocks,
    getBlocks,
    getWordCount,
  };
})();
