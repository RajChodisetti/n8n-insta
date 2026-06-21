const state = {
  workflows: [],
  promptFiles: [],
  selectedPromptPath: '',
  selectedPromptMeta: null,
  deletingTopicIds: new Set(),
  approvingTopicIds: new Set(),
  runtimePromptBuilder: {
    enabled: false,
    idea: '',
    instructions: '',
    targets: [],
  },
  configValues: {},
  topicFormConfig: {
    min: 15,
    max: 180,
    defaultValue: 45,
  },
};

const RECOMMENDED_WORKFLOW_KEY = 'wf_end_to_end_reel_generate_and_publish';

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : { error: await response.text() };

  if (!response.ok) {
    throw new Error(payload.error || 'Request failed.');
  }
  return payload;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function setValue(id, value) {
  document.getElementById(id).value = value;
}

function getCharacterReferenceInput(form) {
  return form?.querySelector('input[type="file"][id$="character-reference-file"]') || null;
}

function getCharacterReferenceFields(form) {
  return {
    characterName: String(form?.querySelector('[name="character_name"]')?.value || '').trim(),
    characterDescription: String(form?.querySelector('[name="character_description"]')?.value || '').trim(),
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file?.name || 'the selected file'}.`));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

async function uploadCharacterReferenceFromForm(form, statusId, pendingLabel) {
  const input = getCharacterReferenceInput(form);
  const file = input?.files?.[0] || null;
  if (!file) {
    return null;
  }

  if (!file.type || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Character reference image must be JPEG, PNG, or WebP.');
  }
  if (file.size > 20 * 1024 * 1024) {
    throw new Error('Character reference image must be 20MB or smaller.');
  }

  const { characterName, characterDescription } = getCharacterReferenceFields(form);
  setText(statusId, `${pendingLabel} Uploading character reference...`);
  const dataUrl = await readFileAsDataUrl(file);
  const payload = await api('/api/uploads/character-reference', {
    method: 'POST',
    body: JSON.stringify({
      data_url: dataUrl,
      file_name: file.name,
      character_name: characterName,
      character_description: characterDescription,
    }),
  });
  return payload.character_reference || null;
}

function applyTopicFormConfig(config = {}) {
  const min = Number.isFinite(Number(config.min)) ? Number(config.min) : 15;
  const maxCandidate = Number.isFinite(Number(config.max)) ? Number(config.max) : 180;
  const max = Math.max(min, maxCandidate);
  const defaultCandidate = Number.isFinite(Number(config.defaultValue)) ? Number(config.defaultValue) : 45;
  const defaultValue = Math.min(max, Math.max(min, defaultCandidate));
  state.topicFormConfig = { min, max, defaultValue };

  const input = document.querySelector('#topic-form [name="target_duration_seconds"]');
  if (!input) {
    return;
  }
  input.min = String(min);
  input.max = String(max);
  input.step = '1';

  const currentValue = Number.parseInt(String(input.value || '').trim(), 10);
  if (!Number.isFinite(currentValue) || currentValue < min || currentValue > max) {
    input.value = String(defaultValue);
  }
}

function renderStatusPill(value, emptyLabel = '—') {
  const text = String(value || '').trim();
  if (!text) {
    return `<span class="status-pill status-empty">${escapeHtml(emptyLabel)}</span>`;
  }

  const normalized = text.toLowerCase();
  let tone = 'neutral';
  if (
    normalized.includes('complete')
    || normalized.includes('ready')
    || normalized.includes('approved')
    || normalized === 'published'
  ) {
    tone = 'success';
  } else if (
    normalized.includes('failed')
    || normalized.includes('rejected')
    || normalized.includes('error')
  ) {
    tone = 'danger';
  } else if (
    normalized.includes('pending')
    || normalized.includes('generating')
    || normalized.includes('scripting')
    || normalized.includes('storyboarding')
  ) {
    tone = 'warning';
  }

  return `<span class="status-pill status-${tone}">${escapeHtml(text)}</span>`;
}

function renderWorkflows() {
  const root = document.getElementById('workflow-list');
  root.innerHTML = state.workflows.map((workflow) => `
    <button class="workflow-card ${workflow.key === RECOMMENDED_WORKFLOW_KEY ? 'workflow-card-recommended' : 'workflow-card-stage'}" data-workflow="${escapeHtml(workflow.key)}">
      <div class="workflow-card-head">
        <strong>${escapeHtml(workflow.name)}</strong>
        <span class="workflow-badge ${workflow.key === RECOMMENDED_WORKFLOW_KEY ? 'workflow-badge-recommended' : 'workflow-badge-stage'}">
          ${workflow.key === RECOMMENDED_WORKFLOW_KEY ? 'Recommended' : 'Stage'}
        </span>
      </div>
      <span>${escapeHtml(workflow.description)}</span>
    </button>
  `).join('');

  root.querySelectorAll('[data-workflow]').forEach((button) => {
    button.addEventListener('click', async () => {
      const workflowKey = button.getAttribute('data-workflow');
      setText('workflow-output', `Running ${workflowKey}...`);
      try {
        const result = await api('/api/workflows/run', {
          method: 'POST',
          body: JSON.stringify({ workflow_key: workflowKey, mode: 'async' }),
        });
        await pollWorkflowJob(result.job_id);
      } catch (error) {
        setText('workflow-output', error.message);
      }
    });
  });
}

async function pollWorkflowJob(jobId) {
  while (true) {
    const job = await api(`/api/workflows/run/${encodeURIComponent(jobId)}`);
    setText(
      'workflow-output',
      [
        `${job.workflow_name} (${job.workflow_key})`,
        `job: ${job.job_id}`,
        `status: ${job.status}`,
        job.exit_code == null ? '' : `exit_code: ${job.exit_code}`,
        job.stdout ? `stdout:\n${job.stdout}` : '',
        job.stderr ? `stderr:\n${job.stderr}` : '',
      ].filter(Boolean).join('\n\n'),
    );

    if (job.status === 'completed' || job.status === 'failed') {
      await loadTopics();
      return job;
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

function renderFieldExamples(field) {
  const examples = Array.isArray(field.examples) ? field.examples.filter(Boolean) : [];
  if (!examples.length) {
    return '';
  }
  return `
    <div class="field-examples" aria-label="${escapeHtml(field.label)} examples">
      ${examples.map((example) => `
        <button
          type="button"
          class="example-chip"
          data-config-example-key="${escapeHtml(field.key)}"
          data-config-example-value="${escapeHtml(example)}"
        >${escapeHtml(example)}</button>
      `).join('')}
    </div>
  `;
}

function formatWorkflowLabel(workflowName) {
  const normalized = String(workflowName || '').trim();
  if (!normalized) {
    return '';
  }
  return normalized.replace(/^wf_/, '').replaceAll('_', ' ');
}

function buildTopicFailureDetails(topic) {
  const errorMessage = String(topic.latest_failed_error_message || '').trim();
  if (!errorMessage) {
    return '';
  }

  const workflowLabel = formatWorkflowLabel(topic.latest_failed_workflow_name) || 'workflow';
  const failedAtRaw = String(topic.latest_failed_at || '').trim();
  const failedAt = failedAtRaw ? new Date(failedAtRaw).toLocaleString() : '';

  return `
    <details class="topic-error-details">
      <summary>
        <span class="topic-error-summary">Latest failure: ${escapeHtml(workflowLabel)}</span>
        ${failedAt ? `<span class="topic-error-time">${escapeHtml(failedAt)}</span>` : ''}
      </summary>
      <pre class="topic-error-log">${escapeHtml(errorMessage)}</pre>
    </details>
  `;
}

function renderConfig(payload) {
  const sections = Array.isArray(payload.sections) ? payload.sections : [];
  const root = document.getElementById('config-groups');
  state.configValues = {};
  root.innerHTML = sections.map((section) => `
    <details class="config-section" open>
      <summary>
        <span>${escapeHtml(section.title)}</span>
      </summary>
      <p class="config-section-copy">${escapeHtml(section.description)}</p>
      <div class="config-grid">
        ${section.fields.map((field) => {
          state.configValues[field.key] = field.value || '';
          return `
            <label class="config-field">
              <span class="field-label-row">
                <span>${escapeHtml(field.label)}</span>
                <button
                  type="button"
                  class="info-badge"
                  title="${escapeHtml(field.description)}"
                  aria-label="${escapeHtml(field.label)} help"
                >?</button>
              </span>
              <input data-config-key="${escapeHtml(field.key)}" value="${escapeHtml(field.value || '')}">
              <small>${escapeHtml(field.description)}</small>
              ${renderFieldExamples(field)}
            </label>
          `;
        }).join('')}
      </div>
    </details>
  `).join('');

  root.querySelectorAll('[data-config-key]').forEach((input) => {
    input.addEventListener('input', (event) => {
      state.configValues[event.target.getAttribute('data-config-key')] = event.target.value;
    });
  });

  root.querySelectorAll('[data-config-example-key]').forEach((button) => {
    button.addEventListener('click', () => {
      const key = button.getAttribute('data-config-example-key');
      const value = button.getAttribute('data-config-example-value') || '';
      const input = root.querySelector(`[data-config-key="${CSS.escape(key)}"]`);
      if (!input) {
        return;
      }
      input.value = value;
      state.configValues[key] = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
}

function groupPromptFiles(files) {
  const grouped = new Map();
  for (const file of files) {
    const stepTitle = file.step_title || 'Other';
    if (!grouped.has(stepTitle)) {
      grouped.set(stepTitle, []);
    }
    grouped.get(stepTitle).push(file);
  }
  return Array.from(grouped.entries());
}

function renderPromptFiles() {
  const root = document.getElementById('prompt-files');
  root.innerHTML = groupPromptFiles(state.promptFiles).map(([stepTitle, files]) => `
    <details class="prompt-group" open>
      <summary>${escapeHtml(stepTitle)}</summary>
      <div class="prompt-group-files">
        ${files.map((file) => `
          <button class="prompt-file ${file.path === state.selectedPromptPath ? 'active' : ''}" data-path="${escapeHtml(file.path)}">
            <strong>${escapeHtml(file.label || file.path)}</strong>
            <span>${escapeHtml(file.path)}</span>
          </button>
        `).join('')}
      </div>
    </details>
  `).join('');

  root.querySelectorAll('[data-path]').forEach((button) => {
    button.addEventListener('click', () => loadPrompt(button.getAttribute('data-path')));
  });
}

function buildDeleteSummary(payload = {}) {
  const deleted = payload.deleted || {};
  const deletedRecords = Object.values(payload.deleted_records || {})
    .map((value) => Number(value || 0))
    .filter((value) => value > 0)
    .reduce((sum, value) => sum + value, 0);
  const storageCleanup = payload.storage_cleanup || {};
  const notes = Array.isArray(payload.notes) ? payload.notes.filter(Boolean) : [];
  const parts = [
    `Deleted ${deleted.title ? `"${deleted.title}"` : 'the pipeline item'}.`,
  ];

  if (deletedRecords > 0) {
    parts.push(`Removed ${deletedRecords} local record${deletedRecords === 1 ? '' : 's'}.`);
  }

  if (Number(storageCleanup.attempted_count || 0) > 0) {
    const clearedCount = Number(storageCleanup.deleted_count || 0) + Number(storageCleanup.missing_count || 0);
    const failedCount = Number(storageCleanup.failed_count || 0);
    if (failedCount > 0) {
      parts.push(
        `Hosted cleanup cleared ${clearedCount} of ${storageCleanup.attempted_count} object${Number(storageCleanup.attempted_count) === 1 ? '' : 's'} and left ${failedCount} warning${failedCount === 1 ? '' : 's'}.`,
      );
    } else {
      parts.push(`Hosted cleanup cleared ${clearedCount} object${clearedCount === 1 ? '' : 's'}.`);
    }
  }

  if (notes.length) {
    parts.push(notes.join(' '));
  }

  return parts.join(' ');
}

async function deleteTopic(contentId, title) {
  const confirmMessage = [
    `Delete "${title || 'this pipeline item'}"?`,
    'This removes the local content item, related pipeline rows, and any hosted assets the studio can identify.',
    'It does not remove anything already published on Instagram.',
  ].join('\n\n');
  if (!window.confirm(confirmMessage)) {
    return;
  }

  state.deletingTopicIds.add(contentId);
  await loadTopics();
  setText('topics-status', `Deleting ${title || 'pipeline item'}...`);

  try {
    const payload = await api(`/api/topics/${encodeURIComponent(contentId)}`, {
      method: 'DELETE',
    });
    setText('topics-status', buildDeleteSummary(payload));
  } finally {
    state.deletingTopicIds.delete(contentId);
    await loadTopics();
  }
}

function renderPromptPlaceholderCatalog(details = []) {
  const root = document.getElementById('prompt-placeholder-catalog');
  if (!details.length) {
    root.innerHTML = '<div class="placeholder-empty">This prompt file has no placeholders.</div>';
    return;
  }
  root.innerHTML = `
    <details class="placeholder-section" open>
      <summary>Runtime placeholders used by this prompt</summary>
      <div class="placeholder-list">
        ${details.map((item) => `
          <article class="placeholder-card">
            <div class="placeholder-card-head">
              <strong>${escapeHtml(item.label || item.key)}</strong>
              <code>{{${escapeHtml(item.key)}}}</code>
            </div>
            <p>${escapeHtml(item.description || 'Injected at runtime.')}</p>
            <div class="field-examples">
              ${(item.examples || []).map((example) => `
                <span class="example-chip static">${escapeHtml(example)}</span>
              `).join('')}
            </div>
          </article>
        `).join('')}
      </div>
    </details>
  `;
}

function renderPromptHardRules(rules = []) {
  const root = document.getElementById('prompt-hard-rules');
  if (!rules.length) {
    root.innerHTML = '<div class="placeholder-empty">No additional hard rules for this prompt.</div>';
    return;
  }
  root.innerHTML = rules.map((rule) => `
    <article class="hard-rule-card">${escapeHtml(rule)}</article>
  `).join('');
}

function syncPromptBuilderAvailability(promptPath) {
  const supported = /\.md$/i.test(String(promptPath || '').trim());
  document.getElementById('generate-prompt-draft').disabled = !supported;
  document.getElementById('save-runtime-prompt-builder').disabled = !supported;
  if (!supported) {
    setText('prompt-builder-status', 'Prompt builder works only on Markdown prompt files.');
    setText('prompt-builder-summary', '');
    setValue('prompt-builder-draft', '');
  }
}

function applyRuntimePromptBuilderToForm(config = {}) {
  state.runtimePromptBuilder = {
    enabled: Boolean(config.enabled),
    idea: String(config.idea || ''),
    instructions: String(config.instructions || ''),
    targets: Array.isArray(config.targets) ? config.targets : [],
  };
  setValue('prompt-builder-idea', state.runtimePromptBuilder.idea);
  setValue('prompt-builder-instructions', state.runtimePromptBuilder.instructions);
  if (state.runtimePromptBuilder.enabled) {
    setText('prompt-builder-summary', 'Runtime prompt-text rewriting is active for the selected target stages. Saved prompt files stay unchanged.');
  } else {
    setText('prompt-builder-summary', 'Runtime prompt-text rewriting is currently disabled.');
  }
}

async function loadPrompt(path) {
  const payload = await api(`/api/prompt?path=${encodeURIComponent(path)}`);
  state.selectedPromptPath = payload.path;
  state.selectedPromptMeta = payload;
  document.getElementById('prompt-content').value = payload.content;
  setText('prompt-path', `${payload.step_title} • ${payload.label}`);
  setText(
    'prompt-placeholders',
    payload.placeholders.length
      ? `${payload.placeholders.length} runtime placeholders: ${payload.placeholders.join(', ')}`
      : 'This prompt file has no runtime placeholders.',
  );
  renderPromptPlaceholderCatalog(payload.placeholder_details || []);
  renderPromptHardRules(payload.hard_rules || []);
  if (/\.md$/i.test(payload.path)) {
    setText('prompt-builder-status', '');
    setValue('prompt-builder-draft', '');
  }
  syncPromptBuilderAvailability(payload.path);
  renderPromptFiles();
}

async function loadPromptFiles() {
  const payload = await api('/api/prompts');
  state.promptFiles = payload.files;
  if (!state.selectedPromptPath && state.promptFiles.length) {
    state.selectedPromptPath = state.promptFiles[0].path;
    await loadPrompt(state.selectedPromptPath);
    return;
  }
  renderPromptFiles();
}

async function loadTopics() {
  const payload = await api('/api/topics?limit=20');
  const tbody = document.getElementById('topics-table');
  if (!payload.topics.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="table-empty-cell">
          <div class="placeholder-empty">No pipeline items yet.</div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = payload.topics.map((topic) => {
    const isDeleting = state.deletingTopicIds.has(topic.content_id);
    const isApproving = state.approvingTopicIds.has(topic.content_id);
    const costUsd = Number(topic.total_cost_usd ?? 0);
    const costDisplay = costUsd > 0 ? `$${costUsd.toFixed(4)}` : '—';
    const failureDetails = buildTopicFailureDetails(topic);
    const approvalStatus = topic.approval_status
      ? `${topic.approval_status}${topic.approval_qa_status ? ` / ${topic.approval_qa_status}` : ''}`
      : '';
    const canApprove = topic.status === 'render_complete'
      && topic.render_status === 'success'
      && topic.output_video_url
      && topic.publish_status !== 'published'
      && topic.approval_status !== 'approved';
    return `
    <tr data-topic-row="${escapeHtml(topic.content_id)}">
      <td>
        <strong>${escapeHtml(topic.title)}</strong>
        <div class="subline">${escapeHtml(topic.slug)}</div>
        ${failureDetails}
      </td>
      <td>${renderStatusPill(topic.status)}</td>
      <td>${escapeHtml(topic.category || '—')}</td>
      <td>${renderStatusPill(topic.render_status)}</td>
      <td>
        ${renderStatusPill(approvalStatus)}
        ${topic.approved_by ? `<div class="subline">${escapeHtml(topic.approved_by)}</div>` : ''}
      </td>
      <td>${renderStatusPill(topic.publish_status)}</td>
      <td>${escapeHtml(new Date(topic.updated_at).toLocaleString())}</td>
      <td class="cost-cell">${escapeHtml(costDisplay)}</td>
      <td class="table-actions">
        ${canApprove ? `
          <button
            type="button"
            class="secondary"
            data-approve-topic="${escapeHtml(topic.content_id)}"
            data-approve-title="${escapeHtml(topic.title)}"
            ${isApproving ? 'disabled' : ''}
          >${isApproving ? 'Approving...' : 'Approve'}</button>
        ` : ''}
        <button
          type="button"
          class="secondary"
          data-costs-topic="${escapeHtml(topic.content_id)}"
        >Costs</button>
        <button
          type="button"
          class="secondary-danger"
          data-delete-topic="${escapeHtml(topic.content_id)}"
          data-delete-title="${escapeHtml(topic.title)}"
          ${isDeleting ? 'disabled' : ''}
        >${isDeleting ? 'Deleting...' : 'Delete'}</button>
      </td>
    </tr>
  `;
  }).join('');

  tbody.querySelectorAll('[data-approve-topic]').forEach((button) => {
    button.addEventListener('click', () => {
      approveTopic(
        button.getAttribute('data-approve-topic') || '',
        button.getAttribute('data-approve-title') || '',
      ).catch((error) => {
        state.approvingTopicIds.delete(button.getAttribute('data-approve-topic') || '');
        setText('topics-status', error.message);
        loadTopics().catch((loadError) => setText('topics-status', loadError.message));
      });
    });
  });

  tbody.querySelectorAll('[data-delete-topic]').forEach((button) => {
    button.addEventListener('click', () => {
      deleteTopic(
        button.getAttribute('data-delete-topic') || '',
        button.getAttribute('data-delete-title') || '',
      ).catch((error) => {
        state.deletingTopicIds.delete(button.getAttribute('data-delete-topic') || '');
        setText('topics-status', error.message);
        loadTopics().catch((loadError) => setText('topics-status', loadError.message));
      });
    });
  });

  tbody.querySelectorAll('[data-costs-topic]').forEach((button) => {
    button.addEventListener('click', () => {
      const contentId = button.getAttribute('data-costs-topic') || '';
      toggleReelCosts(contentId, button).catch((error) => {
        setText('topics-status', error.message);
      });
    });
  });
}

async function approveTopic(contentId, title) {
  const normalizedContentId = String(contentId || '').trim();
  if (!normalizedContentId) {
    setText('topics-status', 'Missing content_id for approval.');
    return;
  }
  const approvedBy = window.prompt(`Approver for ${title || 'this Reel'}:`, state.configValues.STUDIO_APPROVER_NAME || '');
  if (approvedBy === null) {
    return;
  }
  const platformAccountId = window.prompt('Instagram account ID for this approval:', state.configValues.INSTAGRAM_IG_USER_ID || '');
  if (platformAccountId === null) {
    return;
  }
  const trimmedApprover = String(approvedBy || '').trim();
  const trimmedAccountId = String(platformAccountId || '').trim();
  if (!trimmedApprover || !trimmedAccountId) {
    setText('topics-status', 'Approver and Instagram account ID are required.');
    return;
  }
  const confirmed = window.confirm('Approve this selected render for Instagram publish?');
  if (!confirmed) {
    return;
  }

  state.approvingTopicIds.add(normalizedContentId);
  setText('topics-status', 'Recording approval...');
  await loadTopics();
  await api(`/api/topics/${encodeURIComponent(normalizedContentId)}/approval`, {
    method: 'POST',
    body: JSON.stringify({
      approved_by: trimmedApprover,
      platform_account_id: trimmedAccountId,
      approval_note: 'Selected render approved from Studio UI.',
      qa_result: {
        source_stage: 'manual_review',
        publish_decision: 'approved',
        blocks_publish: false,
        evaluated_at: new Date().toISOString(),
        summary: {
          blocks_publish: false,
          notes: 'Reviewer confirmed final QA pass in Studio UI.',
        },
      },
    }),
  });
  state.approvingTopicIds.delete(normalizedContentId);
  setText('topics-status', 'Selected render approved for publish.');
  await loadTopics();
}

function formatCostDetail(cost) {
  const type = String(cost?.type || '').toLowerCase();
  if (type === 'llm') {
    const inputTokens = Number(cost.input_tokens ?? 0).toLocaleString();
    const cachedTokens = Number(cost.input_cached_tokens ?? 0);
    const outputTokens = Number(cost.output_tokens ?? 0).toLocaleString();
    if (cachedTokens > 0) {
      return `${inputTokens} in (${cachedTokens.toLocaleString()} cached) / ${outputTokens} out tokens`;
    }
    return `${inputTokens} in / ${outputTokens} out tokens`;
  }
  if (type === 'image') {
    return `${cost.image_count ?? 0} image${cost.image_count === 1 ? '' : 's'} @ $${cost.price_per_image ?? '?'} each`;
  }
  if (type === 'tts') {
    const bytes = Number(cost.utf8_bytes ?? 0);
    if (bytes > 0) {
      return `${bytes.toLocaleString()} UTF-8 bytes`;
    }
    return `${Number(cost.char_count ?? 0).toLocaleString()} chars`;
  }
  return '—';
}

function renderCostBreakdownRow(item) {
  const cost = item.cost ?? {};
  const total = Number(cost.total_usd ?? 0);
  const modelOrProvider = String(cost.model || cost.provider || '—');
  const workflow = String(item.workflow || '—').replace(/^wf_/, '').replaceAll('_', ' ');
  return `<tr>
    <td>${escapeHtml(workflow)}</td>
    <td><span class="cost-type-badge cost-type-${escapeHtml(String(cost.type || 'unknown'))}">${escapeHtml(String(cost.type || '—'))}</span></td>
    <td><code>${escapeHtml(modelOrProvider)}</code></td>
    <td>${escapeHtml(formatCostDetail(cost))}</td>
    <td class="cost-amount">${cost.priced ? `$${total.toFixed(6)}` : escapeHtml('—')}</td>
  </tr>`;
}

async function toggleReelCosts(contentId, button) {
  const parentRow = button.closest('tr');
  const existingDetail = parentRow.nextElementSibling;
  if (existingDetail && existingDetail.classList.contains('cost-breakdown-row')) {
    existingDetail.remove();
    button.textContent = 'Costs';
    return;
  }

  button.disabled = true;
  button.textContent = 'Loading...';

  try {
    const data = await api(`/api/topics/${encodeURIComponent(contentId)}/costs`);
    const breakdown = Array.isArray(data.breakdown) ? data.breakdown : [];
    const totalUsd = Number(data.total_usd ?? 0);

    const bodyRows = breakdown.length
      ? breakdown.map(renderCostBreakdownRow).join('')
      : '<tr><td colspan="5" class="table-empty-cell">No cost data recorded yet. Costs appear after each workflow stage completes.</td></tr>';

    const totalRow = breakdown.length
      ? `<tr class="cost-total-row"><td colspan="4"><strong>Total</strong></td><td class="cost-amount"><strong>$${totalUsd.toFixed(4)}</strong></td></tr>`
      : '';

    const detailRow = document.createElement('tr');
    detailRow.classList.add('cost-breakdown-row');
    detailRow.innerHTML = `<td colspan="8" class="cost-breakdown-cell">
      <div class="cost-breakdown-panel">
        <div class="cost-breakdown-header">
          <strong>Cost Breakdown</strong>
          <span class="cost-breakdown-total">Total: <strong>$${totalUsd.toFixed(4)}</strong></span>
        </div>
        <table class="cost-breakdown-table">
          <thead><tr>
            <th>Stage</th>
            <th>Type</th>
            <th>Model / Provider</th>
            <th>Usage</th>
            <th>Cost</th>
          </tr></thead>
          <tbody>${bodyRows}${totalRow}</tbody>
        </table>
      </div>
    </td>`;

    parentRow.after(detailRow);
    button.textContent = 'Hide Costs';
  } catch (error) {
    button.textContent = 'Error';
    setTimeout(() => { button.textContent = 'Costs'; }, 2000);
  } finally {
    button.disabled = false;
  }
}

async function loadWorkflows() {
  const payload = await api('/api/workflows');
  state.workflows = [...payload.workflows].sort((left, right) => {
    if (left.key === RECOMMENDED_WORKFLOW_KEY) {
      return -1;
    }
    if (right.key === RECOMMENDED_WORKFLOW_KEY) {
      return 1;
    }
    return String(left.name || '').localeCompare(String(right.name || ''));
  });
  renderWorkflows();
}

async function loadConfig() {
  const payload = await api('/api/config');
  renderConfig(payload);
  applyTopicFormConfig(payload.topic_form);
}

async function loadRuntimePromptBuilder() {
  const payload = await api('/api/runtime-prompt-builder');
  applyRuntimePromptBuilderToForm(payload);
}

async function loadHealth() {
  const payload = await api('/api/health');
  applyTopicFormConfig(payload.topic_form);
  setText('system-note', `Studio UI online • ${new Date(payload.timestamp).toLocaleString()}`);
}

async function savePrompt() {
  if (!state.selectedPromptPath) {
    setText('prompt-status', 'Select a prompt file first.');
    return;
  }
  setText('prompt-status', 'Saving...');
  const payload = await api('/api/prompt', {
    method: 'PUT',
    body: JSON.stringify({
      path: state.selectedPromptPath,
      content: document.getElementById('prompt-content').value,
    }),
  });
  setText('prompt-path', `${payload.step_title} • ${payload.label}`);
  setText(
    'prompt-placeholders',
    payload.placeholders.length
      ? `${payload.placeholders.length} runtime placeholders: ${payload.placeholders.join(', ')}`
      : 'This prompt file has no runtime placeholders.',
  );
  renderPromptPlaceholderCatalog(payload.placeholder_details || []);
  renderPromptHardRules(payload.hard_rules || []);
  setText('prompt-status', `Saved at ${new Date(payload.saved_at).toLocaleTimeString()}. The next workflow run will use this file.`);
  await loadPromptFiles();
}

async function generatePromptDraft() {
  if (!state.selectedPromptPath) {
    setText('prompt-builder-status', 'Select a prompt file first.');
    return;
  }

  const idea = document.getElementById('prompt-builder-idea').value.trim();
  if (!idea) {
    setText('prompt-builder-status', 'Enter an idea first.');
    return;
  }

  setText('prompt-builder-status', 'Generating...');
  const payload = await api('/api/prompt-builder', {
    method: 'POST',
    body: JSON.stringify({
      path: state.selectedPromptPath,
      content: document.getElementById('prompt-content').value,
      idea,
      instructions: document.getElementById('prompt-builder-instructions').value,
    }),
  });
  setValue('prompt-builder-draft', payload.draft || '');
  renderPromptHardRules(payload.hard_rules || []);
  setText(
    'prompt-builder-status',
    `Preview generated${payload.generation_model ? ` with ${payload.generation_model}` : ''}.`,
  );
  setText('prompt-builder-summary', payload.summary || '');
}

async function saveRuntimePromptBuilder() {
  const idea = document.getElementById('prompt-builder-idea').value.trim();
  if (!idea) {
    setText('prompt-builder-status', 'Enter an idea before enabling the runtime builder.');
    return;
  }
  setText('prompt-builder-status', 'Saving runtime builder...');
  const payload = await api('/api/runtime-prompt-builder', {
    method: 'PUT',
    body: JSON.stringify({
      enabled: true,
      idea,
      instructions: document.getElementById('prompt-builder-instructions').value,
    }),
  });
  applyRuntimePromptBuilderToForm(payload);
  setText('prompt-builder-status', 'Runtime prompt-text rewriting enabled for live workflow calls.');
}

async function disableRuntimePromptBuilder() {
  setText('prompt-builder-status', 'Disabling runtime builder...');
  const payload = await api('/api/runtime-prompt-builder', {
    method: 'DELETE',
  });
  applyRuntimePromptBuilderToForm(payload);
  setValue('prompt-builder-draft', '');
  setText('prompt-builder-status', 'Runtime prompt-text rewriting disabled.');
}

async function saveConfig() {
  setText('config-status', 'Saving...');
  const payload = await api('/api/config', {
    method: 'PUT',
    body: JSON.stringify({ values: state.configValues }),
  });
  renderConfig(payload);
  applyTopicFormConfig(payload.topic_form);
  setText('config-status', 'Saved. Recreate n8n, render-worker, and studio-ui before relying on changed env values.');
}

async function submitAbstractIdeaForm(event) {
  event.preventDefault();
  await submitAbstractIdea(false);
}

async function submitAbstractIdea(useV2 = false) {
  const form = document.getElementById('abstract-idea-form');
  const abstractIdea = String(new FormData(form).get('abstract_idea') || '').trim();
  if (!abstractIdea) {
    setText('abstract-idea-status', 'Enter an abstract idea first.');
    return;
  }

  const pendingLabel = useV2
    ? 'Generating payload, injecting, and starting V2 workflow...'
    : 'Generating payload, injecting, and starting workflow...';
  setText('abstract-idea-status', pendingLabel);
  const characterReference = await uploadCharacterReferenceFromForm(form, 'abstract-idea-status', pendingLabel);
  const payload = await api(useV2 ? '/api/ideas/auto-publish-v2' : '/api/ideas/auto-publish', {
    method: 'POST',
    body: JSON.stringify({
      abstract_idea: abstractIdea,
      workflow_key: useV2 ? 'wf_end_to_end_reel_generate_and_publish_v2' : RECOMMENDED_WORKFLOW_KEY,
      character_reference: characterReference,
    }),
  });
  setValue('abstract-idea-json', JSON.stringify(payload.generated_payload || {}, null, 2));
  setValue('abstract-idea-prompt-profile', JSON.stringify(payload.prompt_profile || {}, null, 2));

  const generated = payload.generated_payload || {};
  const topicForm = document.getElementById('topic-form');
  if (topicForm) {
    topicForm.querySelector('[name="title"]').value = generated.title || '';
    topicForm.querySelector('[name="category"]').value = generated.category || '';
    topicForm.querySelector('[name="confidence_label"]').value = generated.confidence_label || 'unverified';
    topicForm.querySelector('[name="target_duration_seconds"]').value = generated.target_duration_seconds || '';
    topicForm.querySelector('[name="summary"]').value = generated.summary || '';
    topicForm.querySelector('[name="notes"]').value = Array.isArray(generated.notes) ? generated.notes.join('\n') : '';
    topicForm.querySelector('[name="source_urls"]').value = Array.isArray(generated.source_urls) ? generated.source_urls.join('\n') : '';
    topicForm.querySelector('[name="context"]').value = generated.context || '';
  }

  setText(
    'abstract-idea-status',
    useV2
      ? `Created ${payload.topic?.title || 'topic'}${payload.generation_model ? ` with ${payload.generation_model}` : ''}, and queued the V2 premium story-package workflow.`
      : `Created ${payload.topic?.title || 'topic'}${payload.generation_model ? ` with ${payload.generation_model}` : ''}, built the prompt profile${payload.prompt_profile_generation_model ? ` with ${payload.prompt_profile_generation_model}` : ''}, and queued the one-click workflow.`,
  );
  form.reset();
  await loadTopics();

  if (payload.workflow_job?.job_id) {
    const finalJob = await pollWorkflowJob(payload.workflow_job.job_id);
    if (finalJob?.status === 'completed') {
      setText('abstract-idea-status', `Workflow completed for ${payload.topic?.title || 'the new Reel'}. Approve the selected render before publish.`);
      return;
    }
    setText('abstract-idea-status', `Created ${payload.topic?.title || 'the new Reel'}, but the workflow run failed. Inspect the workflow output below.`);
  }
}

async function submitTopicForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  delete payload.character_name;
  delete payload.character_description;
  setText('topic-status', 'Injecting...');
  const characterReference = await uploadCharacterReferenceFromForm(form, 'topic-status', 'Injecting...');
  if (characterReference) {
    payload.character_reference = characterReference;
  }
  await api('/api/topics', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  form.reset();
  form.querySelector('[name="target_duration_seconds"]').value = String(state.topicFormConfig.defaultValue);
  form.querySelector('[name="confidence_label"]').value = 'unverified';
  setText('topic-status', 'Topic injected as idea_approved.');
  await loadTopics();
}

document.getElementById('abstract-idea-form').addEventListener('submit', (event) => {
  submitAbstractIdeaForm(event).catch((error) => {
    setText('abstract-idea-status', error.message);
  });
});
document.getElementById('abstract-idea-v2').addEventListener('click', () => {
  submitAbstractIdea(true).catch((error) => {
    setText('abstract-idea-status', error.message);
  });
});
document.getElementById('topic-form').addEventListener('submit', (event) => {
  submitTopicForm(event).catch((error) => {
    setText('topic-status', error.message);
  });
});
document.getElementById('save-prompt').addEventListener('click', () => {
  savePrompt().catch((error) => setText('prompt-status', error.message));
});
document.getElementById('generate-prompt-draft').addEventListener('click', () => {
  generatePromptDraft().catch((error) => setText('prompt-builder-status', error.message));
});
document.getElementById('save-runtime-prompt-builder').addEventListener('click', () => {
  saveRuntimePromptBuilder().catch((error) => setText('prompt-builder-status', error.message));
});
document.getElementById('disable-runtime-prompt-builder').addEventListener('click', () => {
  disableRuntimePromptBuilder().catch((error) => setText('prompt-builder-status', error.message));
});
document.getElementById('save-config').addEventListener('click', () => {
  saveConfig().catch((error) => setText('config-status', error.message));
});
document.getElementById('refresh-topics').addEventListener('click', () => {
  loadTopics().catch((error) => setText('topics-status', error.message));
});

Promise.all([
  loadHealth(),
  loadWorkflows(),
  loadConfig(),
  loadRuntimePromptBuilder(),
  loadTopics(),
  loadPromptFiles(),
]).catch((error) => {
  setText('system-note', error.message);
});
