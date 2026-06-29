(function () {
  let blocks = [];
  let draftId = null;
  let dragBlockId = null;
  let dropIndex = null;
  let onChange = null;

  const FORMAT_COLORS = ['#F5F2ED', '#C4A97D', '#5B8A8A', '#E8A87C', '#C97B7B'];

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
    syncParagraphBlocksFromDom();
    return blocks.map((b) => {
      const copy = { ...b };
      if (copy.type === 'paragraph') {
        if (copy.html) {
          delete copy.text;
        } else {
          delete copy.html;
        }
        if (!copy.align) delete copy.align;
      }
      return copy;
    });
  }

  function syncParagraphBlocksFromDom() {
    const root = container();
    if (!root) return;
    root.querySelectorAll('.composer-block[data-block-id]').forEach((blockEl) => {
      const id = blockEl.dataset.blockId;
      const block = blocks.find((b) => b.id === id);
      if (!block || block.type !== 'paragraph') return;
      const editor = blockEl.querySelector('.composer-richtext');
      if (!editor) return;
      const html = editor.innerHTML.trim();
      const plain = editor.textContent.trim();
      if (!plain) {
        block.text = '';
        delete block.html;
      } else if (html !== plain && /<[a-z]/i.test(html)) {
        block.html = html;
        block.text = '';
      } else {
        block.text = plain;
        delete block.html;
      }
      const alignBtn = blockEl.querySelector('.composer-align-btn.active');
      const align = alignBtn?.dataset.align;
      if (align && align !== 'left') block.align = align;
      else delete block.align;
    });
  }

  function getWordCount() {
    syncParagraphBlocksFromDom();
    return blocks
      .filter((b) => b.type === 'paragraph')
      .flatMap((b) => {
        const text = b.html ? b.html.replace(/<[^>]+>/g, ' ') : b.text || '';
        return text.trim().split(/\s+/).filter(Boolean);
      })
      .length;
  }

  function notifyChange() {
    if (onChange) onChange(getBlocks(), getWordCount());
  }

  function focusLastParagraph() {
    const editors = container()?.querySelectorAll('.composer-richtext');
    const last = editors?.[editors.length - 1];
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

  function renderFormatBar(block) {
    const align = block.align || 'left';
    const colors = FORMAT_COLORS.map(
      (c) =>
        `<button type="button" class="composer-color-swatch" data-color="${c}" style="background:${c}" title="Color"></button>`
    ).join('');

    return `
      <div class="composer-format-bar">
        <button type="button" class="composer-fmt-btn" data-cmd="bold" title="Bold"><b>B</b></button>
        <button type="button" class="composer-fmt-btn" data-cmd="italic" title="Italic"><i>I</i></button>
        <span class="composer-fmt-sep"></span>
        ${colors}
        <span class="composer-fmt-sep"></span>
        <button type="button" class="composer-align-btn${align === 'left' ? ' active' : ''}" data-align="left" title="Align left">←</button>
        <button type="button" class="composer-align-btn${align === 'center' ? ' active' : ''}" data-align="center" title="Align center">↔</button>
        <button type="button" class="composer-align-btn${align === 'right' ? ' active' : ''}" data-align="right" title="Align right">→</button>
      </div>`;
  }

  function render() {
    const root = container();
    if (!root) return;

    if (!blocks.length) {
      root.innerHTML =
        '<div class="composer-empty">Add a paragraph or drop an image to start building your post.</div>';
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
      const isPublished = String(draftId || '').startsWith('published-');
      const slug = isPublished ? draftId.replace(/^published-/, '') : '';
      const src = draftId
        ? isPublished
          ? `/images/posts/${slug}/${encodeURIComponent(block.filename)}`
          : `/api/drafts/${draftId}/media/${encodeURIComponent(block.filename)}`
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

    const inner = block.html || escapeHtml(block.text || '');
    const alignStyle =
      block.align === 'center'
        ? 'text-align:center'
        : block.align === 'right'
          ? 'text-align:right'
          : '';

    return `
      <div class="composer-block" data-block-id="${block.id}" data-block-index="${index}" draggable="true">
        <div class="composer-drag-handle" title="Drag to reorder">⋮⋮</div>
        <div class="composer-block-body">
          ${renderFormatBar(block)}
          <div class="composer-richtext" contenteditable="true" data-placeholder="Write a paragraph…" style="${alignStyle}">${inner}</div>
        </div>
        <button type="button" class="composer-block-remove" title="Remove paragraph">×</button>
      </div>`;
  }

  function bindBlockEvents(root) {
    root.querySelectorAll('.composer-richtext').forEach((el) => {
      const blockEl = el.closest('.composer-block');
      const id = blockEl?.dataset.blockId;

      el.addEventListener('input', () => {
        notifyChange();
      });

      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
        }
      });
    });

    root.querySelectorAll('.composer-fmt-btn').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => {
        const blockEl = btn.closest('.composer-block');
        const editor = blockEl?.querySelector('.composer-richtext');
        if (!editor) return;
        editor.focus();
        const cmd = btn.dataset.cmd;
        if (cmd === 'bold') document.execCommand('bold', false, null);
        if (cmd === 'italic') document.execCommand('italic', false, null);
        notifyChange();
      });
    });

    root.querySelectorAll('.composer-color-swatch').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => {
        const blockEl = btn.closest('.composer-block');
        const editor = blockEl?.querySelector('.composer-richtext');
        if (!editor) return;
        editor.focus();
        document.execCommand('foreColor', false, btn.dataset.color);
        notifyChange();
      });
    });

    root.querySelectorAll('.composer-align-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const blockEl = btn.closest('.composer-block');
        const id = blockEl?.dataset.blockId;
        const block = blocks.find((b) => b.id === id);
        const editor = blockEl?.querySelector('.composer-richtext');
        if (!block || !editor) return;
        const align = btn.dataset.align;
        block.align = align === 'left' ? undefined : align;
        editor.style.textAlign = align;
        blockEl.querySelectorAll('.composer-align-btn').forEach((b) => {
          b.classList.toggle('active', b.dataset.align === align);
        });
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
        syncParagraphBlocksFromDom();
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
          syncParagraphBlocksFromDom();
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
