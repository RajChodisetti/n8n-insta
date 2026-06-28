const state = {
  topics: [],
  reviews: [],
  activePipelineRunId: '',
  approvingReviewIds: new Set(),
  approvingTopicIds: new Set(),
  deletingTopicIds: new Set(),
  configValues: {},
  configSections: [],
  savingSettings: false,
};

const DEFAULT_WORKFLOW_KEY = 'wf_end_to_end_reel_generate_and_publish';

const STAGE_LABELS = {
  idea_ingest: 'Idea',
  story_package_generation: 'Story',
  image_asset_generation: 'Images',
  asset_generation_v3: 'Assets',
  narration_generation: 'Voice',
  voice_performance_script: 'Voice Direction',
  avatar_consent_gate: 'Consent',
  avatar_presenter_selector: 'Avatar Route',
  avatar_media_generation: 'Avatar Media',
  heygen_avatar_generation: 'Avatar',
  remotion_manifest: 'Manifest',
  remotion_render: 'Render',
  caption_and_hashtags: 'Caption',
  final_qa_validator: 'QA',
  final_qa_approval_gate: 'QA',
  performance_feedback_analysis: 'Performance',
  instagram_reel_publish: 'Publish',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function apiUrl(path) {
  const cleanPath = String(path || '').replace(/^\/+/, '');
  const basePath = new URL('.', window.location.href).pathname;
  return `${basePath}${cleanPath}`;
}

async function api(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    headers: { 'Content-Type': 'application/json' },
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

function stageLabel(stageKey) {
  const normalized = String(stageKey || '').trim();
  return STAGE_LABELS[normalized] || normalized.replaceAll('_', ' ');
}

function statusTone(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('failed') || text.includes('rejected') || text.includes('error')) return 'danger';
  if (text.includes('awaiting') || text.includes('pending') || text.includes('running') || text.includes('review')) return 'warning';
  if (text.includes('complete') || text.includes('success') || text.includes('approved') || text.includes('published') || text.includes('ready')) return 'success';
  return 'neutral';
}

function configInputId(key) {
  return `config-${String(key || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function renderFieldExamples(field) {
  const examples = Array.isArray(field.examples)
    ? field.examples.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  if (!examples.length) return '';
  const listId = `${configInputId(field.key)}-examples`;
  return `
    <datalist id="${escapeHtml(listId)}">
      ${examples.map((example) => `<option value="${escapeHtml(example)}"></option>`).join('')}
    </datalist>
  `;
}

function renderConfigField(field) {
  const inputId = configInputId(field.key);
  const examples = Array.isArray(field.examples)
    ? field.examples.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const listAttr = examples.length ? ` list="${escapeHtml(inputId)}-examples"` : '';
  const value = String(field.value || '');
  const placeholder = field.sensitive && value === '********'
    ? 'Stored. Enter a replacement or keep the mask.'
    : '';
  return `
    <label class="settings-field" for="${escapeHtml(inputId)}">
      <span>${escapeHtml(field.label || field.key)}</span>
      <input
        id="${escapeHtml(inputId)}"
        type="${field.sensitive ? 'password' : 'text'}"
        value="${escapeHtml(value)}"
        placeholder="${escapeHtml(placeholder)}"
        data-config-key="${escapeHtml(field.key)}"
        data-sensitive="${field.sensitive ? 'true' : 'false'}"
        autocomplete="off"
        spellcheck="false"
        ${listAttr}
      >
      ${renderFieldExamples(field)}
      <small>${escapeHtml(field.description || field.key)}</small>
    </label>
  `;
}

function renderConfigSection(section) {
  const fields = Array.isArray(section.fields) ? section.fields : [];
  const variant = String(section.variant || '').trim();
  return `
    <details class="settings-section ${variant ? `settings-section-${escapeHtml(variant)}` : ''}" ${section.collapsed ? '' : 'open'}>
      <summary>
        <span>
          <strong>${escapeHtml(section.title || section.id)}</strong>
          <small>${escapeHtml(section.description || '')}</small>
        </span>
      </summary>
      <div class="settings-grid">
        ${fields.map(renderConfigField).join('')}
      </div>
    </details>
  `;
}

function applyConfigPayload(payload) {
  state.configValues = {};
  const sections = Array.isArray(payload.sections) ? payload.sections : [];
  state.configSections = sections.filter((section) => section.studio_visible === true);
  for (const section of sections) {
    for (const field of section.fields || []) {
      state.configValues[field.key] = field.value || '';
    }
  }
}

function renderSettings() {
  const root = document.getElementById('settings-form');
  if (!root) return;
  if (!state.configSections.length) {
    root.innerHTML = '<div class="empty-state">Runtime settings are unavailable.</div>';
    return;
  }
  root.innerHTML = state.configSections.map(renderConfigSection).join('');
}

function renderStatus(value, emptyLabel = 'none') {
  const text = String(value || '').trim() || emptyLabel;
  return `<span class="status-pill status-${statusTone(text)}">${escapeHtml(text)}</span>`;
}

function normalizeSteps(topic) {
  const steps = Array.isArray(topic.latest_pipeline_steps) ? topic.latest_pipeline_steps : [];
  if (steps.length) {
    return steps;
  }
  const stagePlan = Array.isArray(topic.latest_pipeline_stage_plan) ? topic.latest_pipeline_stage_plan : [];
  const currentStage = String(topic.latest_pipeline_stage || '').replace(/^review:/, '');
  const currentIndex = stagePlan.indexOf(currentStage);
  return stagePlan.map((stageKey, index) => {
    let stepStatus = 'pending';
    if (['awaiting_approval', 'completed'].includes(topic.latest_pipeline_status)) {
      stepStatus = 'succeeded';
    } else if (currentIndex >= 0 && index < currentIndex) {
      stepStatus = 'succeeded';
    } else if (stageKey === currentStage) {
      stepStatus = String(topic.latest_pipeline_status || '').includes('review') ? 'waiting_review' : 'running';
    }
    return { stage_key: stageKey, stage_order: index + 1, step_status: stepStatus, error_message: '' };
  });
}

function renderPipelineSteps(topic) {
  const steps = normalizeSteps(topic);
  if (!steps.length) {
    return '<div class="pipeline-steps empty">No run queued</div>';
  }
  const currentReviewStage = String(topic.latest_pipeline_stage || '').startsWith('review:')
    ? String(topic.latest_pipeline_stage).replace(/^review:/, '')
    : '';
  return `
    <div class="pipeline-steps" aria-label="Pipeline steps">
      ${steps.map((step) => {
        const isReview = currentReviewStage && currentReviewStage === step.stage_key;
        const status = isReview ? 'waiting_review' : String(step.step_status || 'pending');
        return `
          <div class="pipeline-step pipeline-step-${statusTone(status)}" title="${escapeHtml(step.error_message || status)}">
            <span class="step-dot"></span>
            <span class="step-label">${escapeHtml(stageLabel(step.stage_key))}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderFailure(topic) {
  const error = String(topic.latest_failed_error_message || '').trim();
  if (!error) return '';
  const workflow = String(topic.latest_failed_workflow_name || 'pipeline').trim();
  return `<div class="failure-note">${escapeHtml(workflow)}: ${escapeHtml(error)}</div>`;
}

function renderTopicActions(topic) {
  const contentId = String(topic.content_id || '');
  const canReview = Boolean(topic.pending_review_id);
  const canApprove = topic.status === 'render_complete'
    && topic.render_status === 'success'
    && topic.output_video_url
    && topic.publish_status !== 'published'
    && topic.approval_status !== 'approved';
  const isApproving = state.approvingTopicIds.has(contentId);
  const isDeleting = state.deletingTopicIds.has(contentId);
  return `
    <div class="topic-actions">
      ${canReview ? `<a class="secondary" href="#reviews" data-focus-review="${escapeHtml(topic.pending_review_id)}">Review</a>` : ''}
      ${canApprove ? `
        <button type="button" class="secondary" data-approve-topic="${escapeHtml(contentId)}" data-title="${escapeHtml(topic.title || '')}" ${isApproving ? 'disabled' : ''}>
          ${isApproving ? 'Approving...' : 'Approve Render'}
        </button>
      ` : ''}
      <button type="button" class="secondary-danger" data-delete-topic="${escapeHtml(contentId)}" data-title="${escapeHtml(topic.title || '')}" ${isDeleting ? 'disabled' : ''}>
        ${isDeleting ? 'Deleting...' : 'Delete'}
      </button>
    </div>
  `;
}

function renderTopics() {
  const root = document.getElementById('pipeline-list');
  if (!root) return;
  if (!state.topics.length) {
    root.innerHTML = '<div class="empty-state">No ideas injected yet.</div>';
    return;
  }

  root.innerHTML = state.topics.map((topic) => {
    const reviewLabel = topic.pending_review_id
      ? `Waiting: ${topic.pending_review_title || stageLabel(topic.pending_review_stage)}`
      : topic.approval_status || '';
    return `
      <article class="pipeline-card" data-content-id="${escapeHtml(topic.content_id)}">
        <div class="pipeline-card-head">
          <div>
            <strong>${escapeHtml(topic.title || 'Untitled idea')}</strong>
            <p>${escapeHtml(topic.category || 'general')} / ${escapeHtml(topic.confidence_label || 'unverified')}</p>
          </div>
          <div class="topic-status-stack">
            ${renderStatus(topic.latest_pipeline_status || topic.status)}
            ${reviewLabel ? renderStatus(reviewLabel) : ''}
          </div>
        </div>
        ${renderPipelineSteps(topic)}
        ${renderFailure(topic)}
        <div class="topic-meta">
          <span>Content: ${escapeHtml(topic.status || 'unknown')}</span>
          <span>Render: ${escapeHtml(topic.render_status || 'none')}</span>
          <span>Publish: ${escapeHtml(topic.publish_status || 'draft')}</span>
          <span>Updated: ${escapeHtml(new Date(topic.updated_at).toLocaleString())}</span>
        </div>
        ${renderTopicActions(topic)}
      </article>
    `;
  }).join('');

  root.querySelectorAll('[data-approve-topic]').forEach((button) => {
    button.addEventListener('click', () => {
      approveTopic(button.dataset.approveTopic || '', button.dataset.title || '')
        .catch((error) => setText('topics-status', error.message));
    });
  });
  root.querySelectorAll('[data-delete-topic]').forEach((button) => {
    button.addEventListener('click', () => {
      deleteTopic(button.dataset.deleteTopic || '', button.dataset.title || '')
        .catch((error) => setText('topics-status', error.message));
    });
  });
}

async function loadTopics() {
  const payload = await api('/api/topics?limit=25');
  state.topics = Array.isArray(payload.topics) ? payload.topics : [];
  renderTopics();
}

function reviewEditorId(reviewId) {
  return `review-json-${String(reviewId || '').replace(/[^a-z0-9-]/gi, '')}`;
}

function renderReviews() {
  const root = document.getElementById('review-list');
  if (!root) return;
  if (!state.reviews.length) {
    root.innerHTML = '<div class="empty-state">No pending reviews.</div>';
    return;
  }

  root.innerHTML = state.reviews.map((review) => {
    const reviewId = String(review.review_id || '');
    const isApproving = state.approvingReviewIds.has(reviewId);
    return `
      <article class="review-card" data-review-id="${escapeHtml(reviewId)}">
        <div class="review-card-head">
          <div>
            <span class="stage-chip">${escapeHtml(stageLabel(review.stage_key))}</span>
            <strong>${escapeHtml(review.content_title || review.title || 'Pending review')}</strong>
            <p>${escapeHtml(review.summary || '')}</p>
          </div>
          ${renderStatus(review.review_status)}
        </div>
        <label>
          <span>Generated data for approval</span>
          <textarea id="${escapeHtml(reviewEditorId(reviewId))}" rows="16" spellcheck="false">${escapeHtml(JSON.stringify(review.editable_json || {}, null, 2))}</textarea>
        </label>
        <div class="review-actions">
          <input data-reviewer-for="${escapeHtml(reviewId)}" value="${escapeHtml(state.configValues.STUDIO_APPROVER_NAME || '')}" placeholder="Reviewer name">
          <button type="button" class="primary" data-approve-review="${escapeHtml(reviewId)}" ${isApproving ? 'disabled' : ''}>
            ${isApproving ? 'Approving...' : 'Approve + Continue'}
          </button>
        </div>
      </article>
    `;
  }).join('');

  root.querySelectorAll('[data-approve-review]').forEach((button) => {
    button.addEventListener('click', () => {
      approveReview(button.dataset.approveReview || '')
        .catch((error) => setText('topics-status', error.message));
    });
  });
}

async function loadReviews() {
  const payload = await api('/api/pipeline-reviews?status=pending&limit=25');
  state.reviews = Array.isArray(payload.reviews) ? payload.reviews : [];
  renderReviews();
}

async function pollPipelineRun(pipelineRunId) {
  const normalizedRunId = String(pipelineRunId || '').trim();
  if (!normalizedRunId) return null;
  state.activePipelineRunId = normalizedRunId;
  while (state.activePipelineRunId === normalizedRunId) {
    const payload = await api(`/api/pipeline-runs/${encodeURIComponent(normalizedRunId)}`);
    const run = payload.pipeline_run || {};
    await Promise.all([loadTopics(), loadReviews()]);
    const status = String(run.status || '');
    setText('idea-status', `Pipeline ${status}${run.current_stage ? ` at ${stageLabel(String(run.current_stage).replace(/^review:/, ''))}` : ''}.`);
    if (['awaiting_review', 'awaiting_approval', 'completed', 'failed', 'cancelled'].includes(status)) {
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, 1800));
  }
  return null;
}

async function submitIdea(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const abstractIdea = String(formData.get('abstract_idea') || '').trim();
  const submitterReelType = String(event.submitter?.value || '').trim().toLowerCase();
  const reelType = ['image', 'video', 'avatar'].includes(submitterReelType)
    ? submitterReelType
    : 'image';
  const reelLabel = {
    image: 'Image Reel',
    video: 'Video Reel',
    avatar: 'Avatar Reel',
  }[reelType] || 'Image Reel';
  const reviewMode = formData.get('review_mode') === 'true';
  const avatarConsentConfirmed = formData.get('avatar_consent_confirmed') === 'true';
  if (!abstractIdea) {
    setText('idea-status', 'Enter an idea first.');
    return;
  }
  if (reelType === 'avatar' && !avatarConsentConfirmed) {
    setText('idea-status', 'Confirm HeyGen avatar and voice consent before queueing an Avatar Reel.');
    return;
  }
  setText('idea-status', `Injecting idea and queueing ${reelLabel} pipeline...`);
  const payload = await api('/api/ideas/auto-publish', {
    method: 'POST',
    body: JSON.stringify({
      abstract_idea: abstractIdea,
      reel_type: reelType,
      workflow_key: DEFAULT_WORKFLOW_KEY,
      review_mode: reviewMode,
      avatar_consent_confirmed: reelType === 'avatar' && avatarConsentConfirmed,
    }),
  });
  form.reset();
  await Promise.all([loadTopics(), loadReviews()]);
  const runId = payload.pipeline_run?.pipeline_run_id;
  setText(
    'idea-status',
    reviewMode
      ? 'Idea injected. Pipeline is waiting for the first review.'
      : 'Idea injected. Pipeline is running automatically.',
  );
  if (runId) {
    await pollPipelineRun(runId);
  }
}

async function approveReview(reviewId) {
  const normalizedReviewId = String(reviewId || '').trim();
  if (!normalizedReviewId) return;
  const editor = document.getElementById(reviewEditorId(normalizedReviewId));
  const reviewer = document.querySelector(`[data-reviewer-for="${CSS.escape(normalizedReviewId)}"]`)?.value || '';
  let editedJson;
  try {
    editedJson = JSON.parse(editor?.value || '{}');
  } catch (error) {
    setText('topics-status', `Review JSON is invalid: ${error.message}`);
    return;
  }
  state.approvingReviewIds.add(normalizedReviewId);
  renderReviews();
  setText('topics-status', 'Approving review...');
  try {
    const payload = await api(`/api/pipeline-reviews/${encodeURIComponent(normalizedReviewId)}/approve`, {
      method: 'POST',
      body: JSON.stringify({
        edited_json: editedJson,
        reviewer,
      }),
    });
    await Promise.all([loadTopics(), loadReviews()]);
    setText('topics-status', 'Review approved. Pipeline resumed.');
    if (payload.review?.pipeline_run_id) {
      pollPipelineRun(payload.review.pipeline_run_id).catch((error) => setText('topics-status', error.message));
    }
  } finally {
    state.approvingReviewIds.delete(normalizedReviewId);
    renderReviews();
  }
}

async function approveTopic(contentId, title) {
  const normalizedContentId = String(contentId || '').trim();
  if (!normalizedContentId) return;
  const approvedBy = window.prompt(`Approver for ${title || 'this Reel'}:`, state.configValues.STUDIO_APPROVER_NAME || '');
  if (approvedBy === null) return;
  const platformAccountId = window.prompt('Instagram account ID for this approval:', state.configValues.INSTAGRAM_IG_USER_ID || '');
  if (platformAccountId === null) return;
  const trimmedApprover = String(approvedBy || '').trim();
  const trimmedAccountId = String(platformAccountId || '').trim();
  if (!trimmedApprover || !trimmedAccountId) {
    setText('topics-status', 'Approver and Instagram account ID are required.');
    return;
  }
  if (!window.confirm('Approve this selected render for Instagram publish?')) return;

  state.approvingTopicIds.add(normalizedContentId);
  renderTopics();
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

async function deleteTopic(contentId, title) {
  const normalizedContentId = String(contentId || '').trim();
  if (!normalizedContentId) return;
  if (!window.confirm(`Delete "${title || 'this pipeline item'}" from local pipeline data?`)) return;
  state.deletingTopicIds.add(normalizedContentId);
  renderTopics();
  await api(`/api/topics/${encodeURIComponent(normalizedContentId)}`, { method: 'DELETE' });
  state.deletingTopicIds.delete(normalizedContentId);
  setText('topics-status', 'Pipeline item deleted.');
  await Promise.all([loadTopics(), loadReviews()]);
}

async function loadHealth() {
  const payload = await api('/api/health');
  setText('system-note', payload.ok ? 'Studio online' : 'Studio unavailable');
}

async function loadDefaults() {
  const payload = await api('/api/config').catch(() => ({ sections: [] }));
  applyConfigPayload(payload);
  renderSettings();
}

async function saveSettings(event) {
  event.preventDefault();
  const form = document.getElementById('settings-form');
  if (!form || state.savingSettings) return;
  const values = {};
  form.querySelectorAll('[data-config-key]').forEach((input) => {
    const key = input.dataset.configKey;
    if (input.value !== String(state.configValues[key] || '')) {
      values[key] = input.value;
    }
  });
  if (!Object.keys(values).length) {
    setText('settings-status', 'No setting changes.');
    return;
  }
  state.savingSettings = true;
  const saveButton = document.getElementById('save-settings');
  if (saveButton) saveButton.disabled = true;
  setText('settings-status', 'Saving settings...');
  try {
    const payload = await api('/api/config', {
      method: 'PUT',
      body: JSON.stringify({ values }),
    });
    applyConfigPayload(payload);
    renderSettings();
    setText('settings-status', 'Settings saved.');
  } finally {
    state.savingSettings = false;
    if (saveButton) saveButton.disabled = false;
  }
}

document.getElementById('idea-form').addEventListener('submit', (event) => {
  submitIdea(event).catch((error) => setText('idea-status', error.message));
});

document.getElementById('refresh-topics').addEventListener('click', () => {
  loadTopics().catch((error) => setText('topics-status', error.message));
});

document.getElementById('refresh-reviews').addEventListener('click', () => {
  loadReviews().catch((error) => setText('topics-status', error.message));
});

document.getElementById('settings-form').addEventListener('submit', (event) => {
  saveSettings(event).catch((error) => setText('settings-status', error.message));
});

Promise.all([
  loadHealth(),
  loadDefaults(),
  loadTopics(),
  loadReviews(),
]).catch((error) => {
  setText('system-note', error.message);
});
