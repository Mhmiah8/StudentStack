// load-trackr-jobs.js
let showingAll = false;
let allJobs = [];
let filteredJobs = [];
let currentFilter = 'all';
let currentPage = 0;
const jobsPerPage = 12;
let categoryCounts = {};
const recentPreviewLimit = 3;

function buildDataUrl(relativePath) {
    return new URL(relativePath, window.location.href).toString();
}

async function fetchJsonWithDebug(relativePath, label) {
    const url = buildDataUrl(relativePath);
    const startedAt = performance.now();
    console.info(`[jobs] Requesting ${label}`, {
        relativePath,
        resolvedUrl: url,
        pageUrl: window.location.href,
        origin: window.location.origin
    });

    const response = await fetch(url, { cache: 'no-store' });
    const elapsedMs = Math.round(performance.now() - startedAt);
    const contentType = response.headers.get('content-type') || 'unknown';

    if (!response.ok) {
        const preview = (await response.text()).slice(0, 220);
        console.error(`[jobs] ${label} request failed`, {
            status: response.status,
            statusText: response.statusText,
            contentType,
            elapsedMs,
            bodyPreview: preview
        });
        throw new Error(`${label} request failed: ${response.status} ${response.statusText}`);
    }

    let data;
    try {
        data = await response.json();
    } catch (error) {
        const preview = (await response.clone().text()).slice(0, 220);
        console.error(`[jobs] ${label} returned non-JSON payload`, {
            contentType,
            elapsedMs,
            bodyPreview: preview,
            parseError: error instanceof Error ? error.message : String(error)
        });
        throw error;
    }

    console.info(`[jobs] ${label} loaded`, {
        elapsedMs,
        contentType,
        items: Array.isArray(data) ? data.length : undefined,
        payloadType: Array.isArray(data) ? 'array' : typeof data
    });

    return data;
}

async function ensureAllJobsDataLoaded() {
    if (allJobs.length > 0) {
        return;
    }

    const data = await fetchJsonWithDebug('data/jobs_latest.json', 'jobs_latest.json');
    if (!Array.isArray(data)) {
        throw new Error('jobs_latest.json payload is not an array');
    }

    allJobs = data;
    allJobs.sort((a, b) => getRecencyTimestamp(b) - getRecencyTimestamp(a));

    categoryCounts = {};
    allJobs.forEach(job => {
        categoryCounts[job.category] = (categoryCounts[job.category] || 0) + 1;
    });
}

function setJobsToggleButton(expanded) {
    const button = document.getElementById('toggle-jobs-btn');
    if (!button) return;

    if (expanded) {
        button.innerHTML = `
            Show Less Jobs
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M15 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>
            </svg>
        `;
        return;
    }

    button.innerHTML = `
        View All Jobs
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>
        </svg>
    `;
}

function ensureLoadMoreButtonExists() {
    const loadMoreContainer = document.getElementById('load-more-container');
    if (!loadMoreContainer) return;

    if (!document.getElementById('load-more-btn')) {
        loadMoreContainer.innerHTML = `
            <button class="px-8 py-3 bg-primary text-white font-semibold rounded-lg hover:bg-blue-800 transition-colors" id="load-more-btn">
                Load More Jobs
            </button>
        `;

        const loadMoreBtn = document.getElementById('load-more-btn');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', loadMoreJobs);
        }
    }
}

function formatDate(dateString) {
    if (!dateString || dateString === 'TBA') return 'TBA';

    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'TBA';

        return date.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    } catch (e) {
        return 'TBA';
    }
}

function getRecencyTimestamp(job) {
    const opening = job.opening_date ? new Date(job.opening_date) : null;
    if (opening && !isNaN(opening.getTime())) {
        return opening.getTime();
    }

    const scraped = job.scraped_date ? new Date(job.scraped_date) : null;
    if (scraped && !isNaN(scraped.getTime())) {
        return scraped.getTime();
    }

    return 0;
}

