const state = {
  topics: [],
  reviews: [],
  activePipelineRunId: '',
  approvingReviewIds: new Set(),
  approvingTopicIds: new Set(),
  deletingTopicIds: new Set(),
  selectedTopicDetail: null,
  activeDetailTab: 'overview',
  loadingDetailId: '',
  configValues: {},
  configSections: [],
  modelRouting: null,
  credentialGroups: [],
};

const DEFAULT_WORKFLOW_KEY = 'wf_end_to_end_reel_generate_and_publish';
const DEFAULT_CREATIVE_WORKFLOW = 'high_retention_story';

const CREATIVE_WORKFLOW_LABELS = Object.freeze({
  high_retention_story: 'High-Retention Story',
  premium_documentary: 'Premium Documentary',
  sales_conversion: 'Sales / Conversion',
});

const STAGE_LABELS = {
  idea_ingest: 'Idea',
  story_package_generation: 'Story',
  image_asset_generation: 'Images',
  asset_generation_v3: 'Assets',
  storyboard_and_shot_plan: 'Storyboard',
  narration_generation: 'Voice',
  voice_performance_script: 'Voice Direction',
  hybrid_media_planner: 'Media Plan',
  hybrid_media_generation: 'Hybrid Media',
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

function creativeWorkflowLabel(value) {
  const key = String(value || '').trim();
  if (CREATIVE_WORKFLOW_LABELS[key]) return CREATIVE_WORKFLOW_LABELS[key];
  return key
    ? key.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
    : CREATIVE_WORKFLOW_LABELS[DEFAULT_CREATIVE_WORKFLOW];
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

function renderConfigField(field, extraAttrs = '') {
  const inputId = configInputId(field.key);
  const examples = Array.isArray(field.examples)
    ? field.examples.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const listAttr = examples.length ? ` list="${escapeHtml(inputId)}-examples"` : '';
  const value = String(field.value || '');
  const placeholder = field.sensitive && value === '********'
    ? 'Stored. Enter a replacement or keep the mask.'
    : '';
  const options = Array.isArray(field.options) ? field.options : [];
  const examplesMarkup = options.length ? '' : renderFieldExamples(field);
  const control = options.length
    ? `
      <select
        id="${escapeHtml(inputId)}"
        data-config-key="${escapeHtml(field.key)}"
        data-sensitive="${field.sensitive ? 'true' : 'false'}"
        ${extraAttrs}
      >
        ${options.map((option) => {
          const optionValue = String(option.value ?? '');
          return `<option value="${escapeHtml(optionValue)}" ${optionValue === value ? 'selected' : ''}>${escapeHtml(option.label || optionValue || 'Use fallback')}</option>`;
        }).join('')}
      </select>
    `
    : `
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
        ${extraAttrs}
      >
    `;
  return `
    <label class="settings-field" for="${escapeHtml(inputId)}">
      <span>${escapeHtml(field.label || field.key)}</span>
      ${control}
      ${examplesMarkup}
      <small>${escapeHtml(field.description || field.key)}</small>
    </label>
  `;
}

function renderConfigSection(section) {
  const fields = Array.isArray(section.fields) ? section.fields : [];
  const variant = String(section.variant || '').trim();
  return `
    <details class="settings-section ${variant ? `settings-section-${escapeHtml(variant)}` : ''}">
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
  state.configSections = sections.filter((section) => (
    section.studio_visible === true
    && !['adapters', 'provider-keys'].includes(String(section.id || ''))
  ));
  state.modelRouting = payload.model_routing || null;
  state.credentialGroups = Array.isArray(payload.credential_groups) ? payload.credential_groups : [];
  for (const section of sections) {
    for (const field of section.fields || []) {
      state.configValues[field.key] = field.value || '';
    }
  }
  for (const group of state.modelRouting?.groups || []) {
    for (const route of group.routes || []) {
      const fields = [
        route.provider_field,
        ...(Array.isArray(route.model_fields) ? route.model_fields : []),
      ].filter(Boolean);
      for (const field of fields) {
        state.configValues[field.key] = field.value || '';
      }
    }
  }
  for (const group of state.credentialGroups) {
    for (const field of [...(group.primary_fields || []), ...(group.advanced_fields || [])]) {
      state.configValues[field.key] = field.value || '';
    }
  }
}

function renderAdapterInventory(inventory = []) {
  if (!Array.isArray(inventory) || inventory.length === 0) return '';
  return `
    <div class="adapter-inventory" aria-label="Adapter availability">
      ${inventory.map((adapter) => `
        <span class="adapter-chip ${adapter.configured ? 'adapter-chip-ready' : 'adapter-chip-missing'}" title="${escapeHtml((adapter.key_env || []).join(', ') || 'No key required')}">
          <strong>${escapeHtml(adapter.label || adapter.value)}</strong>
          <small>${escapeHtml(adapter.status_label || (adapter.configured ? 'ready' : 'missing key'))}</small>
        </span>
      `).join('')}
    </div>
  `;
}

function renderModelRoute(route) {
  const providerField = route.provider_field;
  const modelFields = Array.isArray(route.model_fields) ? route.model_fields : [];
  const activeProvider = String(route.active_provider || '').trim();
  const modelOptionsByProvider = JSON.stringify(route.model_options_by_provider || {});
  return `
    <div
      class="model-route-row"
      data-model-route
      data-active-provider="${escapeHtml(activeProvider)}"
      data-model-options-by-provider="${escapeHtml(modelOptionsByProvider)}"
    >
      <div class="model-route-copy">
        <strong>${escapeHtml(route.label || 'Task')}</strong>
        <small>${escapeHtml(route.description || '')}</small>
      </div>
      <div class="model-route-controls">
        ${providerField ? renderConfigField(providerField, 'data-route-provider="true"') : ''}
        <div class="model-field-list">
          ${modelFields.map((field) => `
            <div class="provider-model-field" data-model-provider="${escapeHtml(field.provider || '')}">
              ${field.provider ? `<span class="model-provider-label">${escapeHtml(field.provider === 'anthropic' ? 'Claude model' : `${field.provider} model`)}</span>` : ''}
              ${renderConfigField(field, 'data-route-model="true"')}
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

function renderModelRouting(routing) {
  if (!routing || !Array.isArray(routing.groups)) return '';
  return `
    <details class="settings-section settings-section-model-routing">
      <summary>
        <span>
          <strong>${escapeHtml(routing.title || 'Model Selection')}</strong>
          <small>${escapeHtml(routing.description || '')}</small>
        </span>
      </summary>
      <div class="settings-panel-body">
        ${routing.groups.map((group) => `
          <details class="model-route-group">
            <summary class="model-route-group-head">
              <span>
                <strong>${escapeHtml(group.title || group.id)}</strong>
                <small>${escapeHtml(group.description || '')}</small>
              </span>
            </summary>
            <div class="model-route-table">
              ${(group.routes || []).map(renderModelRoute).join('')}
            </div>
          </details>
        `).join('')}
      </div>
    </details>
  `;
}

function renderCredentialGroups(groups = []) {
  if (!Array.isArray(groups) || groups.length === 0) return '';
  return `
    <details class="settings-section settings-section-secrets">
      <summary>
        <span>
          <strong>Provider Credentials</strong>
          <small>Set provider keys here when the selected provider is not already configured in env.</small>
        </span>
      </summary>
      <div class="settings-panel-body credential-groups">
        ${groups.map((group) => `
          <section class="credential-group">
            <div class="credential-group-head">
              <span>
                <strong>${escapeHtml(group.title || group.id)}</strong>
                <small>${escapeHtml(group.description || '')}</small>
              </span>
              ${renderStatus(group.configured ? 'key set' : 'not configured')}
            </div>
            <div class="settings-grid credential-primary">
              ${(group.primary_fields || []).map(renderConfigField).join('')}
            </div>
            ${(group.advanced_fields || []).length ? `
              <details class="credential-advanced">
                <summary>Advanced task overrides</summary>
                <div class="settings-grid">
                  ${(group.advanced_fields || []).map(renderConfigField).join('')}
                </div>
              </details>
            ` : ''}
          </section>
        `).join('')}
      </div>
    </details>
  `;
}

function updateSelectOptions(select, options = []) {
  if (!select || select.tagName !== 'SELECT' || !Array.isArray(options) || options.length === 0) {
    return;
  }
  const previousValue = select.value;
  select.innerHTML = options.map((option) => {
    const optionValue = String(option.value ?? '');
    return `<option value="${escapeHtml(optionValue)}">${escapeHtml(option.label || optionValue || 'Use fallback')}</option>`;
  }).join('');
  const values = new Set(options.map((option) => String(option.value ?? '')));
  select.value = values.has(previousValue) ? previousValue : '';
}

function updateModelRouteVisibility(root = document) {
  const sharedTextProviderInput = root.querySelector('[data-config-key="TEXT_LLM_PROVIDER"]');
  root.querySelectorAll('[data-model-route]').forEach((route) => {
    const providerInput = route.querySelector('[data-route-provider]');
    const activeProvider = String(providerInput?.value || sharedTextProviderInput?.value || route.dataset.activeProvider || '').trim();
    route.querySelectorAll('[data-model-provider]').forEach((field) => {
      const provider = String(field.dataset.modelProvider || '').trim();
      field.hidden = Boolean(activeProvider && provider && provider !== activeProvider);
    });
    let optionsByProvider = {};
    try {
      optionsByProvider = JSON.parse(route.dataset.modelOptionsByProvider || '{}');
    } catch {
      optionsByProvider = {};
    }
    if (activeProvider && Array.isArray(optionsByProvider[activeProvider])) {
      route.querySelectorAll('[data-route-model]').forEach((select) => updateSelectOptions(select, optionsByProvider[activeProvider]));
    }
  });
}

function bindSettingsInteractions(root) {
  root.querySelectorAll('[data-route-provider]').forEach((input) => {
    input.addEventListener('change', () => updateModelRouteVisibility(root));
  });
  root.querySelectorAll('[data-config-key="TEXT_LLM_PROVIDER"]').forEach((input) => {
    input.addEventListener('change', () => updateModelRouteVisibility(root));
  });
  const form = root.querySelector('#settings-form');
  if (form) {
    form.addEventListener('submit', (event) => {
      saveSettings(event).catch((error) => setText('settings-status', error.message));
    });
  }
  updateModelRouteVisibility(root);
}

function renderSettings() {
  const root = document.getElementById('provider-status');
  if (!root) return;
  const routing = state.modelRouting || {};
  const groups = Array.isArray(routing.groups) ? routing.groups : [];
  const credentialGroups = Array.isArray(state.credentialGroups) ? state.credentialGroups : [];
  if (!groups.length && !credentialGroups.length && !Array.isArray(routing.adapter_inventory)) {
    root.innerHTML = '<div class="empty-state">Provider configuration is unavailable.</div>';
    return;
  }
  root.innerHTML = `
    <form id="settings-form" class="settings-form">
      <details class="settings-section">
        <summary>
          <span>
            <strong>Adapter Readiness</strong>
            <small>Configured providers are based on saved settings and process env fallbacks.</small>
          </span>
        </summary>
        <div class="settings-panel-body">
          ${renderAdapterInventory(routing.adapter_inventory || [])}
        </div>
      </details>
      ${renderModelRouting(routing)}
      ${state.configSections.map(renderConfigSection).join('')}
      ${renderCredentialGroups(credentialGroups)}
      <div class="settings-actions">
        <button id="save-settings" class="primary" type="submit">Save Runtime Settings</button>
        <span class="inline-status" id="settings-status" aria-live="polite"></span>
      </div>
    </form>
  `;
  bindSettingsInteractions(root);
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
  const notes = [];
  const pipelineStepError = String(topic.latest_pipeline_failed_step_error || '').trim();
  const pipelineRunError = String(topic.latest_pipeline_last_error || '').trim();
  const pipelineError = pipelineStepError || pipelineRunError;
  if (pipelineError) {
    const failedStage = String(topic.latest_pipeline_failed_stage_key || topic.latest_pipeline_stage || '').trim();
    const stageText = failedStage ? ` at ${stageLabel(failedStage)}` : '';
    notes.push(`Pipeline failed${stageText}: ${pipelineError}`);
  }

  const workflowError = String(topic.latest_failed_error_message || '').trim();
  if (workflowError && workflowError !== pipelineError) {
    const workflow = String(topic.latest_failed_workflow_name || 'workflow').trim();
    notes.push(`${workflow}: ${workflowError}`);
  }

  if (!notes.length) return '';
  return notes
    .map((note) => `<div class="failure-note">${escapeHtml(note)}</div>`)
    .join('');
}

function formatUsd(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return '$0.000000';
  return `$${amount.toFixed(6)}`;
}

function formatSeconds(value) {
  const seconds = Number(value || 0);
  return Number.isFinite(seconds) && seconds > 0 ? `${seconds.toFixed(2)}s` : 'n/a';
}

function mediaUrl(asset) {
  return String(asset?.storage_url || asset?.source_url || '').trim();
}

function renderAssetMedia(asset) {
  const url = mediaUrl(asset);
  if (!url) return '<div class="empty-state compact">No media URL</div>';
  const escapedUrl = escapeHtml(url);
  const mediaType = String(asset.media_type || '').toLowerCase();
  if (mediaType === 'video') {
    return `<video controls preload="metadata" src="${escapedUrl}"></video>`;
  }
  if (mediaType === 'audio') {
    return `<audio controls preload="metadata" src="${escapedUrl}"></audio>`;
  }
  if (mediaType === 'image') {
    return `<a href="${escapedUrl}" target="_blank" rel="noopener noreferrer"><img src="${escapedUrl}" alt="${escapeHtml(asset.asset_role || 'asset')}"></a>`;
  }
  return `<a class="secondary" href="${escapedUrl}" target="_blank" rel="noopener noreferrer">Open Asset</a>`;
}

function renderAssetCard(asset) {
  return `
    <article class="asset-card asset-card-${escapeHtml(asset.media_type || 'file')}">
      <div class="asset-card-head">
        <span>
          <strong>${escapeHtml(asset.asset_role || 'asset')}</strong>
          <small>${escapeHtml(asset.provider || 'unknown provider')}</small>
        </span>
        ${renderStatus(asset.status || asset.media_type)}
      </div>
      ${renderAssetMedia(asset)}
      <div class="asset-meta">
        ${asset.duration_seconds ? `<span>${escapeHtml(formatSeconds(asset.duration_seconds))}</span>` : ''}
        ${asset.width || asset.height ? `<span>${escapeHtml(`${asset.width || 0}x${asset.height || 0}`)}</span>` : ''}
        ${mediaUrl(asset) ? `<a href="${escapeHtml(mediaUrl(asset))}" target="_blank" rel="noopener noreferrer">Open</a>` : ''}
      </div>
    </article>
  `;
}

function renderPromptBlock(label, value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return `
    <section class="prompt-block">
      <strong>${escapeHtml(label)}</strong>
      <pre>${escapeHtml(text)}</pre>
    </section>
  `;
}

function detailScenes(detail) {
  return Array.isArray(detail?.storyboard?.scenes) ? detail.storyboard.scenes : [];
}

function detailAssets(detail) {
  return Array.isArray(detail?.assets) ? detail.assets : [];
}

function assetsForScene(detail, sceneNumber) {
  return detailAssets(detail).filter((asset) => Number(asset.scene_number || 0) === Number(sceneNumber));
}

function renderOverviewTab(detail) {
  const topic = detail.topic || {};
  const render = detail.render || {};
  return `
    <div class="detail-overview-grid">
      <section class="detail-summary">
        <h3>${escapeHtml(topic.title || 'Untitled reel')}</h3>
        <div class="topic-meta">
          <span>Type: ${escapeHtml(topic.reel_type || 'unknown')}</span>
          <span>Status: ${escapeHtml(topic.status || 'unknown')}</span>
          <span>Render: ${escapeHtml(render.render_status || 'none')}</span>
          <span>Duration: ${escapeHtml(formatSeconds(render.duration_seconds))}</span>
          <span>Cost: ${escapeHtml(formatUsd(detail.costs?.total_usd))}</span>
        </div>
        ${detail.script?.selected_hook ? `<p>${escapeHtml(detail.script.selected_hook)}</p>` : ''}
      </section>
      <section class="final-media">
        <h3>Final Video</h3>
        ${render.output_video_url ? `<video controls preload="metadata" src="${escapeHtml(render.output_video_url)}"></video>` : '<div class="empty-state compact">No final video yet.</div>'}
        ${render.cover_image_url ? `<a href="${escapeHtml(render.cover_image_url)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(render.cover_image_url)}" alt="Cover image"></a>` : ''}
      </section>
    </div>
  `;
}

function renderScenesTab(detail) {
  const scenes = detailScenes(detail);
  if (!scenes.length) return '<div class="empty-state">No storyboard scenes yet.</div>';
  return scenes.map((scene, index) => {
    const sceneNumber = Number(scene.scene_number || index + 1);
    const assets = assetsForScene(detail, sceneNumber);
    return `
      <article class="scene-detail-card">
        <div class="scene-detail-head">
          <span>
            <strong>Scene ${escapeHtml(sceneNumber)}</strong>
            <small>${escapeHtml(formatSeconds(scene.duration_seconds))}</small>
          </span>
          ${renderStatus(scene.asset_plan?.mode || scene.asset_type || 'scene')}
        </div>
        <p>${escapeHtml(scene.narration_text || '')}</p>
        <div class="asset-grid">
          ${assets.length ? assets.map(renderAssetCard).join('') : '<div class="empty-state compact">No assets for this scene.</div>'}
        </div>
      </article>
    `;
  }).join('');
}

function renderPromptsTab(detail) {
  const assets = detailAssets(detail).filter((asset) => asset.prompts && Object.values(asset.prompts).some((value) => String(value || '').trim()));
  if (!assets.length) return '<div class="empty-state">No asset prompt metadata has been recorded yet.</div>';
  return assets.map((asset) => `
    <article class="prompt-asset-card">
      <div class="asset-card-head">
        <span>
          <strong>Scene ${escapeHtml(asset.scene_number || 'n/a')} / ${escapeHtml(asset.asset_role || 'asset')}</strong>
          <small>${escapeHtml(asset.provider || '')}</small>
        </span>
        ${renderStatus(asset.media_type)}
      </div>
      ${renderPromptBlock('Image Prompt', asset.prompts.image_prompt)}
      ${renderPromptBlock('Video Prompt', asset.prompts.video_prompt)}
      ${renderPromptBlock('Provider Prompt Sent', asset.prompts.provider_prompt)}
      ${renderPromptBlock('Provider Actual Prompt', asset.prompts.actual_prompt)}
      ${renderPromptBlock('Fallback Prompt', asset.prompts.fallback_prompt)}
      ${renderPromptBlock('Negative Prompt', asset.prompts.negative_prompt)}
    </article>
  `).join('');
}

function renderCostsTab(detail) {
  const costs = detail.costs || {};
  const breakdown = Array.isArray(costs.breakdown) ? costs.breakdown : [];
  return `
    <div class="cost-summary">
      <strong>Total</strong>
      <span>${escapeHtml(formatUsd(costs.total_usd))}</span>
    </div>
    <div class="cost-breakdown">
      ${breakdown.length ? breakdown.map((entry) => `
        <article class="cost-row">
          <span>
            <strong>${escapeHtml(entry.workflow || 'workflow')}</strong>
            <small>${escapeHtml(entry.ended_at ? new Date(entry.ended_at).toLocaleString() : 'estimated from stored assets')}</small>
          </span>
          <span>${escapeHtml(formatUsd(entry.cost?.total_usd))}</span>
          ${Array.isArray(entry.cost?.components) && entry.cost.components.length ? `
            <pre>${escapeHtml(JSON.stringify(entry.cost.components, null, 2))}</pre>
          ` : ''}
        </article>
      `).join('') : '<div class="empty-state compact">No cost data available.</div>'}
    </div>
  `;
}

function renderPipelineTab(detail) {
  const run = detail.pipeline_run || {};
  const steps = Array.isArray(run.steps) ? run.steps : [];
  const workflows = Array.isArray(detail.workflows) ? detail.workflows : [];
  return `
    <section class="detail-summary">
      <h3>Pipeline Run</h3>
      <div class="topic-meta">
        <span>Status: ${escapeHtml(run.status || 'none')}</span>
        <span>Current: ${escapeHtml(stageLabel(String(run.current_stage || '').replace(/^review:/, '')) || 'n/a')}</span>
        ${run.last_error ? `<span>Error: ${escapeHtml(run.last_error)}</span>` : ''}
      </div>
      ${steps.length ? `
        <div class="pipeline-steps detail-step-list">
          ${steps.map((step) => `
            <div class="pipeline-step pipeline-step-${statusTone(step.step_status)}" title="${escapeHtml(step.error_message || step.step_status || '')}">
              <span class="step-dot"></span>
              <span class="step-label">${escapeHtml(stageLabel(step.stage_key))}</span>
            </div>
          `).join('')}
        </div>
      ` : '<div class="empty-state compact">No pipeline steps found.</div>'}
    </section>
    <section class="workflow-log-list">
      <h3>Workflow Costs / Events</h3>
      ${workflows.length ? workflows.map((workflow) => `
        <article class="workflow-log-row">
          <span>
            <strong>${escapeHtml(workflow.workflow_name)}</strong>
            <small>${escapeHtml(workflow.ended_at ? new Date(workflow.ended_at).toLocaleString() : workflow.started_at || '')}</small>
          </span>
          ${renderStatus(workflow.run_status)}
          ${workflow.error_message ? `<p>${escapeHtml(workflow.error_message)}</p>` : ''}
        </article>
      `).join('') : '<div class="empty-state compact">No workflow rows found.</div>'}
    </section>
  `;
}

function renderDetailTabs() {
  const root = document.getElementById('detail-tabs');
  if (!root) return;
  const tabs = [
    ['overview', 'Overview'],
    ['scenes', 'Scenes'],
    ['prompts', 'Prompts'],
    ['costs', 'Costs'],
    ['pipeline', 'Pipeline'],
  ];
  root.innerHTML = tabs.map(([key, label]) => `
    <button type="button" class="${state.activeDetailTab === key ? 'active' : ''}" data-detail-tab="${escapeHtml(key)}">${escapeHtml(label)}</button>
  `).join('');
  root.querySelectorAll('[data-detail-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeDetailTab = button.dataset.detailTab || 'overview';
      renderReelDetail();
    });
  });
}

function renderReelDetail() {
  const panel = document.getElementById('reel-detail');
  const body = document.getElementById('reel-detail-body');
  const title = document.getElementById('reel-detail-title');
  const detail = state.selectedTopicDetail;
  if (!panel || !body) return;
  if (!detail) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  if (title) title.textContent = detail.topic?.title || 'Selected reel';
  renderDetailTabs();
  const tab = state.activeDetailTab;
  body.innerHTML = {
    overview: renderOverviewTab,
    scenes: renderScenesTab,
    prompts: renderPromptsTab,
    costs: renderCostsTab,
    pipeline: renderPipelineTab,
  }[tab]?.(detail) || renderOverviewTab(detail);
}

async function loadTopicDetail(contentId) {
  const normalizedContentId = String(contentId || '').trim();
  if (!normalizedContentId) return;
  state.loadingDetailId = normalizedContentId;
  setText('detail-status', 'Loading detail...');
  const panel = document.getElementById('reel-detail');
  if (panel) panel.hidden = false;
  try {
    const detail = await api(`/api/topics/${encodeURIComponent(normalizedContentId)}/detail`);
    state.selectedTopicDetail = detail;
    state.activeDetailTab = 'overview';
    renderReelDetail();
    setText('detail-status', 'Loaded.');
    document.getElementById('reel-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } finally {
    state.loadingDetailId = '';
  }
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
      <button type="button" class="primary" data-open-detail="${escapeHtml(contentId)}">Details</button>
      ${topic.output_video_url && topic.render_status === 'success' ? `
        <a class="primary" href="${escapeHtml(topic.output_video_url)}" target="_blank" rel="noopener noreferrer">Open Video</a>
      ` : ''}
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
          ${topic.creative_workflow ? `<span>Creative: ${escapeHtml(creativeWorkflowLabel(topic.creative_workflow))}</span>` : ''}
          <span>Render: ${escapeHtml(topic.render_status || 'none')}</span>
          ${topic.output_video_url && topic.render_status === 'success' ? `<span>Video: <a href="${escapeHtml(topic.output_video_url)}" target="_blank" rel="noopener noreferrer">ready</a></span>` : ''}
          ${topic.render_duration_seconds ? `<span>Duration: ${escapeHtml(Number(topic.render_duration_seconds).toFixed(2))}s</span>` : ''}
          ${topic.render_resolution ? `<span>${escapeHtml(topic.render_resolution)}</span>` : ''}
          <span>Cost: ${escapeHtml(formatUsd(topic.total_cost_usd))}</span>
          <span>Publish: ${escapeHtml(topic.publish_status || 'draft')}</span>
          <span>Updated: ${escapeHtml(new Date(topic.updated_at).toLocaleString())}</span>
        </div>
        ${renderTopicActions(topic)}
      </article>
    `;
  }).join('');

  root.querySelectorAll('[data-open-detail]').forEach((button) => {
    button.addEventListener('click', () => {
      loadTopicDetail(button.dataset.openDetail || '')
        .catch((error) => setText('topics-status', error.message));
    });
  });
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
  const reelType = ['image', 'video', 'avatar', 'hybrid'].includes(submitterReelType)
    ? submitterReelType
    : 'image';
  const reelLabel = {
    image: 'Image Reel',
    video: 'Video Reel',
    avatar: 'Avatar Reel',
    hybrid: 'Hybrid / Auto Reel',
  }[reelType] || 'Image Reel';
  const reviewMode = formData.get('review_mode') === 'true';
  const avatarConsentConfirmed = formData.get('avatar_consent_confirmed') === 'true';
  const selectedCreativeWorkflow = String(formData.get('creative_workflow') || DEFAULT_CREATIVE_WORKFLOW).trim();
  const creativeWorkflow = Object.hasOwn(CREATIVE_WORKFLOW_LABELS, selectedCreativeWorkflow)
    ? selectedCreativeWorkflow
    : DEFAULT_CREATIVE_WORKFLOW;
  if (!abstractIdea) {
    setText('idea-status', 'Enter an idea first.');
    return;
  }
  if (reelType === 'avatar' && !avatarConsentConfirmed) {
    setText('idea-status', 'Confirm HeyGen avatar and voice consent before queueing an Avatar Reel.');
    return;
  }
  setText('idea-status', `Injecting idea and queueing ${reelLabel} with ${creativeWorkflowLabel(creativeWorkflow)}...`);
  const payload = await api('/api/ideas/auto-publish', {
    method: 'POST',
    body: JSON.stringify({
      abstract_idea: abstractIdea,
      reel_type: reelType,
      creative_workflow: creativeWorkflow,
      workflow_key: DEFAULT_WORKFLOW_KEY,
      review_mode: reviewMode,
      avatar_consent_confirmed: ['avatar', 'hybrid'].includes(reelType) && avatarConsentConfirmed,
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

document.getElementById('close-detail').addEventListener('click', () => {
  state.selectedTopicDetail = null;
  renderReelDetail();
});

Promise.all([
  loadHealth(),
  loadDefaults(),
  loadTopics(),
  loadReviews(),
]).catch((error) => {
  setText('system-note', error.message);
});
