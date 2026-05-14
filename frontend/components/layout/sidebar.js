export function Sidebar(activePage = "") {
    return `
        <aside class="sidebar">

            <div class="sidebar-logo">
                <span class="logo-glow">VoteWave</span>
            </div>

            <nav class="sidebar-nav">

                <a href="/app/admin/dashboard.html"
                   class="${activePage === 'dashboard' ? 'active' : ''}">
                    Dashboard
                </a>

                <a href="/app/admin/elections.html"
                   class="${activePage === 'elections' ? 'active' : ''}">
                    Elections
                </a>

                <a href="/app/admin/candidates.html"
                   class="${activePage === 'candidates' ? 'active' : ''}">
                    Candidates
                </a>

                <a href="/app/admin/voters.html"
                   class="${activePage === 'voters' ? 'active' : ''}">
                    Voters
                </a>

                <a href="/app/admin/analytics.html"
                   class="${activePage === 'analytics' ? 'active' : ''}">
                    Analytics
                </a>

                <a href="/app/admin/ai-center.html"
                   class="${activePage === 'ai' ? 'active' : ''}">
                    AI Center
                </a>

                <a href="/live-results.html">
                    Live Results
                </a>

            </nav>

        </aside>
    `;
}