function getCategoryColor(category) {
    const colors = {
        'summer-internships': 'bg-blue-100 text-blue-700',
        'industrial-placements': 'bg-green-100 text-green-700',
        'graduate-programmes': 'bg-purple-100 text-purple-700',
        'spring-weeks': 'bg-amber-100 text-amber-700'
    };
    return colors[category] || 'bg-slate-100 text-slate-700';
}

function formatCategory(category) {
    const names = {
        'summer-internships': 'Internship',
        'industrial-placements': 'Placement',
        'graduate-programmes': 'Graduate',
        'spring-weeks': 'Spring Week'
    };
    return names[category] || category;
}

function createJobCard(job) {
    const companyInitial = job.company ? job.company.charAt(0).toUpperCase() : '?';
    const categoryColor = getCategoryColor(job.category);
    const categoryName = formatCategory(job.category);
    const openingDate = formatDate(job.opening_date);
    const closingDate = formatDate(job.closing_date);
    const applyUrl = job.url || '#';
    const applyDisabled = !job.url ? 'opacity-50 cursor-not-allowed' : '';

    return `
        <div class="bg-white p-6 rounded-2xl border border-slate-200 card-hover flex flex-col justify-between">
            <div>
                <div class="flex justify-between items-start mb-4">
                    <div class="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center font-bold text-slate-400">${companyInitial}</div>
                    <span class="px-3 py-1 ${categoryColor} text-xs font-bold rounded-full uppercase">${categoryName}</span>
                </div>
                <h3 class="font-bold text-lg mb-1">${job.programme || 'Unknown Position'}</h3>
                <p class="text-slate-500 mb-4">${job.company || 'Unknown Company'} • ${job.locations || 'UK'}</p>
                <div class="text-sm text-slate-500 mb-6 space-y-1">
                    <div class="flex items-center">
                        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>
                        </svg>
                        Opening: ${openingDate}
                    </div>
                    <div class="flex items-center">
                        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>
                        </svg>
                        Closes: ${closingDate}
                    </div>
                </div>
            </div>
            <a href="${applyUrl}" class="w-full py-3 bg-slate-50 text-primary font-semibold rounded-lg hover:bg-primary hover:text-white transition-colors text-center ${applyDisabled}" ${!job.url ? 'onclick="return false;"' : ''} target="_blank" rel="noopener">
                Quick Apply
            </a>
        </div>
    `;
}

function showLoadingSpinner() {
    const container = document.getElementById('jobs-container');
    if (!container) return;
    container.innerHTML = `
        <div class="col-span-3 text-center py-10">
            <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p class="mt-2 text-slate-500">Loading latest opportunities...</p>
        </div>
    `;
}

function showError(message) {
    const container = document.getElementById('jobs-container');
    if (!container) return;
    container.innerHTML = `
        <div class="col-span-3 text-center py-10">
            <div class="text-red-500 mb-2">⚠️ Error loading jobs</div>
            <p class="text-slate-500">${message}</p>
        </div>
    `;
}

function showPreviewUnavailableMessage() {
    const container = document.getElementById('jobs-container');
    if (!container) return;

    container.innerHTML = `
        <div class="col-span-3 text-center py-10">
            <p class="text-slate-600">⚠️ Jobs preview unavailable. Click 'View All Jobs' to see all opportunities.</p>
        </div>
    `;
}

function renderRecentJobs(jobs) {
    const container = document.getElementById('jobs-container');
    if (!container) return;
    container.innerHTML = jobs.map(job => createJobCard(job)).join('');
}

function setPreviewControlsVisibility() {
    const filtersContainer = document.getElementById('filters-container');
    const loadMoreContainer = document.getElementById('load-more-container');

    if (filtersContainer) {
        if (allJobs.length > 0) {
            filtersContainer.classList.remove('hidden');
            createFilterButtons();
        } else {
            filtersContainer.classList.add('hidden');
        }
    }

    if (loadMoreContainer) {
        loadMoreContainer.classList.add('hidden');
    }
}

