export function Topbar(title = "Dashboard") {
    return `
        <header class="topbar">

            <div class="topbar-left">
                <h1>${title}</h1>
            </div>

            <div class="topbar-right">

                <div class="live-status">
                    <span class="pulse"></span>
                    LIVE
                </div>

                <div class="admin-profile">
                    ADMIN
                </div>

            </div>

        </header>
    `;
}