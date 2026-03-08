function formatHackathonDate(dateString) {
    if (!dateString || dateString === 'TBA') return 'TBA';

    const parsedDate = new Date(dateString);
    if (Number.isNaN(parsedDate.getTime())) return 'TBA';

    return parsedDate.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

let allHackathons = [];
let showingAllHackathons = false;

function getHackathonsPreviewCount() {
    const width = window.innerWidth || 0;
    if (width >= 1024) return 4;
    if (width >= 640) return 2;
    return 1;
}

function getHackathonEmoji(hackathon) {
    const text = `${hackathon.name || ''} ${Array.isArray(hackathon.hosts) ? hackathon.hosts.join(' ') : ''}`.toLowerCase();

    if (text.includes('ai') || text.includes('agent')) return '🤖';
    if (text.includes('data')) return '📊';
    if (text.includes('cloud')) return '☁️';
    if (text.includes('security') || text.includes('cyber')) return '🔐';
    if (text.includes('web3') || text.includes('blockchain')) return '⛓️';
    if (text.includes('startup') || text.includes('founder')) return '💡';
    if (text.includes('code') || text.includes('dev')) return '💻';

    const fallback = ['🚀', '🧠', '⚙️', '🧩'];
    const seed = (hackathon.name || '').length % fallback.length;
    return fallback[seed];
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function createHackathonCard(hackathon) {
    const eventName = escapeHtml(hackathon.name || 'Untitled Event');
    const host = Array.isArray(hackathon.hosts) && hackathon.hosts.length > 0
        ? escapeHtml(hackathon.hosts[0])
        : 'Unknown Host';
    const eventDate = formatHackathonDate(hackathon.date);
    const city = escapeHtml(hackathon.city || 'Online / UK');
    const url = hackathon.url && typeof hackathon.url === 'string' ? hackathon.url : '#';
    const disabledClass = url === '#' ? 'opacity-50 cursor-not-allowed' : '';
    const eventEmoji = getHackathonEmoji(hackathon);

    return `
        <div class="bg-slate-800 rounded-xl overflow-hidden border border-slate-700 hover:border-secondary transition-all group">
            <div class="h-32 bg-secondary/20 flex items-center justify-center">
                <span class="text-4xl">${eventEmoji}</span>
            </div>
            <div class="p-5">
                <h3 class="font-bold text-lg group-hover:text-secondary transition-colors text-white mb-2">${eventName}</h3>
                <p class="text-slate-400 text-sm mb-4">${host}</p>
                <div class="space-y-2 mb-6">
                    <div class="flex items-center text-xs text-slate-300">
                        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>
                        </svg>
                        ${eventDate}
                    </div>
                    <div class="flex items-center text-xs text-slate-300">
                        <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>
                        </svg>
                        ${city}
                    </div>
                </div>
                <a href="${url}" target="_blank" rel="noopener" class="w-full py-2 bg-secondary text-white font-bold rounded hover:bg-teal-600 transition-colors text-center block ${disabledClass}" ${url === '#' ? 'onclick="return false;"' : ''}>
                    Register
                </a>
            </div>
        </div>
    `;
}

function updateHackathonsToggleButton() {
    const toggleButton = document.getElementById('toggle-hackathons-btn');
    if (!toggleButton) return;

    const previewCount = getHackathonsPreviewCount();

    if (allHackathons.length <= previewCount) {
        toggleButton.classList.add('hidden');
        return;
    }

    toggleButton.classList.remove('hidden');

    if (showingAllHackathons) {
        toggleButton.innerHTML = `
            Show Less
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M15 19l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>
            </svg>
        `;
    } else {
        toggleButton.innerHTML = `
            View All Events
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>
            </svg>
        `;
    }
}

function renderHackathons() {
    const container = document.getElementById('hackathons-container');
    if (!container) return;

    const previewCount = getHackathonsPreviewCount();

    const visibleHackathons = showingAllHackathons
        ? allHackathons
        : allHackathons.slice(0, previewCount);

    container.innerHTML = visibleHackathons.map(createHackathonCard).join('');
}

function toggleHackathonsView(event) {
    if (event) event.preventDefault();
    if (allHackathons.length <= getHackathonsPreviewCount()) return;

    showingAllHackathons = !showingAllHackathons;
    renderHackathons();
    updateHackathonsToggleButton();
}

function renderHackathonEmptyState(container) {
    container.innerHTML = `
        <div class="sm:col-span-2 lg:col-span-4 text-center py-10 text-slate-300">
            No hackathons found right now.
        </div>
    `;
}

function renderHackathonError(container) {
    container.innerHTML = `
        <div class="sm:col-span-2 lg:col-span-4 text-center py-10">
            <div class="text-red-400 mb-2">⚠️ Error loading hackathons</div>
            <p class="text-slate-300">Please try again later.</p>
        </div>
    `;
}

async function loadRecentHackathons() {
    const container = document.getElementById('hackathons-container');
    const toggleButton = document.getElementById('toggle-hackathons-btn');
    if (!container) return;

    try {
        let hackathons = [];

        const latestResponse = await fetch('data/hackathons_latest.json');
        if (latestResponse.ok) {
            const latestData = await latestResponse.json();
            if (Array.isArray(latestData)) {
                hackathons = latestData;
            }
        }

        if (!hackathons.length) {
            const recentResponse = await fetch('data/recent_hackathons.json');
            if (!recentResponse.ok) throw new Error('Failed to load recent hackathons');
            const recentData = await recentResponse.json();
            if (Array.isArray(recentData)) {
                hackathons = recentData;
            }
        }

        if (!Array.isArray(hackathons) || hackathons.length === 0) {
            renderHackathonEmptyState(container);
            return;
        }

        allHackathons = [...hackathons];
        showingAllHackathons = false;
        renderHackathons();
        updateHackathonsToggleButton();

        if (toggleButton) {
            toggleButton.onclick = toggleHackathonsView;
        }
    } catch (error) {
        console.error('Error loading hackathons:', error);
        renderHackathonError(container);
    }
}

document.addEventListener('DOMContentLoaded', loadRecentHackathons);

window.addEventListener('resize', () => {
    if (!allHackathons.length) return;
    if (!showingAllHackathons) {
        renderHackathons();
    }
    updateHackathonsToggleButton();
});