async function tryRenderRecentFromAllJobs() {
    await ensureAllJobsDataLoaded();
    if (!Array.isArray(allJobs) || allJobs.length === 0) {
        throw new Error('No jobs available in jobs_latest.json fallback');
    }

    const fallbackRecent = allJobs.slice(0, recentPreviewLimit);
    console.warn('[jobs] Using jobs_latest.json fallback for preview', {
        fallbackCount: fallbackRecent.length,
        totalJobs: allJobs.length
    });
    renderRecentJobs(fallbackRecent);
    showingAll = false;
    setJobsToggleButton(false);
    setPreviewControlsVisibility();
}

function updateOpportunitiesCount(count) {
    const countElement = document.getElementById('opportunities-count');
    if (countElement) {
        countElement.textContent = count;
    }
}

async function loadTotalJobsCount() {
    try {
        const summary = await fetchJsonWithDebug('data/jobs_summary.json', 'jobs_summary.json');
        if (summary && typeof summary.total_jobs === 'number') {
            return summary.total_jobs;
        }
    } catch (error) {
        console.warn('Could not load jobs summary:', error);
    }

    try {
        const allJobsResponse = await fetch('data/jobs_latest.json');
        if (allJobsResponse.ok) {
            const allJobsData = await allJobsResponse.json();
            if (Array.isArray(allJobsData)) {
                return allJobsData.length;
            }
        }
    } catch (error) {
        console.warn('Could not load jobs_latest fallback count:', error);
    }

    return null;
}

function createFilterButtons() {
    const filtersContainer = document.getElementById('filters-container');
    if (!filtersContainer) return;

    const categories = [
        { key: 'all', label: 'All', count: allJobs.length },
        { key: 'summer-internships', label: 'Internships', count: categoryCounts['summer-internships'] || 0 },
        { key: 'industrial-placements', label: 'Placements', count: categoryCounts['industrial-placements'] || 0 },
        { key: 'graduate-programmes', label: 'Graduate', count: categoryCounts['graduate-programmes'] || 0 },
        { key: 'spring-weeks', label: 'Spring Weeks', count: categoryCounts['spring-weeks'] || 0 }
    ];

    filtersContainer.innerHTML = categories.map(cat => {
        const isActive = currentFilter === cat.key;
        const activeClass = isActive ? 'bg-primary text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-primary';
        return `<button class="px-5 py-2 ${activeClass} rounded-full text-sm font-semibold filter-btn" data-filter="${cat.key}">${cat.label} (${cat.count})</button>`;
    }).join('');

    // Add event listeners
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const filter = btn.getAttribute('data-filter');
            filterJobs(filter);
        });
    });
}

