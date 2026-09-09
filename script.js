const API_BASE = 'https://moviepro2-0-normal-server.onrender.com/api';
const SESSION_KEY = 'moviepro_admin_session';

const appState = {
  accessToken: '',
  user: null,
  movies: [],
  series: [],
  episodes: [],
  currentSection: 'dashboardSection',
};

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

function trimToUndefined(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function safeParseJson(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function formatDateForInput(dateValue) {
  const value = dateValue ? new Date(dateValue) : new Date();
  if (Number.isNaN(value.getTime())) return '';
  return value.toISOString().slice(0, 10);
}

function formatDateLabel(dateValue) {
  if (!dateValue) return 'N/A';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return String(dateValue);
  return date.toLocaleString();
}

function adminAuthRequiredMessage() {
  return 'Admin authentication is currently required for this operation. Login will be enabled in a future version.';
}

function parseApiError(payload, status) {
  if (typeof payload === 'string' && payload.trim()) return payload;
  if (payload && payload.message) return payload.message;
  if (payload && payload.error) return payload.error;
  if (payload && Array.isArray(payload.errors)) {
    return payload.errors.map((entry) => entry.msg || entry.message || 'Invalid request').join(', ');
  }

  const fallbackMap = {
    400: 'Invalid request. Please check your input.',
    401: adminAuthRequiredMessage(),
    403: adminAuthRequiredMessage(),
    404: 'The requested resource was not found.',
    409: 'This item already exists.',
    413: 'The uploaded file is too large.',
    429: 'Too many requests. Please wait and try again.',
    500: 'Server error. Please try again.',
    503: 'The service is temporarily unavailable. Please try again.',
  };

  return fallbackMap[status] || 'Request failed. Please try again.';
}

function showToast(message, type = 'info') {
  if (!isBrowser) return;
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add('show');
  toast.dataset.type = type;

  clearTimeout(showToast.timeoutId);
  showToast.timeoutId = setTimeout(() => {
    toast.classList.remove('show');
  }, 3200);
}

function setFormMessage(elementId, message, isError = false) {
  if (!isBrowser) return;
  const element = document.getElementById(elementId);
  if (!element) return;
  element.textContent = message || '';
  element.classList.toggle('error', Boolean(isError));
  element.classList.toggle('success', !isError && Boolean(message));
}

function readSession() {
  if (!isBrowser) return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function writeSession(session) {
  if (!isBrowser) return;
  if (!session) {
    sessionStorage.removeItem(SESSION_KEY);
    return;
  }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function getAccessToken() {
  const session = readSession();
  return session && session.accessToken ? session.accessToken : '';
}

function isLoggedIn() {
  return Boolean(getAccessToken());
}

function clearAuthState() {
  appState.accessToken = '';
  appState.user = null;
  writeSession(null);
}

function saveAuthState(authPayload) {
  const accessToken = authPayload && authPayload.accessToken ? authPayload.accessToken : '';
  const user = authPayload && authPayload.user ? authPayload.user : null;
  appState.accessToken = accessToken;
  appState.user = user;
  writeSession({ accessToken, user });
}

function buildApiUrl(path) {
  if (!path) return API_BASE;
  if (/^https?:\/\//i.test(path)) return path;
  const sanitized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${sanitized}`;
}

async function apiRequest(path, options = {}) {
  const session = readSession();
  const token = session && session.accessToken ? session.accessToken : '';
  const method = (options.method || 'GET').toUpperCase();
  const headers = { ...(options.headers || {}) };

  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  const needsJson = options.json !== false && !(options.body instanceof FormData);
  if (needsJson && !headers['Content-Type'] && typeof options.body !== 'undefined' && options.body !== null && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  let response;
  try {
    response = await fetch(buildApiUrl(path), {
      ...options,
      method,
      headers,
      body: (typeof options.body === 'undefined' || options.body === null)
        ? undefined
        : (typeof options.body === 'string' || options.body instanceof FormData || options.body instanceof Blob)
          ? options.body
          : JSON.stringify(options.body),
    });
  } catch (error) {
    throw new Error('Network error. Please check your internet connection and try again.');
  }

  const contentType = response.headers.get('content-type') || '';
  let payload = null;

  if (contentType.includes('application/json')) {
    try {
      payload = await response.json();
    } catch (error) {
      payload = null;
    }
  } else {
    const rawText = await response.text();
    payload = rawText ? rawText : null;
  }

  if (response.status === 401) {
    clearAuthState();
    showToast(adminAuthRequiredMessage(), 'error');
    throw new Error(adminAuthRequiredMessage());
  }

  if (response.status === 403) {
    showToast(adminAuthRequiredMessage(), 'error');
    throw new Error(adminAuthRequiredMessage());
  }

  if (!response.ok) {
    throw new Error(parseApiError(payload, response.status));
  }

  return payload;
}

function isLikelyUrl(value) {
  if (typeof value !== 'string') return false;
  return /^https?:\/\//i.test(value.trim());
}

function normalizeListPayload(payload, key) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload[key])) return payload[key];
  if (payload && payload.data && Array.isArray(payload.data)) return payload.data;
  return [];
}

function showLogin() {
  if (!isBrowser) return;
  document.getElementById('authScreen').classList.remove('hidden');
  document.getElementById('appShell').classList.add('hidden');
}

function showApp() {
  if (!isBrowser) return;
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  const label = document.getElementById('currentUserLabel');
  if (label) {
    label.textContent = appState.user && appState.user.email ? appState.user.email : 'Administrator';
  }
  const role = document.getElementById('settingsRole');
  if (role) {
    role.textContent = appState.user && appState.user.role ? appState.user.role : 'admin';
  }
}

function setActiveSection(sectionId) {
  appState.currentSection = sectionId;
  const panels = document.querySelectorAll('.panel');
  panels.forEach((panel) => {
    panel.classList.toggle('active-panel', panel.id === sectionId);
  });

  const navButtons = document.querySelectorAll('.nav-item');
  navButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.section === sectionId);
  });
}

function buildSourceRow(source = {}, allowRemove = true) {
  const row = document.createElement('div');
  row.className = 'source-row';

  const quality = document.createElement('input');
  quality.placeholder = 'Quality';
  quality.value = source.quality || '';

  const language = document.createElement('input');
  language.placeholder = 'Language';
  language.value = source.language || '';

  const objectKey = document.createElement('input');
  objectKey.placeholder = 'Object Key';
  objectKey.value = source.objectKey || source.url || '';

  const format = document.createElement('input');
  format.placeholder = 'Format';
  format.value = source.format || 'mp4';

  const active = document.createElement('select');
  active.innerHTML = `
    <option value="true" ${source.isActive !== false ? 'selected' : ''}>Active</option>
    <option value="false" ${source.isActive === false ? 'selected' : ''}>Inactive</option>
  `;

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'action-btn delete';
  removeButton.textContent = 'Remove';
  removeButton.addEventListener('click', () => row.remove());

  row.appendChild(quality);
  row.appendChild(language);
  row.appendChild(objectKey);
  row.appendChild(format);
  row.appendChild(active);
  if (allowRemove) row.appendChild(removeButton);

  return row;
}

function collectSourceRows(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return [];

  return Array.from(container.querySelectorAll('.source-row')).map((row) => {
    const inputs = row.querySelectorAll('input, select');
    const quality = inputs[0]?.value || '';
    const language = inputs[1]?.value || '';
    const objectKey = inputs[2]?.value || '';
    const format = inputs[3]?.value || 'mp4';
    const isActive = inputs[4]?.value === 'true';

    const source = {
      quality: quality.trim(),
      language: language.trim(),
      format: format.trim() || 'mp4',
      objectKey: objectKey.trim(),
      isActive,
    };

    if (source.objectKey && !source.objectKey.startsWith('movies/') && !source.objectKey.startsWith('series/') && !source.objectKey.startsWith('episodes/')) {
      source.url = source.objectKey;
    }

    return source;
  }).filter((source) => source.quality && source.language && (source.objectKey || source.url));
}

function getSourceList(containerId) {
  return collectSourceRows(containerId);
}

function addSourceToContainer(containerId, source = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.appendChild(buildSourceRow(source, true));
}

async function login(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  setFormMessage('loginMessage', 'Signing in...', false);
  const loginButton = document.getElementById('loginButton');
  loginButton.disabled = true;

  try {
    const payload = await apiRequest('/auth/login', {
      method: 'POST',
      json: true,
      body: { email, password },
    });

    const authPayload = payload && payload.success ? payload : payload && payload.data ? payload.data : payload;
    if (!authPayload || !authPayload.accessToken) {
      throw new Error('Login response was missing a token.');
    }

    saveAuthState(authPayload);
    setFormMessage('loginMessage', 'Login successful.', false);
    form.reset();
    showApp();
    await refreshAllData();
  } catch (error) {
    const message = error && error.message ? error.message : 'Login failed.';
    setFormMessage('loginMessage', message, true);
    showToast(message, 'error');
  } finally {
    const loginButton = document.getElementById('loginButton');
    if (loginButton) loginButton.disabled = false;
  }
}

async function logout() {
  const token = getAccessToken();
  clearAuthState();
  try {
    if (token) {
      await apiRequest('/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  } finally {
    showApp();
    showToast('You have been logged out.', 'info');
  }
}

function renderMovieTable(items) {
  const tableBody = document.getElementById('movieTableBody');
  if (!tableBody) return;
  tableBody.innerHTML = '';

  if (!items.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.textContent = 'No movies found.';
    row.appendChild(cell);
    tableBody.appendChild(row);
    return;
  }

  items.forEach((movie) => {
    const row = document.createElement('tr');

    const titleCell = document.createElement('td');
    titleCell.textContent = movie.title || 'Untitled';

    const categoryCell = document.createElement('td');
    categoryCell.textContent = movie.category || '—';

    const regionCell = document.createElement('td');
    regionCell.textContent = movie.region || '—';

    const voteCell = document.createElement('td');
    voteCell.textContent = movie.voteAverage ?? '—';

    const sourcesCell = document.createElement('td');
    const sources = Array.isArray(movie.videoSources) ? movie.videoSources : (Array.isArray(movie.videoLinks) ? movie.videoLinks : []);
    sourcesCell.textContent = String(sources.length || 0);

    const actionsCell = document.createElement('td');
    const actions = document.createElement('div');
    actions.className = 'cell-actions';

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'action-btn';
    editButton.textContent = 'Edit';
    editButton.addEventListener('click', () => fillMovieForm(movie));

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'action-btn delete';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => confirmDelete('movie', movie._id, movie.title));

    actions.appendChild(editButton);
    actions.appendChild(deleteButton);
    actionsCell.appendChild(actions);

    row.append(titleCell, categoryCell, regionCell, voteCell, sourcesCell, actionsCell);
    tableBody.appendChild(row);
  });
}

function renderSeriesTable(items) {
  const tableBody = document.getElementById('seriesTableBody');
  if (!tableBody) return;
  tableBody.innerHTML = '';

  if (!items.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.textContent = 'No series found.';
    row.appendChild(cell);
    tableBody.appendChild(row);
    return;
  }

  items.forEach((series) => {
    const row = document.createElement('tr');

    const titleCell = document.createElement('td');
    titleCell.textContent = series.title || 'Untitled';

    const categoryCell = document.createElement('td');
    categoryCell.textContent = series.category || '—';

    const regionCell = document.createElement('td');
    regionCell.textContent = series.region || '—';

    const voteCell = document.createElement('td');
    voteCell.textContent = series.voteAverage ?? '—';

    const sourcesCell = document.createElement('td');
    const sourceCount = Array.isArray(series.videoSources) ? series.videoSources.length : 0;
    sourcesCell.textContent = String(sourceCount);

    const actionsCell = document.createElement('td');
    const actions = document.createElement('div');
    actions.className = 'cell-actions';

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'action-btn';
    editButton.textContent = 'Edit';
    editButton.addEventListener('click', () => fillSeriesForm(series));

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'action-btn delete';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => confirmDelete('series', series._id, series.title));

    actions.append(editButton, deleteButton);
    actionsCell.appendChild(actions);

    row.append(titleCell, categoryCell, regionCell, voteCell, sourcesCell, actionsCell);
    tableBody.appendChild(row);
  });
}

function renderEpisodesTable(items) {
  const body = document.getElementById('episodeTableBody');
  if (!body) return;
  body.innerHTML = '';

  if (!items.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.textContent = 'No episodes found for this series.';
    row.appendChild(cell);
    body.appendChild(row);
    return;
  }

  items.forEach((episode) => {
    const row = document.createElement('tr');
    const episodeCell = document.createElement('td');
    episodeCell.textContent = `#${episode.episodeNumber ?? ''}`;

    const titleCell = document.createElement('td');
    titleCell.textContent = episode.title || 'Untitled';

    const overviewCell = document.createElement('td');
    overviewCell.textContent = episode.overview || '—';

    const sourcesCell = document.createElement('td');
    const count = Array.isArray(episode.videoSources) ? episode.videoSources.length : 0;
    sourcesCell.textContent = String(count);

    row.append(episodeCell, titleCell, overviewCell, sourcesCell);
    body.appendChild(row);
  });
}

function renderCrashTable(rows) {
  const tableBody = document.getElementById('crashTableBody');
  if (!tableBody) return;
  tableBody.innerHTML = '';

  if (!rows.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.textContent = 'No crash reports found.';
    row.appendChild(cell);
    tableBody.appendChild(row);
    return;
  }

  rows.forEach((entry) => {
    const row = document.createElement('tr');

    const timeCell = document.createElement('td');
    timeCell.textContent = formatDateLabel(entry.createdAt || entry.timestamp || entry.time);

    const messageCell = document.createElement('td');
    messageCell.textContent = entry.message || '—';

    const platformCell = document.createElement('td');
    platformCell.textContent = entry.platform || '—';

    const versionCell = document.createElement('td');
    versionCell.textContent = entry.appVersion || '—';

    row.append(timeCell, messageCell, platformCell, versionCell);
    tableBody.appendChild(row);
  });
}

async function loadMovies() {
  try {
    const payload = await apiRequest('/movies?limit=1000');
    const items = normalizeListPayload(payload, 'movies');
    appState.movies = items;
    renderMovieTable(items);
    const dashboardMovies = document.getElementById('dashboardTotalMovies');
    if (dashboardMovies) dashboardMovies.textContent = String(items.length);
    populateVideoTargetOptions();
    return items;
  } catch (error) {
    showToast(error.message, 'error');
    renderMovieTable([]);
    return [];
  }
}

async function loadSeries() {
  try {
    const payload = await apiRequest('/series?limit=1000');
    const items = normalizeListPayload(payload, 'series');
    appState.series = items;
    renderSeriesTable(items);
    const dashboardSeries = document.getElementById('dashboardTotalSeries');
    if (dashboardSeries) dashboardSeries.textContent = String(items.length);
    populateSeriesSelection();
    populateVideoTargetOptions();
    if (document.getElementById('episodeSeriesSelect').value) {
      await loadEpisodesForSelectedSeries();
    }
    return items;
  } catch (error) {
    showToast(error.message, 'error');
    renderSeriesTable([]);
    return [];
  }
}

async function loadEpisodesForSelectedSeries() {
  const seriesId = document.getElementById('episodeSeriesSelect')?.value;
  if (!seriesId) {
    appState.episodes = [];
    const dashboardEpisodes = document.getElementById('dashboardTotalEpisodes');
    if (dashboardEpisodes) dashboardEpisodes.textContent = '0';
    renderEpisodesTable([]);
    return [];
  }

  try {
    const payload = await apiRequest(`/episodes?seriesId=${encodeURIComponent(seriesId)}`);
    const items = Array.isArray(payload) ? payload : [];
    appState.episodes = items;
    const dashboardEpisodes = document.getElementById('dashboardTotalEpisodes');
    if (dashboardEpisodes) dashboardEpisodes.textContent = String(items.length);
    renderEpisodesTable(items);
    return items;
  } catch (error) {
    showToast(error.message, 'error');
    renderEpisodesTable([]);
    return [];
  }
}

async function loadAnalytics() {
  try {
    const payload = await apiRequest('/analytics/summary');
    document.getElementById('totalInstalls').textContent = payload && payload.totalInstalls !== undefined ? payload.totalInstalls : 0;
    document.getElementById('totalVisits').textContent = payload && payload.totalViews !== undefined ? payload.totalViews : 0;
    document.getElementById('todayVisits').textContent = payload && payload.todayViews !== undefined ? payload.todayViews : 0;
    document.getElementById('totalMoviePlays').textContent = payload && payload.totalPlays !== undefined ? payload.totalPlays : 0;

    document.getElementById('dashboardTodayVisits').textContent = payload && payload.todayViews !== undefined ? payload.todayViews : 0;
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadCrashReports() {
  try {
    const payload = await apiRequest('/crashes');
    const rows = Array.isArray(payload) ? payload : [];
    renderCrashTable(rows);
  } catch (error) {
    showToast(error.message, 'error');
    renderCrashTable([]);
  }
}

async function refreshAllData() {
  await Promise.all([
    loadMovies(),
    loadSeries(),
    loadAnalytics(),
    loadCrashReports(),
  ]);
}

function populateSeriesSelection() {
  const select = document.getElementById('episodeSeriesSelect');
  if (!select) return;

  const current = select.value;
  const options = ['<option value="">Select series</option>'];
  appState.series.forEach((series) => {
    options.push(`<option value="${series._id}">${escapeHtml(series.title || 'Untitled')}</option>`);
  });
  select.innerHTML = options.join('');
  if (appState.series.some((series) => series._id === current)) {
    select.value = current;
  }
}

function populateVideoTargetOptions() {
  const targetSelect = document.getElementById('videoTargetSelect');
  if (!targetSelect) return;

  const targetType = document.getElementById('videoTargetType')?.value || 'movie';
  const list = targetType === 'series' ? appState.series : appState.movies;
  const currentValue = targetSelect.value || '';

  const options = ['<option value="">Select item</option>'];
  list.forEach((item) => {
    const label = item.title || 'Untitled';
    options.push(`<option value="${item._id}">${escapeHtml(label)}</option>`);
  });
  targetSelect.innerHTML = options.join('');
  if (list.some((item) => item._id === currentValue)) {
    targetSelect.value = currentValue;
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fillMovieForm(movie) {
  document.getElementById('movieId').value = movie._id || '';
  document.getElementById('movieTitle').value = movie.title || '';
  document.getElementById('movieOverview').value = movie.overview || '';
  document.getElementById('movieCategory').value = movie.category || 'Action';
  document.getElementById('movieRegion').value = movie.region || 'Hollywood';
  document.getElementById('movieType').value = movie.type || 'movie';
  document.getElementById('moviePosterPath').value = movie.posterPath || '';
  document.getElementById('movieReleaseDate').value = formatDateForInput(movie.releaseDate);
  document.getElementById('movieVoteAverage').value = movie.voteAverage ?? 0;

  const sourceContainer = document.getElementById('movieSourceList');
  sourceContainer.innerHTML = '';
  const sources = Array.isArray(movie.videoSources) ? movie.videoSources : (Array.isArray(movie.videoLinks) ? movie.videoLinks : []);
  if (!sources.length) {
    addSourceToContainer('movieSourceList');
    return;
  }
  sources.forEach((source) => addSourceToContainer('movieSourceList', source));

  document.getElementById('movieSubmitButton').textContent = 'Save Movie';
  setActiveSection('moviesSection');
}

function resetMovieForm() {
  document.getElementById('movieForm').reset();
  document.getElementById('movieId').value = '';
  document.getElementById('movieSourceList').innerHTML = '';
  addSourceToContainer('movieSourceList', { quality: '1080p', language: 'English', format: 'mp4', isActive: true });
  document.getElementById('movieSubmitButton').textContent = 'Create Movie';
}

function fillSeriesForm(series) {
  document.getElementById('seriesId').value = series._id || '';
  document.getElementById('seriesTitle').value = series.title || '';
  document.getElementById('seriesOverview').value = series.overview || '';
  document.getElementById('seriesCategory').value = series.category || 'Action';
  document.getElementById('seriesRegion').value = series.region || 'Hollywood';
  document.getElementById('seriesType').value = series.type || 'series';
  document.getElementById('seriesPosterPath').value = series.posterPath || '';
  document.getElementById('seriesReleaseDate').value = formatDateForInput(series.releaseDate);
  document.getElementById('seriesVoteAverage').value = series.voteAverage ?? 0;

  const sourceContainer = document.getElementById('seriesSourceList');
  sourceContainer.innerHTML = '';
  const sources = Array.isArray(series.videoSources) ? series.videoSources : [];
  if (!sources.length) {
    addSourceToContainer('seriesSourceList');
    return;
  }
  sources.forEach((source) => addSourceToContainer('seriesSourceList', source));

  document.getElementById('seriesSubmitButton').textContent = 'Save Series';
  setActiveSection('seriesSection');
}

function resetSeriesForm() {
  document.getElementById('seriesForm').reset();
  document.getElementById('seriesId').value = '';
  document.getElementById('seriesSourceList').innerHTML = '';
  addSourceToContainer('seriesSourceList', { quality: '1080p', language: 'English', format: 'mp4', isActive: true });
  document.getElementById('seriesSubmitButton').textContent = 'Create Series';
}

async function submitMovieForm(event) {
  event.preventDefault();
  const id = document.getElementById('movieId').value;
  const payload = {
    title: trimToUndefined(document.getElementById('movieTitle').value),
    overview: trimToUndefined(document.getElementById('movieOverview').value),
    category: trimToUndefined(document.getElementById('movieCategory').value),
    region: trimToUndefined(document.getElementById('movieRegion').value),
    posterPath: trimToUndefined(document.getElementById('moviePosterPath').value),
    releaseDate: trimToUndefined(document.getElementById('movieReleaseDate').value),
    voteAverage: Number(document.getElementById('movieVoteAverage').value),
    type: trimToUndefined(document.getElementById('movieType').value) || 'movie',
    videoSources: getSourceList('movieSourceList'),
  };

  if (!payload.title || !payload.overview || !payload.category || !payload.region || !payload.releaseDate || Number.isNaN(payload.voteAverage)) {
    showToast('Please fill in all required movie fields.', 'error');
    return;
  }

  if (!payload.videoSources.length) {
    addSourceToContainer('movieSourceList', { quality: '1080p', language: 'English', format: 'mp4', isActive: true });
    showToast('At least one video source is required.', 'error');
    return;
  }

  try {
    const button = document.getElementById('movieSubmitButton');
    button.disabled = true;
    const route = id ? `/movies/${id}` : '/movies';
    const method = id ? 'PUT' : 'POST';

    await apiRequest(route, {
      method,
      body: payload,
    });

    showToast(id ? 'Movie updated successfully.' : 'Movie created successfully.', 'success');
    resetMovieForm();
    await refreshAllData();
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    document.getElementById('movieSubmitButton').disabled = false;
  }
}

async function submitSeriesForm(event) {
  event.preventDefault();
  const id = document.getElementById('seriesId').value;
  const payload = {
    title: trimToUndefined(document.getElementById('seriesTitle').value),
    overview: trimToUndefined(document.getElementById('seriesOverview').value),
    category: trimToUndefined(document.getElementById('seriesCategory').value),
    region: trimToUndefined(document.getElementById('seriesRegion').value),
    posterPath: trimToUndefined(document.getElementById('seriesPosterPath').value),
    releaseDate: trimToUndefined(document.getElementById('seriesReleaseDate').value),
    voteAverage: Number(document.getElementById('seriesVoteAverage').value),
    type: trimToUndefined(document.getElementById('seriesType').value) || 'series',
    videoSources: getSourceList('seriesSourceList'),
  };

  if (!payload.title || !payload.overview || !payload.category || !payload.region || !payload.releaseDate || Number.isNaN(payload.voteAverage)) {
    showToast('Please fill in all required series fields.', 'error');
    return;
  }

  try {
    const button = document.getElementById('seriesSubmitButton');
    button.disabled = true;
    const route = id ? `/series/${id}` : '/series';
    const method = id ? 'PUT' : 'POST';

    await apiRequest(route, {
      method,
      body: payload,
    });

    showToast(id ? 'Series updated successfully.' : 'Series created successfully.', 'success');
    resetSeriesForm();
    await refreshAllData();
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    document.getElementById('seriesSubmitButton').disabled = false;
  }
}

async function submitEpisodeForm(event) {
  event.preventDefault();
  const seriesId = document.getElementById('episodeSeriesSelect').value;
  const payload = {
    seriesId,
    title: trimToUndefined(document.getElementById('episodeTitleInput').value),
    overview: trimToUndefined(document.getElementById('episodeOverviewInput').value),
    episodeNumber: Number(document.getElementById('episodeNumberInput').value),
    videoSources: getSourceList('episodeSourceList'),
  };

  if (!seriesId || !payload.title || Number.isNaN(payload.episodeNumber) || !payload.videoSources.length) {
    showToast('Please select a series, enter a title, number, and at least one video source.', 'error');
    return;
  }

  try {
    await apiRequest('/episodes', {
      method: 'POST',
      body: payload,
    });
    showToast('Episode created successfully.', 'success');
    document.getElementById('episodeForm').reset();
    document.getElementById('episodeSourceList').innerHTML = '';
    addSourceToContainer('episodeSourceList', { quality: '1080p', language: 'English', format: 'mp4', isActive: true });
    await loadEpisodesForSelectedSeries();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function confirmDelete(type, id, title) {
  const label = type === 'movie' ? 'movie' : type === 'series' ? 'series' : 'episode';
  const confirmed = window.confirm(`Delete this ${label} named "${title}"? This action cannot be undone.`);
  if (!confirmed) return;

  try {
    await apiRequest(`/${type}s/${id}`, { method: 'DELETE' });
    showToast(`${label[0].toUpperCase() + label.slice(1)} deleted successfully.`, 'success');
    await refreshAllData();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function uploadPoster(event) {
  event.preventDefault();
  const fileInput = document.getElementById('posterUploadFile');
  const file = fileInput.files[0];
  if (!file) {
    showToast('Please choose an image first.', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('image', file);

  try {
    const response = await apiRequest('/storage/image', {
      method: 'POST',
      body: formData,
      json: false,
    });
    const objectKey = response && response.data ? response.data.objectKey : response && response.objectKey ? response.objectKey : '';
    if (!objectKey) {
      throw new Error('The backend did not return an image reference.');
    }
    showToast('Poster uploaded successfully.', 'success');
    document.getElementById('moviePosterPath').value = objectKey;
    document.getElementById('seriesPosterPath').value = objectKey;
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function requestPresignedUpload(file, quality, language, prefix = 'movies') {
  const response = await apiRequest('/storage/presign-upload', {
    method: 'POST',
    body: {
      contentType: file.type || 'video/mp4',
      originalName: file.name,
      prefix,
      quality,
      language,
      fileSize: file.size,
    },
  });

  if (!response || !response.data) {
    throw new Error('The backend did not return a valid upload URL.');
  }

  return response.data;
}

async function uploadVideoToWasabi(file, uploadUrl, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.round((event.loaded / event.total) * 100);
      if (onProgress) onProgress(percent, event.loaded, event.total);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}.`));
      }
    };

    xhr.onerror = () => reject(new Error('Upload failed due to a network error.'));
    xhr.send(file);
  });
}

async function completeWasabiUpload(objectKey) {
  const payload = await apiRequest('/storage/complete-upload', {
    method: 'POST',
    body: { objectKey },
  });

  return payload && payload.data ? payload.data : payload;
}

async function handleVideoUpload(event) {
  event.preventDefault();
  const fileInput = document.getElementById('videoUploadFile');
  const file = fileInput.files[0];
  const quality = document.getElementById('uploadQuality').value;
  const language = document.getElementById('uploadLanguage').value;
  const targetType = document.getElementById('videoTargetType').value;
  const targetId = document.getElementById('videoTargetSelect').value;
  const button = document.getElementById('videoUploadButton');

  if (!file || !targetId) {
    showToast('Please choose a file and a target item.', 'error');
    return;
  }

  const uploadContainer = document.getElementById('uploadProgressWrapper');
  const progressBar = document.getElementById('uploadProgressBar');
  const progressLabel = document.getElementById('uploadProgressLabel');
  const progressPct = document.getElementById('uploadProgressPct');

  uploadContainer.classList.remove('hidden');
  button.disabled = true;
  progressLabel.textContent = 'Requesting upload...';
  progressBar.style.width = '0%';
  progressPct.textContent = '0%';

  try {
    const uploadInfo = await requestPresignedUpload(file, quality, language, targetType === 'series' ? 'series' : 'movies');
    progressLabel.textContent = 'Uploading to Wasabi...';
    await uploadVideoToWasabi(file, uploadInfo.uploadUrl, (percent) => {
      progressBar.style.width = `${percent}%`;
      progressPct.textContent = `${percent}%`;
    });

    progressLabel.textContent = 'Completing upload...';
    const completion = await completeWasabiUpload(uploadInfo.objectKey);
    const objectKey = completion && completion.objectKey ? completion.objectKey : uploadInfo.objectKey;

    const source = {
      quality,
      language,
      objectKey,
      format: (file.type || 'video/mp4').split('/')[1] || 'mp4',
      isActive: true,
    };

    if (targetType === 'movie') {
      const movie = appState.movies.find((entry) => entry._id === targetId);
      const nextSources = Array.isArray(movie && movie.videoSources) ? [...movie.videoSources, source] : [source];
      await apiRequest(`/movies/${targetId}`, {
        method: 'PUT',
        body: { videoSources: nextSources },
      });
    } else {
      const series = appState.series.find((entry) => entry._id === targetId);
      const nextSources = Array.isArray(series && series.videoSources) ? [...series.videoSources, source] : [source];
      await apiRequest(`/series/${targetId}`, {
        method: 'PUT',
        body: { videoSources: nextSources },
      });
    }

    showToast('Video uploaded and attached successfully.', 'success');
    document.getElementById('videoUploadFile').value = '';
    progressBar.style.width = '100%';
    progressPct.textContent = '100%';
    progressLabel.textContent = 'Upload complete';
    await refreshAllData();
  } catch (error) {
    showToast(error.message, 'error');
    progressLabel.textContent = 'Upload failed';
  } finally {
    button.disabled = false;
  }
}

function bindEvents() {
  document.getElementById('loginForm').addEventListener('submit', login);
  document.getElementById('logoutButton').addEventListener('click', logout);
  document.getElementById('refreshAllButton').addEventListener('click', refreshAllData);
  document.getElementById('refreshAnalyticsButton').addEventListener('click', loadAnalytics);
  document.getElementById('refreshCrashButton').addEventListener('click', loadCrashReports);
  document.getElementById('movieForm').addEventListener('submit', submitMovieForm);
  document.getElementById('seriesForm').addEventListener('submit', submitSeriesForm);
  document.getElementById('episodeForm').addEventListener('submit', submitEpisodeForm);
  document.getElementById('posterUploadForm').addEventListener('submit', uploadPoster);
  document.getElementById('videoUploadForm').addEventListener('submit', handleVideoUpload);
  document.getElementById('resetMovieFormButton').addEventListener('click', resetMovieForm);
  document.getElementById('resetSeriesFormButton').addEventListener('click', resetSeriesForm);

  document.querySelectorAll('.nav-item').forEach((button) => {
    button.addEventListener('click', () => {
      const sectionId = button.dataset.section;
      if (sectionId) setActiveSection(sectionId);
    });
  });

  document.getElementById('movieCategoryFilter').addEventListener('change', () => filterMovieTable());
  document.getElementById('movieRegionFilter').addEventListener('change', () => filterMovieTable());
  document.getElementById('movieSearch').addEventListener('input', () => filterMovieTable());
  document.getElementById('seriesSearch').addEventListener('input', () => filterSeriesTable());
  document.getElementById('episodeSeriesSelect').addEventListener('change', loadEpisodesForSelectedSeries);
  document.getElementById('videoTargetType').addEventListener('change', populateVideoTargetOptions);

  document.getElementById('addMovieSourceButton').addEventListener('click', () => addSourceToContainer('movieSourceList'));
  document.getElementById('addSeriesSourceButton').addEventListener('click', () => addSourceToContainer('seriesSourceList'));
  document.getElementById('addEpisodeSourceButton').addEventListener('click', () => addSourceToContainer('episodeSourceList'));

  resetMovieForm();
  resetSeriesForm();
  document.getElementById('episodeSourceList').innerHTML = '';
  addSourceToContainer('episodeSourceList', { quality: '1080p', language: 'English', format: 'mp4', isActive: true });
}

function filterMovieTable() {
  const search = (document.getElementById('movieSearch').value || '').trim().toLowerCase();
  const category = document.getElementById('movieCategoryFilter').value;
  const region = document.getElementById('movieRegionFilter').value;

  const filtered = appState.movies.filter((movie) => {
    const matchesSearch = !search || (movie.title || '').toLowerCase().includes(search);
    const matchesCategory = !category || movie.category === category;
    const matchesRegion = !region || movie.region === region || region === 'All';
    return matchesSearch && matchesCategory && matchesRegion;
  });

  renderMovieTable(filtered);
}

function filterSeriesTable() {
  const search = (document.getElementById('seriesSearch').value || '').trim().toLowerCase();
  const filtered = appState.series.filter((series) => !search || (series.title || '').toLowerCase().includes(search));
  renderSeriesTable(filtered);
}

async function initializeApp() {
  if (!isBrowser) return;

  const session = readSession();
  if (session && session.accessToken) {
    appState.accessToken = session.accessToken;
    appState.user = session.user || null;
  }

  showApp();
  await refreshAllData();
  bindEvents();
  setActiveSection('dashboardSection');
}

if (isBrowser) {
  document.addEventListener('DOMContentLoaded', initializeApp);
}

if (typeof module !== 'undefined') {
  module.exports = {
    API_BASE,
    buildApiUrl,
    parseApiError,
    isLikelyUrl,
    safeParseJson,
    formatDateForInput,
    collectSourceRows,
  };
}