function updateLoadMoreButton() {
    const loadMoreContainer = document.getElementById('load-more-container');
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (!loadMoreContainer || !loadMoreBtn) return;

    const loadedJobs = currentPage * jobsPerPage;
    const totalJobs = filteredJobs.length;

    if (loadedJobs >= totalJobs) {
        loadMoreBtn.textContent = 'All jobs loaded';
        loadMoreBtn.disabled = true;
        loadMoreBtn.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
        loadMoreBtn.textContent = `Load More Jobs (${Math.min(loadedJobs + jobsPerPage, totalJobs)} of ${totalJobs})`;
        loadMoreBtn.disabled = false;
        loadMoreBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
}

function filterJobs(category) {
    currentFilter = category;
    if (category === 'all') {
        filteredJobs = [...allJobs];
    } else {
        filteredJobs = allJobs.filter(job => job.category === category);
    }
    currentPage = 1;

    const container = document.getElementById('jobs-container');
    if (!container) return;

    container.innerHTML = filteredJobs.slice(0, jobsPerPage).map(createJobCard).join('');

    const loadMoreContainer = document.getElementById('load-more-container');
    if (loadMoreContainer) {
        if (filteredJobs.length > jobsPerPage) {
            loadMoreContainer.classList.remove('hidden');
            ensureLoadMoreButtonExists();
        } else {
            loadMoreContainer.classList.add('hidden');
        }
    }

    setJobsToggleButton(true);
    showingAll = true;

    updateOpportunitiesCount(filteredJobs.length);
    createFilterButtons();
    updateLoadMoreButton();
}

function loadMoreJobs() {
    currentPage++;
    const start = (currentPage - 1) * jobsPerPage;
    const end = currentPage * jobsPerPage;
    const newJobs = filteredJobs.slice(start, end);

    const container = document.getElementById('jobs-container');
    if (!container) return;

    container.innerHTML += newJobs.map(createJobCard).join('');

    updateLoadMoreButton();
}

async function loadRecentJobs() {
    try {
        showLoadingSpinner();
        const recentJobs = await fetchJsonWithDebug('data/recent_jobs.json', 'recent_jobs.json');
        if (!Array.isArray(recentJobs)) {
            throw new Error('Invalid recent jobs payload');
        }

        renderRecentJobs(recentJobs);
        setPreviewControlsVisibility();

        setJobsToggleButton(false);

        const totalJobsCount = await loadTotalJobsCount();
        if (typeof totalJobsCount === 'number') {
            updateOpportunitiesCount(totalJobsCount);
        }
        showingAll = false;

        ensureAllJobsDataLoaded()
            .then(() => {
                const updatedFiltersContainer = document.getElementById('filters-container');
                if (updatedFiltersContainer && !showingAll) {
                    updatedFiltersContainer.classList.remove('hidden');
                    createFilterButtons();
                }
            })
            .catch(error => {
                console.warn('Could not preload all jobs while showing recent jobs:', error);
            });

    } catch (error) {
        console.error('[jobs] Error loading recent_jobs.json on initial view:', error);

        try {
            await tryRenderRecentFromAllJobs();
            const totalJobsCount = await loadTotalJobsCount();
            if (typeof totalJobsCount === 'number') {
                updateOpportunitiesCount(totalJobsCount);
            }
        } catch (fallbackError) {
            console.error('[jobs] Fallback from jobs_latest.json also failed:', fallbackError);

            const filtersContainer = document.getElementById('filters-container');
            if (filtersContainer) {
                filtersContainer.classList.add('hidden');
            }

            const loadMoreContainer = document.getElementById('load-more-container');
            if (loadMoreContainer) {
                loadMoreContainer.classList.add('hidden');
            }

            showPreviewUnavailableMessage();
        }
    }
}

async function loadAllJobs() {
    try {
        showLoadingSpinner();
        await ensureAllJobsDataLoaded();

        // Set initial filter
        currentFilter = 'all';
        filteredJobs = [...allJobs];
        currentPage = 1;

        const container = document.getElementById('jobs-container');
        if (!container) return;

        container.innerHTML = filteredJobs.slice(0, jobsPerPage).map(createJobCard).join('');

        // Show filters
        const filtersContainer = document.getElementById('filters-container');
        if (filtersContainer) {
            filtersContainer.classList.remove('hidden');
            createFilterButtons();
        }

        // Show load more
        const loadMoreContainer = document.getElementById('load-more-container');
        if (loadMoreContainer) {
            loadMoreContainer.classList.remove('hidden');
            ensureLoadMoreButtonExists();
        }

        updateLoadMoreButton();

        setJobsToggleButton(true);

        updateOpportunitiesCount(allJobs.length);
        showingAll = true;

    } catch (error) {
        console.error('Error loading all jobs:', error);
        showError('Unable to load all jobs. Please try again later.');
    }
}

function toggleJobsView() {
    if (showingAll) {
        loadRecentJobs();
    } else {
        loadAllJobs();
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    console.info('[jobs] Initializing jobs loader', {
        pageUrl: window.location.href,
        origin: window.location.origin,
        readyState: document.readyState
    });
    loadRecentJobs();

    // Add event listener to toggle button
    const toggleBtn = document.getElementById('toggle-jobs-btn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleJobsView);
    }
});